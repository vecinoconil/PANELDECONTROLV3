"""
PDF document generator for autoventa documents.
Currently implemented: 'a4_basico_logo_izq'
"""
from __future__ import annotations

import io
from decimal import Decimal
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import HRFlowable

PAGE_W, PAGE_H = A4  # 595.28 x 841.89 points
MARGIN = 12 * mm
FOOTER_H = 44 * mm  # espacio reservado: tabla totales + pie textual


def _fmt(val, decimals=2) -> str:
    try:
        return f"{float(val):,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(val)


def _load_logo_from_pg(conn) -> Optional[bytes]:
    """Read empresa logo from empresa_imagenes (prefers 'Logo Facturas'), fallback imagen_firma OID."""
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT imagen FROM empresa_imagenes "
            "ORDER BY CASE WHEN lower(nombre) LIKE '%logo fact%' THEN 0 "
            "              WHEN lower(nombre) LIKE '%logo%' THEN 1 ELSE 2 END, codigo "
            "LIMIT 1"
        )
        row = cur.fetchone()
        if row and row.get("imagen"):
            lobj = conn.lobject(int(row["imagen"]), "rb")
            data = lobj.read()
            lobj.close()
            if data:
                return data
        # Fallback: imagen_firma OID on empresa table
        cur.execute("SELECT imagen_firma FROM empresa LIMIT 1")
        row = cur.fetchone()
        oid = row["imagen_firma"] if row else 0
        if oid:
            lobj = conn.lobject(int(oid), "rb")
            data = lobj.read()
            lobj.close()
            return data if data else None
    except Exception:
        return None
    return None


def _empresa_data(conn) -> Dict[str, str]:
    """Load empresa data from PostgreSQL."""
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT nombre, cif, direccion, localidad, cpostal, telefono1, fax, "
            "       txt_registro, txt_2 FROM empresa LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            return dict(row)
    except Exception:
        pass
    return {}


def _agente_nombre(conn, agente_code) -> str:
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT nombre FROM agentes WHERE codigo = %s", (agente_code,))
        row = cur.fetchone()
        return row["nombre"] if row else str(agente_code or "")
    except Exception:
        return str(agente_code or "")


def _fpago_nombre(conn, fpago_code) -> str:
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT nombre FROM formas_pago WHERE codigo = %s", (fpago_code,)
        )
        row = cur.fetchone()
        return row["nombre"] if row else str(fpago_code or "")
    except Exception:
        return str(fpago_code or "")


# ─── Main entry point ────────────────────────────────────────────────────────

def generate_pdf(formato: str, doc: Dict, lineas: List[Dict], conn) -> bytes:
    """Generate a PDF document and return raw bytes."""
    if formato == "a4_basico_logo_izq":
        return _a4_basico_logo_izq(doc, lineas, conn)
    raise ValueError(f"Formato desconocido: {formato}")


# ─── A4 Básico Logo Izquierda ────────────────────────────────────────────────

def _a4_basico_logo_izq(doc: Dict, lineas: List[Dict], conn) -> bytes:
    buf = io.BytesIO()
    template = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=FOOTER_H,
    )

    # ── Styles ────────────────────────────────────────────────────────────
    styles = getSampleStyleSheet()

    def ps(name, **kw):
        return ParagraphStyle(name, **kw)

    st_normal = ps("normal", fontSize=8, leading=10, fontName="Helvetica")
    st_small = ps("small", fontSize=7, leading=9, fontName="Helvetica")
    st_tiny = ps("tiny", fontSize=6.5, leading=8, fontName="Helvetica")
    st_bold = ps("bold", fontSize=9, leading=11, fontName="Helvetica-Bold")
    st_bold_sm = ps("bold_sm", fontSize=8, leading=10, fontName="Helvetica-Bold")
    st_title = ps("title", fontSize=11, leading=13, fontName="Helvetica-Bold")
    st_right = ps("right", fontSize=8, leading=10, fontName="Helvetica", alignment=TA_RIGHT)
    st_right_bold = ps("right_bold", fontSize=8, leading=10, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    st_center = ps("center", fontSize=7, leading=9, fontName="Helvetica", alignment=TA_CENTER)

    empresa = _empresa_data(conn)
    logo_bytes = _load_logo_from_pg(conn)

    tipo_label = {2: "Pedido", 4: "Albarán", 8: "Factura"}.get(
        int(doc.get("tipodoc", 0)), "Documento"
    )
    serie = doc.get("serie", "")
    numero = doc.get("numero", "")
    fecha = doc.get("fecha")
    if fecha and hasattr(fecha, "strftime"):
        fecha_str = fecha.strftime("%d/%m/%Y")
    else:
        fecha_str = str(fecha or "")

    agente_str = _agente_nombre(conn, doc.get("agente"))
    fpago_str = _fpago_nombre(conn, doc.get("fpago"))

    content_width = PAGE_W - 2 * MARGIN  # ~171mm

    story = []

    # ── 1. HEADER: Logo | Empresa info ────────────────────────────────────
    logo_col_w = 70 * mm
    info_col_w = content_width - logo_col_w

    if logo_bytes:
        try:
            logo_img = Image(io.BytesIO(logo_bytes), width=60 * mm, height=22 * mm)
        except Exception:
            logo_img = Paragraph("<b>LOGO</b>", st_bold)
    else:
        logo_img = Paragraph("", st_normal)

    emp_nombre = empresa.get("nombre", "")
    emp_cif = empresa.get("cif", "")
    emp_dir = empresa.get("direccion", "")
    emp_loc = empresa.get("localidad", "")
    emp_cp = empresa.get("cpostal", "")
    emp_tel = empresa.get("telefono1", "")
    emp_fax = empresa.get("fax", "")

    st_emp_r = ps("emp_r", fontSize=8, leading=10, fontName="Helvetica", alignment=TA_RIGHT)
    st_emp_bold_r = ps("emp_bold_r", fontSize=9, leading=11, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    st_emp_bsm_r = ps("emp_bsm_r", fontSize=8, leading=10, fontName="Helvetica-Bold", alignment=TA_RIGHT)

    emp_info = [
        Paragraph(f"<b>{emp_nombre}</b>", st_emp_bold_r),
        Paragraph(f"NIF / CIF: {emp_cif}", st_emp_bsm_r),
        Paragraph(emp_dir, st_emp_r),
        Paragraph(f"{emp_cp} {emp_loc}", st_emp_r),
        Paragraph(f"Tel:{emp_tel}  Fax:{emp_fax}", st_emp_r),
    ]

    header_table = Table(
        [[logo_img, emp_info]],
        colWidths=[logo_col_w, info_col_w],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 2 * mm))

    # ── 2. DOCUMENT INFO: left panel | client box ────────────────────────
    left_w = content_width * 0.48
    right_w = content_width * 0.52

    cli_nombre = doc.get("cli_nombre") or doc.get("cli_nombre_full", "")
    cli_cif = doc.get("cli_cif", "") or ""
    cli_dir = doc.get("cli_direccion", "") or ""
    cli_loc = doc.get("cli_localidad", "") or ""
    cli_cp = doc.get("cli_cpostal", "") or ""
    cli_tel = doc.get("cli_telefono", "") or ""

    doc_left = [
        Paragraph(f"<b>{tipo_label} {serie} {numero}</b>", st_title),
        Spacer(1, 1 * mm),
        Paragraph(f"<b>Fecha</b>    {fecha_str}", st_normal),
        Paragraph(f"<b>Cliente</b>  {doc.get('cli_codigo', '')}", st_normal),
        Paragraph(f"<b>Agente</b>   {agente_str}", st_normal),
    ]

    client_box_content = [
        [Paragraph(f"<b>{cli_nombre}</b>", st_bold)],
        [Paragraph(f"NIF / CIF:  {cli_cif}", st_normal)],
        [Paragraph(cli_dir, st_normal)],
        [Paragraph(f"{cli_cp} {cli_loc}".strip(), st_normal)],
        [Spacer(1, 3 * mm)],
        [Paragraph(f"Teléfono: {cli_tel}   Fax:", st_normal)],
    ]
    client_inner = Table(client_box_content, colWidths=[right_w - 6 * mm])
    client_inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    info_row = Table(
        [[doc_left, client_inner]],
        colWidths=[left_w, right_w],
    )
    info_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (1, 0), (1, 0), 0.5, colors.black),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 4),
        ("LEFTPADDING", (1, 0), (1, 0), 0),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(info_row)
    story.append(Spacer(1, 3 * mm))

    # ── 3. LINES TABLE ────────────────────────────────────────────────────
    col_desc = content_width - 52 * mm
    col_uds = 18 * mm
    col_precio = 22 * mm
    col_dto = 12 * mm
    col_total = 22 * mm  # (shouldn't exceed but recheck)

    # Ajuste exacto
    total_cols = col_desc + col_uds + col_precio + col_dto + col_total
    if abs(total_cols - content_width) > 0.5:
        col_desc += content_width - total_cols

    header_bg = colors.Color(0.92, 0.92, 0.92)
    alt_bg = colors.Color(0.97, 0.97, 0.97)

    tbl_header = [
        Paragraph("<b>Concepto / Descripción</b>", st_bold_sm),
        Paragraph("<b>Unidades</b>", ps("th_r", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT)),
        Paragraph("<b>Precio</b>", ps("th_r2", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT)),
        Paragraph("<b>Dto.</b>", ps("th_r3", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT)),
        Paragraph("<b>Total</b>", ps("th_r4", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT)),
    ]

    tbl_data = [tbl_header]
    tbl_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("GRID", (0, 0), (-1, 0), 0.3, colors.gray),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
    ]

    for i, l in enumerate(lineas):
        is_header_line = int(l.get("linea_cabecera", 0)) == 1
        ref = l.get("referencia", "") or ""
        desc = l.get("descripcion", "") or ""
        uds = float(l.get("unidades", 0))
        precio = float(l.get("precio", 0))
        importe = float(l.get("importe", 0))
        dto = float(l.get("descuento", 0))

        row_idx = i + 1  # +1 for header row

        if is_header_line:
            # Cabecera de sección — span full width, bold
            text = f"<b>{ref}  {desc}</b>" if ref else f"<b>{desc}</b>"
            tbl_data.append([
                Paragraph(text, ps(f"hl{i}", fontSize=8, fontName="Helvetica-Bold")),
                "", "", "", ""
            ])
            tbl_styles.append(("SPAN", (0, row_idx), (-1, row_idx)))
            tbl_styles.append(("LINEABOVE", (0, row_idx), (-1, row_idx), 0.5, colors.lightgrey))
        else:
            if ref:
                desc_para = Paragraph(
                    f"<b>{ref}</b>  {desc}",
                    ps(f"dl{i}", fontSize=7.5, fontName="Helvetica", leading=9.5)
                )
            else:
                desc_para = Paragraph(
                    desc,
                    ps(f"dl{i}", fontSize=7.5, fontName="Helvetica", leading=9.5)
                )

            tbl_data.append([
                desc_para,
                Paragraph(_fmt(uds, 3), st_right),
                Paragraph(_fmt(precio), st_right),
                Paragraph(f"{_fmt(dto, 2)}%" if dto else "", st_right),
                Paragraph(_fmt(importe), st_right_bold),
            ])
            if i % 2 == 0:
                tbl_styles.append(("BACKGROUND", (0, row_idx), (-1, row_idx), alt_bg))
            tbl_styles.append(("LINEBELOW", (0, row_idx), (-1, row_idx), 0.3, colors.lightgrey))

    lines_table = Table(
        tbl_data,
        colWidths=[col_desc, col_uds, col_precio, col_dto, col_total],
        repeatRows=1,
    )
    lines_table.setStyle(TableStyle(tbl_styles))
    story.append(lines_table)
    story.append(Spacer(1, 4 * mm))

    # ── 4. TOTALS FOOTER TABLE ────────────────────────────────────────────
    # Build IVA breakdown from baseimpo1..6 / piva1..6 / iva1..6
    iva_rows = []
    for idx in range(1, 7):
        base = float(doc.get(f"baseimpo{idx}") or 0)
        piva = float(doc.get(f"piva{idx}") or 0)
        iva_imp = float(doc.get(f"iva{idx}") or 0)
        if base:
            iva_rows.append((base, piva, iva_imp))

    # Suma sin IVA
    suma_total = sum(float(doc.get(f"suma{i}", 0) or 0) for i in range(1, 7))
    pdtopp = float(doc.get("pdtopp") or 0)
    portes = float(doc.get("portes") or 0)
    total = float(doc.get("total") or 0)

    if iva_rows:
        base_str = " / ".join(_fmt(r[0]) for r in iva_rows)
        iva_pct_str = " / ".join(f"{_fmt(r[1], 2)}%" for r in iva_rows)
        iva_imp_str = " / ".join(_fmt(r[2]) for r in iva_rows)
    else:
        base_impo = sum(r[0] for r in iva_rows)
        base_str = _fmt(base_impo)
        iva_pct_str = ""
        iva_imp_str = ""

    cw = content_width / 7
    totals_data = [[
        Paragraph("<b>Sumas</b>", st_center),
        Paragraph(f"<b>{_fmt(pdtopp, 2)} % Dto.</b>", st_center),
        Paragraph("<b>Transporte</b>", st_center),
        Paragraph("<b>Base imponible</b>", st_center),
        Paragraph(f"<b>IVA {iva_pct_str}</b>", st_center) if iva_rows else Paragraph("<b>IVA</b>", st_center),
        Paragraph("<b>Financiación</b>", st_center),
        Paragraph("<b>TOTAL</b>", ps("tot_h", fontSize=8, fontName="Helvetica-Bold", alignment=TA_CENTER)),
    ], [
        Paragraph(_fmt(suma_total), st_center),
        Paragraph("0,00", st_center),
        Paragraph(_fmt(portes), st_center),
        Paragraph(base_str, st_center),
        Paragraph(iva_imp_str, st_center),
        Paragraph("0,00", st_center),
        Paragraph(f"<b>{_fmt(total)}</b>", ps("tot_v", fontSize=9, fontName="Helvetica-Bold", alignment=TA_CENTER)),
    ]]

    totals_table = Table(totals_data, colWidths=[cw] * 7)
    totals_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("BACKGROUND", (-1, 1), (-1, 1), colors.Color(0.88, 0.88, 0.88)),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    # totals_table NO se añade al story — se dibuja fijo en el pie via canvas

    # ── 5. FOOTER: tabla totales + textos — siempre al fondo del A4 ─────
    txt_registro = empresa.get("txt_registro", "") or ""
    txt_2 = (empresa.get("txt_2", "") or "").strip()

    # ── Build ─────────────────────────────────────────────────────────────
    def _on_page(canvas, doc_tmpl):
        canvas.saveState()
        _cw = PAGE_W - 2 * MARGIN

        # — Tabla de totales —
        _tw, _th = totals_table.wrapOn(canvas, _cw, 200)
        # zona reservada para textos de pie (txt_registro + txt_2 + fpago)
        text_zone = 18 * mm
        y_tbl = text_zone + 3 * mm  # margen entre textos y tabla

        # línea separadora sobre la tabla
        canvas.setStrokeColor(colors.black)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, y_tbl + _th + 2 * mm, PAGE_W - MARGIN, y_tbl + _th + 2 * mm)

        totals_table.drawOn(canvas, MARGIN, y_tbl)

        # línea separadora bajo la tabla (sobre el texto de pie)
        canvas.line(MARGIN, y_tbl - 2 * mm, PAGE_W - MARGIN, y_tbl - 2 * mm)

        # — Textos de pie —
        y_cur = text_zone - 6
        if txt_registro:
            canvas.setFont("Helvetica", 6)
            canvas.drawCentredString(PAGE_W / 2, y_cur, txt_registro)
            y_cur -= 8
        if txt_2:
            canvas.setFont("Helvetica", 6)
            canvas.drawCentredString(PAGE_W / 2, y_cur, txt_2)
            y_cur -= 9
        canvas.setFont("Helvetica", 7)
        canvas.drawString(MARGIN, y_cur, f"Forma de pago   {fpago_str}")
        canvas.drawRightString(PAGE_W - MARGIN, y_cur, f"Página {canvas._pageNumber}")
        canvas.restoreState()

    template.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return buf.getvalue()
