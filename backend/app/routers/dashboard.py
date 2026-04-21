"""
Cuadro de Mandos – read‑only dashboard endpoint.
Queries the empresa's PostgreSQL business database.
"""
from collections import defaultdict
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

        ventas_cond = "vc.tipodoc = 8"

        # 1. Ventas mensuales (solo facturas tipodoc=8)
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   SUM(vc.total) AS total,
                   SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)) AS base,
                   COUNT(*) AS facturas,
                   SUM(vc.total) AS total_facturas
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY mes ORDER BY mes
        """, params)
        ventas_mensuales = [dict(r) for r in cur.fetchall()]

        # 1a. Albaranes pendientes de facturar por mes (tipodoc=4 sin fechafin) — dato informativo
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   COALESCE(SUM(vc.total), 0) AS total_albaranes
            FROM ventas_cabeceras vc
            WHERE vc.tipodoc = 4 AND vc.fechafin IS NULL
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY mes ORDER BY mes
        """, params)
        alb_pte_mensual = {r["mes"]: float(r["total_albaranes"]) for r in cur.fetchall()}
        for vm in ventas_mensuales:
            vm["total_albaranes"] = alb_pte_mensual.get(vm["mes"], 0)

        # 1b. Pendiente de cobro por mes (fecha del vencimiento)
        vto_serie_join = ""
        vto_serie_cond = ""
        if series and len(series) > 0:
            vto_serie_join = "JOIN ventas_cabeceras vc2 ON v.idcab = vc2.id"
            vto_serie_cond = "AND vc2.serie = ANY(%(series)s)"
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM v.fecha)::int AS mes,
                   COALESCE(SUM(v.importe), 0) AS pendiente
            FROM vencimientos v
            {vto_serie_join}
            WHERE v.tipo = 0 AND v.situacion = 0
              AND EXTRACT(YEAR FROM v.fecha) = %(anio)s
              {vto_serie_cond}
            GROUP BY mes ORDER BY mes
        """, params)
        pte_cobro_mensual = {r["mes"]: float(r["pendiente"]) for r in cur.fetchall()}

        # 2. Totales de ventas (solo facturas tipodoc=8) + albaranes pte aparte
        cur.execute(f"""
            SELECT COALESCE(SUM(vc.total), 0) AS total_ventas,
                   COALESCE(SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)), 0) AS total_base,
                   COUNT(*) AS num_facturas
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
        """, params)
        totales_ventas = dict(cur.fetchone())

        # 2b. Albaranes pendientes de facturar (dato informativo)
        cur.execute(f"""
            SELECT COALESCE(SUM(vc.total), 0) AS total_albaranes_pte,
                   COUNT(*) AS num_albaranes_pte
            FROM ventas_cabeceras vc
            WHERE vc.tipodoc = 4 AND vc.fechafin IS NULL
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
        """, params)
        alb_pte = dict(cur.fetchone())

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

        # 4b. Pendiente de pago por mes (fecha del vencimiento)
        cur.execute("""
            SELECT EXTRACT(MONTH FROM v.fecha)::int AS mes,
                   COALESCE(SUM(v.importe), 0) AS pendiente
            FROM vencimientos v
            WHERE v.tipo = 1 AND v.situacion = 0
              AND EXTRACT(YEAR FROM v.fecha) = %(anio)s
            GROUP BY mes ORDER BY mes
        """, params)
        pte_pago_mensual = {r["mes"]: float(r["pendiente"]) for r in cur.fetchall()}

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

        # 7. Vencimientos pendientes (situacion=0), filtrados por fecha/series/agente
        # tipo=0: venta (clientes → pte cobro)
        cur.execute(f"""
            SELECT COALESCE(SUM(v.importe), 0) AS total_pte
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON v.idcab = vc.id
            WHERE v.tipo = 0 AND v.situacion = 0
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
        """, params)
        pte_cobro = float(cur.fetchone()["total_pte"])

        # tipo=1: compra (proveedores → pte pago)
        cur.execute(f"""
            SELECT COALESCE(SUM(v.importe), 0) AS total_pte
            FROM vencimientos v
            JOIN compras_cabeceras cc ON v.idcab = cc.id
            WHERE v.tipo = 1 AND v.situacion = 0
              AND cc.fecha >= %(fecha_desde)s AND cc.fecha < %(fecha_hasta)s
        """, params)
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
                SELECT cc2.pro_codigo, SUM(v2.importe) AS pendiente
                FROM vencimientos v2
                JOIN compras_cabeceras cc2 ON cc2.id = v2.idcab
                WHERE v2.tipo = 1 AND v2.situacion = 0
                GROUP BY cc2.pro_codigo
            )
            SELECT c.pro_codigo, c.pro_nombre, c.total_compras,
                   COALESCE(p.pendiente, 0) AS pendiente
            FROM compras c
            LEFT JOIN pendientes p ON p.pro_codigo = c.pro_codigo
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
                SELECT vc2.cli_codigo, SUM(v2.importe) AS pendiente
                FROM vencimientos v2
                JOIN ventas_cabeceras vc2 ON vc2.id = v2.idcab
                WHERE v2.tipo = 0 AND v2.situacion = 0
                GROUP BY vc2.cli_codigo
            )
            SELECT v.cli_codigo, v.cli_nombre, v.total, v.base,
                   COALESCE(b.beneficio, 0) AS beneficio,
                   COALESCE(p.pendiente, 0) AS pendiente
            FROM ventas_cli v
            LEFT JOIN benef_cli b ON b.cli_codigo = v.cli_codigo
            LEFT JOIN pend_cli p ON p.cli_codigo = v.cli_codigo
            ORDER BY v.total DESC
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
            "pte_cobro_mensual": pte_cobro_mensual,
            "compras_mensuales": _clean(compras_mensuales),
            "pte_pago_mensual": pte_pago_mensual,
            "totales": {
                "ventas": _dec(totales_ventas["total_ventas"]),
                "base_ventas": _dec(totales_ventas["total_base"]),
                "num_facturas": totales_ventas["num_facturas"],
                "total_facturas": _dec(totales_ventas["total_ventas"]),
                "total_albaranes_pte": _dec(alb_pte["total_albaranes_pte"]),
                "num_albaranes_pte": alb_pte["num_albaranes_pte"],
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

    ventas_cond = "vc.tipodoc = 8"

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

    ventas_cond = "vc.tipodoc = 8"

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(f"""
            SELECT vc.id, vc.serie, vc.numero, vc.fecha,
                   'Factura' AS tipo_doc,
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
            SELECT cc.id, cc.serie, cc.numero, cc.fecha,
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


@router.get("/facturas-pte-cobro")
def facturas_pte_cobro(
    anio: int = Query(default=None, description="Año"),
    mes_desde: int = Query(default=1, ge=1, le=12),
    mes_hasta: int = Query(default=12, ge=1, le=12),
    series: Optional[list[str]] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    serie: Optional[str] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Facturas con importe pendiente de cobro."""
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params: dict = {}
        serie_cond = ""
        date_cond = ""
        agente_cond = ""
        if serie:
            serie_cond = " AND vc.serie = %(serie)s"
            params["serie"] = serie
        elif series and len(series) > 0:
            serie_cond = " AND vc.serie = ANY(%(series)s)"
            params["series"] = series
        if anio is not None:
            fecha_desde = f"{anio}-{mes_desde:02d}-01"
            fecha_hasta = f"{anio}-12-31" if mes_hasta == 12 else f"{anio}-{mes_hasta + 1:02d}-01"
            date_cond = " AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s"
            params["fecha_desde"] = fecha_desde
            params["fecha_hasta"] = fecha_hasta
        if agente is not None:
            agente_cond = " AND vc.agente = %(agente)s"
            params["agente"] = agente

        cur.execute(f"""
            SELECT vc.id,
                   vc.serie,
                   vc.numero,
                   vc.fecha::text AS fecha,
                   vc.cli_nombre,
                   COALESCE(vc.total, 0) AS total,
                   COALESCE((
                       SELECT SUM(v.importe)
                       FROM vencimientos v
                       WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
                   ), 0) AS pendiente
            FROM ventas_cabeceras vc
            WHERE EXISTS (
                SELECT 1 FROM vencimientos v
                WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
            )
            {serie_cond} {date_cond} {agente_cond}
            ORDER BY vc.fecha DESC, vc.serie, vc.numero
        """, params)

        def _dec(v):
            if v is None:
                return 0
            return float(v) if hasattr(v, 'as_tuple') else v

        facturas = []
        for r in cur.fetchall():
            facturas.append({
                "id": int(r["id"]),
                "serie": r["serie"] or "",
                "numero": int(r["numero"]),
                "fecha": str(r["fecha"]) if r["fecha"] else "",
                "cli_nombre": r["cli_nombre"] or "",
                "total": _dec(r["total"]),
                "pendiente": _dec(r["pendiente"]),
            })

        # Total pendiente global (con mismos filtros)
        cur.execute(f"""
            SELECT COALESCE(SUM(sub.pendiente), 0) AS total_pendiente,
                   COALESCE(SUM(sub.total), 0) AS total_facturas
            FROM (
                SELECT COALESCE(vc.total, 0) AS total,
                       COALESCE((
                           SELECT SUM(v.importe)
                           FROM vencimientos v
                           WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
                       ), 0) AS pendiente
                FROM ventas_cabeceras vc
                WHERE EXISTS (
                    SELECT 1 FROM vencimientos v
                    WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
                )
                {serie_cond} {date_cond} {agente_cond}
            ) sub
        """, params)
        totals_row = cur.fetchone()

        cur.close()
        return {
            "facturas": facturas,
            "total_pendiente": float(totals_row["total_pendiente"]),
            "total_facturas": float(totals_row["total_facturas"]),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error facturas-pte-cobro: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/iva-trimestral")
def iva_trimestral(
    anio: int = Query(default=None, description="Año"),
    series: Optional[list[str]] = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """IVA repercutido vs soportado por trimestre."""
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year

    params: dict = {"anio": anio}
    serie_filter_v = ""
    serie_filter_c = ""
    if series and len(series) > 0:
        serie_filter_v = " AND vc.serie = ANY(%(series)s)"
        serie_filter_c = " AND cc.serie = ANY(%(series)s)"
        params["series"] = series

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        ventas_cond = "vc.tipodoc = 8"

        # IVA repercutido (ventas) por trimestre
        cur.execute(f"""
            SELECT EXTRACT(QUARTER FROM vc.fecha)::int AS trimestre,
                   COALESCE(SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)), 0) AS base,
                   COALESCE(SUM(vc.iva1 + COALESCE(vc.iva2,0)), 0) AS iva
            FROM ventas_cabeceras vc
            WHERE {ventas_cond}
              AND EXTRACT(YEAR FROM vc.fecha) = %(anio)s
              {serie_filter_v}
            GROUP BY trimestre ORDER BY trimestre
        """, params)
        repercutido = {r["trimestre"]: dict(r) for r in cur.fetchall()}

        # IVA soportado (compras) por trimestre
        cur.execute(f"""
            SELECT EXTRACT(QUARTER FROM cc.fecha)::int AS trimestre,
                   COALESCE(SUM(cc.baseimpo1 + COALESCE(cc.baseimpo2,0) + COALESCE(cc.baseimpo3,0)), 0) AS base,
                   COALESCE(SUM(cc.iva1 + COALESCE(cc.iva2,0)), 0) AS iva
            FROM compras_cabeceras cc
            WHERE cc.tipodoc = 8
              AND EXTRACT(YEAR FROM cc.fecha) = %(anio)s
              {serie_filter_c}
            GROUP BY trimestre ORDER BY trimestre
        """, params)
        soportado = {r["trimestre"]: dict(r) for r in cur.fetchall()}

        cur.close()

        trimestres = []
        for q in range(1, 5):
            rep = repercutido.get(q, {})
            sop = soportado.get(q, {})
            iva_rep = float(rep.get("iva", 0))
            iva_sop = float(sop.get("iva", 0))
            trimestres.append({
                "trimestre": q,
                "base_repercutido": float(rep.get("base", 0)),
                "iva_repercutido": iva_rep,
                "base_soportado": float(sop.get("base", 0)),
                "iva_soportado": iva_sop,
                "diferencia": iva_rep - iva_sop,
            })

        return {"anio": anio, "trimestres": trimestres}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error iva-trimestral: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/detalle-documento")
def detalle_documento(
    doc_id: int = Query(..., description="ID de la cabecera"),
    tipo: str = Query(..., description="'venta' o 'compra'"),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Devuelve cabecera + líneas de un documento (factura/albarán) de venta o compra."""
    empresa = _get_empresa(current_user, session)

    if tipo not in ("venta", "compra"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'venta' o 'compra'")

    cab_table = "ventas_cabeceras" if tipo == "venta" else "compras_cabeceras"
    lin_table = "ventas_lineas" if tipo == "venta" else "compras_lineas"
    cli_field = "cli_codigo" if tipo == "venta" else "pro_codigo"
    cli_name = "cli_nombre" if tipo == "venta" else "pro_nombre"

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Cabecera
        cur.execute(f"""
            SELECT c.id, c.tipodoc, c.serie, c.numero, c.fecha, c.fechafin,
                   c.{cli_field} AS codigo_tercero, c.{cli_name} AS nombre_tercero,
                   c.baseimpo1, COALESCE(c.baseimpo2,0) AS baseimpo2, COALESCE(c.baseimpo3,0) AS baseimpo3,
                   c.piva1, c.piva2, c.piva3,
                   c.iva1, COALESCE(c.iva2,0) AS iva2, COALESCE(c.iva3,0) AS iva3,
                   c.rec1, COALESCE(c.rec2,0) AS rec2, COALESCE(c.rec3,0) AS rec3,
                   c.irpf, c.total, c.descripcion, c.observaciones, c.fpago
            FROM {cab_table} c
            WHERE c.id = %(doc_id)s
        """, {"doc_id": doc_id})
        cab_row = cur.fetchone()
        if not cab_row:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        cabecera = {k: (str(v) if k in ('fecha', 'fechafin') and v else
                        float(v) if hasattr(v, 'as_tuple') else v)
                    for k, v in dict(cab_row).items()}

        # Líneas
        cur.execute(f"""
            SELECT l.orden, l.referencia, l.descripcion, l.unidades, l.precio,
                   l.importe, l.coste, l.pdto1, l.pdto2, l.pdto3, l.descuento, l.piva
            FROM {lin_table} l
            WHERE l.idcab = %(doc_id)s
            ORDER BY l.orden
        """, {"doc_id": doc_id})
        lineas = []
        for r in cur.fetchall():
            lineas.append({k: (float(v) if hasattr(v, 'as_tuple') else v)
                           for k, v in dict(r).items()})

        # Vencimientos del documento
        vto_tipo = 0 if tipo == "venta" else 1
        cur.execute("""
            SELECT v.fecha, v.importe, v.situacion
            FROM vencimientos v
            WHERE v.idcab = %(doc_id)s AND v.tipo = %(vto_tipo)s
            ORDER BY v.fecha
        """, {"doc_id": doc_id, "vto_tipo": vto_tipo})
        vencimientos = []
        for r in cur.fetchall():
            vencimientos.append({
                "fecha": str(r["fecha"]) if r["fecha"] else None,
                "importe": float(r["importe"]),
                "situacion": r["situacion"],
            })

        cur.close()
        return {"cabecera": cabecera, "lineas": lineas, "vencimientos": vencimientos}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detalle-documento: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Ficha Cliente ─────────────────────────────────────────────────────────

@router.get("/ficha-cliente")
def ficha_cliente(
    cli_codigo: int = Query(..., description="Código cliente"),
    anio: int = Query(default=None, description="Año"),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # ── 1. Datos maestro del cliente ──
        cur.execute("SELECT codigo, nombre, alias, cif, direccion, localidad, cpostal, telefono1, email, agente, fpago, observaciones FROM clientes WHERE codigo = %(cli)s", {"cli": cli_codigo})
        row_cli = cur.fetchone()
        if not row_cli:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        cliente = dict(row_cli)

        # ── 2. Ventas mensuales (3 años) ──
        anio_desde = anio - 2
        cur.execute("""
            SELECT EXTRACT(YEAR FROM vc.fecha)::int AS anio,
                   EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   COALESCE(SUM(vc.total), 0) AS total
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
            GROUP BY 1, 2 ORDER BY 1, 2
        """, {"cli": cli_codigo, "desde": f"{anio_desde}-01-01", "hasta": f"{anio + 1}-01-01"})
        ventas_mensuales = [{"anio": int(r["anio"]), "mes": int(r["mes"]), "total": float(r["total"])} for r in cur.fetchall()]

        # ── 3. KPIs año actual ──
        cur.execute("""
            SELECT COALESCE(SUM(vc.total), 0) AS ventas,
                   COUNT(*) AS num_facturas
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        """, {"cli": cli_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        kpi = dict(cur.fetchone())
        ventas_anio = float(kpi["ventas"])
        num_facturas = int(kpi["num_facturas"])
        ticket_medio = ventas_anio / num_facturas if num_facturas > 0 else 0

        # ── 4. KPIs año anterior (para % variación) ──
        cur.execute("""
            SELECT COALESCE(SUM(vc.total), 0) AS ventas
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        """, {"cli": cli_codigo, "desde": f"{anio - 1}-01-01", "hasta": f"{anio}-01-01"})
        ventas_anio_anterior = float(cur.fetchone()["ventas"])

        # ── 5. Margen año actual (desde lineas) ──
        cur.execute("""
            SELECT COALESCE(SUM(vl.importe), 0) AS total_venta,
                   COALESCE(SUM(vl.coste * vl.unidades), 0) AS total_coste
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        """, {"cli": cli_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        margen_row = dict(cur.fetchone())
        total_venta_lineas = float(margen_row["total_venta"])
        total_coste_lineas = float(margen_row["total_coste"])
        margen_anio = total_venta_lineas - total_coste_lineas
        margen_pct = (margen_anio / total_venta_lineas * 100) if total_venta_lineas > 0 else 0

        # ── 6. Última compra (cualquier año) ──
        cur.execute("""
            SELECT MAX(vc.fecha) AS ultima
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        """, {"cli": cli_codigo})
        ultima_row = cur.fetchone()
        ultima_compra = str(ultima_row["ultima"]) if ultima_row and ultima_row["ultima"] else None

        # ── 7. Plazo pago medio (cobros reales) ──
        cur.execute("""
            SELECT AVG((v.fechacobro - vc.fecha)::int)::float AS plazo_medio
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON v.idcab = vc.id
            WHERE v.clipro = %(cli)s AND v.tipo = 0 AND v.situacion <> 0
              AND v.fechacobro IS NOT NULL AND vc.fecha IS NOT NULL
              AND vc.fecha >= %(desde)s
        """, {"cli": cli_codigo, "desde": f"{anio - 2}-01-01"})
        plazo_row = cur.fetchone()
        plazo_pago = float(plazo_row["plazo_medio"]) if plazo_row and plazo_row["plazo_medio"] else 0

        # ── 8. Frecuencia de compra (media días entre facturas) ──
        cur.execute("""
            SELECT fecha FROM ventas_cabeceras
            WHERE cli_codigo = %(cli)s AND tipodoc = 8
              AND fecha >= %(desde)s AND fecha < %(hasta)s
            ORDER BY fecha
        """, {"cli": cli_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        fechas = [r["fecha"] for r in cur.fetchall()]
        if len(fechas) > 1:
            diffs = [(fechas[i+1] - fechas[i]).days for i in range(len(fechas)-1)]
            frecuencia = sum(diffs) / len(diffs)
        else:
            frecuencia = 0

        # ── 9. Saldo pendiente ──
        cur.execute("""
            SELECT COALESCE(SUM(v.importe), 0) AS pendiente
            FROM vencimientos v
            WHERE v.clipro = %(cli)s AND v.tipo = 0 AND v.situacion = 0
        """, {"cli": cli_codigo})
        saldo_pendiente = float(cur.fetchone()["pendiente"])

        # ── 10. Patrón semanal (L-D), docs del año ──
        cur.execute("""
            SELECT EXTRACT(ISODOW FROM vc.fecha)::int AS dow, COUNT(*) AS cnt
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
            GROUP BY 1 ORDER BY 1
        """, {"cli": cli_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        dow_map = {int(r["dow"]): int(r["cnt"]) for r in cur.fetchall()}
        patron_semanal = [dow_map.get(d, 0) for d in range(1, 8)]  # 1=Lun .. 7=Dom

        # ── 11. Productos consumidos por familia (3 años) ──
        cur.execute("""
            SELECT COALESCE(f.nombre, 'Sin Familia') AS familia,
                   vl.referencia,
                   COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
                   EXTRACT(YEAR FROM vc.fecha)::int AS anio,
                   COALESCE(SUM(vl.importe), 0) AS total
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            LEFT JOIN articulos a ON vl.referencia = a.referencia
            LEFT JOIN familias f ON a.familia = f.codigo
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
            GROUP BY 1, 2, 3, 4
            ORDER BY 1, 5 DESC
        """, {"cli": cli_codigo, "desde": f"{anio_desde}-01-01", "hasta": f"{anio + 1}-01-01"})

        fam_data = defaultdict(lambda: {"productos": defaultdict(lambda: {"descripcion": "", "years": {}})})
        for r in cur.fetchall():
            fam = r["familia"]
            ref = r["referencia"] or ""
            yr = int(r["anio"])
            fam_data[fam]["productos"][ref]["descripcion"] = r["descripcion"]
            fam_data[fam]["productos"][ref]["years"][yr] = float(r["total"])

        anios_cols = [anio - 2, anio - 1, anio]
        productos_familia = []
        for fam_name in sorted(fam_data.keys()):
            prods = []
            fam_totals = {y: 0 for y in anios_cols}
            for ref, pdata in fam_data[fam_name]["productos"].items():
                row = {"referencia": ref, "descripcion": pdata["descripcion"]}
                for y in anios_cols:
                    row[str(y)] = pdata["years"].get(y, 0)
                    fam_totals[y] += pdata["years"].get(y, 0)
                prods.append(row)
            prods.sort(key=lambda x: x.get(str(anio), 0), reverse=True)
            fam_row = {"familia": fam_name, "productos": prods}
            for y in anios_cols:
                fam_row[str(y)] = round(fam_totals[y], 2)
            productos_familia.append(fam_row)

        # ── 12. TOP Productos por año (3 años) ──
        top_productos_by_year = {}
        for yr in anios_cols:
            cur.execute("""
                SELECT vl.referencia,
                       COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
                       SUM(vl.unidades) AS unidades,
                       SUM(vl.importe) AS total_venta,
                       SUM(vl.coste * vl.unidades) AS total_coste
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                LEFT JOIN articulos a ON vl.referencia = a.referencia
                WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
                  AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
                GROUP BY vl.referencia, vl.descripcion, a.nombre
                ORDER BY SUM(vl.importe) DESC
            """, {"cli": cli_codigo, "desde": f"{yr}-01-01", "hasta": f"{yr + 1}-01-01"})
            prods = []
            for r in cur.fetchall():
                tv = float(r["total_venta"])
                tc = float(r["total_coste"])
                benef = tv - tc
                prods.append({
                    "referencia": r["referencia"] or "",
                    "descripcion": r["descripcion"],
                    "unidades": float(r["unidades"]),
                    "total_venta": tv,
                    "beneficio": benef,
                    "margen_pct": round(benef / tv * 100, 2) if tv else 0,
                })
            top_productos_by_year[str(yr)] = prods

        # ── 13. Documentos venta del año ──
        cur.execute("""
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
                   vc.total,
                   COALESCE((SELECT SUM(v.importe) FROM vencimientos v
                             WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0), 0) AS pendiente,
                   CASE vc.tipodoc WHEN 8 THEN 'Factura' WHEN 4 THEN 'Albarán' WHEN 3 THEN 'Albarán' ELSE 'Doc' END AS tipo_doc
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
              AND vc.tipodoc IN (3, 4, 8)
            ORDER BY vc.fecha DESC, vc.numero DESC
        """, {"cli": cli_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        documentos_venta = []
        for r in cur.fetchall():
            documentos_venta.append({
                "id": int(r["id"]),
                "tipodoc": int(r["tipodoc"]),
                "serie": r["serie"],
                "numero": int(r["numero"]),
                "fecha": r["fecha"],
                "total": float(r["total"]),
                "pendiente": float(r["pendiente"]) if r["pendiente"] else 0,
                "tipo_doc": r["tipo_doc"],
            })

        # ── 14. Presupuestos (Pedidos Cliente) ──
        cur.execute("""
            SELECT vc.id, vc.serie, vc.numero, vc.fecha::text AS fecha,
                   vc.total, vc.descripcion
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 1
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
            ORDER BY vc.fecha DESC, vc.numero DESC
        """, {"cli": cli_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        presupuestos = []
        for r in cur.fetchall():
            presupuestos.append({
                "id": int(r["id"]),
                "serie": r["serie"],
                "numero": int(r["numero"]),
                "fecha": r["fecha"],
                "total": float(r["total"]),
                "descripcion": r["descripcion"] or "",
            })

        cur.close()

        return {
            "cliente": cliente,
            "anio": anio,
            "anios_cols": anios_cols,
            "ventas_mensuales": ventas_mensuales,
            "kpis": {
                "ticket_medio": round(ticket_medio, 2),
                "ventas_anio": round(ventas_anio, 2),
                "ventas_anio_anterior": round(ventas_anio_anterior, 2),
                "margen_anio": round(margen_anio, 2),
                "margen_pct": round(margen_pct, 1),
                "ultima_compra": ultima_compra,
                "plazo_pago": round(plazo_pago),
                "frecuencia": round(frecuencia),
                "saldo_pendiente": round(saldo_pendiente, 2),
            },
            "patron_semanal": patron_semanal,
            "productos_familia": productos_familia,
            "top_productos": top_productos_by_year,
            "documentos_venta": documentos_venta,
            "presupuestos": presupuestos,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ficha-cliente: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Ficha Proveedor ───────────────────────────────────────────────────────

@router.get("/ficha-proveedor")
def ficha_proveedor(
    pro_codigo: int = Query(..., description="Código proveedor"),
    anio: int = Query(default=None, description="Año"),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # ── 1. Datos maestro del proveedor ──
        cur.execute("""
            SELECT codigo, nombre, alias, cif, direccion, localidad, cpostal,
                   telefono1, email, fpago, observaciones
            FROM proveedores WHERE codigo = %(pro)s
        """, {"pro": pro_codigo})
        row_pro = cur.fetchone()
        if not row_pro:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")
        proveedor = dict(row_pro)

        # ── 2. Compras mensuales (3 años) ──
        anio_desde = anio - 2
        cur.execute("""
            SELECT EXTRACT(YEAR FROM cc.fecha)::int AS anio,
                   EXTRACT(MONTH FROM cc.fecha)::int AS mes,
                   COALESCE(SUM(cc.total), 0) AS total
            FROM compras_cabeceras cc
            WHERE cc.pro_codigo = %(pro)s AND cc.tipodoc = 8
              AND cc.fecha >= %(desde)s AND cc.fecha < %(hasta)s
            GROUP BY 1, 2 ORDER BY 1, 2
        """, {"pro": pro_codigo, "desde": f"{anio_desde}-01-01", "hasta": f"{anio + 1}-01-01"})
        compras_mensuales = [{"anio": int(r["anio"]), "mes": int(r["mes"]), "total": float(r["total"])} for r in cur.fetchall()]

        # ── 3. KPIs año actual ──
        cur.execute("""
            SELECT COALESCE(SUM(cc.total), 0) AS compras,
                   COUNT(*) AS num_facturas
            FROM compras_cabeceras cc
            WHERE cc.pro_codigo = %(pro)s AND cc.tipodoc = 8
              AND cc.fecha >= %(desde)s AND cc.fecha < %(hasta)s
        """, {"pro": pro_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        kpi = dict(cur.fetchone())
        compras_anio = float(kpi["compras"])
        num_facturas = int(kpi["num_facturas"])
        ticket_medio = compras_anio / num_facturas if num_facturas > 0 else 0

        # ── 4. KPIs año anterior ──
        cur.execute("""
            SELECT COALESCE(SUM(cc.total), 0) AS compras
            FROM compras_cabeceras cc
            WHERE cc.pro_codigo = %(pro)s AND cc.tipodoc = 8
              AND cc.fecha >= %(desde)s AND cc.fecha < %(hasta)s
        """, {"pro": pro_codigo, "desde": f"{anio - 1}-01-01", "hasta": f"{anio}-01-01"})
        compras_anio_anterior = float(cur.fetchone()["compras"])

        # ── 5. Última compra ──
        cur.execute("""
            SELECT MAX(cc.fecha) AS ultima
            FROM compras_cabeceras cc
            WHERE cc.pro_codigo = %(pro)s AND cc.tipodoc = 8
        """, {"pro": pro_codigo})
        ultima_row = cur.fetchone()
        ultima_compra = str(ultima_row["ultima"]) if ultima_row and ultima_row["ultima"] else None

        # ── 6. Plazo pago medio ──
        cur.execute("""
            SELECT AVG((v.fechacobro - cc.fecha)::int)::float AS plazo_medio
            FROM vencimientos v
            JOIN compras_cabeceras cc ON v.idcab = cc.id
            WHERE v.clipro = %(pro)s AND v.tipo = 1 AND v.situacion <> 0
              AND v.fechacobro IS NOT NULL AND cc.fecha IS NOT NULL
              AND cc.fecha >= %(desde)s
        """, {"pro": pro_codigo, "desde": f"{anio - 2}-01-01"})
        plazo_row = cur.fetchone()
        plazo_pago = float(plazo_row["plazo_medio"]) if plazo_row and plazo_row["plazo_medio"] else 0

        # ── 7. Frecuencia de compra ──
        cur.execute("""
            SELECT fecha FROM compras_cabeceras
            WHERE pro_codigo = %(pro)s AND tipodoc = 8
              AND fecha >= %(desde)s AND fecha < %(hasta)s
            ORDER BY fecha
        """, {"pro": pro_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        fechas = [r["fecha"] for r in cur.fetchall()]
        if len(fechas) > 1:
            diffs = [(fechas[i+1] - fechas[i]).days for i in range(len(fechas)-1)]
            frecuencia = sum(diffs) / len(diffs)
        else:
            frecuencia = 0

        # ── 8. Saldo pendiente ──
        cur.execute("""
            SELECT COALESCE(SUM(v.importe), 0) AS pendiente
            FROM vencimientos v
            WHERE v.clipro = %(pro)s AND v.tipo = 1 AND v.situacion = 0
        """, {"pro": pro_codigo})
        saldo_pendiente = float(cur.fetchone()["pendiente"])

        # ── 9. Productos comprados por familia (3 años) ──
        cur.execute("""
            SELECT COALESCE(f.nombre, 'Sin Familia') AS familia,
                   cl.referencia,
                   COALESCE(cl.descripcion, a.nombre, '') AS descripcion,
                   EXTRACT(YEAR FROM cc.fecha)::int AS anio,
                   COALESCE(SUM(cl.importe), 0) AS total
            FROM compras_lineas cl
            JOIN compras_cabeceras cc ON cl.idcab = cc.id
            LEFT JOIN articulos a ON cl.referencia = a.referencia
            LEFT JOIN familias f ON a.familia = f.codigo
            WHERE cc.pro_codigo = %(pro)s AND cc.tipodoc = 8
              AND cc.fecha >= %(desde)s AND cc.fecha < %(hasta)s
            GROUP BY 1, 2, 3, 4
            ORDER BY 1, 5 DESC
        """, {"pro": pro_codigo, "desde": f"{anio_desde}-01-01", "hasta": f"{anio + 1}-01-01"})

        fam_data = defaultdict(lambda: {"productos": defaultdict(lambda: {"descripcion": "", "years": {}})})
        for r in cur.fetchall():
            fam = r["familia"]
            ref = r["referencia"] or ""
            yr = int(r["anio"])
            fam_data[fam]["productos"][ref]["descripcion"] = r["descripcion"]
            fam_data[fam]["productos"][ref]["years"][yr] = float(r["total"])

        anios_cols = [anio - 2, anio - 1, anio]
        productos_familia = []
        for fam_name in sorted(fam_data.keys()):
            prods = []
            fam_totals = {y: 0 for y in anios_cols}
            for ref, pdata in fam_data[fam_name]["productos"].items():
                row = {"referencia": ref, "descripcion": pdata["descripcion"]}
                for y in anios_cols:
                    row[str(y)] = pdata["years"].get(y, 0)
                    fam_totals[y] += pdata["years"].get(y, 0)
                prods.append(row)
            prods.sort(key=lambda x: x.get(str(anio), 0), reverse=True)
            fam_row = {"familia": fam_name, "productos": prods}
            for y in anios_cols:
                fam_row[str(y)] = round(fam_totals[y], 2)
            productos_familia.append(fam_row)

        # ── 10. TOP Productos por año (3 años) ──
        top_productos_by_year = {}
        for yr in anios_cols:
            cur.execute("""
                SELECT cl.referencia,
                       COALESCE(cl.descripcion, a.nombre, '') AS descripcion,
                       SUM(cl.unidades) AS unidades,
                       SUM(cl.importe) AS total_compra
                FROM compras_lineas cl
                JOIN compras_cabeceras cc ON cl.idcab = cc.id
                LEFT JOIN articulos a ON cl.referencia = a.referencia
                WHERE cc.pro_codigo = %(pro)s AND cc.tipodoc = 8
                  AND cc.fecha >= %(desde)s AND cc.fecha < %(hasta)s
                GROUP BY cl.referencia, cl.descripcion, a.nombre
                ORDER BY SUM(cl.importe) DESC
            """, {"pro": pro_codigo, "desde": f"{yr}-01-01", "hasta": f"{yr + 1}-01-01"})
            prods = []
            for r in cur.fetchall():
                prods.append({
                    "referencia": r["referencia"] or "",
                    "descripcion": r["descripcion"],
                    "unidades": float(r["unidades"]),
                    "total_compra": float(r["total_compra"]),
                })
            top_productos_by_year[str(yr)] = prods

        # ── 11. Documentos compra del año ──
        cur.execute("""
            SELECT cc.id, cc.tipodoc, cc.serie, cc.numero, cc.fecha::text AS fecha,
                   cc.total,
                   COALESCE((SELECT SUM(v.importe) FROM vencimientos v
                             WHERE v.idcab = cc.id AND v.tipo = 1 AND v.situacion = 0), 0) AS pendiente,
                   CASE cc.tipodoc WHEN 8 THEN 'Factura' WHEN 4 THEN 'Albarán' WHEN 3 THEN 'Albarán' ELSE 'Doc' END AS tipo_doc
            FROM compras_cabeceras cc
            WHERE cc.pro_codigo = %(pro)s
              AND cc.fecha >= %(desde)s AND cc.fecha < %(hasta)s
              AND cc.tipodoc IN (3, 4, 8)
            ORDER BY cc.fecha DESC, cc.numero DESC
        """, {"pro": pro_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        documentos_compra = []
        for r in cur.fetchall():
            documentos_compra.append({
                "id": int(r["id"]),
                "tipodoc": int(r["tipodoc"]),
                "serie": r["serie"],
                "numero": int(r["numero"]),
                "fecha": r["fecha"],
                "total": float(r["total"]),
                "pendiente": float(r["pendiente"]) if r["pendiente"] else 0,
                "tipo_doc": r["tipo_doc"],
            })

        cur.close()

        return {
            "proveedor": proveedor,
            "anio": anio,
            "anios_cols": anios_cols,
            "compras_mensuales": compras_mensuales,
            "kpis": {
                "ticket_medio": round(ticket_medio, 2),
                "compras_anio": round(compras_anio, 2),
                "compras_anio_anterior": round(compras_anio_anterior, 2),
                "ultima_compra": ultima_compra,
                "plazo_pago": round(plazo_pago),
                "frecuencia": round(frecuencia),
                "saldo_pendiente": round(saldo_pendiente, 2),
            },
            "productos_familia": productos_familia,
            "top_productos": top_productos_by_year,
            "documentos_compra": documentos_compra,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ficha-proveedor: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Ficha Agente ──────────────────────────────────────────────────────────

@router.get("/ficha-agente")
def ficha_agente(
    agente_codigo: int = Query(..., description="Código agente"),
    anio: int = Query(default=None, description="Año"),
    fecha_analisis: str = Query(default=None, description="Fecha análisis pendientes YYYY-MM-DD"),
    dias_desde: str = Query(default="vto", description="vto=desde vencimiento, doc=desde fecha documento"),
    comision_anio: int = Query(default=None, description="Año para comisiones"),
    comision_mes: int = Query(default=None, description="Mes para comisiones (1-12)"),
    comision_dias_max: int = Query(default=90, description="Máx días de pago comisionable"),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    if anio is None:
        anio = date.today().year
    if fecha_analisis is None:
        fecha_analisis = date.today().isoformat()
    if dias_desde not in ("vto", "doc"):
        dias_desde = "vto"
    if comision_anio is None:
        comision_anio = anio
    if comision_mes is None:
        comision_mes = date.today().month
    if comision_mes < 1 or comision_mes > 12:
        comision_mes = date.today().month
    if comision_dias_max not in (30, 60, 90, 120):
        comision_dias_max = 90

    comision_desde = f"{comision_anio}-{comision_mes:02d}-01"
    if comision_mes == 12:
        comision_hasta = f"{comision_anio + 1}-01-01"
    else:
        comision_hasta = f"{comision_anio}-{comision_mes + 1:02d}-01"

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # ── 1. Datos maestro del agente ──
        cur.execute("""
            SELECT codigo, nombre, cif, direccion, localidad, cpostal,
                   telefono1, telefono2, email, observaciones, baja
            FROM agentes WHERE codigo = %(ag)s
        """, {"ag": agente_codigo})
        row_ag = cur.fetchone()
        if row_ag:
            agente = dict(row_ag)
        else:
            agente = {
                "codigo": agente_codigo,
                "nombre": f"Agente {agente_codigo}" if agente_codigo != 0 else "Sin Agente",
                "cif": "", "direccion": "", "localidad": "", "cpostal": "",
                "telefono1": "", "telefono2": "", "email": "",
                "observaciones": "", "baja": False,
            }

        anio_desde = anio - 2
        anios_cols = [anio - 2, anio - 1, anio]

        # ── 2. Ventas mensuales (3 años) ──
        cur.execute("""
            SELECT EXTRACT(YEAR FROM vc.fecha)::int AS anio,
                   EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   COALESCE(SUM(vc.total), 0) AS total
            FROM ventas_cabeceras vc
            WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
            GROUP BY 1, 2 ORDER BY 1, 2
        """, {"ag": agente_codigo, "desde": f"{anio_desde}-01-01", "hasta": f"{anio + 1}-01-01"})
        ventas_mensuales = [{"anio": int(r["anio"]), "mes": int(r["mes"]), "total": float(r["total"])} for r in cur.fetchall()]

        # ── 3. KPIs año actual ──
        cur.execute("""
            SELECT COALESCE(SUM(vc.total), 0) AS ventas,
                   COUNT(*) AS num_facturas,
                   COUNT(DISTINCT vc.cli_codigo) AS num_clientes
            FROM ventas_cabeceras vc
            WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        """, {"ag": agente_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        kpi = dict(cur.fetchone())
        ventas_anio = float(kpi["ventas"])
        num_facturas = int(kpi["num_facturas"])
        num_clientes = int(kpi["num_clientes"])
        ticket_medio = ventas_anio / num_clientes if num_clientes > 0 else 0
        valor_por_visita = ventas_anio / num_facturas if num_facturas > 0 else 0

        # ── 4. KPIs año anterior ──
        cur.execute("""
            SELECT COALESCE(SUM(vc.total), 0) AS ventas,
                   COUNT(DISTINCT vc.cli_codigo) AS num_clientes
            FROM ventas_cabeceras vc
            WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        """, {"ag": agente_codigo, "desde": f"{anio - 1}-01-01", "hasta": f"{anio}-01-01"})
        prev = dict(cur.fetchone())
        ventas_anio_anterior = float(prev["ventas"])
        clientes_anterior = int(prev["num_clientes"])

        # ── 5. Margen año actual ──
        cur.execute("""
            SELECT COALESCE(SUM(vl.importe), 0) AS total_venta,
                   COALESCE(SUM(vl.coste * vl.unidades), 0) AS total_coste
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        """, {"ag": agente_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
        margen_row = dict(cur.fetchone())
        total_venta_lineas = float(margen_row["total_venta"])
        total_coste_lineas = float(margen_row["total_coste"])
        margen_anio = total_venta_lineas - total_coste_lineas
        margen_pct = (margen_anio / total_venta_lineas * 100) if total_venta_lineas > 0 else 0

        # ── 6. Crecimiento cartera ──
        crecimiento = 0
        if clientes_anterior > 0:
            crecimiento = ((num_clientes - clientes_anterior) / clientes_anterior * 100)

        # ── 7. Pendiente de cobro ──
        cur.execute("""
            SELECT COALESCE(SUM(v.importe), 0) AS pendiente
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON v.idcab = vc.id
            WHERE vc.agente = %(ag)s AND v.tipo = 0 AND v.situacion = 0
        """, {"ag": agente_codigo})
        saldo_pendiente = float(cur.fetchone()["pendiente"])

        # ── 8. Comisiones liquidables (mes/año seleccionados y pagadas en <= días) ──
        cur.execute("""
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
                   vc.cli_nombre, vc.total,
                   CASE vc.tipodoc WHEN 8 THEN 'FAC' WHEN 4 THEN 'ALB' WHEN 3 THEN 'ALB' ELSE 'DOC' END AS tipo_doc,
                   COALESCE(cob.dias_pago, -1) AS dias_pago
            FROM ventas_cabeceras vc
            LEFT JOIN LATERAL (
                SELECT MIN((v.fechacobro - vc.fecha)::int) AS dias_pago
                FROM vencimientos v
                WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion <> 0
            ) cob ON TRUE
            WHERE vc.agente = %(ag)s AND vc.tipodoc IN (3, 4, 8)
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
              AND COALESCE(cob.dias_pago, -1) BETWEEN 0 AND %(dias_max)s
              AND NOT EXISTS (
                  SELECT 1 FROM vencimientos v
                  WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
              )
            ORDER BY vc.fecha DESC, vc.numero DESC
        """, {
            "ag": agente_codigo,
            "desde": comision_desde,
            "hasta": comision_hasta,
            "dias_max": comision_dias_max,
        })
        comisiones_liquidables = []
        for r in cur.fetchall():
            comisiones_liquidables.append({
                "id": int(r["id"]),
                "tipo_doc": r["tipo_doc"],
                "serie": r["serie"],
                "numero": int(r["numero"]),
                "fecha": r["fecha"],
                "cli_nombre": r["cli_nombre"] or "",
                "total": float(r["total"]),
                "dias_pago": int(r["dias_pago"]) if r["dias_pago"] is not None else 0,
            })

        # ── 9. Pendientes de cobro (vencimientos abiertos a fecha_analisis) ──
        # dias_desde: 'vto' = fecha_analisis - fecha_vencimiento, 'doc' = fecha_analisis - fecha_documento
        dias_expr = "(%(fecha_ref)s::date - v.fecha)::int" if dias_desde == "vto" else "(%(fecha_ref)s::date - vc.fecha)::int"
        cur.execute(f"""
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
                   vc.cli_nombre, v.importe, v.fecha::text AS fecha_vencimiento,
                   CASE vc.tipodoc WHEN 8 THEN 'FAC' WHEN 4 THEN 'ALB' WHEN 3 THEN 'ALB' ELSE 'DOC' END AS tipo_doc,
                   {dias_expr} AS dias
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON v.idcab = vc.id
            WHERE vc.agente = %(ag)s AND v.tipo = 0 AND v.situacion = 0
              AND (v.fechacobro IS NULL OR v.fechacobro > %(fecha_ref)s::date)
            ORDER BY vc.fecha ASC
        """, {"ag": agente_codigo, "fecha_ref": fecha_analisis})
        pendientes_cobro = []
        for r in cur.fetchall():
            pendientes_cobro.append({
                "id": int(r["id"]),
                "tipo_doc": r["tipo_doc"],
                "serie": r["serie"],
                "numero": int(r["numero"]),
                "fecha": r["fecha"],
                "cli_nombre": r["cli_nombre"] or "",
                "importe": float(r["importe"]),
                "fecha_vencimiento": r["fecha_vencimiento"],
                "dias": int(r["dias"]) if r["dias"] is not None else 0,
            })

        # ── 10. TOP Productos por año (3 años) ──
        top_productos_by_year = {}
        for yr in anios_cols:
            cur.execute("""
                SELECT COALESCE(NULLIF(vl.referencia, ''), '---') AS referencia,
                       COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
                       SUM(vl.unidades) AS unidades,
                       SUM(vl.importe) AS total_venta
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
                WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
                  AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
                GROUP BY COALESCE(NULLIF(vl.referencia, ''), '---'), COALESCE(vl.descripcion, a.nombre, '')
                ORDER BY SUM(vl.importe) DESC
                LIMIT 50
            """, {"ag": agente_codigo, "desde": f"{yr}-01-01", "hasta": f"{yr + 1}-01-01"})
            prods = []
            for r in cur.fetchall():
                prods.append({
                    "referencia": r["referencia"],
                    "descripcion": r["descripcion"],
                    "unidades": float(r["unidades"]),
                    "total_venta": float(r["total_venta"]),
                })
            top_productos_by_year[str(yr)] = prods

        # ── 11. Verificar si existe tabla igesvisitas ──
        has_visitas = False
        visitas = []
        try:
            cur.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'igesvisitasfinal'
                )
            """)
            has_visitas = cur.fetchone()["exists"]
            if has_visitas:
                cur.execute("""
                    SELECT iv.id, iv.fecha, iv.hora, iv.codigocliente,
                           COALESCE(c.nombre, '') AS cli_nombre,
                           iv.contacto, iv.observaciones,
                           COALESCE(xm.nombre, '') AS medio,
                           COALESCE(xmo.nombre, '') AS motivo,
                           COALESCE(xr.nombre, '') AS resultado
                    FROM igesvisitasfinal iv
                    LEFT JOIN clientes c ON iv.codigocliente = c.codigo
                    LEFT JOIN xmlvisitasmedios xm ON iv.codigomevisita = xm.codigo
                    LEFT JOIN xmlvisitasmotivos xmo ON iv.codigomovisita = xmo.codigo
                    LEFT JOIN xmlvisitasresultados xr ON iv.codigorevisita = xr.codigo
                    WHERE iv.codigorepresentante = %(ag_str)s
                    ORDER BY iv.fecha DESC, iv.hora DESC
                    LIMIT 500
                """, {"ag_str": str(agente_codigo)})
                visitas = []
                for r in cur.fetchall():
                    visitas.append({
                        "id": int(r["id"]) if r["id"] else 0,
                        "fecha": r["fecha"] or "",
                        "hora": r["hora"] or "",
                        "cli_codigo": int(r["codigocliente"]) if r["codigocliente"] else 0,
                        "cli_nombre": r["cli_nombre"],
                        "contacto": r["contacto"] or "",
                        "medio": r["medio"],
                        "motivo": r["motivo"],
                        "resultado": r["resultado"],
                        "observaciones": r["observaciones"] or "",
                    })
        except Exception:
            has_visitas = False
            visitas = []

        cur.close()

        return {
            "agente": agente,
            "anio": anio,
            "anios_cols": anios_cols,
            "ventas_mensuales": ventas_mensuales,
            "kpis": {
                "ventas_anio": round(ventas_anio, 2),
                "ventas_anio_anterior": round(ventas_anio_anterior, 2),
                "num_clientes": num_clientes,
                "clientes_anterior": clientes_anterior,
                "ticket_medio_cliente": round(ticket_medio, 2),
                "num_visitas": num_facturas,
                "valor_por_visita": round(valor_por_visita, 2),
                "margen_anio": round(margen_anio, 2),
                "margen_pct": round(margen_pct, 1),
                "crecimiento_cartera": round(crecimiento, 2),
                "saldo_pendiente": round(saldo_pendiente, 2),
            },
            "comisiones_liquidables": comisiones_liquidables,
            "pendientes_cobro": pendientes_cobro,
            "top_productos": top_productos_by_year,
            "has_visitas": has_visitas,
            "visitas": visitas,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ficha-agente: {str(e)}")
    finally:
        if conn:
            conn.close()
