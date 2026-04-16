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
    serie: Optional[str] = Query(default=None),
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

    if serie:
        serie_filter = " AND vc.serie = %(serie)s"
        params["serie"] = serie
    if agente is not None:
        agente_filter = " AND vc.agente = %(agente)s"
        params["agente"] = agente

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # 1. Ventas mensuales (facturas tipodoc=4)
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   SUM(vc.total) AS total,
                   SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)) AS base,
                   COUNT(*) AS facturas
            FROM ventas_cabeceras vc
            WHERE vc.tipodoc = 4
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY mes ORDER BY mes
        """, params)
        ventas_mensuales = [dict(r) for r in cur.fetchall()]

        # 2. Totales de ventas
        cur.execute(f"""
            SELECT COALESCE(SUM(vc.total), 0) AS total_ventas,
                   COALESCE(SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)), 0) AS total_base,
                   COUNT(*) AS num_facturas
            FROM ventas_cabeceras vc
            WHERE vc.tipodoc = 4
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
            WHERE vc.tipodoc = 4
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
            WHERE vc.tipodoc = 4
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
            WHERE vc.tipodoc = 4
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY vc.serie ORDER BY total DESC
        """, params)
        series_iva = [dict(r) for r in cur.fetchall()]

        # 7. Vencimientos pendientes (situacion=0)
        cur.execute("""
            SELECT tipo, SUM(importe) AS total_pte, COUNT(*) AS count
            FROM vencimientos WHERE situacion = 0
            GROUP BY tipo ORDER BY tipo
        """)
        vtos_rows = cur.fetchall()
        vencimientos = {"proveedores": 0, "clientes": 0}
        for r in vtos_rows:
            if r["tipo"] == 0:
                vencimientos["proveedores"] = float(r["total_pte"])
            elif r["tipo"] == 1:
                vencimientos["clientes"] = float(r["total_pte"])

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

        # 10. Top proveedores
        cur.execute("""
            SELECT pro_codigo, pro_nombre, SUM(total) AS total_compras
            FROM compras_cabeceras
            WHERE tipodoc = 8
              AND fecha >= %(fecha_desde)s AND fecha < %(fecha_hasta)s
            GROUP BY pro_codigo, pro_nombre
            ORDER BY total_compras DESC LIMIT 15
        """, params)
        proveedores = [dict(r) for r in cur.fetchall()]

        # 11. Series disponibles (para el filtro)
        cur.execute("""
            SELECT DISTINCT serie FROM ventas_cabeceras
            WHERE tipodoc = 4 AND EXTRACT(YEAR FROM fecha) = %(anio)s
            ORDER BY serie
        """, params)
        series_list = [r["serie"] for r in cur.fetchall()]

        # 12. Agentes disponibles (para el filtro)
        cur.execute("""
            SELECT DISTINCT vc.agente AS codigo, COALESCE(a.nombre, 'Sin agente') AS nombre
            FROM ventas_cabeceras vc
            LEFT JOIN agentes a ON vc.agente = a.codigo
            WHERE vc.tipodoc = 4 AND EXTRACT(YEAR FROM vc.fecha) = %(anio)s
            ORDER BY nombre
        """, params)
        agentes_list = [dict(r) for r in cur.fetchall()]

        # 13. Top clientes
        cur.execute(f"""
            SELECT vc.cli_codigo, vc.cli_nombre,
                   SUM(vc.total) AS total,
                   SUM(vc.baseimpo1 + COALESCE(vc.baseimpo2,0) + COALESCE(vc.baseimpo3,0)) AS base
            FROM ventas_cabeceras vc
            WHERE vc.tipodoc = 4
              AND vc.fecha >= %(fecha_desde)s AND vc.fecha < %(fecha_hasta)s
              {serie_filter} {agente_filter}
            GROUP BY vc.cli_codigo, vc.cli_nombre
            ORDER BY total DESC LIMIT 15
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
            "filtro_serie": serie,
            "filtro_agente": agente,
            "ventas_mensuales": _clean(ventas_mensuales),
            "compras_mensuales": _clean(compras_mensuales),
            "totales": {
                "ventas": _dec(totales_ventas["total_ventas"]),
                "base_ventas": _dec(totales_ventas["total_base"]),
                "num_facturas": totales_ventas["num_facturas"],
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
