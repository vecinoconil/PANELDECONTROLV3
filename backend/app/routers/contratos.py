"""
Contratos – endpoints para la gestión de contratos del ERP.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter(dependencies=[Depends(require_permiso('contratos'))])



# ── Resumen general ───────────────────────────────────────────────────────────

@router.get("/resumen")
def resumen_contratos(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """KPIs generales + desglose por tipo de contrato."""

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute("""
            SELECT
                COUNT(*) AS total_contratos,
                COUNT(*) FILTER (
                    WHERE (desactivado IS NULL OR desactivado = FALSE)
                      AND fecha_baja IS NULL
                ) AS activos,
                COUNT(*) FILTER (
                    WHERE desactivado = TRUE OR fecha_baja IS NOT NULL
                ) AS bajas,
                COUNT(*) FILTER (
                    WHERE impago = TRUE
                      AND (desactivado IS NULL OR desactivado = FALSE)
                      AND fecha_baja IS NULL
                ) AS con_impago,
                COALESCE(SUM(cuota_recibo) FILTER (
                    WHERE (desactivado IS NULL OR desactivado = FALSE)
                      AND fecha_baja IS NULL
                ), 0) AS cuota_total_mensual,
                COUNT(DISTINCT cli_codigo) FILTER (
                    WHERE (desactivado IS NULL OR desactivado = FALSE)
                      AND fecha_baja IS NULL
                ) AS clientes_activos,
                COUNT(*) FILTER (
                    WHERE indefinido IS NOT TRUE
                      AND fecha_baja IS NULL
                      AND (desactivado IS NULL OR desactivado = FALSE)
                      AND fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
                ) AS proximos_vencimientos
            FROM contratos
        """)
        kpis = dict(cur.fetchone())

        cur.execute("""
            SELECT
                ct.codigo,
                ct.concepto AS tipo_nombre,
                COUNT(c.id) AS total,
                COUNT(c.id) FILTER (
                    WHERE (c.desactivado IS NULL OR c.desactivado = FALSE)
                      AND c.fecha_baja IS NULL
                ) AS activos,
                COUNT(c.id) FILTER (
                    WHERE c.desactivado = TRUE OR c.fecha_baja IS NOT NULL
                ) AS bajas,
                COALESCE(SUM(c.cuota_recibo) FILTER (
                    WHERE (c.desactivado IS NULL OR c.desactivado = FALSE)
                      AND c.fecha_baja IS NULL
                ), 0) AS cuota_mensual
            FROM contratos_tipos ct
            LEFT JOIN contratos c ON c.tipo_contrato = ct.codigo
            WHERE ct.obsoleto IS NOT TRUE
            GROUP BY ct.codigo, ct.concepto
            HAVING COUNT(c.id) > 0
            ORDER BY activos DESC, cuota_mensual DESC
        """)
        por_tipo = [dict(r) for r in cur.fetchall()]

        cur.close()
        return {"kpis": kpis, "por_tipo": por_tipo}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ── Tipos (para selectores) ───────────────────────────────────────────────────

@router.get("/tipos")
def tipos_contrato(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lista de tipos de contrato no obsoletos."""

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT codigo, concepto FROM contratos_tipos"
            " WHERE obsoleto IS NOT TRUE ORDER BY concepto"
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ── Lista de contratos (con filtros) ─────────────────────────────────────────

@router.get("/lista")
def lista_contratos(
    cli_codigo: Optional[int] = Query(None),
    tipo_contrato: Optional[int] = Query(None),
    solo_activos: bool = Query(True),
    busqueda: str = Query(''),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        conditions: list[str] = []
        params: list = []

        if solo_activos:
            conditions.append(
                "(c.desactivado IS NULL OR c.desactivado = FALSE) AND c.fecha_baja IS NULL"
            )
        if cli_codigo:
            conditions.append("c.cli_codigo = %s")
            params.append(cli_codigo)
        if tipo_contrato:
            conditions.append("c.tipo_contrato = %s")
            params.append(tipo_contrato)
        if busqueda:
            conditions.append(
                "(cl.nombre ILIKE %s OR c.concepto ILIKE %s"
                " OR CAST(c.numero_contrato AS TEXT) = %s)"
            )
            params += [f"%{busqueda}%", f"%{busqueda}%", busqueda]

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        cur.execute(f"""
            SELECT
                c.id, c.numero_contrato, c.cli_codigo,
                cl.nombre AS cli_nombre,
                COALESCE(cl.alias, '') AS cli_alias,
                ct.concepto AS tipo_nombre, c.tipo_contrato,
                c.cuota_recibo, c.periodicidad, c.meses_activos,
                c.fecha_formalizacion, c.fecha_entrada_en_vigor, c.fecha_fin,
                c.fecha_baja, c.fecha_renovacion, c.indefinido,
                c.desactivado, c.impago, c.tipo_iva,
                c.concepto AS concepto_contrato
            FROM contratos c
            LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
            LEFT JOIN contratos_tipos ct ON ct.codigo = c.tipo_contrato
            {where}
            ORDER BY cl.nombre, c.tipo_contrato, c.numero_contrato
            LIMIT 500
        """, params)

        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return {"contratos": rows, "total": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ── Facturación del mes (todos los vencimientos con estado) ──────────────────

@router.get("/vencimientos-mes")
def contratos_vencimientos_mes(
    mes: List[int] = Query(...),
    anio: int = Query(..., ge=2000, le=2100),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Todos los vencimientos de contratos del mes/año indicado, con estado:
    - cobrado:   id_factura > 0 Y vencimientos.situacion = 1 (fechacobro registrada)
    - facturado: id_factura > 0 pero vencimientos.situacion != 1 (aún no cobrado)
    - pendiente: sin factura
    """

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute("""
            SELECT
                cv.id AS venc_id,
                cv.id_contrato,
                cv.fecha,
                cv.importe,
                cv.id_factura,
                cv.id_albaran,
                c.numero_contrato,
                c.cli_codigo,
                cl.nombre AS cli_nombre,
                COALESCE(cl.alias, '') AS cli_alias,
                ct.concepto AS tipo_nombre,
                c.tipo_contrato,
                c.cuota_recibo,
                c.impago,
                c.concepto AS concepto_contrato,
                vc.serie      AS fra_serie,
                vc.numero     AS fra_numero,
                vc.fecha      AS fra_fecha,
                v.situacion   AS vto_situacion,
                v.fechacobro  AS vto_fechacobro
            FROM contratos_vencimientos cv
            LEFT JOIN contratos c        ON c.id       = cv.id_contrato
            LEFT JOIN clientes cl        ON cl.codigo  = c.cli_codigo
            LEFT JOIN contratos_tipos ct ON ct.codigo  = c.tipo_contrato
            LEFT JOIN ventas_cabeceras vc ON vc.id      = cv.id_factura AND cv.id_factura > 0
            LEFT JOIN vencimientos v      ON v.idcab    = cv.id_factura AND cv.id_factura > 0
            WHERE EXTRACT(year  FROM cv.fecha)::int = %s
              AND EXTRACT(month FROM cv.fecha)::int = ANY(%s)
              AND (c.desactivado IS NULL OR c.desactivado = FALSE)
              AND c.fecha_baja IS NULL
            ORDER BY
                CASE
                    WHEN cv.id_factura > 0 AND v.situacion = 1 THEN 3
                    WHEN cv.id_factura > 0 THEN 2
                    ELSE 1
                END,
                cl.nombre
        """, [anio, mes])

        rows = []
        for r in cur.fetchall():
            row = dict(r)
            fac = row.get('id_factura') or 0
            situacion = row.get('vto_situacion')
            if fac > 0 and situacion == 1:
                row['estado'] = 'cobrado'
            elif fac > 0:
                row['estado'] = 'facturado'
            else:
                row['estado'] = 'pendiente'
            rows.append(row)

        total_pendiente  = sum(float(r['importe'] or 0) for r in rows if r['estado'] == 'pendiente')
        total_facturado  = sum(float(r['importe'] or 0) for r in rows if r['estado'] == 'facturado')
        total_cobrado    = sum(float(r['importe'] or 0) for r in rows if r['estado'] == 'cobrado')

        cur.close()
        return {
            "vencimientos": rows,
            "total": len(rows),
            "total_pendiente": round(total_pendiente, 2),
            "total_facturado": round(total_facturado, 2),
            "total_cobrado":   round(total_cobrado, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ── Importes mensuales (facturado vs. pendiente) ──────────────────────────────

@router.get("/importe-mensual")
def importe_mensual(
    anio: int = Query(..., ge=2000, le=2100),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Desglose mensual de lo facturado y pendiente según contratos_vencimientos."""

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute("""
            SELECT
                EXTRACT(month FROM cv.fecha)::int AS mes,
                COALESCE(SUM(cv.importe) FILTER (
                    WHERE cv.id_factura > 0 AND v.situacion = 1
                ), 0) AS cobrado,
                COALESCE(SUM(cv.importe) FILTER (
                    WHERE cv.id_factura > 0 AND (v.situacion IS NULL OR v.situacion != 1)
                ), 0) AS facturado,
                COALESCE(SUM(cv.importe) FILTER (
                    WHERE cv.id_factura IS NULL OR cv.id_factura = 0
                ), 0) AS pendiente,
                COUNT(*) FILTER (
                    WHERE cv.id_factura > 0 AND v.situacion = 1
                ) AS venc_cobrados,
                COUNT(*) FILTER (
                    WHERE cv.id_factura > 0 AND (v.situacion IS NULL OR v.situacion != 1)
                ) AS venc_facturados,
                COUNT(*) FILTER (
                    WHERE cv.id_factura IS NULL OR cv.id_factura = 0
                ) AS venc_pendientes
            FROM contratos_vencimientos cv
            LEFT JOIN contratos c ON c.id = cv.id_contrato
            LEFT JOIN vencimientos v ON v.idcab = cv.id_factura AND cv.id_factura > 0
            WHERE EXTRACT(year FROM cv.fecha)::int = %s
              AND (c.desactivado IS NULL OR c.desactivado = FALSE)
              AND c.fecha_baja IS NULL
            GROUP BY EXTRACT(month FROM cv.fecha)
            ORDER BY mes
        """, [anio])

        rows_db = {r['mes']: dict(r) for r in cur.fetchall()}

        # Rellenar todos los meses aunque no haya datos
        meses = []
        for m in range(1, 13):
            row = rows_db.get(m, {
                'mes': m,
                'cobrado': 0,
                'facturado': 0,
                'pendiente': 0,
                'venc_cobrados': 0,
                'venc_facturados': 0,
                'venc_pendientes': 0,
            })
            meses.append(dict(row))

        cur.close()
        total_cobrado   = sum(float(r['cobrado']   or 0) for r in meses)
        total_facturado = sum(float(r['facturado'] or 0) for r in meses)
        total_pendiente = sum(float(r['pendiente'] or 0) for r in meses)
        return {
            "meses": meses,
            "anio": anio,
            "total_cobrado":   round(total_cobrado, 2),
            "total_facturado": round(total_facturado, 2),
            "total_pendiente": round(total_pendiente, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ── Sin facturar (+ contratos sin vencimiento) ────────────────────────────────

@router.get("/sin-facturar")
def sin_facturar(
    mes: int = Query(..., ge=1, le=12),
    anio: int = Query(..., ge=2000, le=2100),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Vencimientos del mes seleccionado sin factura, señalando cuáles sí se
    facturaron en el mismo mes del año anterior.
    También devuelve contratos mensuales activos que ni siquiera tienen
    vencimiento registrado en ese mes.
    """

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        anio_anterior = anio - 1

        # IDs facturados en el mismo mes del año anterior
        cur.execute("""
            SELECT DISTINCT id_contrato
            FROM contratos_vencimientos
            WHERE EXTRACT(year  FROM fecha)::int = %s
              AND EXTRACT(month FROM fecha)::int = %s
              AND (id_factura IS NOT NULL OR id_albaran IS NOT NULL)
        """, [anio_anterior, mes])
        facturados_ant = {r['id_contrato'] for r in cur.fetchall()}

        # Vencimientos de este mes sin factura
        cur.execute("""
            SELECT
                cv.id, cv.id_contrato, cv.fecha, cv.importe,
                c.cli_codigo, cl.nombre AS cli_nombre,
                COALESCE(cl.alias, '') AS cli_alias,
                ct.concepto AS tipo_nombre, c.tipo_contrato,
                c.cuota_recibo, c.numero_contrato,
                c.concepto AS concepto_contrato
            FROM contratos_vencimientos cv
            LEFT JOIN contratos c    ON c.id   = cv.id_contrato
            LEFT JOIN clientes cl   ON cl.codigo = c.cli_codigo
            LEFT JOIN contratos_tipos ct ON ct.codigo = c.tipo_contrato
            WHERE EXTRACT(year  FROM cv.fecha)::int = %s
              AND EXTRACT(month FROM cv.fecha)::int = %s
              AND cv.id_factura IS NULL
              AND cv.id_albaran IS NULL
              AND (c.desactivado IS NULL OR c.desactivado = FALSE)
              AND c.fecha_baja IS NULL
            ORDER BY cl.nombre, c.tipo_contrato
        """, [anio, mes])

        venc_pendientes = []
        for r in cur.fetchall():
            row = dict(r)
            row['facturado_anio_anterior'] = row['id_contrato'] in facturados_ant
            venc_pendientes.append(row)

        # Contratos mensuales activos SIN vencimiento en ese mes
        cur.execute("""
            SELECT
                c.id AS id_contrato, c.numero_contrato, c.cli_codigo,
                cl.nombre AS cli_nombre,
                COALESCE(cl.alias, '') AS cli_alias,
                ct.concepto AS tipo_nombre,
                c.tipo_contrato, c.cuota_recibo,
                c.concepto AS concepto_contrato,
                c.meses_activos, c.periodicidad
            FROM contratos c
            LEFT JOIN clientes cl   ON cl.codigo = c.cli_codigo
            LEFT JOIN contratos_tipos ct ON ct.codigo = c.tipo_contrato
            WHERE c.cuota_recibo > 0
              AND c.periodicidad = 1
              AND (c.desactivado IS NULL OR c.desactivado = FALSE)
              AND c.fecha_baja IS NULL
              AND (
                  c.fecha_entrada_en_vigor IS NULL
                  OR c.fecha_entrada_en_vigor <= make_date(%s, %s, 28)
              )
              AND (
                  c.indefinido = TRUE
                  OR c.fecha_fin IS NULL
                  OR c.fecha_fin >= make_date(%s, %s, 1)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM contratos_vencimientos cv2
                  WHERE cv2.id_contrato = c.id
                    AND EXTRACT(year  FROM cv2.fecha)::int = %s
                    AND EXTRACT(month FROM cv2.fecha)::int = %s
              )
            ORDER BY cl.nombre
        """, [anio, mes, anio, mes, anio, mes])

        sin_vencimiento = []
        for r in cur.fetchall():
            row = dict(r)
            # Filtrar por meses_activos si tiene valor
            ma_str = (row.get('meses_activos') or '').strip()
            if ma_str:
                try:
                    meses_list = [
                        int(x.strip()) for x in ma_str.split(',')
                        if x.strip().isdigit()
                    ]
                    if meses_list and mes not in meses_list:
                        continue
                except Exception:
                    pass
            row['facturado_anio_anterior'] = row['id_contrato'] in facturados_ant
            row['importe'] = float(row['cuota_recibo'] or 0)
            sin_vencimiento.append(row)

        total_importe = sum(float(r.get('importe') or 0) for r in venc_pendientes)

        cur.close()
        return {
            "vencimientos_pendientes": venc_pendientes,
            "sin_vencimiento": sin_vencimiento,
            "total_importe": round(total_importe, 2),
            "total_vencimientos": len(venc_pendientes),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
