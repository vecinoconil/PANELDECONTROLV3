"""
Almacén — Expediciones: picking de pedidos pendientes de servir.
Permite listar pedidos (tipodoc=2) con líneas sin servir, escanear
códigos de barras/referencias, confirmar unidades y generar el albarán
resultante (tipodoc=4) actualizando udservidas en el pedido original.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter(dependencies=[Depends(require_permiso('expediciones'))])



# ── Listar pedidos pendientes de servir ──────────────────────────────────

@router.get("/expediciones/pedidos")
def list_pedidos_pendientes(
    q: Optional[str] = Query(None),
    localidad: Optional[str] = Query(None),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        conditions = [
            "vc.tipodoc = 2",
            "(vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)",
            "vl.referencia IS NOT NULL",
            "vl.referencia != ''",
        ]
        params: dict = {}

        # Filtrar por serie_expediciones del usuario si tiene series configuradas
        import json as _json
        series_usuario = _json.loads(current_user.serie_expediciones or '[]')
        if series_usuario:
            placeholders = ', '.join([f'%(serie_{i})s' for i in range(len(series_usuario))])
            conditions.append(f'TRIM(vc.serie) IN ({placeholders})')
            for i, s in enumerate(series_usuario):
                params[f'serie_{i}'] = s.strip()

        if q:
            conditions.append(
                "(LOWER(vc.cli_nombre) LIKE %(q)s "
                "OR CAST(vc.numero AS TEXT) LIKE %(q)s "
                "OR LOWER(TRIM(vc.serie)) LIKE %(q)s)"
            )
            params["q"] = f"%{q.lower()}%"

        if localidad:
            conditions.append(
                "(LOWER(TRIM(vc.cli_localidad)) = %(localidad)s "
                "OR (TRIM(vc.cli_localidad) = '' AND LOWER(TRIM(c.localidad)) = %(localidad)s))"
            )
            params["localidad"] = localidad.lower().strip()

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
                vc.id,
                vc.serie,
                vc.numero,
                vc.cli_codigo,
                vc.cli_nombre,
                COALESCE(NULLIF(TRIM(vc.cli_localidad), ''), COALESCE(TRIM(c.localidad), '')) AS cli_localidad,
                vc.fecha,
                vc.fechaentrega,
                vc.total,
                vc.observaciones,
                COUNT(vl.id) FILTER (
                    WHERE vl.unidades > COALESCE(vl.udservidas, 0)
                ) AS lineas_pendientes,
                COUNT(vl.id) AS lineas_total,
                SUM(vl.unidades)                       AS total_uds_pedidas,
                SUM(COALESCE(vl.udservidas, 0))        AS total_uds_servidas
            FROM ventas_cabeceras vc
            JOIN ventas_lineas vl ON vl.idcab = vc.id
            LEFT JOIN clientes c ON c.codigo = vc.cli_codigo
            WHERE {where}
            GROUP BY vc.id, vc.serie, vc.numero, vc.cli_codigo, vc.cli_nombre, vc.cli_localidad,
                     vc.fecha, vc.fechaentrega, vc.total, vc.observaciones, c.localidad
            HAVING SUM(vl.unidades) > SUM(COALESCE(vl.udservidas, 0))
            ORDER BY vc.fecha DESC, vc.id DESC
            LIMIT 100
            """,
            params or None,
        )

        result = []
        for r in cur.fetchall():
            total_uds = float(r["total_uds_pedidas"] or 0)
            total_srv = float(r["total_uds_servidas"] or 0)
            result.append({
                "id": r["id"],
                "serie": (r["serie"] or "").strip(),
                "numero": r["numero"],
                "cli_codigo": r["cli_codigo"],
                "cli_nombre": r["cli_nombre"] or "",
                "cli_localidad": r["cli_localidad"] or "",
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "fechaentrega": r["fechaentrega"].isoformat() if r["fechaentrega"] else None,
                "total": float(r["total"] or 0),
                "observaciones": r["observaciones"] or "",
                "lineas_pendientes": int(r["lineas_pendientes"] or 0),
                "lineas_total": int(r["lineas_total"] or 0),
                "total_uds_pedidas": total_uds,
                "total_uds_servidas": total_srv,
                "estado": "parcial" if total_srv > 0 else "pendiente",
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Detalle de un pedido con sus líneas pendientes ───────────────────────

@router.get("/expediciones/pedidos/{idcab}")
def get_pedido_detalle(
    idcab: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, serie, numero, tipodoc, fecha, fechaentrega,
                   cli_codigo, cli_nombre, cli_cif, cli_direccion,
                   cli_localidad, cli_cpostal, cli_provincia,
                   fpago, agente, tarifa, total,
                   observaciones, observaciones_pedido
            FROM ventas_cabeceras
            WHERE id = %s AND tipodoc = 2
            """,
            (idcab,),
        )
        cab = cur.fetchone()
        if not cab:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        cur.execute(
            """
            SELECT
                vl.id,
                vl.orden,
                vl.referencia,
                vl.descripcion,
                vl.unidades::float                               AS unidades,
                COALESCE(vl.udservidas, 0)::float                AS udservidas,
                (vl.unidades - COALESCE(vl.udservidas, 0))::float AS ud_pendiente,
                vl.precio::float                                 AS precio,
                vl.importe::float                                AS importe,
                vl.piva::float                                   AS piva,
                vl.pdto1::float                                  AS pdto1,
                COALESCE(vl.talla, '')                           AS talla,
                COALESCE(vl.color, '')                           AS color,
                COALESCE(a.control_lotes, false)                 AS control_lotes,
                COALESCE(a.tallas_colores, false)                AS tallas_colores,
                COALESCE(a.nombre, vl.descripcion)              AS articulo_nombre
            FROM ventas_lineas vl
            LEFT JOIN articulos a ON a.referencia = vl.referencia
            WHERE vl.idcab = %s
              AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)
              AND vl.referencia IS NOT NULL AND vl.referencia != ''
              AND vl.unidades > COALESCE(vl.udservidas, 0)
            ORDER BY vl.orden
            """,
            (idcab,),
        )
        lineas = []
        refs_lotes: list[str] = []
        all_refs: list[str] = []
        for r in cur.fetchall():
            ref = r["referencia"] or ""
            lineas.append({
                "id": r["id"],
                "orden": r["orden"],
                "referencia": ref,
                "descripcion": r["descripcion"] or "",
                "articulo_nombre": r["articulo_nombre"] or "",
                "unidades": r["unidades"],
                "udservidas": r["udservidas"],
                "ud_pendiente": r["ud_pendiente"],
                "precio": r["precio"],
                "importe": r["importe"],
                "piva": r["piva"],
                "pdto1": r["pdto1"],
                "talla": r["talla"] or "",
                "color": r["color"] or "",
                "control_lotes": bool(r["control_lotes"]),
                "tallas_colores": bool(r["tallas_colores"]),
            })
            if ref and ref not in all_refs:
                all_refs.append(ref)
            if r["control_lotes"] and ref and ref not in refs_lotes:
                refs_lotes.append(ref)

        # ── Preload: códigos de barras ────────────────────────────────────
        codbarras: list = []
        if all_refs:
            cur.execute(
                """
                SELECT referencia,
                       TRIM(codbarras)      AS codbarras,
                       COALESCE(talla, '')  AS talla,
                       COALESCE(color, '')  AS color
                FROM articulos_codbarras
                WHERE referencia = ANY(%s)
                  AND codbarras IS NOT NULL AND TRIM(codbarras) != ''
                """,
                (all_refs,),
            )
            for r in cur.fetchall():
                codbarras.append({
                    "referencia": r["referencia"],
                    "codbarras": r["codbarras"],
                    "talla": r["talla"],
                    "color": r["color"],
                })

        # ── Preload: lotes con stock ──────────────────────────────────────
        lotes_data: dict = {}
        if refs_lotes:
            cur.execute(
                """
                SELECT al.referencia, al.id, al.lote, al.fecha_caducidad,
                       COALESCE(SUM(als.unidades), 0)::float AS stock
                FROM articulos_lotes al
                LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
                WHERE al.referencia = ANY(%s)
                GROUP BY al.referencia, al.id, al.lote, al.fecha_caducidad
                HAVING COALESCE(SUM(als.unidades), 0) > 0
                ORDER BY al.referencia, al.fecha_caducidad ASC NULLS LAST, al.id ASC
                """,
                (refs_lotes,),
            )
            for r in cur.fetchall():
                ref = r["referencia"]
                if ref not in lotes_data:
                    lotes_data[ref] = []
                lotes_data[ref].append({
                    "id": r["id"],
                    "lote": r["lote"] or "",
                    "fecha_caducidad": r["fecha_caducidad"].isoformat() if r["fecha_caducidad"] else None,
                    "stock": r["stock"],
                })

        return {
            "id": cab["id"],
            "serie": (cab["serie"] or "").strip(),
            "numero": cab["numero"],
            "fecha": cab["fecha"].isoformat() if cab["fecha"] else None,
            "fechaentrega": cab["fechaentrega"].isoformat() if cab["fechaentrega"] else None,
            "cli_codigo": cab["cli_codigo"],
            "cli_nombre": cab["cli_nombre"] or "",
            "cli_cif": cab["cli_cif"] or "",
            "cli_direccion": cab["cli_direccion"] or "",
            "cli_localidad": cab["cli_localidad"] or "",
            "cli_cpostal": cab["cli_cpostal"] or "",
            "cli_provincia": cab["cli_provincia"],
            "fpago": cab["fpago"],
            "agente": cab["agente"],
            "tarifa": cab["tarifa"],
            "total": float(cab["total"] or 0),
            "observaciones": cab["observaciones"] or "",
            "observaciones_pedido": cab["observaciones_pedido"] or "",
            "lineas": lineas,
            "codbarras": codbarras,
            "lotes_data": lotes_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Escanear código de barras / referencia ────────────────────────────────

class ScanRequest(BaseModel):
    codigo: str


@router.post("/expediciones/pedidos/{idcab}/scan")
def scan_codigo(
    idcab: int,
    body: ScanRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    codigo = (body.codigo or "").strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="Código vacío")


    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Try direct match by referencia in pedido lines
        cur.execute(
            """
            SELECT
                vl.id, vl.referencia, vl.descripcion, vl.unidades::float,
                COALESCE(vl.udservidas, 0)::float             AS udservidas,
                (vl.unidades - COALESCE(vl.udservidas, 0))::float AS ud_pendiente,
                COALESCE(vl.talla, '')                        AS talla,
                COALESCE(vl.color, '')                        AS color,
                COALESCE(a.control_lotes, false)              AS control_lotes,
                COALESCE(a.tallas_colores, false)             AS tallas_colores,
                COALESCE(a.nombre, vl.descripcion)           AS articulo_nombre
            FROM ventas_lineas vl
            LEFT JOIN articulos a ON a.referencia = vl.referencia
            WHERE vl.idcab = %s
              AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)
              AND vl.unidades > COALESCE(vl.udservidas, 0)
              AND LOWER(TRIM(vl.referencia)) = LOWER(TRIM(%s))
            ORDER BY vl.orden
            """,
            (idcab, codigo),
        )
        lineas = list(cur.fetchall())
        talla_bc = None
        color_bc = None

        # If not found, try via articulos_codbarras
        if not lineas:
            cur.execute(
                """
                SELECT referencia, COALESCE(talla, '') AS talla,
                       COALESCE(color, '') AS color
                FROM articulos_codbarras
                WHERE TRIM(codbarras) = TRIM(%s)
                LIMIT 1
                """,
                (codigo,),
            )
            bc = cur.fetchone()
            if bc:
                referencia = bc["referencia"]
                talla_bc = bc["talla"] or ""
                color_bc = bc["color"] or ""

                # Match lines by referencia (and optionally talla/color if barcode has them)
                extra = ""
                extra_params = []
                if talla_bc:
                    extra += " AND COALESCE(vl.talla, '') = %s"
                    extra_params.append(talla_bc)
                if color_bc:
                    extra += " AND COALESCE(vl.color, '') = %s"
                    extra_params.append(color_bc)

                cur.execute(
                    f"""
                    SELECT
                        vl.id, vl.referencia, vl.descripcion, vl.unidades::float,
                        COALESCE(vl.udservidas, 0)::float             AS udservidas,
                        (vl.unidades - COALESCE(vl.udservidas, 0))::float AS ud_pendiente,
                        COALESCE(vl.talla, '')                        AS talla,
                        COALESCE(vl.color, '')                        AS color,
                        COALESCE(a.control_lotes, false)              AS control_lotes,
                        COALESCE(a.tallas_colores, false)             AS tallas_colores,
                        COALESCE(a.nombre, vl.descripcion)           AS articulo_nombre
                    FROM ventas_lineas vl
                    LEFT JOIN articulos a ON a.referencia = vl.referencia
                    WHERE vl.idcab = %s
                      AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)
                      AND vl.unidades > COALESCE(vl.udservidas, 0)
                      AND vl.referencia = %s{extra}
                    ORDER BY vl.orden
                    """,
                    [idcab, referencia] + extra_params,
                )
                lineas = list(cur.fetchall())

        if not lineas:
            return {"found": False, "lineas": []}

        result_lineas = []
        for r in lineas:
            line_data: dict = {
                "id": r["id"],
                "referencia": r["referencia"] or "",
                "descripcion": r["descripcion"] or "",
                "articulo_nombre": r["articulo_nombre"] or "",
                "unidades": r["unidades"],
                "udservidas": r["udservidas"],
                "ud_pendiente": r["ud_pendiente"],
                "talla": talla_bc if talla_bc is not None else (r["talla"] or ""),
                "color": color_bc if color_bc is not None else (r["color"] or ""),
                "control_lotes": bool(r["control_lotes"]),
                "tallas_colores": bool(r["tallas_colores"]),
            }

            # Load lotes if needed
            if r["control_lotes"]:
                cur.execute(
                    """
                    SELECT al.id, al.lote, al.fecha_caducidad,
                           COALESCE(SUM(als.unidades), 0)::float AS stock
                    FROM articulos_lotes al
                    LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
                    WHERE al.referencia = %s
                    GROUP BY al.id, al.lote, al.fecha_caducidad
                    HAVING COALESCE(SUM(als.unidades), 0) > 0
                    ORDER BY al.fecha_caducidad ASC NULLS LAST, al.id ASC
                    """,
                    (r["referencia"],),
                )
                lotes = []
                for l in cur.fetchall():
                    lotes.append({
                        "id": l["id"],
                        "lote": l["lote"] or "",
                        "fecha_caducidad": l["fecha_caducidad"].isoformat() if l["fecha_caducidad"] else None,
                        "stock": l["stock"],
                    })
                line_data["lotes"] = lotes
                line_data["stock_total"] = sum(l["stock"] for l in lotes)
                line_data["lotes_auto"] = _distribuir_fefo(lotes, r["ud_pendiente"])

            result_lineas.append(line_data)

        return {"found": True, "lineas": result_lineas}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


def _distribuir_fefo(lotes: list, uds_necesarias: float) -> list:
    """Distribución automática FEFO (first-expiry, first-out)."""
    dist = []
    remaining = uds_necesarias
    for lote in lotes:
        if remaining <= 0:
            break
        take = min(lote["stock"], remaining)
        if take > 0:
            dist.append({"id_lote": lote["id"], "lote": lote["lote"], "unidades": round(take, 4)})
            remaining -= take
    return dist


# ── Series disponibles para el albarán ───────────────────────────────────

@router.get("/expediciones/series")
def list_series(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
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


# ── Crear albarán desde líneas confirmadas ────────────────────────────────

class LoteExpedicion(BaseModel):
    id_lote: int
    lote: str
    unidades: float


class LineaExpedicion(BaseModel):
    id_linea_pedido: int
    unidades: float
    lotes: Optional[List[LoteExpedicion]] = None
    talla: Optional[str] = None
    color: Optional[str] = None


class CrearAlbaranRequest(BaseModel):
    serie: str
    lineas: List[LineaExpedicion]


@router.post("/expediciones/pedidos/{idcab}/crear-albaran")
def crear_albaran(
    idcab: int,
    body: CrearAlbaranRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not body.lineas:
        raise HTTPException(status_code=400, detail="Sin líneas confirmadas")

    serie_alb = (body.serie or "").strip()
    if not serie_alb:
        raise HTTPException(status_code=400, detail="Serie requerida")


    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        conn.autocommit = False

        # Load pedido cabecera
        cur.execute(
            "SELECT * FROM ventas_cabeceras WHERE id = %s AND tipodoc = 2",
            (idcab,),
        )
        pedido_cab = cur.fetchone()
        if not pedido_cab:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        # Load pedido lines involved
        linea_ids = [l.id_linea_pedido for l in body.lineas]
        cur.execute(
            """
            SELECT vl.*, COALESCE(a.control_lotes, false) AS control_lotes
            FROM ventas_lineas vl
            LEFT JOIN articulos a ON a.referencia = vl.referencia
            WHERE vl.id = ANY(%s) AND vl.idcab = %s
            """,
            (linea_ids, idcab),
        )
        pedido_lineas_rows = cur.fetchall()
        if len(pedido_lineas_rows) != len(set(linea_ids)):
            raise HTTPException(status_code=400, detail="Algunas líneas no pertenecen a este pedido")
        pedido_lineas = {r["id"]: r for r in pedido_lineas_rows}

        # Get next albarán number for this series
        cur.execute(
            """
            SELECT COALESCE(MAX(numero), 0) + 1 AS next_num
            FROM ventas_cabeceras
            WHERE tipodoc = 4 AND TRIM(serie) = %s
            """,
            (serie_alb,),
        )
        num_alb = cur.fetchone()["next_num"]
        hoy = date.today()

        # Create albarán cabecera
        cur.execute(
            """
            INSERT INTO ventas_cabeceras (
                tipodoc, serie, numero, fecha, fechaentrega,
                cli_codigo, cli_nombre, cli_cif, cli_direccion,
                cli_localidad, cli_cpostal, cli_provincia,
                fpago, agente, tarifa, observaciones
            ) VALUES (
                4, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s
            ) RETURNING id
            """,
            (
                serie_alb, num_alb, hoy, hoy,
                pedido_cab["cli_codigo"], pedido_cab["cli_nombre"],
                pedido_cab["cli_cif"], pedido_cab["cli_direccion"],
                pedido_cab["cli_localidad"], pedido_cab["cli_cpostal"],
                pedido_cab["cli_provincia"],
                pedido_cab["fpago"], pedido_cab["agente"],
                pedido_cab["tarifa"],
                pedido_cab["observaciones"] or "",
            ),
        )
        id_alb = cur.fetchone()["id"]

        # Create albarán lines + update pedido udservidas
        iva_groups: dict = defaultdict(Decimal)  # piva -> base sum

        for orden, linea_req in enumerate(body.lineas, start=1):
            pl = pedido_lineas[linea_req.id_linea_pedido]
            uds = Decimal(str(linea_req.unidades))
            precio_unit = Decimal(str(pl["precio"] or 0))
            pdto1 = Decimal(str(pl["pdto1"] or 0))
            precio_efect = precio_unit * (1 - pdto1 / 100)
            importe = uds * precio_efect
            piva = Decimal(str(pl["piva"] or 0))

            talla = (linea_req.talla or pl["talla"] or "")[:20]
            color = (linea_req.color or pl["color"] or "")[:20]

            cur.execute(
                """
                INSERT INTO ventas_lineas (
                    idcab, tipodoc, serie, numero, cli_codigo, orden, fecha,
                    referencia, descripcion, unidades, precio, importe,
                    piva, pdto1, talla, color,
                    almacen, coste, pmp, idpedido, usuario
                ) VALUES (
                    %s, 4, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    1, %s, %s, %s, %s
                ) RETURNING id
                """,
                (
                    id_alb, serie_alb, num_alb,
                    pedido_cab["cli_codigo"], orden, hoy,
                    pl["referencia"] or "", pl["descripcion"] or "",
                    uds, precio_efect, importe,
                    piva, pdto1, talla, color,
                    pl["coste"] or 0, pl["pmp"] or 0,
                    pl["id"],  # idpedido = pedido LINE id (FK convention del ERP)
                    current_user.id,
                ),
            )
            id_alb_lin = cur.fetchone()["id"]

            # Accumulate IVA groups for cabecera totals
            iva_groups[piva] += importe

            # Update pedido line: increment udservidas, recalculate ud_pte_entrega
            cur.execute(
                """
                UPDATE ventas_lineas
                SET udservidas     = COALESCE(udservidas, 0) + %s,
                    ud_pte_entrega = unidades - (COALESCE(udservidas, 0) + %s)
                WHERE id = %s
                """,
                (uds, uds, pl["id"]),
            )

            # Register lote movements (salida, tipo=0)
            if pl["control_lotes"] and linea_req.lotes:
                for lote_req in linea_req.lotes:
                    cur.execute(
                        """
                        INSERT INTO articulos_lotes_registro
                            (id_lote, tipo, id_lin, almacen, unidades, gramos, id_lin_origen)
                        VALUES (%s, 0, %s, 1, %s, 0, 0)
                        """,
                        (lote_req.id_lote, id_alb_lin, Decimal(str(lote_req.unidades))),
                    )

        # Compute albarán totals grouped by IVA type (up to 3 groups)
        groups_sorted = sorted(iva_groups.items())  # (piva, base)
        update_fields = {}
        total = Decimal(0)
        for idx, (piva, base) in enumerate(groups_sorted, start=1):
            if idx > 3:
                break
            iva_importe = base * piva / 100
            update_fields[f"baseimpo{idx}"] = base
            update_fields[f"piva{idx}"] = piva
            update_fields[f"iva{idx}"] = iva_importe
            total += base + iva_importe

        # Build dynamic UPDATE for totals
        set_clauses = ", ".join(f"{k} = %s" for k in update_fields) + ", total = %s"
        cur.execute(
            f"UPDATE ventas_cabeceras SET {set_clauses} WHERE id = %s",
            list(update_fields.values()) + [total, id_alb],
        )

        conn.commit()
        return {
            "id": id_alb,
            "serie": serie_alb,
            "numero": num_alb,
            "total": float(total),
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando albarán: {e}")
    finally:
        if conn:
            conn.close()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RECEPCIÓN DE PEDIDOS DE COMPRA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

recepcion_router = APIRouter(
    dependencies=[Depends(require_permiso("recepcion_pedidos"))]
)


class CrearRecepcionRequest(BaseModel):
    lineas: List[LineaExpedicion]


# ── Series de compras disponibles ────────────────────────────────────────

@recepcion_router.get("/recepcion/series")
def list_series_compras(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT TRIM(serie) AS serie
            FROM compras_cabeceras
            WHERE tipodoc = 2
              AND serie IS NOT NULL AND TRIM(serie) != ''
            ORDER BY serie
            """
        )
        return [r["serie"] for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Listar pedidos de compra pendientes ──────────────────────────────────

@recepcion_router.get("/recepcion/pedidos")
def list_pedidos_compra_pendientes(
    q: Optional[str] = Query(None),
    series: Optional[str] = Query(None),  # comma-separated list of series
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        conditions = [
            "cc.tipodoc = 2",
            "(cl.linea_cabecera IS NULL OR cl.linea_cabecera = 0)",
            "cl.referencia IS NOT NULL",
            "cl.referencia != ''",
            "cc.fecha_finalizacion IS NULL",
        ]
        params: dict = {}

        if series:
            series_list = [s.strip() for s in series.split(",") if s.strip()]
            if series_list:
                ph = ", ".join([f"%(serie_{i})s" for i in range(len(series_list))])
                conditions.append(f"TRIM(cc.serie) IN ({ph})")
                for i, s in enumerate(series_list):
                    params[f"serie_{i}"] = s

        if q:
            conditions.append(
                "(LOWER(cc.pro_nombre) LIKE %(q)s "
                "OR CAST(cc.numero AS TEXT) LIKE %(q)s "
                "OR LOWER(TRIM(cc.serie)) LIKE %(q)s)"
            )
            params["q"] = f"%{q.lower()}%"

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
                cc.id,
                cc.serie,
                cc.numero,
                cc.pro_codigo,
                cc.pro_nombre,
                cc.fecha,
                cc.fechaentrega,
                cc.pro_referencia,
                COUNT(cl.id) FILTER (
                    WHERE cl.unidades > COALESCE(cl.udservidas, 0)
                ) AS lineas_pendientes,
                COUNT(cl.id) AS lineas_total,
                SUM(cl.unidades)                AS total_uds_pedidas,
                SUM(COALESCE(cl.udservidas, 0)) AS total_uds_servidas
            FROM compras_cabeceras cc
            JOIN compras_lineas cl ON cl.idcab = cc.id
            WHERE {where}
            GROUP BY cc.id, cc.serie, cc.numero, cc.pro_codigo, cc.pro_nombre,
                     cc.fecha, cc.fechaentrega, cc.pro_referencia
            HAVING SUM(cl.unidades) > SUM(COALESCE(cl.udservidas, 0))
            ORDER BY cc.fecha DESC, cc.id DESC
            LIMIT 200
            """,
            params or None,
        )

        result = []
        for r in cur.fetchall():
            total_uds = float(r["total_uds_pedidas"] or 0)
            total_srv = float(r["total_uds_servidas"] or 0)
            result.append({
                "id": r["id"],
                "serie": (r["serie"] or "").strip(),
                "numero": r["numero"],
                "pro_codigo": r["pro_codigo"],
                "pro_nombre": r["pro_nombre"] or "",
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "fechaentrega": r["fechaentrega"].isoformat() if r["fechaentrega"] else None,
                "pro_referencia": r["pro_referencia"] or "",
                "lineas_pendientes": int(r["lineas_pendientes"] or 0),
                "lineas_total": int(r["lineas_total"] or 0),
                "total_uds_pedidas": total_uds,
                "total_uds_servidas": total_srv,
                "estado": "parcial" if total_srv > 0 else "pendiente",
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Detalle de pedido de compra ──────────────────────────────────────────

@recepcion_router.get("/recepcion/pedidos/{idcab}")
def get_pedido_compra_detalle(
    idcab: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, tipodoc, serie, numero, fecha, fechaentrega,
                   pro_codigo, pro_nombre, pro_cif, pro_referencia,
                   fpago, observaciones
            FROM compras_cabeceras
            WHERE id = %s AND tipodoc = 2
            """,
            (idcab,),
        )
        cab = cur.fetchone()
        if not cab:
            raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

        cur.execute(
            """
            SELECT
                cl.id,
                cl.orden,
                cl.referencia,
                cl.descripcion,
                cl.unidades::float                                AS unidades,
                COALESCE(cl.udservidas, 0)::float                 AS udservidas,
                (cl.unidades - COALESCE(cl.udservidas, 0))::float  AS ud_pendiente,
                cl.precio::float                                  AS precio,
                cl.importe::float                                 AS importe,
                cl.piva::float                                    AS piva,
                cl.pdto1::float                                   AS pdto1,
                COALESCE(cl.talla, '')                            AS talla,
                COALESCE(cl.color, '')                            AS color,
                COALESCE(cl.almacen, 1)                          AS almacen,
                COALESCE(a.control_lotes, false)                  AS control_lotes,
                COALESCE(a.tallas_colores, false)                 AS tallas_colores,
                COALESCE(a.nombre, cl.descripcion)               AS articulo_nombre
            FROM compras_lineas cl
            LEFT JOIN articulos a ON a.referencia = cl.referencia
            WHERE cl.idcab = %s
              AND (cl.linea_cabecera IS NULL OR cl.linea_cabecera = 0)
              AND cl.referencia IS NOT NULL AND cl.referencia != ''
              AND cl.unidades > COALESCE(cl.udservidas, 0)
            ORDER BY cl.orden
            """,
            (idcab,),
        )
        lineas = []
        refs_lotes: list[str] = []
        all_refs: list[str] = []
        for r in cur.fetchall():
            ref = r["referencia"] or ""
            lineas.append({
                "id": r["id"],
                "orden": r["orden"],
                "referencia": ref,
                "descripcion": r["descripcion"] or "",
                "articulo_nombre": r["articulo_nombre"] or "",
                "unidades": r["unidades"],
                "udservidas": r["udservidas"],
                "ud_pendiente": r["ud_pendiente"],
                "precio": r["precio"],
                "importe": r["importe"],
                "piva": r["piva"],
                "pdto1": r["pdto1"],
                "talla": r["talla"] or "",
                "color": r["color"] or "",
                "almacen": r["almacen"] or 1,
                "control_lotes": bool(r["control_lotes"]),
                "tallas_colores": bool(r["tallas_colores"]),
            })
            if ref and ref not in all_refs:
                all_refs.append(ref)
            if r["control_lotes"] and ref and ref not in refs_lotes:
                refs_lotes.append(ref)

        codbarras: list = []
        if all_refs:
            cur.execute(
                """
                SELECT referencia,
                       TRIM(codbarras)      AS codbarras,
                       COALESCE(talla, '')  AS talla,
                       COALESCE(color, '')  AS color
                FROM articulos_codbarras
                WHERE referencia = ANY(%s)
                  AND codbarras IS NOT NULL AND TRIM(codbarras) != ''
                """,
                (all_refs,),
            )
            for r in cur.fetchall():
                codbarras.append({
                    "referencia": r["referencia"],
                    "codbarras": r["codbarras"],
                    "talla": r["talla"],
                    "color": r["color"],
                })

        lotes_data: dict = {}
        if refs_lotes:
            cur.execute(
                """
                SELECT al.referencia, al.id, al.lote, al.fecha_caducidad,
                       COALESCE(SUM(als.unidades), 0)::float AS stock
                FROM articulos_lotes al
                LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
                WHERE al.referencia = ANY(%s)
                GROUP BY al.referencia, al.id, al.lote, al.fecha_caducidad
                ORDER BY al.referencia, al.fecha_caducidad ASC NULLS LAST, al.id ASC
                """,
                (refs_lotes,),
            )
            for r in cur.fetchall():
                ref = r["referencia"]
                if ref not in lotes_data:
                    lotes_data[ref] = []
                lotes_data[ref].append({
                    "id": r["id"],
                    "lote": r["lote"] or "",
                    "fecha_caducidad": r["fecha_caducidad"].isoformat() if r["fecha_caducidad"] else None,
                    "stock": r["stock"],
                })

        return {
            "id": cab["id"],
            "serie": (cab["serie"] or "").strip(),
            "numero": cab["numero"],
            "fecha": cab["fecha"].isoformat() if cab["fecha"] else None,
            "fechaentrega": cab["fechaentrega"].isoformat() if cab["fechaentrega"] else None,
            "pro_codigo": cab["pro_codigo"],
            "pro_nombre": cab["pro_nombre"] or "",
            "pro_cif": cab["pro_cif"] or "",
            "pro_referencia": cab["pro_referencia"] or "",
            "observaciones": cab["observaciones"] or "",
            "lineas": lineas,
            "codbarras": codbarras,
            "lotes_data": lotes_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Escanear código en pedido de compra ──────────────────────────────────

@recepcion_router.post("/recepcion/pedidos/{idcab}/scan")
def scan_codigo_compra(
    idcab: int,
    body: ScanRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    codigo = (body.codigo or "").strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="Código vacío")


    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT
                cl.id, cl.referencia, cl.descripcion, cl.unidades::float,
                COALESCE(cl.udservidas, 0)::float              AS udservidas,
                (cl.unidades - COALESCE(cl.udservidas, 0))::float AS ud_pendiente,
                COALESCE(cl.talla, '')                         AS talla,
                COALESCE(cl.color, '')                         AS color,
                COALESCE(a.control_lotes, false)               AS control_lotes,
                COALESCE(a.tallas_colores, false)              AS tallas_colores,
                COALESCE(a.nombre, cl.descripcion)            AS articulo_nombre
            FROM compras_lineas cl
            LEFT JOIN articulos a ON a.referencia = cl.referencia
            WHERE cl.idcab = %s
              AND (cl.linea_cabecera IS NULL OR cl.linea_cabecera = 0)
              AND cl.unidades > COALESCE(cl.udservidas, 0)
              AND LOWER(TRIM(cl.referencia)) = LOWER(TRIM(%s))
            ORDER BY cl.orden
            """,
            (idcab, codigo),
        )
        lineas = list(cur.fetchall())
        talla_bc = None
        color_bc = None

        if not lineas:
            cur.execute(
                """
                SELECT referencia, COALESCE(talla, '') AS talla,
                       COALESCE(color, '') AS color
                FROM articulos_codbarras
                WHERE TRIM(codbarras) = TRIM(%s)
                LIMIT 1
                """,
                (codigo,),
            )
            bc = cur.fetchone()
            if bc:
                referencia = bc["referencia"]
                talla_bc = bc["talla"] or ""
                color_bc = bc["color"] or ""
                extra = ""
                extra_params = []
                if talla_bc:
                    extra += " AND COALESCE(cl.talla, '') = %s"
                    extra_params.append(talla_bc)
                if color_bc:
                    extra += " AND COALESCE(cl.color, '') = %s"
                    extra_params.append(color_bc)
                cur.execute(
                    f"""
                    SELECT
                        cl.id, cl.referencia, cl.descripcion, cl.unidades::float,
                        COALESCE(cl.udservidas, 0)::float              AS udservidas,
                        (cl.unidades - COALESCE(cl.udservidas, 0))::float AS ud_pendiente,
                        COALESCE(cl.talla, '')                         AS talla,
                        COALESCE(cl.color, '')                         AS color,
                        COALESCE(a.control_lotes, false)               AS control_lotes,
                        COALESCE(a.tallas_colores, false)              AS tallas_colores,
                        COALESCE(a.nombre, cl.descripcion)            AS articulo_nombre
                    FROM compras_lineas cl
                    LEFT JOIN articulos a ON a.referencia = cl.referencia
                    WHERE cl.idcab = %s
                      AND (cl.linea_cabecera IS NULL OR cl.linea_cabecera = 0)
                      AND cl.unidades > COALESCE(cl.udservidas, 0)
                      AND cl.referencia = %s{extra}
                    ORDER BY cl.orden
                    """,
                    [idcab, referencia] + extra_params,
                )
                lineas = list(cur.fetchall())

        if not lineas:
            return {"found": False, "lineas": []}

        result_lineas = []
        for r in lineas:
            line_data: dict = {
                "id": r["id"],
                "referencia": r["referencia"] or "",
                "descripcion": r["descripcion"] or "",
                "articulo_nombre": r["articulo_nombre"] or "",
                "unidades": r["unidades"],
                "udservidas": r["udservidas"],
                "ud_pendiente": r["ud_pendiente"],
                "talla": talla_bc if talla_bc is not None else (r["talla"] or ""),
                "color": color_bc if color_bc is not None else (r["color"] or ""),
                "control_lotes": bool(r["control_lotes"]),
                "tallas_colores": bool(r["tallas_colores"]),
            }
            if r["control_lotes"]:
                cur.execute(
                    """
                    SELECT al.id, al.lote, al.fecha_caducidad,
                           COALESCE(SUM(als.unidades), 0)::float AS stock
                    FROM articulos_lotes al
                    LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
                    WHERE al.referencia = %s
                    GROUP BY al.id, al.lote, al.fecha_caducidad
                    ORDER BY al.fecha_caducidad ASC NULLS LAST, al.id ASC
                    """,
                    (r["referencia"],),
                )
                lotes = [
                    {
                        "id": l["id"], "lote": l["lote"] or "",
                        "fecha_caducidad": l["fecha_caducidad"].isoformat() if l["fecha_caducidad"] else None,
                        "stock": l["stock"],
                    }
                    for l in cur.fetchall()
                ]
                line_data["lotes"] = lotes
                line_data["stock_total"] = sum(l["stock"] for l in lotes)
                line_data["lotes_auto"] = _distribuir_fefo(lotes, r["ud_pendiente"])
            result_lineas.append(line_data)

        return {"found": True, "lineas": result_lineas}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Crear albarán de recepción (compras tipodoc=4) ───────────────────────

@recepcion_router.post("/recepcion/pedidos/{idcab}/crear-albaran")
def crear_albaran_compra(
    idcab: int,
    body: CrearRecepcionRequest,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not body.lineas:
        raise HTTPException(status_code=400, detail="Sin líneas confirmadas")


    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        conn.autocommit = False

        cur.execute(
            "SELECT * FROM compras_cabeceras WHERE id = %s AND tipodoc = 2",
            (idcab,),
        )
        pedido_cab = cur.fetchone()
        if not pedido_cab:
            raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

        linea_ids = [l.id_linea_pedido for l in body.lineas]
        cur.execute(
            """
            SELECT cl.*, COALESCE(a.control_lotes, false) AS control_lotes
            FROM compras_lineas cl
            LEFT JOIN articulos a ON a.referencia = cl.referencia
            WHERE cl.id = ANY(%s) AND cl.idcab = %s
            """,
            (linea_ids, idcab),
        )
        pedido_lineas_rows = cur.fetchall()
        if len(pedido_lineas_rows) != len(set(linea_ids)):
            raise HTTPException(status_code=400, detail="Algunas líneas no pertenecen a este pedido")
        pedido_lineas = {r["id"]: r for r in pedido_lineas_rows}

        serie_alb = (pedido_cab["serie"] or "").strip()
        if not serie_alb:
            raise HTTPException(status_code=400, detail="El pedido no tiene serie definida")

        cur.execute(
            """
            SELECT COALESCE(MAX(numero), 0) + 1 AS next_num
            FROM compras_cabeceras
            WHERE tipodoc = 4 AND TRIM(serie) = %s
            """,
            (serie_alb,),
        )
        num_alb = cur.fetchone()["next_num"]
        hoy = date.today()

        cur.execute(
            """
            INSERT INTO compras_cabeceras (
                tipodoc, serie, numero, fecha,
                pro_codigo, pro_nombre, pro_cif, pro_referencia,
                fpago, observaciones
            ) VALUES (4, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                serie_alb, num_alb, hoy,
                pedido_cab["pro_codigo"], pedido_cab["pro_nombre"] or "",
                pedido_cab["pro_cif"] or "", pedido_cab["pro_referencia"] or "",
                pedido_cab["fpago"], pedido_cab["observaciones"] or "",
            ),
        )
        id_alb = cur.fetchone()["id"]

        iva_groups: dict = defaultdict(Decimal)

        for orden, linea_req in enumerate(body.lineas, start=1):
            pl = pedido_lineas[linea_req.id_linea_pedido]
            uds = Decimal(str(linea_req.unidades))
            precio_unit = Decimal(str(pl["precio"] or 0))
            pdto1 = Decimal(str(pl["pdto1"] or 0))
            precio_efect = precio_unit * (1 - pdto1 / 100)
            importe = uds * precio_efect
            piva = Decimal(str(pl["piva"] or 0))
            almacen = pl["almacen"] or 1
            talla = (linea_req.talla or pl["talla"] or "")[:20]
            color = (linea_req.color or pl["color"] or "")[:20]

            cur.execute(
                """
                INSERT INTO compras_lineas (
                    idcab, tipodoc, serie, numero, pro_codigo, orden, fecha,
                    referencia, descripcion, unidades, precio, importe,
                    piva, pdto1, talla, color, almacen, coste, pmp, idpedido, usuario
                ) VALUES (
                    %s, 4, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
                """,
                (
                    id_alb, serie_alb, num_alb,
                    pedido_cab["pro_codigo"], orden, hoy,
                    pl["referencia"] or "", pl["descripcion"] or "",
                    uds, precio_efect, importe,
                    piva, pdto1, talla, color, almacen,
                    pl["coste"] or 0, pl["pmp"] or 0,
                    pl["id"],
                    current_user.id,
                ),
            )
            id_alb_lin = cur.fetchone()["id"]

            iva_groups[piva] += importe

            cur.execute(
                "UPDATE compras_lineas SET udservidas = COALESCE(udservidas, 0) + %s WHERE id = %s",
                (uds, pl["id"]),
            )

            # Lote registro: tipo=1 (entrada de compra)
            if pl["control_lotes"] and linea_req.lotes:
                for lote_req in linea_req.lotes:
                    cur.execute(
                        """
                        INSERT INTO articulos_lotes_registro
                            (id_lote, tipo, id_lin, almacen, unidades, gramos, id_lin_origen)
                        VALUES (%s, 1, %s, %s, %s, 0, 0)
                        """,
                        (lote_req.id_lote, id_alb_lin, almacen, Decimal(str(lote_req.unidades))),
                    )

        groups_sorted = sorted(iva_groups.items())
        update_fields: dict = {}
        total = Decimal(0)
        for idx, (piva, base) in enumerate(groups_sorted, start=1):
            if idx > 3:
                break
            iva_importe = base * piva / 100
            update_fields[f"baseimpo{idx}"] = base
            update_fields[f"piva{idx}"] = piva
            update_fields[f"iva{idx}"] = iva_importe
            total += base + iva_importe

        if update_fields:
            set_clauses = ", ".join(f"{k} = %s" for k in update_fields) + ", total = %s"
            cur.execute(
                f"UPDATE compras_cabeceras SET {set_clauses} WHERE id = %s",
                list(update_fields.values()) + [total, id_alb],
            )

        # Mark pedido as finalized if all lines fully received
        cur.execute(
            """
            SELECT COUNT(*) AS pte
            FROM compras_lineas
            WHERE idcab = %s
              AND (linea_cabecera IS NULL OR linea_cabecera = 0)
              AND referencia IS NOT NULL AND referencia != ''
              AND unidades > COALESCE(udservidas, 0)
            """,
            (idcab,),
        )
        pedido_finalizado = cur.fetchone()["pte"] == 0

        if pedido_finalizado:
            cur.execute(
                """
                UPDATE compras_cabeceras
                SET fecha_finalizacion = NOW(),
                    usuario_finalizacion = %s,
                    motivo_finalizacion = 'Recepción completa'
                WHERE id = %s
                """,
                (current_user.id, idcab),
            )

        conn.commit()
        return {
            "id": id_alb,
            "serie": serie_alb,
            "numero": num_alb,
            "total": float(total),
            "finalizado": pedido_finalizado,
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando recepción: {e}")
    finally:
        if conn:
            conn.close()
