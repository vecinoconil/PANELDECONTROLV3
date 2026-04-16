"""
Cuadro de Mandos – read‑only dashboard endpoint.
Queries the empresa's PostgreSQL business database.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.auth.dependencies import get_current_user
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter()


def _get_empresa(user: Usuario, session: Session) -> Empresa:
    if not user.empresa_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa asignada")
    empresa = session.get(Empresa, user.empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return empresa


@router.get("/cuadro-mandos")
def cuadro_mandos(
    anio: int = Query(default=None, description="Año"),
    mes_desde: int = Query(default=1, ge=1, le=12),
    mes_hasta: int = Query(default=12, ge=1, le=12),
    series: Optional[list[str]] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)

    if anio is None:
        anio = date.today().year

    fecha_desde = f"{anio}-{mes_desde:02d}-01"
    if mes_hasta == 12:
        fecha_hasta = f"{anio}-12-31"
    else:
        fecha_hasta = f"{anio}-{mes_hasta + 1:02d}-01"

    serie_filter = ""
    agente_filter = ""
    params: dict = {"anio": anio, "fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta}

    if series and len(series) > 0:
        serie_filter = " AND vc.serie = ANY(%(series)s)"
        params["series"] = series
    if agente is not None:
        agente_filter = " AND vc.agente = %(agente)s"
        params["agente"] = agente

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        ventas_cond = "(vc.tipodoc = 8 OR (vc.tipodoc = 4 AND vc.fechafin IS NULL))"

        # 1. Ventas mensuales (facturas + albaranes pte facturar)
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   SUM(vc.total) AS total,
                   SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)) AS base,
                   COUNT(*) AS facturas
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY mes ORDER BY mes
        """, params)
        ventas_mensuales = [dict(r) for r in cur.fetchall()]

        # 2. Totales de ventas (global + desglose facturas / albaranes pte)
        cur.execute(f"""
            SELECT COALESCE(SUM(vc.total), 0) AS total_ventas,
                   COALESCE(SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)), 0) AS total_base,
                   COUNT(*) AS num_docs,
                   COALESCE(SUM(CASE WHEN vc.tipodoc = 8 THEN vc.total END), 0) AS total_facturas,
                   COUNT(CASE WHEN vc.tipodoc = 8 THEN 1 END) AS num_facturas,
                   COALESCE(SUM(CASE WHEN vc.tipodoc = 4 AND vc.fechafin IS NULL THEN vc.total END), 0) AS total_albaranes_pte,
                   COUNT(CASE WHEN vc.tipodoc = 4 AND vc.fechafin IS NULL THEN 1 END) AS num_albaranes_pte
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
        """, params)
        totales_ventas = dict(cur.fetchone())

        # 3. Beneficio (venta - coste en líneas)
        cur.execute(f"""
            SELECT COALESCE(SUM(vl.importe), 0) AS total_venta,
                   COALESCE(SUM(vl.coste * vl.unidades), 0) AS total_coste
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
        """, params)
        benef_row = dict(cur.fetchone())
        beneficio = {
            "ventas": float(benef_row["total_venta"]),
            "coste": float(benef_row["total_coste"]),
            "beneficio": float(benef_row["total_venta"] - benef_row["total_coste"]),
        }

        # 4. Compras mensuales (albaranes tipodoc=8)
        cur.execute("""
            SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
                   SUM(total) AS total,
                   COUNT(*) AS count
            FROM compras_cabeceras
            WHERE tipodoc = 8
              AND fecha >= %(fecha_desde)s AND fecha < %(fecha_hasta)s
            GROUP BY mes ORDER BY mes
        """, params)
        compras_mensuales = [dict(r) for r in cur.fetchall()]

        total_compras = sum(float(r["total"]) for r in compras_mensuales)

        # 5. Consumo por familia
        cur.execute(f"""
            SELECT COALESCE(f.nombre, 'Sin Familia') AS familia,
                   SUM(vl.unidades) AS unidades,
                   SUM(vl.importe) AS total_venta,
                   SUM(vl.coste * vl.unidades) AS total_coste
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            LEFT JOIN articulos a ON vl.referencia = a.referencia
            LEFT JOIN familias f ON a.familia = f.codigo
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY f.nombre
            ORDER BY total_venta DESC
        """, params)
        consumo_familias = [dict(r) for r in cur.fetchall()]

        # 6. Series / IVA
        cur.execute(f"""
            SELECT vc.serie,
                   SUM(vc.baseimpo1) AS base1, SUM(vc.iva1) AS iva1,
                   SUM(COALESCE(vc.baseimpo2,0)) AS base2, SUM(COALESCE(vc.iva2,0)) AS iva2,
                   SUM(vc.total) AS total,
                   COUNT(*) AS num
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY vc.serie ORDER BY total DESC
        """, params)
        series_iva = [dict(r) for r in cur.fetchall()]

        # 7. Vencimientos pendientes (situacion=0), filtrados por series si aplica
        # tipo=0: venta (clientes → pte cobro)
        if series and len(series) > 0:
            cur.execute("""
                SELECT COALESCE(SUM(v.importe), 0) AS total_pte
                FROM vencimientos v
                JOIN ventas_cabeceras vc ON v.idcab = vc.id
                WHERE v.tipo = 0 AND v.situacion = 0
                  AND vc.serie = ANY(%(series)s)
            """, params)
        else:
            cur.execute("""
                SELECT COALESCE(SUM(importe), 0) AS total_pte
                FROM vencimientos WHERE tipo = 0 AND situacion = 0
            """)
        pte_cobro = float(cur.fetchone()["total_pte"])

        # tipo=1: compra (proveedores → pte pago)
        if series and len(series) > 0:
            cur.execute("""
                SELECT COALESCE(SUM(v.importe), 0) AS total_pte
                FROM vencimientos v
                JOIN compras_cabeceras cc ON v.idcab = cc.id
                WHERE v.tipo = 1 AND v.situacion = 0
                  AND cc.serie = ANY(%(series)s)
            """, params)
        else:
            cur.execute("""
                SELECT COALESCE(SUM(importe), 0) AS total_pte
                FROM vencimientos WHERE tipo = 1 AND situacion = 0
            """)
        pte_pago = float(cur.fetchone()["total_pte"])

        vencimientos = {"clientes": pte_cobro, "proveedores": pte_pago}

        # 8. Cobros en el período
        cur.execute("""
            SELECT COALESCE(SUM(rc.importe), 0) AS total
            FROM registro_cobros rc
            WHERE rc.borrado = false AND rc.es_cobro = true
              AND rc.created_at >= %(fecha_desde)s AND rc.created_at < %(fecha_hasta)s
        """, params)
        total_cobros = float(cur.fetchone()["total"])

        # 9. Pagos en el período
        cur.execute("""
            SELECT COALESCE(SUM(rp.importe), 0) AS total
            FROM registro_pagos rp
            WHERE rp.borrado = false AND rp.es_cobro = true
              AND rp.created_at >= %(fecha_desde)s AND rp.created_at < %(fecha_hasta)s
        """, params)
        total_pagos = float(cur.fetchone()["total"])

        # 10. Top proveedores + pendiente
        cur.execute("""
            WITH compras AS (
                SELECT pro_codigo, pro_nombre, SUM(total) AS total_compras
                FROM compras_cabeceras
                WHERE tipodoc = 8
                  AND fecha >= %(fecha_desde)s AND fecha < %(fecha_hasta)s
                GROUP BY pro_codigo, pro_nombre
            ),
            pendientes AS (
                SELECT clipro, SUM(importe) AS pendiente
                FROM vencimientos WHERE tipo = 1 AND situacion = 0
                GROUP BY clipro
            )
            SELECT c.pro_codigo, c.pro_nombre, c.total_compras,
                   COALESCE(p.pendiente, 0) AS pendiente
            FROM compras c
            LEFT JOIN pendientes p ON p.clipro = c.pro_codigo
            ORDER BY c.total_compras DESC LIMIT 20
        """, params)
        proveedores = [dict(r) for r in cur.fetchall()]

        # 11. Series disponibles (para el filtro)
        cur.execute(f"""
            SELECT DISTINCT serie FROM ventas_cabeceras vc
            WHERE {ventas_cond} AND EXTRACT(YEAR FROM vc.fecha) = %(anio)s
            ORDER BY serie
        """, params)
        series_list = [r["serie"] for r in cur.fetchall()]

        # 12. Agentes disponibles (para el filtro)
        cur.execute(f"""
            SELECT DISTINCT vc.agente AS codigo, COALESCE(a.nombre, 'Sin agente') AS nombre
            FROM ventas_cabeceras vc
            LEFT JOIN agentes a ON vc.agente = a.codigo
            WHERE {ventas_cond} AND EXTRACT(YEAR FROM vc.fecha) = %(anio)s
            ORDER BY nombre
        """, params)
        agentes_list = [dict(r) for r in cur.fetchall()]

        # 13. Top clientes + beneficio + pendiente
        cur.execute(f"""
            WITH ventas_cli AS (
                SELECT vc.cli_codigo, vc.cli_nombre,
                       SUM(vc.total) AS total,
                       SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)) AS base
                FROM ventas_cabeceras vc
                WHERE {ventas_cond}
                  AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
                  {serie_filter} {agente_filter}
                GROUP BY vc.cli_codigo, vc.cli_nombre
            ),
            benef_cli AS (
                SELECT vc.cli_codigo,
                       SUM(vl.importe - vl.coste * vl.unidades) AS beneficio
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                WHERE {ventas_cond}
                  AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
                  {serie_filter} {agente_filter}
                GROUP BY vc.cli_codigo
            ),
            pend_cli AS (
                SELECT clipro, SUM(importe) AS pendiente
                FROM vencimientos WHERE tipo = 0 AND situacion = 0
                GROUP BY clipro
            )
            SELECT v.cli_codigo, v.cli_nombre, v.total, v.base,
                   COALESCE(b.beneficio, 0) AS beneficio,
                   COALESCE(p.pendiente, 0) AS pendiente
            FROM ventas_cli v
            LEFT JOIN benef_cli b ON b.cli_codigo = v.cli_codigo
            LEFT JOIN pend_cli p ON p.clipro = v.cli_codigo
            ORDER BY v.total DESC LIMIT 20
        """, params)
        top_clientes = [dict(r) for r in cur.fetchall()]

        cur.close()

        def _dec(v):
            if v is None:
                return 0
            return float(v)

        def _clean(rows):
            return [{k: _dec(v) if hasattr(v, 'as_tuple') else v for k, v in r.items()} for r in rows]

        return {
            "anio": anio,
            "mes_desde": mes_desde,
            "mes_hasta": mes_hasta,
            "filtro_series": series or [],
            "filtro_agente": agente,
            "ventas_mensuales": _clean(ventas_mensuales),
            "compras_mensuales": _clean(compras_mensuales),
            "totales": {
                "ventas": _dec(totales_ventas["total_ventas"]),
                "base_ventas": _dec(totales_ventas["total_base"]),
                "num_facturas": totales_ventas["num_facturas"],
                "total_facturas": _dec(totales_ventas["total_facturas"]),
                "total_albaranes_pte": _dec(totales_ventas["total_albaranes_pte"]),
                "num_albaranes_pte": totales_ventas["num_albaranes_pte"],
                "compras": _dec(total_compras),
                "cobros": _dec(total_cobros),
                "pagos": _dec(total_pagos),
            },
            "beneficio": beneficio,
            "vencimientos": vencimientos,
            "consumo_familias": _clean(consumo_familias),
            "series_iva": _clean(series_iva),
            "proveedores": _clean(proveedores),
            "top_clientes": _clean(top_clientes),
            "filtros": {
                "series": series_list,
                "agentes": agentes_list,
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando BD: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/summary")
def get_summary(current_user: Usuario = Depends(get_current_user)):
    return {
        "message": f"Bienvenido {current_user.nombre}",
    }


@router.get("/productos-familia")
def productos_familia(
    familia: str = Query(..., description="Nombre de la familia"),
    anio: int = Query(default=None),
    mes_desde: int = Query(default=1, ge=1, le=12),
    mes_hasta: int = Query(default=12, ge=1, le=12),
    series: Optional[list[str]] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year

    fecha_desde = f"{anio}-{mes_desde:02d}-01"
    fecha_hasta = f"{anio}-12-31" if mes_hasta == 12 else f"{anio}-{mes_hasta + 1:02d}-01"

    serie_filter = ""
    agente_filter = ""
    params: dict = {"anio": anio, "fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta, "familia": familia}
    if series and len(series) > 0:
        serie_filter = " AND vc.serie = ANY(%(series)s)"
        params["series"] = series
    if agente is not None:
        agente_filter = " AND vc.agente = %(agente)s"
        params["agente"] = agente

    ventas_cond = "(vc.tipodoc = 8 OR (vc.tipodoc = 4 AND vc.fechafin IS NULL))"

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        familia_cond = "f.nombre = %(familia)s" if familia != "Sin Familia" else "f.nombre IS NULL"

        cur.execute(f"""
            SELECT COALESCE(NULLIF(vl.referencia, ''), '---') AS referencia,
                   COALESCE(a.nombre, vl.descripcion, 'Sin referencia') AS descripcion,
                   SUM(vl.unidades) AS unidades,
                   SUM(vl.importe) AS total_venta,
                   SUM(vl.coste * vl.unidades) AS total_coste,
                   SUM(vl.importe - vl.coste * vl.unidades) AS beneficio
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
            LEFT JOIN familias f ON a.familia = f.codigo
            WHERE {ventas_cond}
              AND {familia_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY COALESCE(NULLIF(vl.referencia, ''), '---'), COALESCE(a.nombre, vl.descripcion, 'Sin referencia')
            ORDER BY total_venta DESC
        """, params)
        productos = [dict(r) for r in cur.fetchall()]
        cur.close()

        def _dec(v):
            return float(v) if v is not None else 0

        return {
            "familia": familia,
            "productos": [{k: _dec(v) if hasattr(v, 'as_tuple') else v for k, v in p.items()} for p in productos],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/vencimientos-resumen")
def vencimientos_resumen(
    fecha_desde: Optional[str] = Query(default=None),
    fecha_hasta: Optional[str] = Query(default=None),
    series: Optional[list[str]] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        fecha_cond = ""
        params: dict = {}
        if fecha_desde:
            fecha_cond += " AND v.fecha >= %(vto_desde)s"
            params["vto_desde"] = fecha_desde
        if fecha_hasta:
            fecha_cond += " AND v.fecha <= %(vto_hasta)s"
            params["vto_hasta"] = fecha_hasta
        if series and len(series) > 0:
            params["series"] = series

        # Pte cobro (tipo=0, clientes)
        if series and len(series) > 0:
            cur.execute(f"""
                SELECT COALESCE(SUM(v.importe), 0) AS total_pte, COUNT(*) AS count
                FROM vencimientos v
                JOIN ventas_cabeceras vc ON v.idcab = vc.id
                WHERE v.tipo = 0 AND v.situacion = 0
                  AND vc.serie = ANY(%(series)s)
                  {fecha_cond}
            """, params)
        else:
            cur.execute(f"""
                SELECT COALESCE(SUM(v.importe), 0) AS total_pte, COUNT(*) AS count
                FROM vencimientos v
                WHERE v.tipo = 0 AND v.situacion = 0
                  {fecha_cond}
            """, params)
        row = cur.fetchone()
        pte_cobro = float(row["total_pte"])
        cnt_cobro = row["count"]

        # Pte pago (tipo=1, proveedores)
        if series and len(series) > 0:
            cur.execute(f"""
                SELECT COALESCE(SUM(v.importe), 0) AS total_pte, COUNT(*) AS count
                FROM vencimientos v
                JOIN compras_cabeceras cc ON v.idcab = cc.id
                WHERE v.tipo = 1 AND v.situacion = 0
                  AND cc.serie = ANY(%(series)s)
                  {fecha_cond}
            """, params)
        else:
            cur.execute(f"""
                SELECT COALESCE(SUM(v.importe), 0) AS total_pte, COUNT(*) AS count
                FROM vencimientos v
                WHERE v.tipo = 1 AND v.situacion = 0
                  {fecha_cond}
            """, params)
        row = cur.fetchone()
        pte_pago = float(row["total_pte"])
        cnt_pago = row["count"]

        cur.close()
        return {
            "clientes": pte_cobro,
            "clientes_count": cnt_cobro,
            "proveedores": pte_pago,
            "proveedores_count": cnt_pago,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/facturas-cliente")
def facturas_cliente(
    cli_codigo: int = Query(...),
    anio: int = Query(default=None),
    mes_desde: int = Query(default=1, ge=1, le=12),
    mes_hasta: int = Query(default=12, ge=1, le=12),
    series: Optional[list[str]] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year
    fecha_desde = f"{anio}-{mes_desde:02d}-01"
    fecha_hasta = f"{anio}-12-31" if mes_hasta == 12 else f"{anio}-{mes_hasta + 1:02d}-01"

    serie_filter = ""
    agente_filter = ""
    params: dict = {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta, "cli_codigo": cli_codigo}
    if series and len(series) > 0:
        serie_filter = " AND vc.serie = ANY(%(series)s)"
        params["series"] = series
    if agente is not None:
        agente_filter = " AND vc.agente = %(agente)s"
        params["agente"] = agente

    ventas_cond = "(vc.tipodoc = 8 OR (vc.tipodoc = 4 AND vc.fechafin IS NULL))"

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(f"""
            SELECT vc.serie, vc.numero, vc.fecha,
                   CASE WHEN vc.tipodoc = 8 THEN 'Factura'
                        WHEN vc.tipodoc = 4 THEN 'Albarán' END AS tipo_doc,
                   vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0) AS base,
                   vc.iva1 + COALESCE(vc.iva2,0) AS iva,
                   vc.total,
                   COALESCE((SELECT SUM(v.importe) FROM vencimientos v
                             WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0), 0) AS pendiente
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND vc.cli_codigo = %(cli_codigo)s
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            ORDER BY vc.fecha DESC, vc.serie, vc.numero
        """, params)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()

        def _dec(v):
            if v is None:
                return 0
            return float(v) if hasattr(v, 'as_tuple') else v

        return {
            "facturas": [{k: str(v) if k == 'fecha' else _dec(v) for k, v in r.items()} for r in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error facturas-cliente: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/facturas-proveedor")
def facturas_proveedor(
    pro_codigo: int = Query(...),
    anio: int = Query(default=None),
    mes_desde: int = Query(default=1, ge=1, le=12),
    mes_hasta: int = Query(default=12, ge=1, le=12),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year
    fecha_desde = f"{anio}-{mes_desde:02d}-01"
    fecha_hasta = f"{anio}-12-31" if mes_hasta == 12 else f"{anio}-{mes_hasta + 1:02d}-01"
    params: dict = {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta, "pro_codigo": pro_codigo}

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("""
            SELECT cc.serie, cc.numero, cc.fecha,
                   cc.baseimpo1 + COALESCE(cc.baseimpo2,0) + COALESCE(cc.baseimpo3,0) AS base,
                   cc.iva1 + COALESCE(cc.iva2,0) AS iva,
                   cc.total,
                   COALESCE((SELECT SUM(v.importe) FROM vencimientos v
                             WHERE v.idcab = cc.id AND v.tipo = 1 AND v.situacion = 0), 0) AS pendiente
            FROM compras_cabeceras cc
            WHERE cc.tipodoc = 8
              AND cc.pro_codigo = %(pro_codigo)s
              AND cc.fecha >= %(fecha_desde)s AND cc.fecha < %(fecha_hasta)s
            ORDER BY cc.fecha DESC, cc.serie, cc.numero
        """, params)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()

        def _dec(v):
            if v is None:
                return 0
            return float(v) if hasattr(v, 'as_tuple') else v

        return {
            "facturas": [{k: str(v) if k == 'fecha' else _dec(v) for k, v in r.items()} for r in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error facturas-proveedor: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/vencimientos-detalle")
def vencimientos_detalle(
    tipo: int = Query(..., description="0=clientes, 1=proveedores"),
    fecha_desde: Optional[str] = Query(default=None),
    fecha_hasta: Optional[str] = Query(default=None),
    series: Optional[list[str]] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        fecha_cond = ""
        params: dict = {"tipo": tipo}
        if fecha_desde:
            fecha_cond += " AND v.fecha >= %(vto_desde)s"
            params["vto_desde"] = fecha_desde
        if fecha_hasta:
            fecha_cond += " AND v.fecha <= %(vto_hasta)s"
            params["vto_hasta"] = fecha_hasta

        if tipo == 0:
            join = "JOIN ventas_cabeceras cab ON v.idcab = cab.id"
            nombre_col = "cab.cli_nombre AS nombre"
            serie_cond = ""
            if series and len(series) > 0:
                serie_cond = " AND cab.serie = ANY(%(series)s)"
                params["series"] = series
        else:
            join = "JOIN compras_cabeceras cab ON v.idcab = cab.id"
            nombre_col = "cab.pro_nombre AS nombre"
            serie_cond = ""
            if series and len(series) > 0:
                serie_cond = " AND cab.serie = ANY(%(series)s)"
                params["series"] = series

        cur.execute(f"""
            SELECT v.clipro AS codigo, {nombre_col},
                   cab.serie, cab.numero, v.fecha,
                   v.importe
            FROM vencimientos v
            {join}
            WHERE v.tipo = %(tipo)s AND v.situacion = 0
              {serie_cond} {fecha_cond}
            ORDER BY v.fecha, v.clipro
        """, params)

        rows = [dict(r) for r in cur.fetchall()]
        cur.close()

        def _dec(v):
            if v is None:
                return 0
            return float(v) if hasattr(v, 'as_tuple') else v

        return {
            "vencimientos": [{k: str(v) if k == 'fecha' else _dec(v) for k, v in r.items()} for r in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error vencimientos-detalle: {str(e)}")
    finally:
        if conn:
            conn.close()
