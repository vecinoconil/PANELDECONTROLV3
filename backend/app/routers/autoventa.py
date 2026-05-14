"""
Autoventa – mobile-sales endpoints.
Allows a field agent to create Pedidos (1), Albaranes (4) or Facturas (8)
for their assigned clients, pre-loading products consumed in the last 90 days.
"""
import json
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user, get_empresa_from_local
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection
from app.schemas import normalize_permisos

router = APIRouter()

TIPODOC_LABELS = {2: "Pedido", 4: "Albarán", 8: "Factura"}



def _require_autoventa(user: Usuario):
    permisos = normalize_permisos(user.permisos or "{}")
    can_enter = bool(permisos.get("autoventa", {}).get("entrar", False))
    if user.rol != "superadmin" and not can_enter:
        raise HTTPException(status_code=403, detail="Sin permiso de Autoventa")


# ── Empresa info (datos fiscales del ERP) ─────────────────────────────────

@router.get("/empresa-info")
def get_empresa_info(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT nombre, cif, direccion, localidad, cpostal, telefono1, email "
            "FROM empresa LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return {}
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Agentes ───────────────────────────────────────────────────────────────

@router.get("/agentes")
def list_agentes(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM agentes WHERE baja = false ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Series ────────────────────────────────────────────────────────────────

@router.get("/series")
def list_series(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT serie FROM series WHERE obsoleta = false ORDER BY serie")
        return [{"serie": r["serie"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Clientes ──────────────────────────────────────────────────────────────

@router.get("/clientes/buscar")
def buscar_clientes(
    q: str = Query(min_length=2),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        # Split query into words for multi-word substring search
        words = [w for w in q.strip().split() if w]
        if not words:
            return []

        # Build one condition per word: each must appear in nombre OR alias
        word_conditions = []
        params: dict = {"obsoleto": 0}
        for i, w in enumerate(words):
            key = f"w{i}"
            params[key] = f"%{w}%"
            word_conditions.append(
                f"(LOWER(nombre) LIKE LOWER(%({key})s)"
                f" OR LOWER(COALESCE(alias, '')) LIKE LOWER(%({key})s))"
            )

        where = "obsoleto = 0 AND activo = true AND " + " AND ".join(word_conditions)

        agente_codigo = current_user.agente_autoventa
        if agente_codigo and current_user.solo_clientes_agente:
            where += " AND agente = %(agente)s"
            params["agente"] = agente_codigo

        cur.execute(
            f"""
            SELECT codigo, nombre, alias, cif,
                   direccion, localidad, cpostal, provincia,
                   fpago, tarifabase, COALESCE(email, '') AS email
            FROM clientes
            WHERE {where}
            ORDER BY nombre
            LIMIT 30
            """,
            params,
        )
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Ficha de un cliente ───────────────────────────────────────────────────

@router.get("/clientes/{cli_codigo}")
def get_cliente(
    cli_codigo: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT codigo, nombre, alias, cif,
                   direccion, localidad, cpostal, provincia,
                   fpago, tarifabase, COALESCE(email, '') AS email
            FROM clientes
            WHERE codigo = %(codigo)s
            """,
            {"codigo": cli_codigo},
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Consumo últimos 90 días ───────────────────────────────────────────────

@router.get("/clientes/{cli_codigo}/consumo-90dias")
def consumo_90dias(
    cli_codigo: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Tarifa del cliente
        cur.execute(
            "SELECT tarifabase, tarifaespecial FROM clientes WHERE codigo = %s",
            (cli_codigo,),
        )
        cli = cur.fetchone()
        tarifabase = int((cli["tarifabase"] if cli else None) or 1)
        tarifaespecial = int((cli["tarifaespecial"] if cli else None) or 0)

        cur.execute(
            """
            SELECT
                vl.referencia,
                vl.descripcion,
                SUM(vl.unidades)::numeric          AS uds_total,
                MAX(vc.fecha)                      AS ultima_fecha,
                COALESCE(AVG(vl.piva), 0)::numeric AS piva,
                COALESCE(MAX(a.control_lotes::int), 0)::bool  AS control_lotes,
                COALESCE(MAX(a.tallas_colores::int), 0)::bool AS tallas_colores,
                COALESCE(MAX(a.tipo_unidad), 0)::int          AS tipo_unidad,
                COALESCE(MAX(a.unidad), '')                   AS unidad,
                COALESCE(MAX(a.familia), 0)::int              AS familia,
                COALESCE(MAX(ap.precio), 0)::float            AS precio_base,
                EXISTS(
                    SELECT 1 FROM articulos_imagenes ai WHERE ai.referencia = vl.referencia LIMIT 1
                )                                  AS tiene_imagen,
                COALESCE(MAX(a.canon_digital), 0)::int        AS canon_digital,
                CASE WHEN COALESCE(MAX(a.canon_importe), 0) > 0
                     THEN MAX(a.canon_importe)::float
                     ELSE COALESCE(MAX(ac.importe1), 0)::float END AS canon_importe,
                COALESCE(MAX(a.canon_suma_importe::int), 0)::bool AS canon_suma_importe,
                COALESCE(MAX(ac.nombre), '')                   AS canon_descripcion
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vc.id = vl.idcab
            LEFT JOIN articulos a ON a.referencia = vl.referencia
            LEFT JOIN articulos_precios ap ON ap.referencia = vl.referencia AND ap.tarifa = %(tarifa)s
            LEFT JOIN articulos_canon ac ON ac.codigo = a.canon_digital
            WHERE vc.cli_codigo   = %(cli)s
              AND vc.tipodoc      IN (2, 4, 8)
              AND vc.fecha        >= CURRENT_DATE - INTERVAL '90 days'
              AND vl.referencia   IS NOT NULL
              AND vl.referencia   != ''
              AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)
              AND vl.unidades     > 0
            GROUP BY vl.referencia, vl.descripcion
            ORDER BY ultima_fecha DESC, uds_total DESC
            """,
            {"cli": cli_codigo, "tarifa": tarifabase},
        )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return []

        refs = [r["referencia"] for r in rows]
        familias = list({r["familia"] for r in rows if r["familia"] and r["familia"] > 0})

        # Condiciones especiales de tarifa del cliente
        esp_by_ref: dict = {}
        esp_by_fam: dict = {}
        esp_global = None
        if tarifaespecial > 0:
            cur.execute(
                """
                SELECT referencia, familia, descuento::float, precio::float
                FROM tarifas_especiales_detalle
                WHERE codigo_tarifa = %(cod)s
                  AND (
                    (referencia = ANY(%(refs)s) AND referencia != '')
                    OR (familia = ANY(%(fams)s) AND referencia = '')
                    OR (familia = 0 AND referencia = '')
                  )
                """,
                {"cod": tarifaespecial, "refs": refs, "fams": familias if familias else [-1]},
            )
            for ec in cur.fetchall():
                ec = dict(ec)
                if ec["referencia"]:
                    esp_by_ref.setdefault(ec["referencia"], ec)
                elif ec["familia"] == 0:
                    if esp_global is None:
                        esp_global = ec
                else:
                    esp_by_fam.setdefault(ec["familia"], ec)

        # Precios específicos por cliente (precios_clipro)
        clipro: dict = {}
        cur.execute(
            """
            SELECT DISTINCT ON (referencia) referencia, pvp::float
            FROM precios_clipro
            WHERE cliente = %s AND anulado = 0 AND referencia = ANY(%s)
            ORDER BY referencia, id DESC
            """,
            (cli_codigo, refs),
        )
        for cp in cur.fetchall():
            clipro[cp["referencia"]] = float(cp["pvp"])

        def _apply_esp(esp, base):
            if esp["precio"] and float(esp["precio"]) > 0:
                return float(esp["precio"]), 0.0
            if esp["descuento"] and float(esp["descuento"]) > 0:
                d = float(esp["descuento"])
                return base, d
            return base, 0.0

        result = []
        for r in rows:
            ref = r["referencia"]
            familia = r["familia"] or 0
            base = float(r["precio_base"])
            dto = 0.0

            if ref in clipro:
                precio = clipro[ref]
            elif ref in esp_by_ref:
                precio, dto = _apply_esp(esp_by_ref[ref], base)
            elif familia in esp_by_fam:
                precio, dto = _apply_esp(esp_by_fam[familia], base)
            elif esp_global:
                precio, dto = _apply_esp(esp_global, base)
            else:
                precio = base

            result.append({
                "referencia": ref,
                "descripcion": r["descripcion"],
                "uds_total": float(r["uds_total"]),
                "precio": round(float(precio), 6),
                "dto": dto,
                "ultima_fecha": r["ultima_fecha"].isoformat() if r["ultima_fecha"] else None,
                "piva": float(r["piva"]),
                "control_lotes": bool(r["control_lotes"]),
                "tallas_colores": bool(r["tallas_colores"]),
                "tipo_unidad": int(r["tipo_unidad"] or 0),
                "unidad": r["unidad"] or '',
                "tiene_imagen": bool(r["tiene_imagen"]),
                "canon_digital": int(r["canon_digital"] or 0),
                "canon_importe": float(r["canon_importe"] or 0),
                "canon_suma_importe": bool(r["canon_suma_importe"]),
                "canon_descripcion": str(r["canon_descripcion"] or ""),
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Buscar artículos con precio según tarifa del cliente ─────────────────

@router.get("/articulos/buscar")
def buscar_articulos(
    q: str = Query(default='', min_length=0),
    cli_codigo: int = Query(...),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Searches articles by substring (referencia or nombre) and returns them
    with the price calculated from the client's tariff and special conditions.
    Priority: precios_clipro > tarifas_especiales_detalle (by ref > by family > global) > articulos_precios (base tariff).
    """
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Get client tariff info
        cur.execute(
            "SELECT tarifabase, tarifaespecial FROM clientes WHERE codigo = %s",
            (cli_codigo,),
        )
        cli = cur.fetchone()
        if not cli:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        tarifabase = int(cli["tarifabase"] or 1)
        tarifaespecial = int(cli["tarifaespecial"] or 0)

        # Search articles with base tariff price and IVA %
        # Multi-word search: each word must appear in referencia OR nombre
        words = [w for w in q.strip().split() if w]
        art_params: dict = {"tarifa": tarifabase}
        if words:
            word_conds = []
            for i, w in enumerate(words):
                key = f"w{i}"
                art_params[key] = f"%{w}%"
                word_conds.append(
                    f"(LOWER(a.referencia) LIKE LOWER(%({key})s) OR LOWER(a.nombre) LIKE LOWER(%({key})s))"
                )
            art_where = "AND " + " AND ".join(word_conds)
            limit = "20"
        else:
            art_where = ""
            limit = "ALL"

        cur.execute(
            f"""
            SELECT
                a.referencia,
                a.nombre,
                a.familia,
                COALESCE(ti.iva, 21.0)::float       AS piva,
                COALESCE(ap.precio, 0.0)::float      AS precio_base,
                COALESCE(a.control_lotes, false)     AS control_lotes,
                COALESCE(a.tallas_colores, false)    AS tallas_colores,
                COALESCE(a.tipo_unidad, 0)::int      AS tipo_unidad,
                COALESCE(a.unidad, '')               AS unidad,
                EXISTS(
                    SELECT 1 FROM articulos_imagenes ai WHERE ai.referencia = a.referencia LIMIT 1
                )                                    AS tiene_imagen,
                COALESCE(a.canon_digital, 0)::int    AS canon_digital,
                CASE WHEN COALESCE(a.canon_importe, 0) > 0
                     THEN a.canon_importe::float
                     ELSE COALESCE(ac.importe1, 0)::float END AS canon_importe,
                COALESCE(a.canon_suma_importe, false) AS canon_suma_importe,
                COALESCE(ac.nombre, '')               AS canon_descripcion
            FROM articulos a
            LEFT JOIN tipos_iva ti    ON ti.codigo = a.tipoiva
            LEFT JOIN articulos_precios ap
                   ON ap.referencia = a.referencia AND ap.tarifa = %(tarifa)s
            LEFT JOIN articulos_canon ac ON ac.codigo = a.canon_digital
            WHERE a.obsoleto = 0
              {art_where}
            ORDER BY a.nombre
            LIMIT {limit}
            """,
            art_params,
        )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return []

        refs = [r["referencia"] for r in rows]
        familias = list({r["familia"] for r in rows if r["familia"] and r["familia"] > 0})

        # Special tariff conditions (if client has one)
        esp_by_ref: dict = {}
        esp_by_fam: dict = {}
        esp_global = None
        if tarifaespecial > 0:
            cur.execute(
                """
                SELECT referencia, familia, descuento::float, precio::float
                FROM tarifas_especiales_detalle
                WHERE codigo_tarifa = %(cod)s
                  AND (
                    (referencia = ANY(%(refs)s) AND referencia != '')
                    OR (familia = ANY(%(fams)s) AND referencia = '')
                    OR (familia = 0 AND referencia = '')
                  )
                """,
                {"cod": tarifaespecial, "refs": refs, "fams": familias if familias else [-1]},
            )
            for ec in cur.fetchall():
                ec = dict(ec)
                if ec["referencia"]:
                    esp_by_ref.setdefault(ec["referencia"], ec)
                elif ec["familia"] == 0:
                    if esp_global is None:
                        esp_global = ec
                else:
                    esp_by_fam.setdefault(ec["familia"], ec)

        # Specific client prices (precios_clipro) — most recent per article
        clipro: dict = {}
        cur.execute(
            """
            SELECT DISTINCT ON (referencia) referencia, pvp::float
            FROM precios_clipro
            WHERE cliente = %s AND anulado = 0 AND referencia = ANY(%s)
            ORDER BY referencia, id DESC
            """,
            (cli_codigo, refs),
        )
        for cp in cur.fetchall():
            clipro[cp["referencia"]] = float(cp["pvp"])

        # Apply price priority per article
        def _apply_esp(esp, base):
            if esp["precio"] and float(esp["precio"]) > 0:
                return float(esp["precio"]), 0.0
            if esp["descuento"] and float(esp["descuento"]) > 0:
                d = float(esp["descuento"])
                return base, d
            return base, 0.0

        result = []
        for r in rows:
            ref = r["referencia"]
            familia = r["familia"] or 0
            base = r["precio_base"]
            dto = 0.0

            if ref in clipro:
                precio = clipro[ref]
            elif ref in esp_by_ref:
                precio, dto = _apply_esp(esp_by_ref[ref], base)
            elif familia in esp_by_fam:
                precio, dto = _apply_esp(esp_by_fam[familia], base)
            elif esp_global:
                precio, dto = _apply_esp(esp_global, base)
            else:
                precio = base

            result.append({
                "referencia": ref,
                "nombre": r["nombre"],
                "precio": round(float(precio), 6),
                "dto": dto,
                "piva": r["piva"],
                "control_lotes": r.get("control_lotes") or False,
                "tallas_colores": r.get("tallas_colores") or False,
                "tiene_imagen": r.get("tiene_imagen") or False,
                "tipo_unidad": int(r.get("tipo_unidad") or 0),
                "unidad": r.get("unidad") or "",
                "canon_digital": int(r.get("canon_digital") or 0),
                "canon_importe": float(r.get("canon_importe") or 0),
                "canon_suma_importe": bool(r.get("canon_suma_importe")),
                "canon_descripcion": str(r.get("canon_descripcion") or ""),
            })

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Imagen miniatura de artículo ──────────────────────────────────────────

@router.get("/articulos/{referencia}/imagen")
def get_articulo_imagen(
    referencia: str,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns the thumbnail image for an article (first image, orden=1)."""
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT imagentmb FROM articulos_imagenes WHERE referencia = %s ORDER BY orden LIMIT 1",
            (referencia,),
        )
        row = cur.fetchone()
        if not row or not row["imagentmb"]:
            raise HTTPException(status_code=404, detail="Sin imagen")
        oid = row["imagentmb"]
        cur.execute("SELECT lo_get(%s) AS data", (oid,))
        data_row = cur.fetchone()
        if not data_row or not data_row["data"]:
            raise HTTPException(status_code=404, detail="Sin imagen")
        img_bytes = bytes(data_row["data"])
        # Detect content type by magic bytes
        if img_bytes[:3] == b'\xff\xd8\xff':
            media_type = "image/jpeg"
        elif img_bytes[:4] == b'\x89PNG':
            media_type = "image/png"
        elif img_bytes[:4] in (b'GIF8', b'GIF9'):
            media_type = "image/gif"
        else:
            media_type = "image/jpeg"
        return Response(content=img_bytes, media_type=media_type,
                        headers={"Cache-Control": "public, max-age=86400"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error imagen: {e}")
    finally:
        if conn:
            conn.close()


# ── Lotes disponibles de un artículo ─────────────────────────────────────

@router.get("/articulos/{referencia}/lotes")
def get_articulo_lotes(
    referencia: str,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns available lots (stock > 0) for a lot-controlled article, sorted FEFO."""
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Obtener tipo_unidad y nombre de la segunda unidad del artículo
        cur.execute(
            "SELECT tipo_unidad, unidad FROM articulos WHERE referencia = %s",
            (referencia,),
        )
        art = cur.fetchone()
        es_doble = art and art.get("tipo_unidad") == 1
        unidad_nombre = (art.get("unidad") or "Kilos") if art else "Kilos"

        if es_doble:
            # Para doble unidad: stock en gramos/kilos (campo gramos en lotes_stock)
            cur.execute(
                """
                SELECT
                    al.id,
                    al.lote,
                    al.fecha_compra,
                    al.fecha_caducidad,
                    COALESCE(SUM(als.unidades), 0)::float AS stock_uds,
                    COALESCE(SUM(als.gramos), 0)::float   AS stock_gramos
                FROM articulos_lotes al
                LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
                WHERE al.referencia = %s
                GROUP BY al.id, al.lote, al.fecha_compra, al.fecha_caducidad
                HAVING COALESCE(SUM(als.gramos), 0) > 0
                ORDER BY al.fecha_caducidad ASC NULLS LAST, al.fecha_compra ASC
                """,
                (referencia,),
            )
        else:
            cur.execute(
                """
                SELECT
                    al.id,
                    al.lote,
                    al.fecha_compra,
                    al.fecha_caducidad,
                    COALESCE(SUM(als.unidades), 0)::float AS stock_uds,
                    0::float AS stock_gramos
                FROM articulos_lotes al
                LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
                WHERE al.referencia = %s
                GROUP BY al.id, al.lote, al.fecha_compra, al.fecha_caducidad
                HAVING COALESCE(SUM(als.unidades), 0) > 0
                ORDER BY al.fecha_caducidad ASC NULLS LAST, al.fecha_compra ASC
                """,
                (referencia,),
            )

        rows = cur.fetchall()
        result = []
        for r in rows:
            stock = r["stock_gramos"] if es_doble else r["stock_uds"]
            result.append({
                "id": r["id"],
                "lote": r["lote"],
                "fecha_compra": r["fecha_compra"].isoformat() if r["fecha_compra"] else None,
                "fecha_caducidad": r["fecha_caducidad"].isoformat() if r["fecha_caducidad"] else None,
                "stock": stock,
                "stock_uds": r["stock_uds"],
                "stock_gramos": r["stock_gramos"],
                "es_doble_unidad": bool(es_doble),
                "unidad": unidad_nombre,
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error lotes: {e}")
    finally:
        if conn:
            conn.close()


# ── Tallas y colores disponibles de un artículo ───────────────────────────

@router.get("/articulos/{referencia}/tallas-colores")
def get_articulo_tallas_colores(
    referencia: str,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns tallas, colores and aggregated stock for a talla/color article."""
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            "SELECT grupo_tallas, grupo_colores FROM articulos WHERE referencia = %s",
            (referencia,),
        )
        art = cur.fetchone()
        if not art:
            raise HTTPException(status_code=404, detail="Artículo no encontrado")

        grupo_tallas = int(art["grupo_tallas"] or 0)
        grupo_colores = int(art["grupo_colores"] or 0)

        cur.execute(
            """
            SELECT r.talla, COALESCE(t.nombre, r.talla) AS nombre, r.orden
            FROM articulos_tallas_rel_grupos r
            LEFT JOIN articulos_tallas t ON t.codigo = r.talla
            WHERE r.grupo = %s
            ORDER BY r.orden
            """,
            (grupo_tallas,),
        )
        tallas = [{"codigo": row["talla"], "nombre": row["nombre"], "orden": row["orden"]} for row in cur.fetchall()]

        cur.execute(
            """
            SELECT r.color, COALESCE(c.nombre, r.color) AS nombre,
                   COALESCE(c.codigo_rgb, '') AS codigo_rgb, r.orden
            FROM articulos_colores_rel_grupos r
            LEFT JOIN articulos_colores c ON c.codigo = r.color
            WHERE r.grupo = %s
            ORDER BY r.orden
            """,
            (grupo_colores,),
        )
        colores = [
            {"codigo": row["color"], "nombre": row["nombre"], "codigo_rgb": row["codigo_rgb"], "orden": row["orden"]}
            for row in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT talla, color, COALESCE(SUM(actual), 0)::float AS actual
            FROM almacenes_stock_tallas_colores
            WHERE referencia = %s
            GROUP BY talla, color
            """,
            (referencia,),
        )
        stock = [{"talla": row["talla"], "color": row["color"], "actual": float(row["actual"])} for row in cur.fetchall()]

        return {"tallas": tallas, "colores": colores, "stock": stock}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error TC: {e}")
    finally:
        if conn:
            conn.close()


# ── Crear documento ───────────────────────────────────────────────────────

class LineaDocumento(BaseModel):
    referencia: str
    descripcion: str
    unidades: float
    gramos: Optional[float] = 0.0    # segunda unidad (kg) para tipo_unidad=1
    tipo_unidad: Optional[int] = 0   # 0=normal, 1=doble unidad
    precio: float
    piva: float = 0.0
    dto: Optional[float] = 0.0
    talla: Optional[str] = ""
    color: Optional[str] = ""
    lotes_asignados: Optional[list] = None


class CrearDocumentoRequest(BaseModel):
    tipodoc: int          # 2=Pedido, 4=Albarán, 8=Factura
    serie: str
    cli_codigo: int
    cli_nombre: str
    cli_cif: Optional[str] = ""
    cli_direccion: Optional[str] = ""
    cli_localidad: Optional[str] = ""
    cli_cpostal: Optional[str] = ""
    cli_provincia: Optional[int] = 0
    fpago: Optional[int] = 1
    tarifa: Optional[int] = 1
    observaciones: Optional[str] = ""
    lineas: list[LineaDocumento]


@router.post("/documento")
def crear_documento(
    body: CrearDocumentoRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)

    if body.tipodoc not in TIPODOC_LABELS:
        raise HTTPException(status_code=400, detail="tipodoc debe ser 2, 4 u 8")

    lineas_validas = [l for l in body.lineas if l.unidades > 0]
    if not lineas_validas:
        raise HTTPException(status_code=400, detail="El documento debe tener al menos una línea con unidades")

    agente_codigo = current_user.agente_autoventa or 0

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Get next numero for this serie+tipodoc
        cur.execute(
            "SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente "
            "FROM ventas_cabeceras WHERE serie = %(s)s AND tipodoc = %(t)s",
            {"s": body.serie, "t": body.tipodoc},
        )
        numero = cur.fetchone()["siguiente"]

        today = date.today()

        # Calculate totals grouped by IVA rate
        iva_groups: dict[float, dict] = {}
        for l in lineas_validas:
            # Para doble unidad, el importe se calcula sobre los gramos (segunda unidad)
            base_qty = (l.gramos or 0) if l.tipo_unidad == 1 else l.unidades
            dto_factor = 1 - (l.dto or 0) / 100
            importe = round(base_qty * l.precio * dto_factor, 6)
            piva = l.piva
            if piva not in iva_groups:
                iva_groups[piva] = {"base": Decimal("0"), "iva_importe": Decimal("0")}
            iva_groups[piva]["base"] += Decimal(str(round(importe, 6)))
            iva_importe = Decimal(str(round(importe * piva / 100, 6)))
            iva_groups[piva]["iva_importe"] += iva_importe

        sorted_pivas = sorted(iva_groups.keys())

        def get_group(idx: int) -> tuple:
            if idx < len(sorted_pivas):
                piva = sorted_pivas[idx]
                g = iva_groups[piva]
                return float(g["base"]), piva, float(g["iva_importe"])
            return 0.0, 0.0, 0.0

        base1, piva1, iva1 = get_group(0)
        base2, piva2, iva2 = get_group(1)
        base3, piva3, iva3 = get_group(2)

        total = round(base1 + iva1 + base2 + iva2 + base3 + iva3, 2)

        # Insert cabecera
        cur.execute(
            """
            INSERT INTO ventas_cabeceras (
                tipodoc, serie, numero, fecha,
                cli_codigo, cli_nombre, cli_cif,
                cli_direccion, cli_localidad, cli_cpostal, cli_provincia,
                agente, fpago, tarifa,
                baseimpo1, piva1, iva1,
                baseimpo2, piva2, iva2,
                baseimpo3, piva3, iva3,
                total, observaciones
            ) VALUES (
                %(tipodoc)s, %(serie)s, %(numero)s, %(fecha)s,
                %(cli_codigo)s, %(cli_nombre)s, %(cli_cif)s,
                %(cli_direccion)s, %(cli_localidad)s, %(cli_cpostal)s, %(cli_provincia)s,
                %(agente)s, %(fpago)s, %(tarifa)s,
                %(base1)s, %(piva1)s, %(iva1)s,
                %(base2)s, %(piva2)s, %(iva2)s,
                %(base3)s, %(piva3)s, %(iva3)s,
                %(total)s, %(observaciones)s
            ) RETURNING id
            """,
            {
                "tipodoc": body.tipodoc, "serie": body.serie, "numero": numero, "fecha": today,
                "cli_codigo": body.cli_codigo, "cli_nombre": body.cli_nombre, "cli_cif": body.cli_cif or "",
                "cli_direccion": body.cli_direccion or "", "cli_localidad": body.cli_localidad or "",
                "cli_cpostal": body.cli_cpostal or "", "cli_provincia": body.cli_provincia or 0,
                "agente": agente_codigo, "fpago": body.fpago or 1, "tarifa": body.tarifa or 1,
                "base1": base1, "piva1": piva1, "iva1": iva1,
                "base2": base2, "piva2": piva2, "iva2": iva2,
                "base3": base3, "piva3": piva3, "iva3": iva3,
                "total": total, "observaciones": body.observaciones or "",
            },
        )
        idcab = cur.fetchone()["id"]

        almacen = current_user.almacen_autoventa or 1

        # Insert lineas
        for orden, l in enumerate(lineas_validas, start=1):
            base_qty = (l.gramos or 0) if l.tipo_unidad == 1 else l.unidades
            dto_factor = 1 - (l.dto or 0) / 100
            importe = round(base_qty * l.precio * dto_factor, 6)
            cur.execute(
                """
                INSERT INTO ventas_lineas (
                    idcab, tipodoc, serie, numero, cli_codigo,
                    orden, fecha,
                    referencia, descripcion,
                    unidades, gramos, precio, importe, piva,
                    pdto1, talla, color,
                    tipo_unidad, almacen,
                    coste, pmp, usuario
                ) VALUES (
                    %(idcab)s, %(tipodoc)s, %(serie)s, %(numero)s, %(cli_codigo)s,
                    %(orden)s, %(fecha)s,
                    %(referencia)s, %(descripcion)s,
                    %(unidades)s, %(gramos)s, %(precio)s, %(importe)s, %(piva)s,
                    %(pdto1)s, %(talla)s, %(color)s,
                    %(tipo_unidad)s, %(almacen)s,
                    0, 0, %(usuario)s
                ) RETURNING id
                """,
                {
                    "idcab": idcab, "tipodoc": body.tipodoc, "serie": body.serie,
                    "numero": numero, "cli_codigo": body.cli_codigo,
                    "orden": orden, "fecha": today,
                    "referencia": l.referencia, "descripcion": l.descripcion,
                    "unidades": l.unidades, "gramos": l.gramos or 0,
                    "precio": l.precio, "importe": importe, "piva": l.piva,
                    "pdto1": l.dto or 0, "talla": l.talla or "", "color": l.color or "",
                    "tipo_unidad": l.tipo_unidad or 0, "almacen": almacen,
                    "usuario": current_user.id,
                },
            )
            id_lin = cur.fetchone()["id"]

            # Guardar movimientos de lotes si la línea tiene lotes asignados
            if l.lotes_asignados:
                for asig in l.lotes_asignados:
                    id_lote = asig.get("id") if isinstance(asig, dict) else getattr(asig, "id", None)
                    asignar = asig.get("asignar") if isinstance(asig, dict) else getattr(asig, "asignar", 0)
                    if not id_lote or not asignar:
                        continue
                    es_doble = (l.tipo_unidad or 0) == 1
                    uds_mov = 0 if es_doble else asignar
                    gramos_mov = asignar if es_doble else 0
                    # Insertar en articulos_lotes_registro (tipo=0 → salida/venta)
                    cur.execute(
                        """
                        INSERT INTO articulos_lotes_registro
                            (id_lote, tipo, id_lin, almacen, unidades, gramos,
                             id_lin_origen, stock_unidades, stock_gramos, temperatura)
                        VALUES
                            (%(id_lote)s, 0, %(id_lin)s, %(almacen)s, %(uds)s, %(gramos)s,
                             0, 0, 0, 0)
                        """,
                        {"id_lote": id_lote, "id_lin": id_lin, "almacen": almacen,
                         "uds": uds_mov, "gramos": gramos_mov},
                    )
                    # Actualizar stock del lote
                    if es_doble:
                        cur.execute(
                            "UPDATE articulos_lotes_stock SET gramos = gramos - %(g)s "
                            "WHERE id_lote = %(id)s AND almacen = %(alm)s",
                            {"g": gramos_mov, "id": id_lote, "alm": almacen},
                        )
                    else:
                        cur.execute(
                            "UPDATE articulos_lotes_stock SET unidades = unidades - %(u)s "
                            "WHERE id_lote = %(id)s AND almacen = %(alm)s",
                            {"u": uds_mov, "id": id_lote, "alm": almacen},
                        )

        conn.commit()
        return {
            "ok": True,
            "id": idcab,
            "serie": body.serie,
            "numero": numero,
            "tipodoc": body.tipodoc,
            "tipodoc_label": TIPODOC_LABELS[body.tipodoc],
            "total": total,
        }

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando documento: {e}")
    finally:
        if conn:
            conn.close()


# ── Formas de pago del usuario ────────────────────────────────────────────

@router.get("/formaspago")
def list_formaspago(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns the formas de pago the user is allowed to use in Autoventa."""
    _require_autoventa(current_user)

    fpagos_ids = json.loads(current_user.fpagos_autoventa or "[]")

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        if fpagos_ids:
            cur.execute(
                "SELECT codigo, nombre FROM formaspago WHERE codigo = ANY(%(ids)s) ORDER BY nombre",
                {"ids": fpagos_ids},
            )
        else:
            # superadmin / gerente can see all
            cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Documentos pendientes del cliente ─────────────────────────────────────

@router.get("/clientes/{cli_codigo}/documentos")
def documentos_cliente(
    cli_codigo: int,
    solo_pte: bool = Query(default=True),
    tipodoc: Optional[int] = Query(default=None),  # 4=albaran, 8=factura, None=todos
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Documentos del cliente para autoventa.

    ALBARANES (tipodoc=4):
      "Pendiente" significa PENDIENTE DE FACTURAR, no de cobro.
      Un albarán está pendiente si ninguna línea de factura (ventas_lineas.idalbaran)
      lo referencia como origen de una factura (ventas_cabeceras.tipodoc=8).
      Cuando el ERP factura un albarán, genera líneas con idalbaran = id del albarán.
      El cobro de albaranes (cuando se hace contra entrega) se registra en
      ventas_entregas (idcab = id albarán), pero eso es independiente de la facturación.

    FACTURAS (tipodoc=8):
      "Pendiente" significa vencimientos con situacion=0 (pendiente de cobro).
      Los vencimientos cobrados tienen situacion != 0.
      Los pagos parciales a cuenta de un vencimiento van en
      ventas_entregas (idvencimiento = id vencimiento).
    """
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        results = []
        include_alb = tipodoc is None or tipodoc == 4
        include_fac = tipodoc is None or tipodoc == 8

        # ── Albaranes ────────────────────────────────────────────────────
        # Pendiente = NO facturado aún.
        # Al facturar, ventas_lineas.idalbaran apunta al id del albarán original.
        # NOT EXISTS es más rápido que LEFT JOIN global (~8ms vs ~100ms).
        # Además se descuentan cobros directos al albarán via ventas_entregas (idvencimiento=0).
        if include_alb:
            if solo_pte:
                alb_filter = """
                  AND NOT EXISTS (
                      SELECT 1 FROM ventas_lineas vl
                      JOIN ventas_cabeceras vc2 ON vc2.id = vl.idcab AND vc2.tipodoc = 8
                      WHERE vl.idalbaran = vc.id
                  )
                  AND vc.total > COALESCE((
                      SELECT SUM(e.importe) FROM ventas_entregas e
                      WHERE e.idcab = vc.id AND (e.idvencimiento IS NULL OR e.idvencimiento = 0)
                  ), 0)
                """
            else:
                alb_filter = ""
            cur.execute(f"""
                SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total,
                       COALESCE((
                           SELECT SUM(e.importe)
                           FROM ventas_entregas e
                           WHERE e.idcab = vc.id
                             AND (e.idvencimiento IS NULL OR e.idvencimiento = 0)
                       ), 0)::float AS cobrado_cuenta
                FROM ventas_cabeceras vc
                WHERE vc.cli_codigo = %(cli)s
                  AND vc.tipodoc = 4
                  {alb_filter}
                ORDER BY vc.fecha DESC
                LIMIT 50
            """, {"cli": cli_codigo})
            for r in cur.fetchall():
                total = float(r["total"])
                cobrado = float(r["cobrado_cuenta"])
                pendiente_cobro = max(0.0, round(total - cobrado, 2))
                results.append({
                    "id": r["id"],
                    "tipodoc": r["tipodoc"],
                    "tipodoc_label": "Albarán",
                    "serie": r["serie"],
                    "numero": r["numero"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "total": total,
                    "pagado": cobrado,
                    "pendiente": pendiente_cobro,  # cobro pendiente real
                    "vencimientos": [],
                })

        # ── Facturas ──────────────────────────────────────────────────────
        # Pendiente = vencimientos con situacion=0.
        # La subquery pre-agrega ventas_entregas por idvencimiento para evitar
        # una subquery correlada dentro del json_agg (1 consulta por vencimiento).
        if include_fac:
            fac_having = "HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0" if solo_pte else ""
            cur.execute(f"""
                WITH ve_sum AS (
                    SELECT e.idvencimiento, SUM(e.importe) AS cobrado
                    FROM ventas_entregas e
                    WHERE e.idvencimiento > 0
                    GROUP BY e.idvencimiento
                )
                SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total,
                       json_agg(json_build_object(
                           'id', v.id,
                           'fecha_vencimiento', v.fecha_vencimiento,
                           'importe', v.importe,
                           'situacion', v.situacion,
                           'entregas_cuenta', COALESCE(ve.cobrado, 0)
                       ) ORDER BY v.fecha_vencimiento) FILTER (WHERE v.id IS NOT NULL) AS vencimientos
                FROM ventas_cabeceras vc
                LEFT JOIN vencimientos v ON v.idcab = vc.id
                LEFT JOIN ve_sum ve ON ve.idvencimiento = v.id
                WHERE vc.cli_codigo = %(cli)s
                  AND vc.tipodoc = 8
                GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total
                {fac_having}
                ORDER BY vc.fecha DESC
                LIMIT 50
            """, {"cli": cli_codigo})
            for r in cur.fetchall():
                vtos_raw = r["vencimientos"] or []
                vtos = []
                for v in vtos_raw:
                    if not solo_pte or v["situacion"] == 0:
                        fv = v["fecha_vencimiento"]
                        vtos.append({
                            "id": v["id"],
                            "fecha_vencimiento": fv.isoformat() if hasattr(fv, "isoformat") else str(fv),
                            "importe": float(v["importe"]),
                            "situacion": v["situacion"],
                            "entregas_cuenta": float(v["entregas_cuenta"]),
                        })
                total = float(r["total"])
                pendiente = sum(v["importe"] - v["entregas_cuenta"] for v in vtos if v["situacion"] == 0)
                results.append({
                    "id": r["id"],
                    "tipodoc": r["tipodoc"],
                    "tipodoc_label": "Factura",
                    "serie": r["serie"],
                    "numero": r["numero"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "total": total,
                "pagado": round(total - pendiente, 2),
                "pendiente": round(pendiente, 2),
                "vencimientos": vtos,
            })

        # Sort all by fecha desc
        results.sort(key=lambda x: x["fecha"] or "", reverse=True)
        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Ver líneas de un documento ───────────────────────────────────────────

@router.get("/clientes/{cli_codigo}/documentos/{idcab}/lineas")
def get_documento_lineas(
    cli_codigo: int,
    idcab: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve las líneas de un albarán o factura de autoventa."""
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        # Verificar que el documento pertenece al cliente
        cur.execute(
            "SELECT id, tipodoc, serie, numero, fecha, cli_codigo, cli_nombre, total FROM ventas_cabeceras WHERE id = %s AND cli_codigo = %s",
            (idcab, cli_codigo),
        )
        cab = cur.fetchone()
        if not cab:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        cur.execute(
            """SELECT vl.referencia, vl.descripcion, vl.unidades, vl.gramos,
                      vl.tipo_unidad, ''::text AS unidad, vl.precio, vl.pdto1 AS dto,
                      vl.importe, vl.piva, vl.talla, vl.color,
                      vl.linea_cabecera,
                      (
                          SELECT STRING_AGG(ls.lote, ', ' ORDER BY ls.fecha_caducidad ASC NULLS LAST, ls.lote)
                          FROM (
                              SELECT DISTINCT al.lote, al.fecha_caducidad
                              FROM articulos_lotes_registro alr
                              JOIN articulos_lotes al ON al.id = alr.id_lote
                              WHERE alr.id_lin = vl.id
                          ) ls
                      ) AS lote,
                      (
                          SELECT STRING_AGG(cs.cad, ', ' ORDER BY cs.cad)
                          FROM (
                              SELECT DISTINCT TO_CHAR(al.fecha_caducidad, 'DD/MM/YYYY') AS cad
                              FROM articulos_lotes_registro alr
                              JOIN articulos_lotes al ON al.id = alr.id_lote
                              WHERE alr.id_lin = vl.id
                                AND al.fecha_caducidad IS NOT NULL
                          ) cs
                      ) AS fecha_caducidad
               FROM ventas_lineas vl WHERE idcab = %s ORDER BY id""",
            (idcab,),
        )
        lineas = []
        for r in cur.fetchall():
            es_canon = int(r["linea_cabecera"] or 0) > 0 or not r.get("referencia")
            lineas.append({
                "referencia": r["referencia"] or "",
                "descripcion": r["descripcion"] or "",
                "unidades": float(r["unidades"]),
                "gramos": float(r["gramos"] or 0),
                "tipo_unidad": int(r["tipo_unidad"] or 0),
                "unidad": r["unidad"] or "",
                "precio": float(r["precio"]),
                "dto": float(r["dto"] or 0),
                "importe": float(r["importe"]),
                "piva": float(r["piva"] or 0),
                "talla": r["talla"] or "",
                "color": r["color"] or "",
                "es_canon": es_canon,
                "lote": r["lote"] or None,
                "fecha_caducidad": r["fecha_caducidad"] or None,
            })
        return {
            "id": cab["id"],
            "tipodoc": cab["tipodoc"],
            "serie": cab["serie"],
            "numero": cab["numero"],
            "fecha": cab["fecha"].isoformat() if cab["fecha"] else None,
            "cli_codigo": cab["cli_codigo"],
            "cli_nombre": cab["cli_nombre"] or "",
            "total": float(cab["total"]),
            "lineas": lineas,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Cobrar documento ──────────────────────────────────────────────────────

class CobrarAlbaranRequest(BaseModel):
    fpago_codigo: Optional[int] = None
    importe: float


class CobrarVencimientoRequest(BaseModel):
    vto_id: int
    fpago_codigo: Optional[int] = None
    importe: float


@router.post("/clientes/{cli_codigo}/documentos/{idcab}/cobrar-albaran")
def cobrar_albaran(
    cli_codigo: int,
    idcab: int,
    body: CobrarAlbaranRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Register a payment for an albarán (ventas_entregas)."""
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Verify document exists and belongs to client
        cur.execute(
            "SELECT id, total, serie, numero FROM ventas_cabeceras "
            "WHERE id = %(id)s AND cli_codigo = %(cli)s AND tipodoc = 4",
            {"id": idcab, "cli": cli_codigo}
        )
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Albarán no encontrado")

        today = date.today()
        caja_id = current_user.caja_autoventa or 0
        user_id = current_user.id
        fpago = body.fpago_codigo or current_user.fpago_autoventa or 1
        concepto = f"Cobro cliente albarán {doc['serie']}-{doc['numero']}"

        # 1º — cajas_registro (igual que el ERP: primero caja, luego ve, luego rc)
        caja_reg_id = 0
        if caja_id:
            cur.execute("""
                SELECT COALESCE(MAX(numregistro), 0) + 1 AS next_num
                FROM cajas_registro WHERE codigo = %(caja)s
            """, {"caja": caja_id})
            next_num = cur.fetchone()["next_num"]
            cur.execute("""
                SELECT COALESCE(saldo, 0) AS last_saldo
                FROM cajas_registro WHERE codigo = %(caja)s ORDER BY id DESC LIMIT 1
            """, {"caja": caja_id})
            saldo_row = cur.fetchone()
            new_saldo = float(saldo_row["last_saldo"] if saldo_row else 0) + float(body.importe)
            cur.execute("""
                INSERT INTO cajas_registro(
                    codigo, numregistro, fecha, concepto, ingreso, reintegro, saldo,
                    idvencimiento, usuario, hora, tiposujeto, idsujeto, turno, apuntecierre,
                    terminaltpv, es_entrega_alb, fecha_conta, fecha_pre_conta, usuario_pre_conta,
                    usuario_conta, destino, id_registro_banco, observaciones, id_conta, edit, num_anticipo
                ) VALUES (
                    %(caja)s, %(num)s, %(fecha)s, %(concepto)s, %(ingreso)s, 0, %(saldo)s,
                    0, %(user)s, NOW(), 1, %(cli)s, 1, 0,
                    1, 1, NULL, NULL, 0, 0, 0, 0, '', 0, false, 0
                ) RETURNING id
            """, {
                "caja": caja_id, "num": next_num, "fecha": today, "concepto": concepto,
                "ingreso": body.importe, "saldo": new_saldo, "user": user_id, "cli": cli_codigo
            })
            caja_reg_id = cur.fetchone()["id"]

        # 2º — ventas_entregas con idregistro apuntando a cajas_registro
        cur.execute("""
            INSERT INTO ventas_entregas(idcab, idregistro, cliente, fecha, importe,
                                        usuario, cajabanco, codigo_cb, idvencimiento, terminal, turno)
            VALUES (%(idcab)s, %(caja_reg)s, %(cli)s, %(fecha)s, %(importe)s,
                    %(user)s, 0, %(fpago)s, 0, 1, 1)
            RETURNING id
        """, {"idcab": idcab, "caja_reg": caja_reg_id, "cli": cli_codigo,
              "fecha": today, "importe": body.importe, "fpago": fpago,
              "user": user_id})
        ve_id = cur.fetchone()["id"]

        # 3º — registro_cobros con id_vto apuntando a ventas_entregas, importe=0
        cur.execute("""
            INSERT INTO registro_cobros(id_cab, id_vto, tipo, es_cobro, es_impago, es_anulacion,
                                        es_entrega, created_by, created_at, borrado, es_manual, importe)
            VALUES (%(idcab)s, %(ve)s, 0, true, false, false, true, %(user)s, NOW(), false, false, 0)
            RETURNING id
        """, {"idcab": idcab, "ve": ve_id, "user": user_id})
        reg_id = cur.fetchone()["id"]

        conn.commit()
        return {"ok": True, "idregistro": reg_id}

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error registrando cobro: {e}")
    finally:
        if conn:
            conn.close()


@router.post("/clientes/{cli_codigo}/documentos/{idcab}/cobrar-vencimiento")
def cobrar_vencimiento(
    cli_codigo: int,
    idcab: int,
    body: CobrarVencimientoRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Register a payment for a factura vencimiento."""
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Verify vencimiento
        cur.execute("""
            SELECT v.id, v.importe, v.situacion, vc.cli_codigo, vc.serie, vc.numero,
                   COALESCE(
                       (SELECT SUM(e2.importe) FROM ventas_entregas e2 WHERE e2.idvencimiento = v.id), 0
                   ) AS ya_entregado
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON vc.id = v.idcab
            WHERE v.id = %(vto)s AND vc.id = %(idcab)s AND vc.cli_codigo = %(cli)s
        """, {"vto": body.vto_id, "idcab": idcab, "cli": cli_codigo})
        vto = cur.fetchone()
        if not vto:
            raise HTTPException(status_code=404, detail="Vencimiento no encontrado")
        if vto["situacion"] != 0:
            raise HTTPException(status_code=400, detail="El vencimiento ya está cobrado")

        today = date.today()
        caja_id = current_user.caja_autoventa or 0
        user_id = current_user.id
        fpago = body.fpago_codigo or current_user.fpago_autoventa or 1

        importe_vto = float(vto["importe"])
        ya_entregado = float(vto["ya_entregado"])
        pendiente_vto = round(importe_vto - ya_entregado, 2)
        cobro = float(body.importe)
        # ¿Cubre el pago restante? (con margen de 1 céntimo)
        pago_total = cobro >= pendiente_vto - 0.01
        concepto = f"Cobro cliente factura {vto['serie']}-{vto['numero']}"

        # 1º — cajas_registro
        caja_reg_id = 0
        if caja_id:
            cur.execute("""
                SELECT COALESCE(MAX(numregistro), 0) + 1 AS next_num
                FROM cajas_registro WHERE codigo = %(caja)s
            """, {"caja": caja_id})
            next_num = cur.fetchone()["next_num"]
            cur.execute("""
                SELECT COALESCE(saldo, 0) AS last_saldo
                FROM cajas_registro WHERE codigo = %(caja)s ORDER BY id DESC LIMIT 1
            """, {"caja": caja_id})
            saldo_row = cur.fetchone()
            new_saldo = float(saldo_row["last_saldo"] if saldo_row else 0) + cobro
            cur.execute("""
                INSERT INTO cajas_registro(
                    codigo, numregistro, fecha, concepto, ingreso, reintegro, saldo,
                    idvencimiento, usuario, hora, tiposujeto, idsujeto, turno, apuntecierre,
                    terminaltpv, es_entrega_alb, fecha_conta, fecha_pre_conta, usuario_pre_conta,
                    usuario_conta, destino, id_registro_banco, observaciones, id_conta, edit, num_anticipo
                ) VALUES (
                    %(caja)s, %(num)s, %(fecha)s, %(concepto)s, %(ingreso)s, 0, %(saldo)s,
                    %(vto_id)s, %(user)s, NOW(), 1, %(cli)s, 1, 0,
                    1, 0, NULL, NULL, 0, 0, 0, 0, '', 0, false, 0
                ) RETURNING id
            """, {
                "caja": caja_id, "num": next_num, "fecha": today, "concepto": concepto,
                "ingreso": cobro, "saldo": new_saldo, "user": user_id,
                "cli": cli_codigo, "vto_id": body.vto_id
            })
            caja_reg_id = cur.fetchone()["id"]

        # 2º — ventas_entregas con idvencimiento (igual que albaranes, es como el ERP registra entregas a cuenta)
        cur.execute("""
            INSERT INTO ventas_entregas(idcab, idregistro, cliente, fecha, importe,
                                        usuario, cajabanco, codigo_cb, idvencimiento, terminal, turno)
            VALUES (%(idcab)s, %(caja_reg)s, %(cli)s, %(fecha)s, %(importe)s,
                    %(user)s, 0, %(fpago)s, %(vto_id)s, 1, 1)
            RETURNING id
        """, {"idcab": idcab, "caja_reg": caja_reg_id, "cli": cli_codigo,
              "fecha": today, "importe": cobro, "fpago": fpago,
              "user": user_id, "vto_id": body.vto_id})
        ve_id = cur.fetchone()["id"]

        # 3º — actualizar vencimiento: situacion=1 solo si paga el total, si no queda pendiente
        if pago_total:
            cur.execute("""
                UPDATE vencimientos
                SET situacion = 1,
                    fechacobro = %(fecha)s,
                    cajabanco  = %(caja)s,
                    codigo_cb  = %(fpago)s,
                    idregistro = %(caja_reg)s
                WHERE id = %(vto)s
            """, {"fecha": today, "fpago": fpago, "caja_reg": caja_reg_id,
                  "vto": body.vto_id, "caja": caja_id})
        # Si es entrega parcial, el vencimiento sigue en situacion=0 — se actualiza solo al cobrar el resto

        # 4º — registro_cobros con id_vto apuntando a ventas_entregas, importe=0
        cur.execute("""
            INSERT INTO registro_cobros(id_cab, id_vto, tipo, es_cobro, es_impago, es_anulacion,
                                        es_entrega, created_by, created_at, borrado, es_manual, importe)
            VALUES (%(idcab)s, %(ve)s, 0, true, false, false, false, %(user)s, NOW(), false, false, 0)
            RETURNING id
        """, {"idcab": idcab, "ve": ve_id, "user": user_id})
        reg_id = cur.fetchone()["id"]

        conn.commit()
        return {"ok": True, "idregistro": reg_id, "cobro_total": pago_total}

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error registrando cobro: {e}")
    finally:
        if conn:
            conn.close()


# ── Arqueo de cobros del usuario ─────────────────────────────────────────

@router.get("/arqueo")
def arqueo(
    desde: str = Query(...),
    hasta: str = Query(...),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    caja_id = current_user.caja_autoventa or 0
    user_id = current_user.id
    if not caja_id:
        return {"lineas": [], "total_ingreso": 0, "total_reintegro": 0, "saldo_final": 0}
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("""
            SELECT cr.id, cr.fecha, cr.concepto, cr.ingreso, cr.reintegro, cr.saldo,
                   cr.es_entrega_alb,
                   vc.serie, vc.numero,
                   COALESCE(vc.cli_nombre, c.nombre) AS cli_nombre,
                   COALESCE(vc.id, ve.idcab) AS idcab
            FROM cajas_registro cr
            LEFT JOIN ventas_entregas ve ON ve.idregistro = cr.id
            LEFT JOIN ventas_cabeceras vc ON vc.id = ve.idcab
            LEFT JOIN clientes c ON c.codigo = cr.idsujeto AND cr.tiposujeto = 1
            WHERE cr.usuario = %(user)s
              AND cr.codigo = %(caja)s
              AND cr.fecha BETWEEN %(desde)s AND %(hasta)s
              AND cr.es_entrega_alb IN (0, 1)
              AND cr.ingreso > 0
            ORDER BY cr.id ASC
        """, {"user": user_id, "caja": caja_id, "desde": desde, "hasta": hasta})
        rows = cur.fetchall()
        lineas = []
        saldo_acum = 0.0
        for r in rows:
            ingreso = float(r["ingreso"] or 0)
            reintegro = float(r["reintegro"] or 0)
            saldo_acum += ingreso - reintegro
            lineas.append({
                "id": r["id"],
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "concepto": r["concepto"] or "",
                "serie": r["serie"] or "",
                "numero": r["numero"],
                "cli_nombre": r["cli_nombre"] or "",
                "idcab": r["idcab"],
                "ingreso": ingreso,
                "reintegro": reintegro,
                "saldo": round(saldo_acum, 2),
            })
        total_ingreso = sum(l["ingreso"] for l in lineas)
        total_reintegro = sum(l["reintegro"] for l in lineas)
        return {
            "lineas": lineas,
            "total_ingreso": round(total_ingreso, 2),
            "total_reintegro": round(total_reintegro, 2),
            "saldo_final": round(total_ingreso - total_reintegro, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Todos los documentos pendientes del agente ────────────────────────────

@router.get("/documentos-todos")
def documentos_todos(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Returns all pending documents (facturas + albaranes no facturados)
    for all clients of the current user's agent.
    - Albarán: tipodoc=4, MAX(vl.idfactura)=0 (no facturado), pendiente > 0.01
    - Factura: tipodoc=8, con vencimientos situacion=0
    """
    _require_autoventa(current_user)
    agente = current_user.agente_autoventa
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        results = []

        # ── Albaranes no facturados con pendiente ──────────────────────
        alb_filter = "AND cli.agente = %(agente)s" if (agente and current_user.solo_clientes_agente) else ""
        cur.execute(f"""
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                   vc.cli_codigo, vc.cli_nombre, vc.total,
                   COALESCE(SUM(e.importe), 0)::numeric AS pagado
            FROM ventas_cabeceras vc
            JOIN clientes cli ON cli.codigo = vc.cli_codigo
            LEFT JOIN ventas_entregas e ON e.idcab = vc.id
            WHERE vc.tipodoc = 4
              {alb_filter}
              AND NOT EXISTS (
                  SELECT 1 FROM ventas_lineas vl
                  WHERE vl.idcab = vc.id AND vl.idfactura > 0
              )
            GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                     vc.cli_codigo, vc.cli_nombre, vc.total
            HAVING (vc.total - COALESCE(SUM(e.importe), 0)) > 0.01
            ORDER BY vc.fecha DESC
            LIMIT 200
        """, {"agente": agente})
        for r in cur.fetchall():
            total = float(r["total"])
            pagado = float(r["pagado"])
            results.append({
                "id": r["id"],
                "tipodoc": 4,
                "tipodoc_label": "Albarán",
                "serie": r["serie"],
                "numero": r["numero"],
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "cli_codigo": r["cli_codigo"],
                "cli_nombre": r["cli_nombre"] or "",
                "total": total,
                "pagado": pagado,
                "pendiente": round(total - pagado, 2),
                "vencimientos": [],
            })

        # ── Facturas con vencimientos pendientes ───────────────────────
        fac_filter = "AND cli.agente = %(agente)s" if (agente and current_user.solo_clientes_agente) else ""
        cur.execute(f"""
            WITH ve_sum AS (
                SELECT e.idvencimiento, SUM(e.importe) AS cobrado
                FROM ventas_entregas e
                WHERE e.idvencimiento > 0
                GROUP BY e.idvencimiento
            )
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                   vc.cli_codigo, vc.cli_nombre, vc.total,
                   json_agg(json_build_object(
                       'id', v.id,
                       'fecha_vencimiento', v.fecha_vencimiento,
                       'importe', v.importe,
                       'situacion', v.situacion,
                       'entregas_cuenta', COALESCE(ve.cobrado, 0)
                   ) ORDER BY v.fecha_vencimiento) FILTER (WHERE v.id IS NOT NULL AND v.situacion = 0) AS vencimientos
            FROM ventas_cabeceras vc
            JOIN clientes cli ON cli.codigo = vc.cli_codigo
            LEFT JOIN vencimientos v ON v.idcab = vc.id AND v.situacion = 0
            LEFT JOIN ve_sum ve ON ve.idvencimiento = v.id
            WHERE vc.tipodoc = 8
              {fac_filter}
            GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                     vc.cli_codigo, vc.cli_nombre, vc.total
            HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0
            ORDER BY vc.fecha DESC
            LIMIT 200
        """, {"agente": agente})
        for r in cur.fetchall():
            vtos_raw = r["vencimientos"] or []
            vtos = []
            for v in vtos_raw:
                if v is None:
                    continue
                fv = v["fecha_vencimiento"]
                vtos.append({
                    "id": v["id"],
                    "fecha_vencimiento": fv.isoformat() if hasattr(fv, "isoformat") else str(fv),
                    "importe": float(v["importe"]),
                    "situacion": v["situacion"],
                    "entregas_cuenta": float(v["entregas_cuenta"]),
                })
            total = float(r["total"])
            pendiente = sum(v["importe"] - v["entregas_cuenta"] for v in vtos)
            results.append({
                "id": r["id"],
                "tipodoc": 8,
                "tipodoc_label": "Factura",
                "serie": r["serie"],
                "numero": r["numero"],
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "cli_codigo": r["cli_codigo"],
                "cli_nombre": r["cli_nombre"] or "",
                "total": total,
                "pagado": round(total - pendiente, 2),
                "pendiente": round(pendiente, 2),
                "vencimientos": vtos,
            })

        results.sort(key=lambda x: (x["cli_nombre"], x["fecha"] or ""), reverse=False)
        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Cobro múltiple ────────────────────────────────────────────────────────

class CobrarMultipleItem(BaseModel):
    tipo: str          # 'albaran' | 'vencimiento'
    idcab: int
    cli_codigo: int
    importe: float
    vto_id: Optional[int] = None
    fpago_codigo: Optional[int] = None


class CobrarMultipleRequest(BaseModel):
    items: list[CobrarMultipleItem]


@router.post("/cobrar-multiple")
def cobrar_multiple(
    body: CobrarMultipleRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Registra múltiples cobros en una sola llamada."""
    _require_autoventa(current_user)
    results = []
    for item in body.items:
        try:
            if item.tipo == 'albaran':
                # Reutilizamos la lógica de cobrar-albaran
                _cobrar_albaran_internal(item.cli_codigo, item.idcab, item.importe, item.fpago_codigo, current_user, empresa)
                results.append({"idcab": item.idcab, "ok": True})
            elif item.tipo == 'vencimiento' and item.vto_id:
                _cobrar_vencimiento_internal(item.cli_codigo, item.idcab, item.vto_id, item.importe, item.fpago_codigo, current_user, empresa)
                results.append({"idcab": item.idcab, "vto_id": item.vto_id, "ok": True})
            else:
                results.append({"idcab": item.idcab, "ok": False, "error": "Tipo desconocido"})
        except Exception as e:
            results.append({"idcab": item.idcab, "ok": False, "error": str(e)})
    return {"results": results}


def _cobrar_albaran_internal(cli_codigo, idcab, importe, fpago_codigo, current_user, empresa):
    """Internal helper: registers a payment for an albarán."""
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, total, serie, numero FROM ventas_cabeceras "
            "WHERE id = %(id)s AND cli_codigo = %(cli)s AND tipodoc = 4",
            {"id": idcab, "cli": cli_codigo}
        )
        doc = cur.fetchone()
        if not doc:
            raise ValueError(f"Albarán {idcab} no encontrado")
        today = date.today()
        caja_id = current_user.caja_autoventa or 0
        user_id = current_user.id
        fpago = fpago_codigo or current_user.fpago_autoventa or 1
        concepto = f"Cobro cliente albarán {doc['serie']}-{doc['numero']}"
        caja_reg_id = 0
        if caja_id:
            cur.execute("SELECT COALESCE(MAX(numregistro), 0) + 1 AS next_num FROM cajas_registro WHERE codigo = %(caja)s", {"caja": caja_id})
            next_num = cur.fetchone()["next_num"]
            cur.execute("SELECT COALESCE(saldo, 0) AS last_saldo FROM cajas_registro WHERE codigo = %(caja)s ORDER BY id DESC LIMIT 1", {"caja": caja_id})
            saldo_row = cur.fetchone()
            new_saldo = float(saldo_row["last_saldo"] if saldo_row else 0) + float(importe)
            cur.execute("""
                INSERT INTO cajas_registro(
                    codigo, numregistro, fecha, concepto, ingreso, reintegro, saldo,
                    idvencimiento, usuario, hora, tiposujeto, idsujeto, turno, apuntecierre,
                    terminaltpv, es_entrega_alb, fecha_conta, fecha_pre_conta, usuario_pre_conta,
                    usuario_conta, destino, id_registro_banco, observaciones, id_conta, edit, num_anticipo
                ) VALUES (
                    %(caja)s, %(num)s, %(fecha)s, %(concepto)s, %(ingreso)s, 0, %(saldo)s,
                    0, %(user)s, NOW(), 1, %(cli)s, 1, 0,
                    1, 1, NULL, NULL, 0, 0, 0, 0, '', 0, false, 0
                ) RETURNING id
            """, {"caja": caja_id, "num": next_num, "fecha": today, "concepto": concepto,
                  "ingreso": importe, "saldo": new_saldo, "user": user_id, "cli": cli_codigo})
            caja_reg_id = cur.fetchone()["id"]
        cur.execute("""
            INSERT INTO ventas_entregas(idcab, idregistro, cliente, fecha, importe,
                                        usuario, cajabanco, codigo_cb, idvencimiento, terminal, turno)
            VALUES (%(idcab)s, %(caja_reg)s, %(cli)s, %(fecha)s, %(importe)s,
                    %(user)s, 0, %(fpago)s, 0, 1, 1)
            RETURNING id
        """, {"idcab": idcab, "caja_reg": caja_reg_id, "cli": cli_codigo,
              "fecha": today, "importe": importe, "fpago": fpago, "user": user_id})
        ve_id = cur.fetchone()["id"]
        cur.execute("""
            INSERT INTO registro_cobros(id_cab, id_vto, tipo, es_cobro, es_impago, es_anulacion,
                                        es_entrega, created_by, created_at, borrado, es_manual, importe)
            VALUES (%(idcab)s, %(ve)s, 0, true, false, false, true, %(user)s, NOW(), false, false, 0)
        """, {"idcab": idcab, "ve": ve_id, "user": user_id})
        conn.commit()
    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def _cobrar_vencimiento_internal(cli_codigo, idcab, vto_id, importe, fpago_codigo, current_user, empresa):
    """Internal helper: registers a payment for a vencimiento."""
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT id, serie, numero FROM ventas_cabeceras WHERE id = %(id)s AND cli_codigo = %(cli)s AND tipodoc = 8",
                    {"id": idcab, "cli": cli_codigo})
        doc = cur.fetchone()
        if not doc:
            raise ValueError(f"Factura {idcab} no encontrada")
        cur.execute("SELECT id, importe, fecha_vencimiento FROM vencimientos WHERE id = %(vto)s AND idcab = %(idcab)s",
                    {"vto": vto_id, "idcab": idcab})
        v = cur.fetchone()
        if not v:
            raise ValueError(f"Vencimiento {vto_id} no encontrado")
        today = date.today()
        caja_id = current_user.caja_autoventa or 0
        user_id = current_user.id
        fpago = fpago_codigo or current_user.fpago_autoventa or 1
        concepto = f"Cobro factura {doc['serie']}-{doc['numero']}"
        caja_reg_id = 0
        if caja_id:
            cur.execute("SELECT COALESCE(MAX(numregistro), 0) + 1 AS next_num FROM cajas_registro WHERE codigo = %(caja)s", {"caja": caja_id})
            next_num = cur.fetchone()["next_num"]
            cur.execute("SELECT COALESCE(saldo, 0) AS last_saldo FROM cajas_registro WHERE codigo = %(caja)s ORDER BY id DESC LIMIT 1", {"caja": caja_id})
            saldo_row = cur.fetchone()
            new_saldo = float(saldo_row["last_saldo"] if saldo_row else 0) + float(importe)
            cur.execute("""
                INSERT INTO cajas_registro(
                    codigo, numregistro, fecha, concepto, ingreso, reintegro, saldo,
                    idvencimiento, usuario, hora, tiposujeto, idsujeto, turno, apuntecierre,
                    terminaltpv, es_entrega_alb, fecha_conta, fecha_pre_conta, usuario_pre_conta,
                    usuario_conta, destino, id_registro_banco, observaciones, id_conta, edit, num_anticipo
                ) VALUES (
                    %(caja)s, %(num)s, %(fecha)s, %(concepto)s, %(ingreso)s, 0, %(saldo)s,
                    %(vto)s, %(user)s, NOW(), 1, %(cli)s, 1, 0,
                    1, 0, NULL, NULL, 0, 0, 0, 0, '', 0, false, 0
                ) RETURNING id
            """, {"caja": caja_id, "num": next_num, "fecha": today, "concepto": concepto,
                  "ingreso": importe, "saldo": new_saldo, "vto": vto_id, "user": user_id, "cli": cli_codigo})
            caja_reg_id = cur.fetchone()["id"]
        cur.execute("SELECT COALESCE(SUM(importe), 0) AS ya FROM ventas_entregas WHERE idvencimiento = %(vto)s", {"vto": vto_id})
        ya_entregado = float(cur.fetchone()["ya"])
        pendiente_vto = float(v["importe"]) - ya_entregado
        pago_total = importe >= pendiente_vto - 0.01
        cur.execute("""
            INSERT INTO ventas_entregas(idcab, idregistro, cliente, fecha, importe,
                                        usuario, cajabanco, codigo_cb, idvencimiento, terminal, turno)
            VALUES (%(idcab)s, %(caja_reg)s, %(cli)s, %(fecha)s, %(importe)s,
                    %(user)s, 0, %(fpago)s, %(vto)s, 1, 1)
            RETURNING id
        """, {"idcab": idcab, "caja_reg": caja_reg_id, "cli": cli_codigo,
              "fecha": today, "importe": importe, "fpago": fpago, "vto": vto_id, "user": user_id})
        ve_id = cur.fetchone()["id"]
        cur.execute("""
            INSERT INTO registro_cobros(id_cab, id_vto, tipo, es_cobro, es_impago, es_anulacion,
                                        es_entrega, created_by, created_at, borrado, es_manual, importe)
            VALUES (%(idcab)s, %(ve)s, 0, true, false, false, true, %(user)s, NOW(), false, false, 0)
        """, {"idcab": idcab, "ve": ve_id, "user": user_id})
        if pago_total:
            cur.execute("UPDATE vencimientos SET situacion = 1 WHERE id = %(vto)s", {"vto": vto_id})
        conn.commit()
    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


# ── Clientes del agente (caché inicial) ──────────────────────────────────

@router.get("/clientes/agente")
def clientes_agente(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns all active clients assigned to the user's agent for local caching."""
    _require_autoventa(current_user)
    agente_codigo = current_user.agente_autoventa
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        if agente_codigo and current_user.solo_clientes_agente:
            cur.execute(
                """
                SELECT codigo, nombre, alias, cif,
                       direccion, localidad, cpostal, provincia,
                       fpago, tarifabase, COALESCE(email, '') AS email
                FROM clientes
                WHERE obsoleto = 0
                  AND activo = true
                  AND agente = %(agente)s
                ORDER BY nombre
                """,
                {"agente": agente_codigo},
            )
        else:
            cur.execute(
                """
                SELECT codigo, nombre, alias, cif,
                       direccion, localidad, cpostal, provincia,
                       fpago, tarifabase, COALESCE(email, '') AS email
                FROM clientes
                WHERE obsoleto = 0
                  AND activo = true
                ORDER BY nombre
                LIMIT 200
                """
            )
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Enviar copia de documento por email ──────────────────────────────────

import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.models.app_models import Local as LocalModel
from app.services.pdf_docs import generate_pdf


class EnviarDocumentoRequest(BaseModel):
    cli_codigo: int
    idcab: int
    tipodoc: int
    email_destino: str
    local_id: Optional[int] = None


@router.post("/enviar-documento")
def enviar_documento(
    body: EnviarDocumentoRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Sends a document email to the client with PDF attachment."""
    _require_autoventa(current_user)

    # Resolve local for SMTP config + formato_doc
    local = None
    if body.local_id:
        local = session.get(LocalModel, body.local_id)

    conn = None
    try:
        import psycopg2.extras
        conn = get_pg_connection(empresa)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT vc.*, c.nombre AS cli_nombre_full
            FROM ventas_cabeceras vc
            JOIN clientes c ON c.codigo = vc.cli_codigo
            WHERE vc.id = %(id)s AND vc.cli_codigo = %(cli)s
            """,
            {"id": body.idcab, "cli": body.cli_codigo},
        )
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        cur.execute(
            "SELECT * FROM ventas_lineas WHERE idcab = %(id)s ORDER BY orden",
            {"id": body.idcab},
        )
        lineas = cur.fetchall()

        tipo_label = {2: "Pedido", 4: "Albarán", 8: "Factura"}.get(body.tipodoc, "Documento")
        empresa_nombre = empresa.nombre

        # SMTP config: prefer local, fallback to empresa
        smtp_host = (local.smtp_host if local else None) or empresa.smtp_host or "smtp.ionos.es"
        smtp_port = (local.smtp_port if local and local.smtp_host else None) or empresa.smtp_port or 465
        smtp_user = (local.smtp_user if local else None) or empresa.smtp_user or "solbabi@solba.com"
        smtp_pass = (local.smtp_password if local else None) or empresa.smtp_password or "Solba2012@"
        from_name = (local.smtp_from_name if local else None) or empresa.smtp_from_name or empresa_nombre

        # PDF generation
        formato = (local.formato_doc if local else None) or "a4_basico_logo_izq"
        doc_dict = dict(doc)
        lineas_list = [dict(l) for l in lineas]
        pdf_bytes = generate_pdf(formato, doc_dict, lineas_list, conn)
        nombre_pdf = f"{tipo_label}_{doc['serie']}_{doc['numero']}.pdf"

        # Email body
        html = (
            "<html><body style='font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto;padding:24px'>"
            f"<h2 style='color:#0056b3'>{empresa_nombre}</h2>"
            f"<p>Estimado/a <strong>{doc['cli_nombre_full']}</strong>,</p>"
            f"<p>Adjunto encontrará la copia de su {tipo_label.lower()} "
            f"<strong>{doc['serie']}-{doc['numero']}</strong> con fecha <strong>{doc['fecha']}</strong>.</p>"
            f"<p style='color:#888;font-size:12px;margin-top:24px'>{empresa_nombre}</p>"
            "</body></html>"
        )

        msg = MIMEMultipart("mixed")
        msg["Subject"] = f"{tipo_label} {doc['serie']}-{doc['numero']} – {empresa_nombre}"
        msg["From"] = f"{from_name} <{smtp_user}>"
        msg["To"] = body.email_destino
        msg.attach(MIMEText(html, "html"))

        pdf_part = MIMEApplication(pdf_bytes, _subtype="pdf")
        pdf_part.add_header("Content-Disposition", "attachment", filename=nombre_pdf)
        msg.attach(pdf_part)

        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx) as smtp:
            smtp.login(smtp_user, smtp_pass)
            smtp.send_message(msg)

        return {"ok": True}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {e}")
    finally:
        if conn:
            conn.close()

# ── Mis documentos ────────────────────────────────────────────────────────

@router.get("/mis-documentos")
def mis_documentos(
    tipodoc: int = Query(...),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    serie_usuario = current_user.serie_autoventa
    if not serie_usuario:
        raise HTTPException(status_code=400, detail="No tienes serie asignada para Autoventa")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        agente = current_user.agente_autoventa
        agente_filter = "AND vc.agente = %(ag)s" if agente else ""
        params = {"td": tipodoc, "serie": serie_usuario, "ag": agente}

        if tipodoc == 4:
            # Albaranes: calcular pendiente real desde ventas_entregas
            cur.execute(
                f"""
                SELECT vc.id, vc.serie, vc.numero, vc.fecha, vc.cli_codigo, vc.cli_nombre, vc.total,
                       COALESCE(SUM(ve.importe), 0) AS cobrado,
                       c.alias AS cli_alias
                FROM ventas_cabeceras vc
                LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
                LEFT JOIN clientes c ON c.codigo = vc.cli_codigo
                WHERE vc.tipodoc = %(td)s AND vc.serie = %(serie)s {agente_filter}
                GROUP BY vc.id, vc.serie, vc.numero, vc.fecha, vc.cli_codigo, vc.cli_nombre, vc.total, c.alias
                ORDER BY vc.fecha DESC, vc.numero DESC
                LIMIT 60
                """,
                params,
            )
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "serie": r["serie"],
                    "numero": r["numero"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "cli_codigo": r["cli_codigo"],
                    "cli_nombre": r["cli_nombre"],
                    "cli_alias": r["cli_alias"] or "",
                    "total": float(r["total"] or 0),
                    "pendiente": round(float(r["total"] or 0) - float(r["cobrado"] or 0), 2),
                    "finalizado": float(r["total"] or 0) - float(r["cobrado"] or 0) <= 0.01,
                }
                for r in rows
            ]
        else:
            cur.execute(
                f"""
                SELECT vc.id, vc.serie, vc.numero, vc.fecha, vc.cli_codigo, vc.cli_nombre, vc.total, vc.fechafin,
                       c.alias AS cli_alias
                FROM ventas_cabeceras vc
                LEFT JOIN clientes c ON c.codigo = vc.cli_codigo
                WHERE vc.tipodoc = %(td)s AND vc.serie = %(serie)s {agente_filter}
                ORDER BY vc.fecha DESC, vc.numero DESC
                LIMIT 60
                """,
                params,
            )
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "serie": r["serie"],
                    "numero": r["numero"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "cli_codigo": r["cli_codigo"],
                    "cli_nombre": r["cli_nombre"],
                    "cli_alias": r["cli_alias"] or "",
                    "total": float(r["total"] or 0),
                    "pendiente": float(r["total"] or 0),
                    "finalizado": r["fechafin"] is not None,
                }
                for r in rows
            ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Detalle de documento (para edición) ──────────────────────────────────

@router.get("/documentos/{idcab}/detalle")
def detalle_documento(
    idcab: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM ventas_cabeceras WHERE id = %(id)s",
            {"id": idcab},
        )
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        cur.execute(
            "SELECT * FROM ventas_lineas WHERE idcab = %(id)s ORDER BY orden",
            {"id": idcab},
        )
        lineas = cur.fetchall()

        # Cargar lotes asignados a cada línea (una consulta plana, agregación en Python)
        ids_linea = [int(l["id"]) for l in lineas if l.get("id")]
        lotes_por_linea: dict[int, dict] = {}
        if ids_linea:
            cur.execute(
                """
                SELECT DISTINCT alr.id_lin, al.lote, al.fecha_caducidad
                FROM articulos_lotes_registro alr
                JOIN articulos_lotes al ON al.id = alr.id_lote
                WHERE alr.id_lin = ANY(%(ids)s)
                ORDER BY alr.id_lin, al.fecha_caducidad ASC NULLS LAST, al.lote
                """,
                {"ids": ids_linea},
            )
            from collections import defaultdict
            _lotes_tmp: dict = defaultdict(list)
            _cad_tmp:   dict = defaultdict(list)
            for row in cur.fetchall():
                id_lin = int(row["id_lin"])
                lote = row["lote"] or ""
                if lote and lote not in _lotes_tmp[id_lin]:
                    _lotes_tmp[id_lin].append(lote)
                if row["fecha_caducidad"]:
                    cad_str = row["fecha_caducidad"].strftime("%d/%m/%Y")
                    if cad_str not in _cad_tmp[id_lin]:
                        _cad_tmp[id_lin].append(cad_str)
            for id_lin in _lotes_tmp:
                lotes_por_linea[id_lin] = {
                    "lote": ", ".join(_lotes_tmp[id_lin]) or None,
                    "fecha_caducidad": ", ".join(_cad_tmp[id_lin]) or None,
                }

        # Cargar control_lotes y tallas_colores de los artículos
        refs = list({l["referencia"] for l in lineas if l.get("referencia")})
        flags_art: dict[str, dict] = {}
        if refs:
            cur.execute(
                "SELECT referencia, COALESCE(control_lotes, false) AS control_lotes, COALESCE(tallas_colores, false) AS tallas_colores FROM articulos WHERE referencia = ANY(%s)",
                (refs,),
            )
            for ar in cur.fetchall():
                flags_art[ar["referencia"]] = {
                    "control_lotes": bool(ar["control_lotes"]),
                    "tallas_colores": bool(ar["tallas_colores"]),
                }
        # Calcular pendiente real para albaranes
        _total = float(doc.get("total", 0) or 0)
        _pendiente = _total
        if doc.get("tipodoc") == 4:
            cur.execute(
                "SELECT COALESCE(SUM(importe), 0) AS cobrado FROM ventas_entregas WHERE idcab = %(id)s",
                {"id": idcab},
            )
            cobrado_row = cur.fetchone()
            _pendiente = round(_total - float(cobrado_row["cobrado"] or 0), 2)
        return {
            "id": doc["id"],
            "tipodoc": doc["tipodoc"],
            "serie": doc["serie"],
            "numero": doc["numero"],
            "fecha": doc["fecha"].isoformat() if doc["fecha"] else None,
            "fecha_finalizacion": doc["fechafin"].isoformat() if doc.get("fechafin") else None,
            "cli_codigo": doc["cli_codigo"],
            "cli_nombre": doc["cli_nombre"],
            "cli_cif": doc.get("cli_cif", "") or "",
            "cli_direccion": doc.get("cli_direccion", "") or "",
            "cli_localidad": doc.get("cli_localidad", "") or "",
            "cli_cpostal": doc.get("cli_cpostal", "") or "",
            "cli_provincia": doc.get("cli_provincia", 0) or 0,
            "fpago": doc.get("fpago", 1) or 1,
            "tarifa": doc.get("tarifa", 1) or 1,
            "observaciones": doc.get("observaciones", "") or "",
            "total": _total,
            "pendiente": _pendiente,
            "lineas": [
                {
                    "referencia": l["referencia"],
                    "descripcion": l["descripcion"],
                    "unidades": float(l.get("unidades", 0) or 0),
                    "gramos": float(l.get("gramos", 0) or 0),
                    "tipo_unidad": int(l.get("tipo_unidad", 0) or 0),
                    "unidad": l.get("unidad", "") or "",
                    "precio": float(l.get("precio", 0) or 0),
                    "dto": float(l.get("pdto1", l.get("dto", 0)) or 0),
                    "importe": float(l.get("importe", 0) or 0),
                    "piva": float(l.get("piva", 0) or 0),
                    "talla": l.get("talla", "") or "",
                    "color": l.get("color", "") or "",
                    "control_lotes": flags_art.get(l["referencia"], {}).get("control_lotes", False),
                    "tallas_colores": flags_art.get(l["referencia"], {}).get("tallas_colores", False),
                    "es_canon": int(l.get("linea_cabecera") or 0) > 0 or not l.get("referencia"),
                    "lote": lotes_por_linea.get(l["id"], {}).get("lote"),
                    "fecha_caducidad": lotes_por_linea.get(l["id"], {}).get("fecha_caducidad"),
                }
                for l in lineas
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Actualizar documento ──────────────────────────────────────────────────

@router.put("/documentos/{idcab}")
def actualizar_documento(
    idcab: int,
    body: CrearDocumentoRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)

    lineas_validas = [l for l in body.lineas if l.unidades > 0]
    if not lineas_validas:
        raise HTTPException(status_code=400, detail="El documento debe tener al menos una línea con unidades")

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute("SELECT id, serie, numero, tipodoc FROM ventas_cabeceras WHERE id = %(id)s", {"id": idcab})
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        serie = doc["serie"]
        numero = doc["numero"]
        tipodoc = doc["tipodoc"]
        today = date.today()

        iva_groups: dict[float, dict] = {}
        for l in lineas_validas:
            dto_factor = 1 - (l.dto or 0) / 100
            importe = round(l.unidades * l.precio * dto_factor, 6)
            piva = l.piva
            if piva not in iva_groups:
                iva_groups[piva] = {"base": Decimal("0"), "iva_importe": Decimal("0")}
            iva_groups[piva]["base"] += Decimal(str(round(importe, 6)))
            iva_groups[piva]["iva_importe"] += Decimal(str(round(importe * piva / 100, 6)))

        sorted_pivas = sorted(iva_groups.keys())

        def get_group(idx: int) -> tuple:
            if idx < len(sorted_pivas):
                piva = sorted_pivas[idx]
                g = iva_groups[piva]
                return float(g["base"]), piva, float(g["iva_importe"])
            return 0.0, 0.0, 0.0

        base1, piva1, iva1 = get_group(0)
        base2, piva2, iva2 = get_group(1)
        base3, piva3, iva3 = get_group(2)
        total = round(base1 + iva1 + base2 + iva2 + base3 + iva3, 2)

        cur.execute(
            """
            UPDATE ventas_cabeceras SET
                cli_codigo=%(cli_codigo)s, cli_nombre=%(cli_nombre)s, cli_cif=%(cli_cif)s,
                cli_direccion=%(cli_direccion)s, cli_localidad=%(cli_localidad)s,
                cli_cpostal=%(cli_cpostal)s, cli_provincia=%(cli_provincia)s,
                fpago=%(fpago)s, tarifa=%(tarifa)s,
                baseimpo1=%(base1)s, piva1=%(piva1)s, iva1=%(iva1)s,
                baseimpo2=%(base2)s, piva2=%(piva2)s, iva2=%(iva2)s,
                baseimpo3=%(base3)s, piva3=%(piva3)s, iva3=%(iva3)s,
                total=%(total)s, observaciones=%(observaciones)s
            WHERE id=%(id)s
            """,
            {
                "id": idcab,
                "cli_codigo": body.cli_codigo, "cli_nombre": body.cli_nombre,
                "cli_cif": body.cli_cif or "", "cli_direccion": body.cli_direccion or "",
                "cli_localidad": body.cli_localidad or "", "cli_cpostal": body.cli_cpostal or "",
                "cli_provincia": body.cli_provincia or 0,
                "fpago": body.fpago or 1, "tarifa": body.tarifa or 1,
                "base1": base1, "piva1": piva1, "iva1": iva1,
                "base2": base2, "piva2": piva2, "iva2": iva2,
                "base3": base3, "piva3": piva3, "iva3": iva3,
                "total": total, "observaciones": body.observaciones or "",
            },
        )

        # Guardar lotes existentes antes de borrar, para restaurarlos en líneas sin lotes_asignados
        cur.execute(
            """
            SELECT vl.referencia, vl.talla, vl.color,
                   alr.id_lote, alr.tipo, alr.almacen AS alr_almacen,
                   alr.unidades AS alr_uds, alr.gramos AS alr_gramos,
                   alr.id_lin_origen, alr.stock_unidades, alr.stock_gramos, alr.temperatura
            FROM articulos_lotes_registro alr
            JOIN ventas_lineas vl ON vl.id = alr.id_lin
            WHERE vl.idcab = %(id)s
            """,
            {"id": idcab},
        )
        lotes_backup: dict = {}
        for row in cur.fetchall():
            key = (row["referencia"] or "", row["talla"] or "", row["color"] or "")
            if key not in lotes_backup:
                lotes_backup[key] = []
            lotes_backup[key].append(dict(row))

        # Borrar registros de lotes vinculados a las líneas antiguas
        cur.execute(
            """
            DELETE FROM articulos_lotes_registro
            WHERE id_lin IN (SELECT id FROM ventas_lineas WHERE idcab = %(id)s)
            """,
            {"id": idcab},
        )
        cur.execute("DELETE FROM ventas_lineas WHERE idcab = %(id)s", {"id": idcab})

        almacen = current_user.almacen_autoventa or 1
        for orden, l in enumerate(lineas_validas, start=1):
            dto_factor = 1 - (l.dto or 0) / 100
            base_qty = (l.gramos or 0) if (l.tipo_unidad or 0) == 1 else l.unidades
            importe = round(base_qty * l.precio * dto_factor, 6)
            cur.execute(
                """
                INSERT INTO ventas_lineas (
                    idcab, tipodoc, serie, numero, cli_codigo,
                    orden, fecha,
                    referencia, descripcion,
                    unidades, gramos, precio, importe, piva,
                    pdto1, talla, color,
                    tipo_unidad, almacen,
                    coste, pmp, usuario
                ) VALUES (
                    %(idcab)s, %(tipodoc)s, %(serie)s, %(numero)s, %(cli_codigo)s,
                    %(orden)s, %(fecha)s,
                    %(referencia)s, %(descripcion)s,
                    %(unidades)s, %(gramos)s, %(precio)s, %(importe)s, %(piva)s,
                    %(pdto1)s, %(talla)s, %(color)s,
                    %(tipo_unidad)s, %(almacen)s,
                    0, 0, %(usuario)s
                ) RETURNING id
                """,
                {
                    "idcab": idcab, "tipodoc": tipodoc, "serie": serie,
                    "numero": numero, "cli_codigo": body.cli_codigo,
                    "orden": orden, "fecha": today,
                    "referencia": l.referencia, "descripcion": l.descripcion,
                    "unidades": l.unidades, "gramos": l.gramos or 0,
                    "precio": l.precio, "importe": importe, "piva": l.piva,
                    "pdto1": l.dto or 0, "talla": l.talla or "", "color": l.color or "",
                    "tipo_unidad": l.tipo_unidad or 0, "almacen": almacen,
                    "usuario": current_user.id,
                },
            )
            id_lin = cur.fetchone()["id"]

            # Guardar movimientos de lotes si la línea tiene lotes asignados
            if l.lotes_asignados:
                for asig in l.lotes_asignados:
                    id_lote = asig.get("id") if isinstance(asig, dict) else getattr(asig, "id", None)
                    asignar = asig.get("asignar") if isinstance(asig, dict) else getattr(asig, "asignar", 0)
                    if not id_lote or not asignar:
                        continue
                    es_doble = (l.tipo_unidad or 0) == 1
                    uds_mov   = 0       if es_doble else asignar
                    gramos_mov = asignar if es_doble else 0
                    cur.execute(
                        """
                        INSERT INTO articulos_lotes_registro
                            (id_lote, tipo, id_lin, almacen, unidades, gramos,
                             id_lin_origen, stock_unidades, stock_gramos, temperatura)
                        VALUES
                            (%(id_lote)s, 0, %(id_lin)s, %(almacen)s, %(uds)s, %(gramos)s,
                             0, 0, 0, 0)
                        """,
                        {"id_lote": id_lote, "id_lin": id_lin, "almacen": almacen,
                         "uds": uds_mov, "gramos": gramos_mov},
                    )
            else:
                # Sin lotes_asignados: restaurar los lotes que tenía antes de la edición
                key = (l.referencia or "", l.talla or "", l.color or "")
                for lote_rec in lotes_backup.get(key, []):
                    cur.execute(
                        """
                        INSERT INTO articulos_lotes_registro
                            (id_lote, tipo, id_lin, almacen, unidades, gramos,
                             id_lin_origen, stock_unidades, stock_gramos, temperatura)
                        VALUES
                            (%(id_lote)s, %(tipo)s, %(id_lin)s, %(almacen)s, %(uds)s, %(gramos)s,
                             %(id_lin_origen)s, %(stock_uds)s, %(stock_gramos)s, %(temperatura)s)
                        """,
                        {
                            "id_lote": lote_rec["id_lote"],
                            "tipo": lote_rec["tipo"],
                            "id_lin": id_lin,
                            "almacen": lote_rec["alr_almacen"],
                            "uds": lote_rec["alr_uds"],
                            "gramos": lote_rec["alr_gramos"],
                            "id_lin_origen": lote_rec["id_lin_origen"],
                            "stock_uds": lote_rec["stock_unidades"],
                            "stock_gramos": lote_rec["stock_gramos"],
                            "temperatura": lote_rec["temperatura"],
                        },
                    )

        conn.commit()
        return {
            "ok": True,
            "id": idcab,
            "serie": serie,
            "numero": numero,
            "tipodoc": tipodoc,
            "tipodoc_label": TIPODOC_LABELS.get(tipodoc, "Documento"),
            "total": total,
        }

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error actualizando documento: {e}")
    finally:
        if conn:
            conn.close()


# ── Guardar firma ─────────────────────────────────────────────────────────

class FirmaRequest(BaseModel):
    firma: str


@router.post("/documento/{idcab}/firma")
def guardar_firma(
    idcab: int,
    body: FirmaRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    from app.models.app_models import FirmaAutoventa
    from sqlmodel import select
    # Upsert: si ya existe firma para este documento, actualizarla
    existing = session.exec(
        select(FirmaAutoventa)
        .where(FirmaAutoventa.empresa_id == empresa.id)
        .where(FirmaAutoventa.idcab == idcab)
    ).first()
    if existing:
        existing.firma_data_url = body.firma
        session.add(existing)
    else:
        session.add(FirmaAutoventa(
            empresa_id=empresa.id,
            idcab=idcab,
            firma_data_url=body.firma,
        ))
    session.commit()
    return {"ok": True}


@router.get("/documento/{idcab}/firma")
def get_firma(
    idcab: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    from app.models.app_models import FirmaAutoventa
    from sqlmodel import select
    firma = session.exec(
        select(FirmaAutoventa)
        .where(FirmaAutoventa.empresa_id == empresa.id)
        .where(FirmaAutoventa.idcab == idcab)
    ).first()
    if not firma:
        return {"firma": None}
    return {"firma": firma.firma_data_url}


# ── Registrar visita ──────────────────────────────────────────────────────

class VisitaRequest(BaseModel):
    cli_codigo: int
    cli_nombre: str
    motivo: str
    resultado: str


@router.post("/visita")
def registrar_visita(
    body: VisitaRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    from app.models.app_models import Visita
    visita = Visita(
        empresa_id=empresa.id,
        usuario_id=current_user.id,
        agente_codigo=current_user.agente_autoventa,
        cli_codigo=body.cli_codigo,
        cli_nombre=body.cli_nombre,
        motivo=body.motivo,
        resultado=body.resultado,
    )
    session.add(visita)
    session.commit()
    return {"ok": True}


# ── Mis visitas ───────────────────────────────────────────────────────────

@router.get("/mis-visitas")
def mis_visitas(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    from app.models.app_models import Visita
    from sqlmodel import select
    stmt = (
        select(Visita)
        .where(Visita.empresa_id == empresa.id)
        .where(Visita.usuario_id == current_user.id)
        .order_by(Visita.fecha.desc())
        .limit(60)
    )
    visitas = session.exec(stmt).all()
    return [
        {
            "id": v.id,
            "fecha": v.fecha.isoformat() if v.fecha else None,
            "cli_codigo": v.cli_codigo,
            "cli_nombre": v.cli_nombre,
            "motivo": v.motivo,
            "resultado": v.resultado,
        }
        for v in visitas
    ]


# ── Liquidación del agente (documentos del día + cobros) ─────────────────

@router.get("/liquidacion")
def liquidacion(
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Liquidación del agente para un rango de fechas (por defecto hoy).
    - docs_periodo: documentos (pedidos/albaranes/facturas) creados en el periodo por el agente.
    - cobros_otros_dias: cobros en caja dentro del periodo que corresponden a docs de fechas anteriores al periodo.
    - totales
    """
    _require_autoventa(current_user)
    agente = current_user.agente_autoventa
    caja_id = current_user.caja_autoventa or 0
    user_id = current_user.id
    hoy = date.today().isoformat()
    fecha_desde = desde or hoy
    fecha_hasta = hasta or hoy
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # ── Documentos creados en el periodo por el agente ────────────
        agente_filter = "AND vc.agente = %(agente)s" if agente else ""
        cur.execute(f"""
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                   vc.cli_codigo, vc.cli_nombre, vc.total,
                   COALESCE(SUM(e.importe), 0)::numeric AS cobrado
            FROM ventas_cabeceras vc
            LEFT JOIN ventas_entregas e ON e.idcab = vc.id
            WHERE vc.fecha BETWEEN %(desde)s AND %(hasta)s
              AND vc.tipodoc IN (2, 4, 8)
              {agente_filter}
            GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
                     vc.cli_codigo, vc.cli_nombre, vc.total
            ORDER BY vc.fecha ASC, vc.tipodoc ASC, vc.id ASC
        """, {"desde": fecha_desde, "hasta": fecha_hasta, "agente": agente})
        docs_hoy = []
        for r in cur.fetchall():
            total = float(r["total"] or 0)
            cobrado = float(r["cobrado"] or 0)
            docs_hoy.append({
                "id": r["id"],
                "tipodoc": r["tipodoc"],
                "tipodoc_label": TIPODOC_LABELS.get(r["tipodoc"], "Doc"),
                "serie": r["serie"] or "",
                "numero": r["numero"],
                "fecha": r["fecha"].isoformat() if r["fecha"] else fecha_desde,
                "cli_codigo": r["cli_codigo"],
                "cli_nombre": r["cli_nombre"] or "",
                "total": total,
                "cobrado": round(cobrado, 2),
                "pendiente": round(total - cobrado, 2),
            })

        # ── Cobros en el periodo correspondientes a docs anteriores ──
        cobros_otros = []
        if caja_id:
            agente_cobros_filter = "AND (vc.agente = %(agente)s OR vc.id IS NULL)" if agente else ""
            cur.execute(f"""
                SELECT cr.id, cr.fecha, cr.concepto, cr.ingreso, cr.reintegro,
                       vc.serie, vc.numero, vc.fecha AS fecha_doc,
                       COALESCE(vc.cli_nombre, c.nombre) AS cli_nombre,
                       COALESCE(vc.id, ve.idcab) AS idcab
                FROM cajas_registro cr
                LEFT JOIN ventas_entregas ve ON ve.idregistro = cr.id
                LEFT JOIN ventas_cabeceras vc ON vc.id = ve.idcab
                LEFT JOIN clientes c ON c.codigo = cr.idsujeto AND cr.tiposujeto = 1
                WHERE cr.usuario = %(user)s
                  AND cr.codigo = %(caja)s
                  AND cr.fecha BETWEEN %(desde)s AND %(hasta)s
                  AND cr.es_entrega_alb IN (0, 1)
                  AND cr.ingreso > 0
                  AND (vc.fecha IS NULL OR vc.fecha < %(desde)s)
                  {agente_cobros_filter}
                ORDER BY cr.fecha ASC, cr.id ASC
            """, {"user": user_id, "caja": caja_id, "desde": fecha_desde, "hasta": fecha_hasta, "agente": agente})
            for r in cur.fetchall():
                cobros_otros.append({
                    "id": r["id"],
                    "concepto": r["concepto"] or "",
                    "serie": r["serie"] or "",
                    "numero": r["numero"],
                    "fecha_doc": r["fecha_doc"].isoformat() if r["fecha_doc"] else None,
                    "cli_nombre": r["cli_nombre"] or "",
                    "ingreso": float(r["ingreso"] or 0),
                    "reintegro": float(r["reintegro"] or 0),
                })

        total_ventas = sum(d["total"] for d in docs_hoy)
        total_cobrado_hoy = sum(d["cobrado"] for d in docs_hoy)
        total_cobros_otros = sum(c["ingreso"] - c["reintegro"] for c in cobros_otros)

        return {
            "fecha": fecha_hasta,
            "desde": fecha_desde,
            "hasta": fecha_hasta,
            "docs_hoy": docs_hoy,
            "cobros_otros_dias": cobros_otros,
            "total_ventas": round(total_ventas, 2),
            "total_cobrado_hoy": round(total_cobrado_hoy, 2),
            "total_cobros_otros_dias": round(total_cobros_otros, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Enviar liquidación por email ──────────────────────────────────────────

class EnviarLiquidacionRequest(BaseModel):
    fecha: str
    docs_hoy: list[dict]
    cobros_otros_dias: list[dict]
    total_ventas: float
    total_cobrado_hoy: float
    total_cobros_otros_dias: float
    email_destino: Optional[str] = None


@router.post("/enviar-liquidacion")
def enviar_liquidacion(
    body: EnviarLiquidacionRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Envía la liquidación por email al agente usando SMTP de la tabla empresa del ERP."""
    _require_autoventa(current_user)

    to = (body.email_destino or "").strip() or current_user.email
    if not to:
        raise HTTPException(status_code=400, detail="No se ha especificado dirección de email")

    # ── Leer config SMTP del ERP (tabla empresa) + nombre agente ─────────
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT nombre, smtp_servidor, smtp_puerto, smtp_ssl, "
            "       smtp_usuario, smtp_password FROM empresa LIMIT 1"
        )
        erp_emp = cur.fetchone()
        # Nombre del agente ERP
        agente_codigo = current_user.agente_autoventa
        nombre_agente = current_user.nombre  # fallback
        if agente_codigo:
            cur.execute("SELECT nombre FROM agentes WHERE codigo = %s", (agente_codigo,))
            row = cur.fetchone()
            if row:
                nombre_agente = row["nombre"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo config ERP: {e}")
    finally:
        if conn:
            conn.close()

    if not erp_emp or not erp_emp["smtp_servidor"] or not erp_emp["smtp_usuario"]:
        raise HTTPException(
            status_code=400,
            detail="El servidor de email no está configurado en la empresa ERP. Contacte con el administrador."
        )

    smtp_host = erp_emp["smtp_servidor"]
    smtp_port = int(erp_emp["smtp_puerto"] or 587)
    smtp_user = erp_emp["smtp_usuario"]
    smtp_password = erp_emp["smtp_password"] or ""
    from_name = erp_emp["nombre"] or empresa.nombre

    # ── Generar HTML ──────────────────────────────────────────────────────
    fmt_eur = lambda v: f"{v:,.2f}€".replace(",", "X").replace(".", ",").replace("X", ".")

    filas_docs = ""
    for d in body.docs_hoy:
        total = d.get('total', 0)
        cobrado = d.get('cobrado', 0)
        pendiente = d.get('pendiente', total)
        parcial = cobrado > 0.01 and pendiente > 0.01
        tot_cobrado = pendiente <= 0.01
        if tot_cobrado:
            cobrado_col = f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a;font-weight:bold">{fmt_eur(cobrado)}</td>'
            estado_col = '<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a;font-weight:bold">&#10003; Cobrado</td>'
            row_bg = ""
        elif parcial:
            cobrado_col = f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a;font-weight:bold">{fmt_eur(cobrado)}</td>'
            estado_col = f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right"><span style="color:#dc2626;font-weight:bold">{fmt_eur(pendiente)}</span><br/><span style="color:#d97706;font-size:11px">parcial</span></td>'
            row_bg = 'background:#fffbeb;'
        else:
            cobrado_col = '<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#cbd5e1">—</td>'
            estado_col = f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;font-weight:bold">{fmt_eur(pendiente)}</td>'
            row_bg = ""
        filas_docs += f"""
        <tr style="{row_bg}">
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{d.get('tipodoc_label','')}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace">{d.get('serie','')}-{d.get('numero','')}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{d.get('cli_nombre','')}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">{fmt_eur(total)}</td>
          {cobrado_col}
          {estado_col}
        </tr>"""

    filas_cobros = ""
    for c in body.cobros_otros_dias:
        doc_ref = f"{c.get('serie','')}-{c.get('numero','')}" if c.get('numero') else c.get('concepto', '')
        filas_cobros += f"""
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{c.get('fecha_doc') or '—'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace">{doc_ref}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{c.get('cli_nombre','')}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a">{fmt_eur(c.get('ingreso',0))}</td>
        </tr>"""

    cobros_section = ""
    if body.cobros_otros_dias:
        cobros_section = f"""
        <h3 style="color:#475569;font-size:14px;margin:20px 0 6px">Cobros de documentos anteriores</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f1f5f9;color:#64748b">
            <th style="padding:6px 8px;text-align:left">Fecha doc.</th>
            <th style="padding:6px 8px;text-align:left">Documento</th>
            <th style="padding:6px 8px;text-align:left">Cliente</th>
            <th style="padding:6px 8px;text-align:right">Cobrado</th>
          </tr></thead>
          <tbody>{filas_cobros}</tbody>
        </table>
        <p style="text-align:right;font-size:13px;color:#16a34a;margin-top:6px">
          <strong>Total cobros anteriores: {fmt_eur(body.total_cobros_otros_dias)}</strong>
        </p>"""

    html = f"""<html>
<body style="font-family:Arial,sans-serif;color:#334155;max-width:620px;margin:auto;padding:24px">
  <h2 style="color:#1e40af;margin-bottom:4px">Liquidación de {body.fecha}</h2>
  <p style="color:#64748b;margin-top:0">Agente: <strong>{nombre_agente}</strong></p>

  <h3 style="color:#475569;font-size:14px;margin-bottom:6px">Documentos creados hoy</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f1f5f9;color:#64748b">
      <th style="padding:6px 8px;text-align:left">Tipo</th>
      <th style="padding:6px 8px;text-align:left">Doc.</th>
      <th style="padding:6px 8px;text-align:left">Cliente</th>
      <th style="padding:6px 8px;text-align:right">Total</th>
      <th style="padding:6px 8px;text-align:right">Cobrado</th>
      <th style="padding:6px 8px;text-align:right">Pendiente</th>
    </tr></thead>
    <tbody>{filas_docs}</tbody>
  </table>
  <p style="text-align:right;font-size:13px;color:#1d4ed8;margin-top:6px">
    <strong>Total ventas: {fmt_eur(body.total_ventas)}</strong> &nbsp;|&nbsp;
    <strong style="color:#16a34a">Cobrado: {fmt_eur(body.total_cobrado_hoy)}</strong>
  </p>

  {cobros_section}

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
  <p style="font-size:13px;color:#64748b;text-align:right">
    <strong>Total general cobrado: {fmt_eur(body.total_cobrado_hoy + body.total_cobros_otros_dias)}</strong>
  </p>
</body>
</html>"""

    from app.services.email import send_with_empresa_smtp
    try:
        send_with_empresa_smtp(
            to=to,
            subject=f"Liquidación {nombre_agente} — {body.fecha}",
            html=html,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            from_name=from_name,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {e}")

    return {"ok": True, "to": to}
