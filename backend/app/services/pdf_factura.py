"""
Generador de PDF de facturas/albaranes a partir de datos del ERP.
Diseño replicado del formato "Solba A4 Básico Logo Izquierda".
"""
from __future__ import annotations

import io
from typing import Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Image as RLImage

from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection

# ── Página ────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4           # 595.28 × 841.89 pts
ML = 15 * mm                  # margen izquierdo  ≈ 42.5 pts
MR = 15 * mm
MT = 10 * mm                  # margen superior   ≈ 28.3 pts
MB = 10 * mm

CW = PAGE_W - ML - MR        # ancho de contenido ≈ 510 pts

# Alturas de secciones (pts)
LOGO_H   = 30 * mm            # bloque logo + empresa
META_H   = 37 * mm            # bloque meta (izq) + cliente (der)
COL_H    =  6 * mm            # banda cabecera columnas
LINE_H   =  5 * mm            # altura de cada fila de línea
SUM_H    = 44 * mm            # bloque resumen/pie (sin footer de texto libre)
FOOTER_H = 18 * mm            # altura reservada para pie fijo (txt_registro + txt_2)

HEADER_H = LOGO_H + META_H + COL_H   # altura total de cabecera

# Colores
C_GRAY_HD  = colors.Color(0.88, 0.90, 0.94)   # fondo cabecera columnas / totales
C_GRAY_LT  = colors.Color(0.96, 0.96, 0.98)   # fondo alterno líneas
C_SEP      = colors.Color(0.80, 0.82, 0.85)   # separadores


# ── Utilidades ────────────────────────────────────────────────────────────

def _q(v: Any) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except Exception:
        return 0.0


def _fmt(v, dec=2) -> str:
    """Formatea número (oculta el 0)."""
    try:
        n = float(v)
        if n == 0:
            return ''
        return f"{n:,.{dec}f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    except Exception:
        return str(v)


def _fmt0(v, dec=2) -> str:
    """Formatea número siempre, incluyendo 0."""
    try:
        return f"{float(v):,.{dec}f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    except Exception:
        return str(v)


def _date(d) -> str:
    if not d:
        return ''
    import datetime
    try:
        if isinstance(d, (datetime.date, datetime.datetime)):
            return d.strftime('%d/%m/%Y')
        y, m, day = str(d)[:10].split('-')
        return f"{day}/{m}/{y}"
    except Exception:
        return str(d)


def _t(c: rl_canvas.Canvas, x, y, text, size=8, bold=False,
        color=colors.black, align='left', maxw=None):
    """Dibuja texto en la canvas."""
    if text is None:
        return
    text = str(text)
    if not text.strip():
        return
    c.setFillColor(color)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    if align == 'right' and maxw:
        c.drawRightString(x + maxw, y, text)
    elif align == 'center' and maxw:
        c.drawCentredString(x + maxw / 2, y, text)
    else:
        c.drawString(x, y, text)
    c.setFillColor(colors.black)


def _box(c: rl_canvas.Canvas, x, y, w, h, fill=None,
         stroke=colors.black, lw=0.5):
    c.setLineWidth(lw)
    c.setStrokeColor(stroke)
    if fill is not None:
        c.setFillColor(fill)
        c.rect(x, y, w, h, fill=1, stroke=1)
        c.setFillColor(colors.black)
    else:
        c.rect(x, y, w, h, fill=0, stroke=1)


def _line(c: rl_canvas.Canvas, x1, y1, x2, y2, lw=0.5, color=colors.black):
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    c.line(x1, y1, x2, y2)


# ── Definición de columnas ────────────────────────────────────────────────

def _cols():
    """Devuelve lista de (x, w, align, label) para las columnas de líneas."""
    desc_w = CW * 0.57
    uds_w  = CW * 0.10
    prec_w = CW * 0.12
    dto_w  = CW * 0.07
    tot_w  = CW - desc_w - uds_w - prec_w - dto_w

    dx = ML
    ux = dx + desc_w
    px = ux + uds_w
    qx = px + prec_w
    tx = qx + dto_w

    return [
        (dx, desc_w, 'left',  'Concepto / Descripción'),
        (ux, uds_w,  'right', 'Unidades'),
        (px, prec_w, 'right', 'Precio'),
        (qx, dto_w,  'right', 'Dto.'),
        (tx, tot_w,  'right', 'Total'),
    ]


# ── Carga logo desde ERP ──────────────────────────────────────────────────

def _logo_bytes(conn) -> Optional[bytes]:
    """Lee el logo de empresa_imagenes (prefiere 'Logo Facturas') o imagen_firma."""
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT imagen FROM empresa_imagenes "
            "ORDER BY CASE WHEN lower(nombre) LIKE '%logo fact%' THEN 0 "
            "              WHEN lower(nombre) LIKE '%logo%' THEN 1 ELSE 2 END, codigo "
            "LIMIT 1"
        )
        row = cur.fetchone()
        if row and row.get('imagen'):
            lobj = conn.lobject(int(row['imagen']), 'rb')
            data = lobj.read()
            lobj.close()
            if data:
                return data
    except Exception:
        pass
    try:
        cur = conn.cursor()
        cur.execute("SELECT imagen_firma FROM empresa LIMIT 1")
        row = cur.fetchone()
        oid = row['imagen_firma'] if row else None
        if oid:
            lobj = conn.lobject(int(oid), 'rb')
            data = lobj.read()
            lobj.close()
            return data if data else None
    except Exception:
        pass
    return None


# ── Consulta de datos ────────────────────────────────────────────────────

def query_factura_data(empresa: Empresa, fac_id: int, cli_codigo: int) -> dict:
    conn = get_pg_connection(empresa)
    try:
        cur = conn.cursor()

        # Cabecera
        cur.execute("""
            SELECT
                vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                vc.cli_codigo, vc.cli_nombre, vc.cli_cif,
                vc.cli_direccion, vc.cli_localidad, vc.cli_cpostal,
                vc.cli_referencia, vc.cli_telefono, vc.cli_provincia,
                vc.descripcion, vc.observaciones,
                vc.suma1, vc.suma2, vc.suma3,
                vc.pdtopp, vc.pdtopp_imp,
                vc.baseimpo1, vc.baseimpo2, vc.baseimpo3,
                vc.piva1, vc.piva2, vc.piva3,
                vc.iva1, vc.iva2, vc.iva3,
                vc.prec1, vc.prec2, vc.prec3,
                vc.rec1, vc.rec2, vc.rec3,
                vc.irpf, vc.pirpf,
                vc.portes, vc.recfin, vc.precfin,
                vc.recfin_imp, vc.precfin_imp,
                vc.total, vc.fpago, vc.agente,
                COALESCE(fp.nombre, '') AS fpago_desc,
                COALESCE(ag.nombre, '') AS agente_nombre,
                COALESCE(pr.nombre, '') AS provincia_nombre,
                cl.telefono1 AS cli_tel1
            FROM ventas_cabeceras vc
            JOIN clientes cl ON cl.codigo = vc.cli_codigo
            LEFT JOIN formaspago fp ON fp.codigo = vc.fpago
            LEFT JOIN agentes ag ON ag.codigo = vc.agente
            LEFT JOIN provincias pr ON pr.codigo = vc.cli_provincia
            WHERE vc.id = %(id)s
              AND vc.cli_codigo = %(cli)s
              AND vc.tipodoc IN (8, 4, 3)
        """, {'id': fac_id, 'cli': cli_codigo})

        row = cur.fetchone()
        if not row:
            return {}
        cab = dict(row)

        cab['suma'] = _q(cab['suma1']) + _q(cab['suma2']) + _q(cab['suma3'])
        cab['base_imponible'] = _q(cab['baseimpo1']) + _q(cab['baseimpo2']) + _q(cab['baseimpo3'])
        cab['iva_total'] = _q(cab['iva1']) + _q(cab['iva2']) + _q(cab['iva3'])
        cab['tel'] = (cab.get('cli_telefono') or cab.get('cli_tel1') or '').strip()
        cab['fax'] = ''
        cab['tipo_documento'] = {
            8: 'FACTURA', 4: 'ALBARÁN', 3: 'ALBARÁN'
        }.get(int(cab.get('tipodoc', 0)), 'DOCUMENTO')

        # Líneas
        cur.execute("""
            SELECT orden, referencia, descripcion, observaciones,
                   unidades, precio, descuento, importe, piva, linea_cabecera
            FROM ventas_lineas WHERE idcab = %(id)s ORDER BY orden
        """, {'id': fac_id})
        lineas = [dict(r) for r in cur.fetchall()]

        # Vencimientos
        cur.execute("""
            SELECT fecha, importe, situacion FROM vencimientos
            WHERE idcab = %(id)s AND tipo = 0 ORDER BY fecha
        """, {'id': fac_id})
        venc = [dict(r) for r in cur.fetchall()]

        # Empresa ERP
        emp: dict = {'nombre': empresa.nombre}
        try:
            cur.execute("""
                SELECT nombre, cif, direccion, localidad, cpostal,
                       telefono1, fax, email, txt_1, txt_2, txt_registro
                FROM empresa LIMIT 1
            """)
            er = cur.fetchone()
            if er:
                emp.update(dict(er))
        except Exception:
            pass

        # LOPD
        try:
            cur.execute("""
                SELECT texto_factura FROM empresa_lopd
                WHERE delegacion = 0 OR delegacion IS NULL LIMIT 1
            """)
            lr = cur.fetchone()
            emp['lopd'] = (lr['texto_factura'] if lr else '') or ''
        except Exception:
            emp['lopd'] = ''

        # Banco
        try:
            cur.execute("""
                SELECT TRIM(COALESCE(iban,'')) || ' ' || TRIM(COALESCE(cuenta,'')) AS cuenta
                FROM bancos_cuentas WHERE (inactiva IS NULL OR inactiva = 0)
                ORDER BY codigo LIMIT 1
            """)
            br = cur.fetchone()
            emp['cuenta_banco'] = br['cuenta'].strip() if br else ''
        except Exception:
            emp['cuenta_banco'] = ''

        # Logo desde ERP
        try:
            emp['logo'] = _logo_bytes(conn)
        except Exception:
            emp['logo'] = None

        cur.close()
        return {'cab': cab, 'lineas': lineas, 'venc': venc, 'emp': emp}
    finally:
        conn.close()


# ── Dibujo ────────────────────────────────────────────────────────────────

def _draw_header(c: rl_canvas.Canvas, cab: dict, emp: dict, page: int, total: int):
    top = PAGE_H - MT

    # ── LOGO + EMPRESA (fila superior) ────────────────────────────────
    logo_w = CW * 0.40          # ~204 pts
    info_w = CW - logo_w        # ~306 pts
    info_x = ML + logo_w
    row_bottom = top - LOGO_H

    # Logo
    logo = emp.get('logo')
    if logo:
        try:
            img_h = LOGO_H * 0.88
            img_w = logo_w * 0.82
            img = RLImage(io.BytesIO(logo), width=img_w, height=img_h)
            img.drawOn(c, ML + 2, row_bottom + (LOGO_H - img_h) / 2)
        except Exception:
            _t(c, ML + 4, top - 16, emp.get('nombre', ''), size=11, bold=True)
    else:
        _t(c, ML + 4, top - 16, emp.get('nombre', ''), size=11, bold=True)

    # Datos empresa (alineados a la derecha)
    ey = top - 9
    _t(c, info_x, ey, emp.get('nombre', ''), size=9, bold=True, align='right', maxw=info_w)
    ey -= 12
    cif = emp.get('cif', '')
    if cif:
        _t(c, info_x, ey, f"NIF / CIF: {cif}", size=8, bold=True, align='right', maxw=info_w)
        ey -= 11
    addr = emp.get('direccion', '')
    if addr:
        _t(c, info_x, ey, addr, size=8, align='right', maxw=info_w)
        ey -= 11
    cp_loc = ' '.join(filter(None, [emp.get('cpostal', ''), emp.get('localidad', '')]))
    if cp_loc:
        _t(c, info_x, ey, cp_loc, size=8, align='right', maxw=info_w)
        ey -= 11
    tel = emp.get('telefono1', '')
    fax = emp.get('fax', '')
    tf_txt = '  '.join(filter(None, [
        f"Tel:{tel}" if tel else '',
        f"Fax:{fax}" if fax else '',
    ]))
    if tf_txt:
        _t(c, info_x, ey, tf_txt, size=8, align='right', maxw=info_w)

    # Línea separadora
    _line(c, ML, row_bottom, ML + CW, row_bottom, lw=0.5, color=C_SEP)

    # ── META (izq) + CLIENTE (der) ─────────────────────────────────────
    meta_top    = row_bottom
    meta_bottom = meta_top - META_H
    meta_w      = CW * 0.40
    cli_x       = ML + meta_w + 3
    cli_w       = CW - meta_w - 3

    # Texto meta izquierda
    tipo  = cab.get('tipo_documento', 'DOCUMENTO')
    serie = (cab.get('serie') or '').strip()
    num   = str(cab.get('numero') or '')
    doc_str = f"{tipo}  {serie} {num}".strip()

    my = meta_top - 10
    _t(c, ML, my, doc_str, size=10, bold=True)
    my -= 13
    _t(c, ML, my, "Fecha",   size=7.5, bold=True)
    _t(c, ML + 32, my, _date(cab.get('fecha')),        size=7.5)
    my -= 10
    _t(c, ML, my, "Cliente", size=7.5, bold=True)
    _t(c, ML + 32, my, str(cab.get('cli_codigo', '')), size=7.5)
    my -= 10
    agente_n = (cab.get('agente_nombre') or '').strip()
    _t(c, ML, my, "Agente",  size=7.5, bold=True)
    _t(c, ML + 32, my, agente_n,                       size=7.5)

    # Caja cliente con borde
    _box(c, cli_x, meta_bottom, cli_w, META_H,
         fill=colors.white, stroke=colors.black, lw=0.8)

    cy = meta_top - 9
    _t(c, cli_x + 5, cy, cab.get('cli_nombre', ''), size=9, bold=True)
    cy -= 12
    cli_cif = cab.get('cli_cif', '')
    if cli_cif:
        _t(c, cli_x + 5, cy, f"NIF / CIF:  {cli_cif}", size=8, bold=True)
        cy -= 10
    cli_dir = cab.get('cli_direccion', '')
    if cli_dir:
        _t(c, cli_x + 5, cy, cli_dir, size=8)
        cy -= 10
    cli_loc2 = ' '.join(filter(None, [
        str(cab.get('cli_cpostal') or ''),
        cab.get('cli_localidad') or '',
    ]))
    if cli_loc2:
        _t(c, cli_x + 5, cy, cli_loc2, size=8)
        cy -= 10
    cli_prov = (cab.get('provincia_nombre') or '').strip()
    if cli_prov:
        _t(c, cli_x + 5, cy, cli_prov, size=8)
        cy -= 10
    cli_tel = cab.get('tel', '')
    cli_fax = cab.get('fax', '')
    if cli_tel or cli_fax:
        _t(c, cli_x + 5, cy, f"Teléfono: {cli_tel}  Fax: {cli_fax}".strip(), size=8)

    # Línea separadora
    _line(c, ML, meta_bottom, ML + CW, meta_bottom, lw=0.5, color=C_SEP)

    # ── CABECERA DE COLUMNAS ───────────────────────────────────────────
    col_top    = meta_bottom
    col_bottom = col_top - COL_H
    _box(c, ML, col_bottom, CW, COL_H, fill=C_GRAY_HD, stroke=C_SEP, lw=0.4)

    ly = col_bottom + COL_H * 0.33
    for (x, w, align, label) in _cols():
        _t(c, x, ly, label, size=7, bold=True, align=align, maxw=w)


def _draw_lines(c: rl_canvas.Canvas, lineas: list, top: float, bottom: float):
    """Dibuja líneas entre top y bottom. Retorna (y_final, restantes)."""
    col_defs = _cols()
    dx, dw, _, _ = col_defs[0]
    ux, uw, _, _ = col_defs[1]
    px, pw, _, _ = col_defs[2]
    qx, qw, _, _ = col_defs[3]
    tx, tw, _, _ = col_defs[4]

    y = top
    remaining = []
    drawing = True

    for i, lin in enumerate(lineas):
        if not drawing:
            remaining.append(lin)
            continue

        obs = (lin.get('observaciones') or '').strip()
        row_h = LINE_H + (LINE_H * 0.9 if obs else 0)

        if y - row_h < bottom:
            drawing = False
            remaining.append(lin)
            continue

        # Fondo alterno
        if i % 2 == 0:
            _box(c, ML, y - row_h, CW, row_h, fill=C_GRAY_LT, stroke=C_SEP, lw=0.2)

        ty = y - LINE_H * 0.62

        ref  = (lin.get('referencia') or '').strip()
        desc = (lin.get('descripcion') or '').strip()

        # Referencia en negrita + descripción en la misma columna
        rx = dx
        c.setFillColor(colors.black)
        if ref:
            c.setFont('Helvetica-Bold', 7.5)
            c.drawString(rx, ty, ref)
            rx += c.stringWidth(ref, 'Helvetica-Bold', 7.5) + 5
        c.setFont('Helvetica', 7.5)
        avail = dw - (rx - dx)
        while desc and c.stringWidth(desc, 'Helvetica', 7.5) > avail:
            desc = desc[:-1]
        c.drawString(rx, ty, desc)

        uds   = _q(lin.get('unidades'))
        prec  = _q(lin.get('precio'))
        dto   = _q(lin.get('descuento'))
        total = _q(lin.get('importe'))

        if uds:
            _t(c, ux, ty, _fmt(uds, 3),  size=7.5, align='right', maxw=uw)
        if prec:
            _t(c, px, ty, _fmt(prec),     size=7.5, align='right', maxw=pw)
        if dto:
            _t(c, qx, ty, _fmt(dto, 1),   size=7.5, align='right', maxw=qw)
        _t(c, tx, ty, _fmt0(total),        size=7.5, align='right', maxw=tw)

        # Observaciones (sublinea)
        if obs:
            oy = y - LINE_H - LINE_H * 0.55
            c.setFont('Helvetica', 7)
            c.setFillColor(colors.Color(0.30, 0.30, 0.30))
            while obs and c.stringWidth(obs, 'Helvetica', 7) > dw:
                obs = obs[:-1]
            c.drawString(dx + 10, oy, obs)
            c.setFillColor(colors.black)

        _line(c, ML, y - row_h, ML + CW, y - row_h, lw=0.2, color=C_SEP)
        y -= row_h

    return y, remaining


def _draw_summary(c: rl_canvas.Canvas, cab: dict, venc: list, emp: dict,
                  bot_y: float):
    """Dibuja el bloque de resumen/pie. bot_y es el y base (desde arriba del bloque)."""
    y = bot_y + SUM_H

    # ── TABLA DE TOTALES ─────────────────────────────────────────────
    tot_h = LINE_H * 2.5
    _box(c, ML, y - tot_h, CW, tot_h, fill=C_GRAY_HD, stroke=C_SEP, lw=0.5)

    suma    = _q(cab.get('suma'))
    dto_imp = _q(cab.get('pdtopp_imp'))
    portes  = _q(cab.get('portes'))
    recfin  = _q(cab.get('recfin_imp'))
    base    = _q(cab.get('base_imponible'))
    iva_tot = _q(cab.get('iva_total'))
    total   = _q(cab.get('total'))

    # Etiqueta IVA con porcentaje(s)
    iva_pcts = []
    for n in range(1, 4):
        if _q(cab.get(f'baseimpo{n}')) > 0:
            pct = _q(cab.get(f'piva{n}'))
            iva_pcts.append(f"{_fmt0(pct, 1)}%")
    iva_lbl = 'IVA ' + '/'.join(iva_pcts) if iva_pcts else 'IVA'

    tot_cols = [
        ('Sumas',          _fmt0(suma)),
        ('0,00 % Dto.',    _fmt(dto_imp) or '0,00'),
        ('Transporte',     _fmt(portes)  or '0,00'),
        ('Base imponible', _fmt0(base)),
        (iva_lbl,          _fmt0(iva_tot)),
        ('Financiación',   _fmt(recfin)  or '0,00'),
        ('TOTAL',          _fmt0(total)),
    ]
    ncols = len(tot_cols)
    cw2 = CW / ncols
    lbl_y = y - tot_h * 0.28
    val_y = y - tot_h * 0.70

    for i, (lbl, val) in enumerate(tot_cols):
        cx = ML + i * cw2
        is_last = (i == ncols - 1)
        _t(c, cx + 2, lbl_y, lbl, size=6.5, bold=True)
        _t(c, cx + cw2 - 3, val_y, val,
           size=8.5 if is_last else 7.5, bold=is_last, align='right', maxw=0)
        if i > 0:
            _line(c, cx, y - tot_h, cx, y, lw=0.3, color=C_SEP)

    y -= tot_h + 3

    # ── DESGLOSE IVA ─────────────────────────────────────────────────
    has_iva = any(_q(cab.get(f'baseimpo{n}')) > 0 for n in range(1, 4))
    if has_iva:
        iva_col_w = CW / 5
        row_h_hdr = LINE_H * 0.9
        _box(c, ML, y - row_h_hdr, CW, row_h_hdr,
             fill=colors.Color(0.94, 0.94, 0.96), stroke=C_SEP, lw=0.3)
        hy = y - row_h_hdr * 0.38
        for i2, h in enumerate(('% IVA', 'Base Imponible', 'Cuota IVA', '% R.Eq.', 'R.Equiv.')):
            _t(c, ML + i2 * iva_col_w + 2, hy, h, size=6.5, bold=True)
        y -= row_h_hdr

        for n in range(1, 4):
            bi = _q(cab.get(f'baseimpo{n}'))
            if not bi:
                continue
            piva  = _q(cab.get(f'piva{n}'))
            iva_n = _q(cab.get(f'iva{n}'))
            prec  = _q(cab.get(f'prec{n}'))
            rec   = _q(cab.get(f'rec{n}'))
            rh2   = LINE_H * 0.88
            _line(c, ML, y - rh2, ML + CW, y - rh2, lw=0.2, color=C_SEP)
            vy = y - rh2 * 0.32
            for i2, v in enumerate([
                f"{_fmt0(piva, 1)} %",
                f"{_fmt0(bi)} €",
                f"{_fmt0(iva_n)} €",
                f"{_fmt(prec, 1)} %" if prec else "",
                f"{_fmt0(rec)} €" if rec else "",
            ]):
                _t(c, ML + i2 * iva_col_w + 2, vy, v, size=7.5)
            y -= rh2
        y -= 4

    # ── FORMA DE PAGO ────────────────────────────────────────────────
    fpago = (cab.get('fpago_desc') or '').strip()
    banco = (emp.get('cuenta_banco') or '').strip()
    if fpago:
        _t(c, ML, y, 'Forma de pago', size=7.5, bold=True)
        _t(c, ML + 65, y, fpago, size=7.5)
        y -= 11
    if banco:
        _t(c, ML, y, 'Cuenta bancaria:', size=7.5, bold=True)
        _t(c, ML + 65, y, banco, size=7.5)
        y -= 11

    # ── LÍNEA DE FIRMA ────────────────────────────────────────────────
    y -= 4
    _line(c, ML + CW * 0.55, y, ML + CW, y, lw=0.5)


# ── Estimaciones ──────────────────────────────────────────────────────────

def _capacity(top, bottom) -> int:
    return max(0, int((top - bottom) / LINE_H))


def _estimate_pages(lineas: list) -> int:
    lines_top = PAGE_H - MT - HEADER_H
    first = _capacity(lines_top, MB + FOOTER_H + SUM_H + 4)
    more  = _capacity(lines_top, MB + FOOTER_H + 4)
    n = len(lineas)
    if n <= first:
        return 1
    return 1 + max(1, (n - first + more - 1) // more)


# ── Generador principal ───────────────────────────────────────────────────

def generar_pdf(data: dict) -> bytes:
    cab    = data['cab']
    lineas = data['lineas']
    venc   = data['venc']
    emp    = data['emp']

    buf = io.BytesIO()
    serie  = (cab.get('serie') or '').strip()
    numero = str(cab.get('numero') or '')
    c = rl_canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{cab.get('tipo_documento', '')} {serie} {numero}".strip())
    c.setAuthor(emp.get('nombre', ''))

    remaining   = list(lineas)
    page        = 0
    total_pages = _estimate_pages(lineas)
    lines_top   = PAGE_H - MT - HEADER_H

    while True:
        page += 1
        c.saveState()

        is_last      = len(remaining) <= _capacity(lines_top, MB + FOOTER_H + SUM_H + 4)
        lines_bottom = (MB + FOOTER_H + SUM_H + 4) if is_last else MB + FOOTER_H + 4

        _draw_header(c, cab, emp, page, total_pages)
        _, remaining = _draw_lines(c, remaining, lines_top, lines_bottom)

        if is_last:
            _draw_summary(c, cab, venc, emp, MB + FOOTER_H)

        # ── PIE FIJO: líneas de texto libre del ERP ───────────────────
        footer_color = colors.Color(0.35, 0.35, 0.35)
        fy = MB + 14
        txt1 = (emp.get('txt_registro') or '').strip()
        txt2 = (emp.get('txt_2') or '').strip()
        if txt1:
            _t(c, ML, fy, txt1, size=6, align='center', maxw=CW, color=footer_color)
            fy -= 8
        if txt2:
            _t(c, ML, fy, txt2, size=6, align='center', maxw=CW, color=footer_color)

        # Número de página
        _t(c, ML + CW, MB + 3, f"Página {page}/{total_pages}",
           size=7, align='right', maxw=0)

        c.restoreState()
        if not remaining:
            break
        c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()
