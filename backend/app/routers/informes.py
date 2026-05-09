"""
Informes – reporting endpoints.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.auth.dependencies import get_current_user, get_empresa_from_local
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter()



# ── Filter options ────────────────────────────────────────────────────────────

@router.get("/filtros-comparativa")
def filtros_comparativa(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return available filter options for comparativa report."""
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute("SELECT codigo, nombre FROM familias ORDER BY nombre")
        familias = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT codigo, nombre, familia FROM subfamilias ORDER BY familia, nombre")
        subfamilias = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT codigo, nombre FROM agentes ORDER BY nombre")
        agentes = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT codigo, nombre FROM clientes_tipos ORDER BY codigo")
        tipos_cliente = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT codigo, nombre FROM articulos_tipos ORDER BY codigo")
        tipos_articulo = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT codigo, nombre FROM articulos_marcas ORDER BY nombre")
        marcas = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT DISTINCT localidad FROM clientes
            WHERE localidad IS NOT NULL AND localidad != ''
            ORDER BY localidad
        """)
        poblaciones = [r["localidad"] for r in cur.fetchall()]

        cur.execute("""
            SELECT DISTINCT cpostal FROM clientes
            WHERE cpostal IS NOT NULL AND cpostal != '' AND cpostal NOT IN (' ', '>')
            ORDER BY cpostal
        """)
        codigos_postales = [r["cpostal"] for r in cur.fetchall()]

        cur.close()
        return {
            "familias": familias,
            "subfamilias": subfamilias,
            "agentes": agentes,
            "tipos_cliente": tipos_cliente,
            "tipos_articulo": tipos_articulo,
            "marcas": marcas,
            "poblaciones": poblaciones,
            "codigos_postales": codigos_postales,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Comparativa ventas por cliente ────────────────────────────────────────────

@router.get("/comparativa-ventas-clientes")
def comparativa_ventas_clientes(
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    meses: Optional[str] = Query(default=None, description="Comma-separated month numbers, e.g. '1,2,3'"),
    familia: Optional[int] = Query(default=None),
    subfamilia: Optional[int] = Query(default=None),
    articulo: Optional[str] = Query(default=None),
    marca: Optional[int] = Query(default=None),
    tipo_articulo: Optional[int] = Query(default=None),
    tipo_cliente: Optional[int] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    poblacion: Optional[str] = Query(default=None),
    cpostal: Optional[str] = Query(default=None),
    ocultar_obsoletos: bool = Query(default=False),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date.today()
    if anio1 is None:
        anio1 = today.year - 1
    if anio2 is None:
        anio2 = today.year

    # Build month filter
    month_list = None
    if meses:
        month_list = [int(m.strip()) for m in meses.split(",") if m.strip().isdigit()]

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        ventas_cond = "vc.tipodoc = 8"

        # ── Build filters ──
        joins = ""
        where_extra = ""
        params: dict = {}

        # Article-level filters require join to ventas_lineas + articulos
        need_lineas = any([familia is not None, subfamilia is not None, articulo, marca is not None, tipo_articulo is not None])

        if need_lineas:
            joins += " JOIN ventas_lineas vl ON vl.idcab = vc.id"
            joins += " LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''"
            if familia is not None:
                joins += " LEFT JOIN familias f ON a.familia = f.codigo"
                where_extra += " AND a.familia = %(familia)s"
                params["familia"] = familia
            if subfamilia is not None:
                where_extra += " AND a.subfamilia = %(subfamilia)s"
                params["subfamilia"] = subfamilia
            if articulo:
                where_extra += " AND vl.referencia = %(articulo)s"
                params["articulo"] = articulo
            if marca is not None:
                where_extra += " AND a.marca = %(marca)s"
                params["marca"] = marca
            if tipo_articulo is not None:
                where_extra += " AND a.tipo = %(tipo_articulo)s"
                params["tipo_articulo"] = tipo_articulo

        # Client-level filters
        cli_join = ""
        cli_where = ""
        if any([tipo_cliente is not None, poblacion, cpostal, ocultar_obsoletos, agente is not None]):
            cli_join = " JOIN clientes cli ON vc.cli_codigo = cli.codigo"
            if tipo_cliente is not None:
                cli_where += " AND cli.tipo = %(tipo_cliente)s"
                params["tipo_cliente"] = tipo_cliente
            if poblacion:
                cli_where += " AND cli.localidad = %(poblacion)s"
                params["poblacion"] = poblacion
            if cpostal:
                cli_where += " AND cli.cpostal = %(cpostal)s"
                params["cpostal"] = cpostal
            if ocultar_obsoletos:
                cli_where += " AND (cli.obsoleto = 0 OR cli.obsoleto IS NULL)"
            if agente is not None:
                cli_where += " AND cli.agente = %(agente)s"
                params["agente"] = agente

        month_filter = ""
        if month_list:
            month_filter = " AND EXTRACT(MONTH FROM vc.fecha)::int = ANY(%(month_list)s)"
            params["month_list"] = month_list

        # Value expression depends on whether we join lineas
        val_expr = "SUM(vl.importe)" if need_lineas else "SUM(vc.total)"
        uds_expr = "SUM(vl.unidades)" if need_lineas else "NULL"

        # ── Year 1 ──
        params["anio1_start"] = f"{anio1}-01-01"
        params["anio1_end"] = f"{anio1 + 1}-01-01"

        sql1 = f"""
            SELECT vc.cli_codigo, vc.cli_nombre,
                   {val_expr} AS total_ventas,
                   {uds_expr} AS total_uds
            FROM ventas_cabeceras vc
            {joins} {cli_join}
            WHERE {ventas_cond}
              AND vc.fecha >= %(anio1_start)s AND vc.fecha < %(anio1_end)s
              {month_filter} {where_extra} {cli_where}
            GROUP BY vc.cli_codigo, vc.cli_nombre
        """
        cur.execute(sql1, params)
        data1 = {r["cli_codigo"]: dict(r) for r in cur.fetchall()}

        # ── Year 2 ──
        params["anio2_start"] = f"{anio2}-01-01"
        params["anio2_end"] = f"{anio2 + 1}-01-01"

        sql2 = f"""
            SELECT vc.cli_codigo, vc.cli_nombre,
                   {val_expr} AS total_ventas,
                   {uds_expr} AS total_uds
            FROM ventas_cabeceras vc
            {joins} {cli_join}
            WHERE {ventas_cond}
              AND vc.fecha >= %(anio2_start)s AND vc.fecha < %(anio2_end)s
              {month_filter} {where_extra} {cli_where}
            GROUP BY vc.cli_codigo, vc.cli_nombre
        """
        cur.execute(sql2, params)
        data2 = {r["cli_codigo"]: dict(r) for r in cur.fetchall()}

        # ── Merge ──
        all_codes = set(data1.keys()) | set(data2.keys())

        def _f(v):
            if v is None:
                return 0
            return float(v) if hasattr(v, "as_tuple") else v

        clientes = []
        for code in all_codes:
            r1 = data1.get(code)
            r2 = data2.get(code)
            nombre = (r2 or r1)["cli_nombre"]
            v1 = _f((r1 or {}).get("total_ventas", 0)) or 0
            v2 = _f((r2 or {}).get("total_ventas", 0)) or 0
            u1 = _f((r1 or {}).get("total_uds")) if need_lineas else None
            u2 = _f((r2 or {}).get("total_uds")) if need_lineas else None
            clientes.append({
                "cli_codigo": code,
                "cli_nombre": nombre,
                "ventas_anio1": v1,
                "ventas_anio2": v2,
                "uds_anio1": u1,
                "uds_anio2": u2,
            })

        clientes.sort(key=lambda c: c["cli_nombre"] or "")

        # ── Summary ──
        total_v1 = sum(c["ventas_anio1"] for c in clientes)
        total_v2 = sum(c["ventas_anio2"] for c in clientes)
        clientes_anio1 = sum(1 for c in clientes if c["ventas_anio1"] > 0)
        clientes_anio2 = sum(1 for c in clientes if c["ventas_anio2"] > 0)
        cli_subida = sum(1 for c in clientes if c["ventas_anio2"] > c["ventas_anio1"] and c["ventas_anio1"] > 0)
        cli_bajada = sum(1 for c in clientes if c["ventas_anio2"] < c["ventas_anio1"] and c["ventas_anio1"] > 0)
        cli_nuevos = sum(1 for c in clientes if c["ventas_anio1"] == 0 and c["ventas_anio2"] > 0)
        cli_perdidos = sum(1 for c in clientes if c["ventas_anio1"] > 0 and c["ventas_anio2"] == 0)

        uds_bajada = 0
        uds_subida = 0
        if need_lineas:
            uds_bajada = sum(1 for c in clientes if (c["uds_anio2"] or 0) < (c["uds_anio1"] or 0) and (c["uds_anio1"] or 0) > 0)
            uds_subida = sum(1 for c in clientes if (c["uds_anio2"] or 0) > (c["uds_anio1"] or 0))

        cur.close()
        return {
            "anio1": anio1,
            "anio2": anio2,
            "clientes": clientes,
            "resumen": {
                "total_clientes": len(clientes),
                "clientes_anio1": clientes_anio1,
                "clientes_anio2": clientes_anio2,
                "ventas_anio1": total_v1,
                "ventas_anio2": total_v2,
                "cli_subida": cli_subida,
                "cli_bajada": cli_bajada,
                "cli_nuevos": cli_nuevos,
                "cli_perdidos": cli_perdidos,
                "uds_bajada": uds_bajada,
                "uds_subida": uds_subida,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Detalle por cliente - desglose familia/subfamilia/artículo ────────────────

@router.get("/comparativa-cliente-detalle")
def comparativa_cliente_detalle(
    cli_codigo: int = Query(...),
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    meses: Optional[str] = Query(default=None),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Desglose familia > subfamilia > artículo para un cliente."""
    today = date.today()
    if anio1 is None:
        anio1 = today.year - 1
    if anio2 is None:
        anio2 = today.year

    month_list = None
    if meses:
        month_list = [int(m.strip()) for m in meses.split(",") if m.strip().isdigit()]

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        ventas_cond = "vc.tipodoc = 8"

        month_filter = ""
        params: dict = {"cli_codigo": cli_codigo}
        if month_list:
            month_filter = " AND EXTRACT(MONTH FROM vc.fecha)::int = ANY(%(month_list)s)"
            params["month_list"] = month_list

        def _query_year(anio: int):
            p = {**params, "start": f"{anio}-01-01", "end": f"{anio + 1}-01-01"}
            cur.execute(f"""
                SELECT COALESCE(f.nombre, 'Sin Familia') AS familia,
                       COALESCE(sf.nombre, '') AS subfamilia,
                       COALESCE(NULLIF(vl.referencia, ''), '---') AS referencia,
                       COALESCE(a.nombre, vl.descripcion, '') AS descripcion,
                       SUM(vl.importe) AS importe,
                       SUM(vl.unidades) AS unidades
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
                LEFT JOIN familias f ON a.familia = f.codigo
                LEFT JOIN subfamilias sf ON a.subfamilia = sf.codigo AND a.familia = sf.familia
                WHERE {ventas_cond}
                  AND vc.cli_codigo = %(cli_codigo)s
                  AND vc.fecha >= %(start)s AND vc.fecha < %(end)s
                  {month_filter}
                GROUP BY f.nombre, sf.nombre, COALESCE(NULLIF(vl.referencia, ''), '---'),
                         COALESCE(a.nombre, vl.descripcion, '')
            """, p)
            return [dict(r) for r in cur.fetchall()]

        rows1 = _query_year(anio1)
        rows2 = _query_year(anio2)

        # Build a tree: familia > subfamilia > articulo
        def _f(v):
            if v is None:
                return 0
            return float(v) if hasattr(v, "as_tuple") else v

        # Index by (familia, subfamilia, referencia)
        tree: dict = {}
        for row in rows1:
            key = (row["familia"], row["subfamilia"], row["referencia"])
            tree[key] = {
                "familia": row["familia"],
                "subfamilia": row["subfamilia"],
                "referencia": row["referencia"],
                "descripcion": row["descripcion"],
                "importe_anio1": _f(row["importe"]),
                "uds_anio1": _f(row["unidades"]),
                "importe_anio2": 0,
                "uds_anio2": 0,
            }
        for row in rows2:
            key = (row["familia"], row["subfamilia"], row["referencia"])
            if key in tree:
                tree[key]["importe_anio2"] = _f(row["importe"])
                tree[key]["uds_anio2"] = _f(row["unidades"])
            else:
                tree[key] = {
                    "familia": row["familia"],
                    "subfamilia": row["subfamilia"],
                    "referencia": row["referencia"],
                    "descripcion": row["descripcion"],
                    "importe_anio1": 0,
                    "uds_anio1": 0,
                    "importe_anio2": _f(row["importe"]),
                    "uds_anio2": _f(row["unidades"]),
                }

        items = sorted(tree.values(), key=lambda x: (x["familia"], x["subfamilia"], x["descripcion"]))
        cur.close()
        return {"detalle": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# Helper: build common filter fragments
# ══════════════════════════════════════════════════════════════════════════════

VENTAS_COND = "vc.tipodoc = 8"


def _fval(v):
    """Convert Decimal/None to float."""
    if v is None:
        return 0
    return float(v) if hasattr(v, "as_tuple") else v


def _build_art_filters(params, familia, subfamilia, articulo, marca, tipo_articulo):
    joins = ""
    where = ""
    need = any([familia is not None, subfamilia is not None, articulo, marca is not None, tipo_articulo is not None])
    if need:
        joins = " JOIN ventas_lineas vl ON vl.idcab = vc.id"
        joins += " LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''"
        if familia is not None:
            where += " AND a.familia = %(familia)s"; params["familia"] = familia
        if subfamilia is not None:
            where += " AND a.subfamilia = %(subfamilia)s"; params["subfamilia"] = subfamilia
        if articulo:
            where += " AND vl.referencia = %(articulo)s"; params["articulo"] = articulo
        if marca is not None:
            where += " AND a.marca = %(marca)s"; params["marca"] = marca
        if tipo_articulo is not None:
            where += " AND a.tipo = %(tipo_articulo)s"; params["tipo_articulo"] = tipo_articulo
    return joins, where, need


def _build_cli_filters(params, tipo_cliente, agente, poblacion, cpostal, ocultar_obsoletos):
    join = ""
    where = ""
    need = any([tipo_cliente is not None, poblacion, cpostal, ocultar_obsoletos, agente is not None])
    if need:
        join = " JOIN clientes cli ON vc.cli_codigo = cli.codigo"
        if tipo_cliente is not None:
            where += " AND cli.tipo = %(tipo_cliente)s"; params["tipo_cliente"] = tipo_cliente
        if poblacion:
            where += " AND cli.localidad = %(poblacion)s"; params["poblacion"] = poblacion
        if cpostal:
            where += " AND cli.cpostal = %(cpostal)s"; params["cpostal"] = cpostal
        if ocultar_obsoletos:
            where += " AND (cli.obsoleto = 0 OR cli.obsoleto IS NULL)"
        if agente is not None:
            where += " AND cli.agente = %(agente)s"; params["agente"] = agente
    return join, where, need


def _parse_meses(meses):
    if not meses:
        return None
    return [int(m.strip()) for m in meses.split(",") if m.strip().isdigit()] or None


# ── Comparativa ventas por agente ─────────────────────────────────────────────

@router.get("/comparativa-ventas-agentes")
def comparativa_ventas_agentes(
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    meses: Optional[str] = Query(default=None),
    familia: Optional[int] = Query(default=None),
    subfamilia: Optional[int] = Query(default=None),
    articulo: Optional[str] = Query(default=None),
    marca: Optional[int] = Query(default=None),
    tipo_articulo: Optional[int] = Query(default=None),
    tipo_cliente: Optional[int] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    poblacion: Optional[str] = Query(default=None),
    cpostal: Optional[str] = Query(default=None),
    ocultar_obsoletos: bool = Query(default=False),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date.today()
    if anio1 is None:
        anio1 = today.year - 1
    if anio2 is None:
        anio2 = today.year
    month_list = _parse_meses(meses)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params: dict = {}
        art_joins, art_where, need_lineas = _build_art_filters(params, familia, subfamilia, articulo, marca, tipo_articulo)
        # Always join clientes for agente
        cli_where = ""
        if tipo_cliente is not None:
            cli_where += " AND cli.tipo = %(tipo_cliente)s"; params["tipo_cliente"] = tipo_cliente
        if poblacion:
            cli_where += " AND cli.localidad = %(poblacion)s"; params["poblacion"] = poblacion
        if cpostal:
            cli_where += " AND cli.cpostal = %(cpostal)s"; params["cpostal"] = cpostal
        if ocultar_obsoletos:
            cli_where += " AND (cli.obsoleto = 0 OR cli.obsoleto IS NULL)"
        if agente is not None:
            cli_where += " AND cli.agente = %(agente)s"; params["agente"] = agente

        month_filter = ""
        if month_list:
            month_filter = " AND EXTRACT(MONTH FROM vc.fecha)::int = ANY(%(month_list)s)"
            params["month_list"] = month_list

        val_expr = "SUM(vl.importe)" if need_lineas else "SUM(vc.total)"

        def _q(sk, ek, y):
            params[sk] = f"{y}-01-01"
            params[ek] = f"{y + 1}-01-01"
            return f"""
                SELECT COALESCE(cli.agente, 0) AS ag, vc.cli_codigo, vc.cli_nombre,
                       {val_expr} AS ventas
                FROM ventas_cabeceras vc
                JOIN clientes cli ON vc.cli_codigo = cli.codigo
                {art_joins}
                WHERE {VENTAS_COND}
                  AND vc.fecha >= %({sk})s AND vc.fecha < %({ek})s
                  {month_filter} {art_where} {cli_where}
                GROUP BY cli.agente, vc.cli_codigo, vc.cli_nombre
            """

        cur.execute(_q("s1", "e1", anio1), params)
        r1 = {r["cli_codigo"]: dict(r) for r in cur.fetchall()}
        cur.execute(_q("s2", "e2", anio2), params)
        r2 = {r["cli_codigo"]: dict(r) for r in cur.fetchall()}

        # Pendiente
        cur.execute("""
            SELECT v.clipro, SUM(v.importe) AS pendiente
            FROM vencimientos v WHERE v.tipo = 0 AND v.situacion = 0
            GROUP BY v.clipro
        """)
        pend = {r["clipro"]: _fval(r["pendiente"]) for r in cur.fetchall()}

        # Agent names
        cur.execute("SELECT codigo, nombre FROM agentes")
        ag_names = {r["codigo"]: r["nombre"] for r in cur.fetchall()}
        ag_names[0] = "Sin Agente"

        # Merge
        all_codes = set(r1.keys()) | set(r2.keys())
        ags: dict = {}
        for code in all_codes:
            d1 = r1.get(code)
            d2 = r2.get(code)
            ag_code = (d2 or d1)["ag"]
            nombre = (d2 or d1)["cli_nombre"]
            v1 = _fval((d1 or {}).get("ventas", 0))
            v2 = _fval((d2 or {}).get("ventas", 0))
            p = pend.get(code, 0)

            if ag_code not in ags:
                ags[ag_code] = {
                    "agente_codigo": ag_code,
                    "agente_nombre": ag_names.get(ag_code, f"Agente {ag_code}"),
                    "ventas_anio1": 0, "ventas_anio2": 0, "pendiente": 0, "clientes": [],
                }
            ags[ag_code]["ventas_anio1"] += v1
            ags[ag_code]["ventas_anio2"] += v2
            ags[ag_code]["pendiente"] += p
            ags[ag_code]["clientes"].append({
                "cli_codigo": code, "cli_nombre": nombre,
                "ventas_anio1": v1, "ventas_anio2": v2, "pendiente": p,
            })

        result = sorted(ags.values(), key=lambda a: a["agente_nombre"])
        for a in result:
            a["clientes"].sort(key=lambda c: c["cli_nombre"] or "")

        cur.close()
        return {"agentes": result, "anio1": anio1, "anio2": anio2}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Comparativa ventas por artículo ───────────────────────────────────────────

@router.get("/comparativa-ventas-articulos")
def comparativa_ventas_articulos(
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    meses: Optional[str] = Query(default=None),
    familia: Optional[int] = Query(default=None),
    subfamilia: Optional[int] = Query(default=None),
    articulo: Optional[str] = Query(default=None),
    marca: Optional[int] = Query(default=None),
    tipo_articulo: Optional[int] = Query(default=None),
    tipo_cliente: Optional[int] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    poblacion: Optional[str] = Query(default=None),
    cpostal: Optional[str] = Query(default=None),
    ocultar_obsoletos: bool = Query(default=False),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date.today()
    if anio1 is None:
        anio1 = today.year - 1
    if anio2 is None:
        anio2 = today.year
    month_list = _parse_meses(meses)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params: dict = {}
        # Always join lineas (article grouping)
        art_where = ""
        if familia is not None:
            art_where += " AND a.familia = %(familia)s"; params["familia"] = familia
        if subfamilia is not None:
            art_where += " AND a.subfamilia = %(subfamilia)s"; params["subfamilia"] = subfamilia
        if articulo:
            art_where += " AND vl.referencia = %(articulo)s"; params["articulo"] = articulo
        if marca is not None:
            art_where += " AND a.marca = %(marca)s"; params["marca"] = marca
        if tipo_articulo is not None:
            art_where += " AND a.tipo = %(tipo_articulo)s"; params["tipo_articulo"] = tipo_articulo

        cli_join, cli_where, _ = _build_cli_filters(params, tipo_cliente, agente, poblacion, cpostal, ocultar_obsoletos)

        month_filter = ""
        if month_list:
            month_filter = " AND EXTRACT(MONTH FROM vc.fecha)::int = ANY(%(month_list)s)"
            params["month_list"] = month_list

        def _q(sk, ek, y):
            params[sk] = f"{y}-01-01"
            params[ek] = f"{y + 1}-01-01"
            return f"""
                SELECT COALESCE(NULLIF(vl.referencia, ''), '---') AS ref,
                       COALESCE(a.nombre, vl.descripcion, '') AS descr,
                       vc.cli_codigo, vc.cli_nombre,
                       SUM(vl.importe) AS importe, SUM(vl.unidades) AS uds
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
                {cli_join}
                WHERE {VENTAS_COND}
                  AND vc.fecha >= %({sk})s AND vc.fecha < %({ek})s
                  {month_filter} {art_where} {cli_where}
                GROUP BY COALESCE(NULLIF(vl.referencia, ''), '---'),
                         COALESCE(a.nombre, vl.descripcion, ''),
                         vc.cli_codigo, vc.cli_nombre
            """

        cur.execute(_q("s1", "e1", anio1), params)
        rows1 = [dict(r) for r in cur.fetchall()]
        cur.execute(_q("s2", "e2", anio2), params)
        rows2 = [dict(r) for r in cur.fetchall()]

        # Stock
        cur.execute("SELECT referencia, SUM(actual) AS stock FROM almacenes_stock GROUP BY referencia")
        stock_map = {r["referencia"]: int(r["stock"]) for r in cur.fetchall()}

        # Merge by (ref, cli_codigo)
        arts: dict = {}  # ref -> { descr, importe1, importe2, uds1, uds2, stock, clientes: { cli_codigo -> ... } }
        for r in rows1:
            ref = r["ref"]
            if ref not in arts:
                arts[ref] = {"ref": ref, "descr": r["descr"], "imp1": 0, "imp2": 0, "uds1": 0, "uds2": 0,
                             "stock": stock_map.get(ref, 0), "clientes": {}}
            arts[ref]["imp1"] += _fval(r["importe"])
            arts[ref]["uds1"] += _fval(r["uds"])
            c = r["cli_codigo"]
            if c not in arts[ref]["clientes"]:
                arts[ref]["clientes"][c] = {"cli_nombre": r["cli_nombre"], "imp1": 0, "imp2": 0, "uds1": 0, "uds2": 0}
            arts[ref]["clientes"][c]["imp1"] += _fval(r["importe"])
            arts[ref]["clientes"][c]["uds1"] += _fval(r["uds"])

        for r in rows2:
            ref = r["ref"]
            if ref not in arts:
                arts[ref] = {"ref": ref, "descr": r["descr"], "imp1": 0, "imp2": 0, "uds1": 0, "uds2": 0,
                             "stock": stock_map.get(ref, 0), "clientes": {}}
            arts[ref]["imp2"] += _fval(r["importe"])
            arts[ref]["uds2"] += _fval(r["uds"])
            c = r["cli_codigo"]
            if c not in arts[ref]["clientes"]:
                arts[ref]["clientes"][c] = {"cli_nombre": r["cli_nombre"], "imp1": 0, "imp2": 0, "uds1": 0, "uds2": 0}
            arts[ref]["clientes"][c]["imp2"] += _fval(r["importe"])
            arts[ref]["clientes"][c]["uds2"] += _fval(r["uds"])

        # Build result
        result = []
        for a in sorted(arts.values(), key=lambda x: x["descr"]):
            cli_list = sorted(a["clientes"].values(), key=lambda c: c["cli_nombre"] or "")
            result.append({
                "referencia": a["ref"], "descripcion": a["descr"],
                "importe_anio1": a["imp1"], "importe_anio2": a["imp2"],
                "uds_anio1": a["uds1"], "uds_anio2": a["uds2"],
                "stock": a["stock"],
                "clientes": [{"cli_nombre": c["cli_nombre"],
                              "importe_anio1": c["imp1"], "importe_anio2": c["imp2"],
                              "uds_anio1": c["uds1"], "uds_anio2": c["uds2"]} for c in cli_list],
            })

        cur.close()
        return {"articulos": result, "anio1": anio1, "anio2": anio2}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Comparativa ventas por familia ────────────────────────────────────────────

@router.get("/comparativa-ventas-familias")
def comparativa_ventas_familias(
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    meses: Optional[str] = Query(default=None),
    familia: Optional[int] = Query(default=None),
    subfamilia: Optional[int] = Query(default=None),
    articulo: Optional[str] = Query(default=None),
    marca: Optional[int] = Query(default=None),
    tipo_articulo: Optional[int] = Query(default=None),
    tipo_cliente: Optional[int] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    poblacion: Optional[str] = Query(default=None),
    cpostal: Optional[str] = Query(default=None),
    ocultar_obsoletos: bool = Query(default=False),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date.today()
    if anio1 is None:
        anio1 = today.year - 1
    if anio2 is None:
        anio2 = today.year
    month_list = _parse_meses(meses)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params: dict = {}
        art_where = ""
        if familia is not None:
            art_where += " AND a.familia = %(familia)s"; params["familia"] = familia
        if subfamilia is not None:
            art_where += " AND a.subfamilia = %(subfamilia)s"; params["subfamilia"] = subfamilia
        if articulo:
            art_where += " AND vl.referencia = %(articulo)s"; params["articulo"] = articulo
        if marca is not None:
            art_where += " AND a.marca = %(marca)s"; params["marca"] = marca
        if tipo_articulo is not None:
            art_where += " AND a.tipo = %(tipo_articulo)s"; params["tipo_articulo"] = tipo_articulo

        cli_join, cli_where, _ = _build_cli_filters(params, tipo_cliente, agente, poblacion, cpostal, ocultar_obsoletos)

        month_filter = ""
        if month_list:
            month_filter = " AND EXTRACT(MONTH FROM vc.fecha)::int = ANY(%(month_list)s)"
            params["month_list"] = month_list

        def _q(sk, ek, y):
            params[sk] = f"{y}-01-01"
            params[ek] = f"{y + 1}-01-01"
            return f"""
                SELECT COALESCE(f.nombre, 'Sin Familia') AS fam,
                       COALESCE(NULLIF(vl.referencia, ''), '---') AS ref,
                       COALESCE(a.nombre, vl.descripcion, '') AS descr,
                       vc.cli_codigo, vc.cli_nombre,
                       SUM(vl.importe) AS importe, SUM(vl.unidades) AS uds
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
                LEFT JOIN familias f ON a.familia = f.codigo
                {cli_join}
                WHERE {VENTAS_COND}
                  AND vc.fecha >= %({sk})s AND vc.fecha < %({ek})s
                  {month_filter} {art_where} {cli_where}
                GROUP BY f.nombre, COALESCE(NULLIF(vl.referencia, ''), '---'),
                         COALESCE(a.nombre, vl.descripcion, ''),
                         vc.cli_codigo, vc.cli_nombre
            """

        cur.execute(_q("s1", "e1", anio1), params)
        rows1 = [dict(r) for r in cur.fetchall()]
        cur.execute(_q("s2", "e2", anio2), params)
        rows2 = [dict(r) for r in cur.fetchall()]

        # Merge by (fam, ref, cli_codigo)
        tree: dict = {}
        for r in rows1:
            key = (r["fam"], r["ref"], r["cli_codigo"])
            tree[key] = {
                "familia": r["fam"], "referencia": r["ref"], "descripcion": r["descr"],
                "cli_codigo": r["cli_codigo"], "cli_nombre": r["cli_nombre"],
                "imp1": _fval(r["importe"]), "uds1": _fval(r["uds"]), "imp2": 0, "uds2": 0,
            }
        for r in rows2:
            key = (r["fam"], r["ref"], r["cli_codigo"])
            if key in tree:
                tree[key]["imp2"] = _fval(r["importe"])
                tree[key]["uds2"] = _fval(r["uds"])
            else:
                tree[key] = {
                    "familia": r["fam"], "referencia": r["ref"], "descripcion": r["descr"],
                    "cli_codigo": r["cli_codigo"], "cli_nombre": r["cli_nombre"],
                    "imp1": 0, "uds1": 0, "imp2": _fval(r["importe"]), "uds2": _fval(r["uds"]),
                }

        items = sorted(tree.values(), key=lambda x: (x["familia"], x["descripcion"], x["cli_nombre"] or ""))
        result = [{
            "familia": i["familia"], "referencia": i["referencia"], "descripcion": i["descripcion"],
            "cli_nombre": i["cli_nombre"],
            "importe_anio1": i["imp1"], "importe_anio2": i["imp2"],
            "uds_anio1": i["uds1"], "uds_anio2": i["uds2"],
        } for i in items]

        cur.close()
        return {"items": result, "anio1": anio1, "anio2": anio2}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Seguimiento clientes ─────────────────────────────────────────────────────

@router.get("/seguimiento-clientes")
def seguimiento_clientes(
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    meses: Optional[str] = Query(default=None),
    familia: Optional[int] = Query(default=None),
    subfamilia: Optional[int] = Query(default=None),
    articulo: Optional[str] = Query(default=None),
    marca: Optional[int] = Query(default=None),
    tipo_articulo: Optional[int] = Query(default=None),
    tipo_cliente: Optional[int] = Query(default=None),
    agente: Optional[int] = Query(default=None),
    poblacion: Optional[str] = Query(default=None),
    cpostal: Optional[str] = Query(default=None),
    ocultar_obsoletos: bool = Query(default=False),
    no_compra_meses: Optional[int] = Query(default=None),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date.today()
    if anio1 is None:
        anio1 = today.year - 1
    if anio2 is None:
        anio2 = today.year
    month_list = _parse_meses(meses)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params: dict = {}
        art_joins, art_where, need_lineas = _build_art_filters(params, familia, subfamilia, articulo, marca, tipo_articulo)
        cli_join, cli_where, _ = _build_cli_filters(params, tipo_cliente, agente, poblacion, cpostal, ocultar_obsoletos)

        month_filter = ""
        if month_list:
            month_filter = " AND EXTRACT(MONTH FROM vc.fecha)::int = ANY(%(month_list)s)"
            params["month_list"] = month_list

        val_expr = "SUM(vl.importe)" if need_lineas else "SUM(vc.total)"

        # Both years in one query
        params["start"] = f"{anio1}-01-01"
        params["end"] = f"{anio2 + 1}-01-01"

        sql = f"""
            SELECT vc.cli_codigo, vc.cli_nombre,
                   EXTRACT(YEAR FROM vc.fecha)::int AS anio,
                   EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   {val_expr} AS ventas
            FROM ventas_cabeceras vc
            {art_joins} {cli_join}
            WHERE {VENTAS_COND}
              AND vc.fecha >= %(start)s AND vc.fecha < %(end)s
              {month_filter} {art_where} {cli_where}
            GROUP BY vc.cli_codigo, vc.cli_nombre,
                     EXTRACT(YEAR FROM vc.fecha), EXTRACT(MONTH FROM vc.fecha)
        """
        cur.execute(sql, params)
        rows = cur.fetchall()

        # Build per-client monthly data
        clientes: dict = {}
        for r in rows:
            c = r["cli_codigo"]
            if c not in clientes:
                clientes[c] = {"cli_codigo": c, "cli_nombre": r["cli_nombre"],
                               "meses": {}}
            key = f"{r['anio']}_{r['mes']}"
            clientes[c]["meses"][key] = _fval(r["ventas"])

        # Optionally filter by "no compra desde hace X meses"
        if no_compra_meses is not None and no_compra_meses > 0:
            cur.execute(f"""
                SELECT vc.cli_codigo, MAX(vc.fecha) AS ultima
                FROM ventas_cabeceras vc
                {cli_join}
                WHERE {VENTAS_COND} {cli_where}
                GROUP BY vc.cli_codigo
            """, params)
            ultima_map = {r["cli_codigo"]: r["ultima"] for r in cur.fetchall()}
            from dateutil.relativedelta import relativedelta
            threshold = today - relativedelta(months=no_compra_meses)
            clientes = {c: d for c, d in clientes.items()
                        if ultima_map.get(c) is not None and ultima_map[c] < threshold}

        # Compute totals
        result = []
        for d in sorted(clientes.values(), key=lambda x: x["cli_nombre"] or ""):
            v1 = sum(d["meses"].get(f"{anio1}_{m}", 0) for m in range(1, 13))
            v2 = sum(d["meses"].get(f"{anio2}_{m}", 0) for m in range(1, 13))
            meses_arr = []
            for m in range(1, 13):
                mv1 = d["meses"].get(f"{anio1}_{m}", 0)
                mv2 = d["meses"].get(f"{anio2}_{m}", 0)
                meses_arr.append({"mes": m, "v1": mv1, "v2": mv2})
            result.append({
                "cli_codigo": d["cli_codigo"], "cli_nombre": d["cli_nombre"],
                "ventas_anio1": v1, "ventas_anio2": v2, "meses": meses_arr,
            })

        cur.close()
        return {"clientes": result, "anio1": anio1, "anio2": anio2}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Condiciones especiales ────────────────────────────────────────────────────

@router.get("/condiciones-especiales")
def condiciones_especiales(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Clients with tarifaespecial > 0
        cur.execute("""
            SELECT c.codigo, c.nombre, c.tarifaespecial,
                   COALESCE(te.nombre, '') AS tarifa_nombre
            FROM clientes c
            LEFT JOIN tarifas_especiales te ON c.tarifaespecial = te.codigo
            WHERE c.tarifaespecial > 0
            ORDER BY c.nombre
        """)
        clientes = [dict(r) for r in cur.fetchall()]

        # Tarifa details
        cur.execute("""
            SELECT ted.codigo_tarifa, ted.referencia, ted.familia, ted.subfamilia,
                   ted.descuento, ted.precio, ted.precio_iva,
                   COALESCE(a.nombre, '') AS art_nombre,
                   COALESCE(f.nombre, '') AS fam_nombre
            FROM tarifas_especiales_detalle ted
            LEFT JOIN articulos a ON ted.referencia = a.referencia AND ted.referencia != ''
            LEFT JOIN familias f ON ted.familia = f.codigo AND ted.familia >= 0
            ORDER BY ted.codigo_tarifa, f.nombre, a.nombre
        """)
        details_raw = [dict(r) for r in cur.fetchall()]

        # Group details by tarifa
        details_map: dict = {}
        for d in details_raw:
            tc = d["codigo_tarifa"]
            if tc not in details_map:
                details_map[tc] = []
            details_map[tc].append({
                "referencia": d["referencia"],
                "art_nombre": d["art_nombre"],
                "fam_nombre": d["fam_nombre"],
                "descuento": float(d["descuento"]) if d["descuento"] else 0,
                "precio": float(d["precio"]) if d["precio"] else 0,
            })

        result = []
        for c in clientes:
            result.append({
                "cli_codigo": c["codigo"],
                "cli_nombre": c["nombre"],
                "tarifaespecial": c["tarifaespecial"],
                "tarifa_nombre": c["tarifa_nombre"],
                "detalle": details_map.get(c["tarifaespecial"], []),
            })

        cur.close()
        return {"clientes": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ── Ficha Artículo ─────────────────────────────────────────────────────────────

@router.get("/ficha-articulo")
def ficha_articulo(
    referencia: str = Query(...),
    anio: int = Query(default=None),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date.today()
    if anio is None:
        anio = today.year

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # ── Datos del artículo ──
        cur.execute("""
            SELECT a.referencia, a.nombre, '' AS descripcion,
                   COALESCE(f.nombre, '') AS familia,
                   COALESCE(sf.nombre, '') AS subfamilia,
                   COALESCE(m.nombre, '') AS marca,
                   COALESCE((SELECT precio FROM articulos_precios WHERE referencia = a.referencia AND tarifa = 1 LIMIT 1), 0) AS pvp1,
                   COALESCE(a.pmp, 0) AS coste,
                   COALESCE((SELECT SUM(actual) FROM almacenes_stock WHERE referencia = a.referencia), 0) AS stock
            FROM articulos a
            LEFT JOIN familias f ON a.familia = f.codigo
            LEFT JOIN subfamilias sf ON a.subfamilia = sf.codigo AND a.familia = sf.familia
            LEFT JOIN articulos_marcas m ON a.marca = m.codigo
            WHERE a.referencia = %(ref)s
        """, {"ref": referencia})
        art_row = cur.fetchone()
        articulo = dict(art_row) if art_row else {
            "referencia": referencia, "nombre": referencia, "descripcion": "",
            "familia": "", "subfamilia": "", "marca": "", "pvp1": 0, "coste": 0, "stock": 0
        }
        articulo = {k: (float(v) if hasattr(v, "as_tuple") else v) for k, v in articulo.items()}

        # ── Ventas mensuales - 3 años ──
        cur.execute("""
            SELECT EXTRACT(YEAR FROM vc.fecha)::int AS anio,
                   EXTRACT(MONTH FROM vc.fecha)::int AS mes,
                   SUM(vl.importe) AS total,
                   SUM(vl.unidades) AS uds,
                   SUM(vl.coste * vl.unidades) AS coste_total
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE vc.tipodoc = 8
              AND vl.referencia = %(ref)s
              AND vc.fecha >= %(desde)s
            GROUP BY 1, 2
            ORDER BY 1, 2
        """, {"ref": referencia, "desde": f"{anio - 2}-01-01"})
        ventas_mensuales = [
            {"anio": r["anio"], "mes": r["mes"],
             "total": _fval(r["total"]), "uds": _fval(r["uds"]), "coste": _fval(r["coste_total"])}
            for r in cur.fetchall()
        ]

        # ── KPIs ventas año seleccionado ──
        cur.execute("""
            SELECT COALESCE(SUM(vl.importe), 0) AS ventas,
                   COALESCE(SUM(vl.unidades), 0) AS uds,
                   COALESCE(SUM(vl.coste * vl.unidades), 0) AS coste_total
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE vc.tipodoc = 8
              AND vl.referencia = %(ref)s
              AND vc.fecha >= %(start)s AND vc.fecha < %(end)s
        """, {"ref": referencia, "start": f"{anio}-01-01", "end": f"{anio + 1}-01-01"})
        kv = cur.fetchone()
        ventas = _fval(kv["ventas"])
        uds_vendidas = _fval(kv["uds"])
        coste_ventas = _fval(kv["coste_total"])
        beneficio = ventas - coste_ventas
        precio_medio = ventas / uds_vendidas if uds_vendidas else 0
        margen_pct = (beneficio / ventas * 100) if ventas else 0

        # ── KPIs compras año seleccionado ──
        cur.execute("""
            SELECT COALESCE(SUM(cl.importe), 0) AS compras,
                   COALESCE(SUM(cl.unidades), 0) AS uds_compradas,
                   COALESCE(SUM(cl.precio * cl.unidades), 0) AS coste_compra
            FROM compras_lineas cl
            JOIN compras_cabeceras cc ON cl.idcab = cc.id
            WHERE cl.referencia = %(ref)s
              AND cc.fecha >= %(start)s AND cc.fecha < %(end)s
        """, {"ref": referencia, "start": f"{anio}-01-01", "end": f"{anio + 1}-01-01"})
        kc = cur.fetchone()
        compras = _fval(kc["compras"])
        uds_compradas = _fval(kc["uds_compradas"])
        coste_medio = compras / uds_compradas if uds_compradas else 0
        rotacion = ventas / compras if compras else 0

        # ── Detalle ventas ──
        cur.execute("""
            SELECT vc.id AS doc_id, vc.fecha, vc.serie, vc.numero, vc.tipodoc,
                   vc.cli_codigo, vc.cli_nombre,
                   vl.unidades, vl.precio AS precio_uni, vl.importe,
                   vl.coste * vl.unidades AS coste_lin,
                   vl.importe - vl.coste * vl.unidades AS beneficio_lin,
                   vl.pdto1, vl.pdto2, vl.pdto3
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE vc.tipodoc = 8
              AND vl.referencia = %(ref)s
            ORDER BY vc.fecha DESC
            LIMIT 300
        """, {"ref": referencia})
        TIPO_DOC = {8: "CI", 1: "PR", 3: "AL", 9: "AB", 10: "RC"}
        ventas_detalle = []
        for r in cur.fetchall():
            td = r["tipodoc"]
            doc_code = TIPO_DOC.get(td, str(td))
            ventas_detalle.append({
                "doc_id": r["doc_id"],
                "fecha": str(r["fecha"]),
                "doc": f"{doc_code} {r['serie']}{r['numero']}",
                "cli_codigo": r["cli_codigo"],
                "cli_nombre": r["cli_nombre"],
                "uds": _fval(r["unidades"]),
                "precio_uni": _fval(r["precio_uni"]),
                "importe": _fval(r["importe"]),
                "coste": _fval(r["coste_lin"]),
                "beneficio": _fval(r["beneficio_lin"]),
                "pdto1": _fval(r["pdto1"]),
                "pdto2": _fval(r["pdto2"]),
                "pdto3": _fval(r["pdto3"]),
            })

        # ── Detalle compras ──
        cur.execute("""
            SELECT cc.id AS doc_id, cc.fecha, cc.serie, cc.numero,
                   cc.pro_codigo, cc.pro_nombre,
                   cl.unidades, cl.precio AS precio_uni, cl.importe
            FROM compras_lineas cl
            JOIN compras_cabeceras cc ON cl.idcab = cc.id
            WHERE cl.referencia = %(ref)s
            ORDER BY cc.fecha DESC
            LIMIT 200
        """, {"ref": referencia})
        compras_detalle = []
        for r in cur.fetchall():
            compras_detalle.append({
                "doc_id": r["doc_id"],
                "fecha": str(r["fecha"]),
                "doc": f"CI {r['serie']}{r['numero']}",
                "pro_codigo": r["pro_codigo"],
                "pro_nombre": r["pro_nombre"],
                "uds": _fval(r["unidades"]),
                "precio_uni": _fval(r["precio_uni"]),
                "importe": _fval(r["importe"]),
            })

        # ── Descuentos aplicados ──
        cur.execute("""
            SELECT vc.cli_codigo, vc.cli_nombre,
                   vl.pdto1, vl.pdto2, vl.pdto3,
                   ROUND(
                     (1 - (1 - COALESCE(vl.pdto1,0)/100.0)
                            * (1 - COALESCE(vl.pdto2,0)/100.0)
                            * (1 - COALESCE(vl.pdto3,0)/100.0)) * 100, 2
                   ) AS dto_efectivo,
                   COUNT(*) AS veces,
                   SUM(vl.unidades) AS uds,
                   SUM(vl.importe) AS importe
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vl.idcab = vc.id
            WHERE vc.tipodoc = 8
              AND vl.referencia = %(ref)s
              AND (vl.pdto1 > 0 OR vl.pdto2 > 0 OR vl.pdto3 > 0)
            GROUP BY vc.cli_codigo, vc.cli_nombre, vl.pdto1, vl.pdto2, vl.pdto3
            ORDER BY dto_efectivo DESC, vc.cli_nombre
        """, {"ref": referencia})

        dto_raw = cur.fetchall()
        # Agrupar por dto_efectivo
        dto_groups: dict = {}
        for r in dto_raw:
            dto = float(r["dto_efectivo"]) if r["dto_efectivo"] is not None else 0
            key = f"{dto:.2f}"
            if key not in dto_groups:
                dto_groups[key] = {
                    "dto_efectivo": dto,
                    "pdto1": _fval(r["pdto1"]),
                    "pdto2": _fval(r["pdto2"]),
                    "pdto3": _fval(r["pdto3"]),
                    "total_veces": 0,
                    "total_uds": 0,
                    "total_importe": 0,
                    "clientes": []
                }
            entry = dto_groups[key]
            entry["total_veces"] += int(r["veces"])
            entry["total_uds"] += _fval(r["uds"])
            entry["total_importe"] += _fval(r["importe"])
            entry["clientes"].append({
                "cli_codigo": r["cli_codigo"],
                "cli_nombre": r["cli_nombre"],
                "veces": int(r["veces"]),
                "uds": _fval(r["uds"]),
                "importe": _fval(r["importe"]),
            })

        descuentos = sorted(dto_groups.values(), key=lambda x: -x["dto_efectivo"])

        cur.close()
        return {
            "articulo": articulo,
            "anio": anio,
            "ventas_mensuales": ventas_mensuales,
            "kpis": {
                "ventas": ventas,
                "beneficio": beneficio,
                "margen_pct": margen_pct,
                "uds_vendidas": uds_vendidas,
                "precio_medio": precio_medio,
                "compras": compras,
                "uds_compradas": uds_compradas,
                "coste_medio": coste_medio,
                "rotacion": rotacion,
            },
            "ventas_detalle": ventas_detalle,
            "compras_detalle": compras_detalle,
            "descuentos": descuentos,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn:
            conn.close()
