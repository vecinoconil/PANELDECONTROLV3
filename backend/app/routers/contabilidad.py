"""
Contabilidad – Libro IVA emitidas y recibidas.
"""
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


@router.get("/libro-iva")
def libro_iva(
    tipo: str = Query("emitidas", description="emitidas|recibidas"),
    desde: str = Query(..., description="Fecha desde YYYY-MM-DD"),
    hasta: str = Query(..., description="Fecha hasta YYYY-MM-DD"),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params = {"desde": desde, "hasta": hasta}

        # Build fpago_nombre: try JOIN with formas_pago; fall back to code string
        _fpago_join = "LEFT JOIN formaspago fp ON fp.codigo = {alias}.fpago"
        _fpago_col  = "COALESCE(fp.nombre, 'FP ' || COALESCE({alias}.fpago::text, '0')) AS fpago_nombre"

        def _run_query(sql: str) -> list:
            cur.execute(sql, params)
            return cur.fetchall()

        if tipo == "emitidas":
            alias = "vc"
            try:
                rows = _run_query(f"""
                    SELECT vc.id, vc.serie, vc.numero,
                           vc.fecha::text AS fecha,
                           vc.cli_codigo AS codigo_tercero,
                           vc.cli_nombre AS nombre_tercero,
                           COALESCE(vc.baseimpo1, 0) AS baseimpo1,
                           COALESCE(vc.piva1, 0)     AS piva1,
                           COALESCE(vc.iva1, 0)      AS iva1,
                           COALESCE(vc.rec1, 0)      AS rec1,
                           COALESCE(vc.baseimpo2, 0) AS baseimpo2,
                           COALESCE(vc.piva2, 0)     AS piva2,
                           COALESCE(vc.iva2, 0)      AS iva2,
                           COALESCE(vc.rec2, 0)      AS rec2,
                           COALESCE(vc.baseimpo3, 0) AS baseimpo3,
                           COALESCE(vc.piva3, 0)     AS piva3,
                           COALESCE(vc.iva3, 0)      AS iva3,
                           COALESCE(vc.rec3, 0)      AS rec3,
                           COALESCE(vc.irpf, 0)      AS irpf,
                           COALESCE(vc.total, 0)     AS total,
                           COALESCE(vc.fpago, 0)     AS fpago,
                           {_fpago_col.format(alias=alias)},
                           COALESCE((
                               SELECT SUM(v.importe) FROM vencimientos v
                               WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
                           ), 0) AS pendiente
                    FROM ventas_cabeceras vc
                    {_fpago_join.format(alias=alias)}
                    WHERE vc.tipodoc = 8
                      AND vc.fecha >= %(desde)s::date
                      AND vc.fecha <= %(hasta)s::date
                    ORDER BY vc.fecha, vc.serie, vc.numero
                """)
            except Exception:
                conn.rollback()
                rows = _run_query("""
                    SELECT vc.id, vc.serie, vc.numero,
                           vc.fecha::text AS fecha,
                           vc.cli_codigo AS codigo_tercero,
                           vc.cli_nombre AS nombre_tercero,
                           COALESCE(vc.baseimpo1, 0) AS baseimpo1,
                           COALESCE(vc.piva1, 0)     AS piva1,
                           COALESCE(vc.iva1, 0)      AS iva1,
                           COALESCE(vc.rec1, 0)      AS rec1,
                           COALESCE(vc.baseimpo2, 0) AS baseimpo2,
                           COALESCE(vc.piva2, 0)     AS piva2,
                           COALESCE(vc.iva2, 0)      AS iva2,
                           COALESCE(vc.rec2, 0)      AS rec2,
                           COALESCE(vc.baseimpo3, 0) AS baseimpo3,
                           COALESCE(vc.piva3, 0)     AS piva3,
                           COALESCE(vc.iva3, 0)      AS iva3,
                           COALESCE(vc.rec3, 0)      AS rec3,
                           COALESCE(vc.irpf, 0)      AS irpf,
                           COALESCE(vc.total, 0)     AS total,
                           COALESCE(vc.fpago, 0)     AS fpago,
                           NULL AS fpago_nombre,
                           COALESCE((
                               SELECT SUM(v.importe) FROM vencimientos v
                               WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
                           ), 0) AS pendiente
                    FROM ventas_cabeceras vc
                    WHERE vc.tipodoc = 8
                      AND vc.fecha >= %(desde)s::date
                      AND vc.fecha <= %(hasta)s::date
                    ORDER BY vc.fecha, vc.serie, vc.numero
                """)
        else:
            alias = "cc"
            try:
                rows = _run_query(f"""
                    SELECT cc.id, cc.serie, cc.numero,
                           cc.fecha::text AS fecha,
                           cc.pro_codigo AS codigo_tercero,
                           cc.pro_nombre AS nombre_tercero,
                           COALESCE(cc.baseimpo1, 0) AS baseimpo1,
                           COALESCE(cc.piva1, 0)     AS piva1,
                           COALESCE(cc.iva1, 0)      AS iva1,
                           COALESCE(cc.rec1, 0)      AS rec1,
                           COALESCE(cc.baseimpo2, 0) AS baseimpo2,
                           COALESCE(cc.piva2, 0)     AS piva2,
                           COALESCE(cc.iva2, 0)      AS iva2,
                           COALESCE(cc.rec2, 0)      AS rec2,
                           COALESCE(cc.baseimpo3, 0) AS baseimpo3,
                           COALESCE(cc.piva3, 0)     AS piva3,
                           COALESCE(cc.iva3, 0)      AS iva3,
                           COALESCE(cc.rec3, 0)      AS rec3,
                           COALESCE(cc.irpf, 0)      AS irpf,
                           COALESCE(cc.total, 0)     AS total,
                           COALESCE(cc.fpago, 0)     AS fpago,
                           {_fpago_col.format(alias=alias)},
                           COALESCE((
                               SELECT SUM(v.importe) FROM vencimientos v
                               WHERE v.idcab = cc.id AND v.tipo = 1 AND v.situacion = 0
                           ), 0) AS pendiente
                    FROM compras_cabeceras cc
                    {_fpago_join.format(alias=alias)}
                    WHERE cc.tipodoc = 8
                      AND cc.fecha >= %(desde)s::date
                      AND cc.fecha <= %(hasta)s::date
                    ORDER BY cc.fecha, cc.serie, cc.numero
                """)
            except Exception:
                conn.rollback()
                rows = _run_query("""
                    SELECT cc.id, cc.serie, cc.numero,
                           cc.fecha::text AS fecha,
                           cc.pro_codigo AS codigo_tercero,
                           cc.pro_nombre AS nombre_tercero,
                           COALESCE(cc.baseimpo1, 0) AS baseimpo1,
                           COALESCE(cc.piva1, 0)     AS piva1,
                           COALESCE(cc.iva1, 0)      AS iva1,
                           COALESCE(cc.rec1, 0)      AS rec1,
                           COALESCE(cc.baseimpo2, 0) AS baseimpo2,
                           COALESCE(cc.piva2, 0)     AS piva2,
                           COALESCE(cc.iva2, 0)      AS iva2,
                           COALESCE(cc.rec2, 0)      AS rec2,
                           COALESCE(cc.baseimpo3, 0) AS baseimpo3,
                           COALESCE(cc.piva3, 0)     AS piva3,
                           COALESCE(cc.iva3, 0)      AS iva3,
                           COALESCE(cc.rec3, 0)      AS rec3,
                           COALESCE(cc.irpf, 0)      AS irpf,
                           COALESCE(cc.total, 0)     AS total,
                           COALESCE(cc.fpago, 0)     AS fpago,
                           NULL AS fpago_nombre,
                           COALESCE((
                               SELECT SUM(v.importe) FROM vencimientos v
                               WHERE v.idcab = cc.id AND v.tipo = 1 AND v.situacion = 0
                           ), 0) AS pendiente
                    FROM compras_cabeceras cc
                    WHERE cc.tipodoc = 8
                      AND cc.fecha >= %(desde)s::date
                      AND cc.fecha <= %(hasta)s::date
                    ORDER BY cc.fecha, cc.serie, cc.numero
                """)

        facturas = []
        for r in rows:
            fpago_code = int(r["fpago"] or 0)
            raw_nombre = r.get("fpago_nombre")
            fpago_nombre = raw_nombre if raw_nombre else (f"FP {fpago_code}" if fpago_code else "Sin forma")
            facturas.append({
                "id": int(r["id"]),
                "fecha": r["fecha"],
                "serie": r["serie"] or "",
                "numero": int(r["numero"]),
                "codigo_tercero": r["codigo_tercero"],
                "nombre_tercero": r["nombre_tercero"] or "",
                "baseimpo1": float(r["baseimpo1"]),
                "piva1": float(r["piva1"]),
                "iva1": float(r["iva1"]),
                "rec1": float(r["rec1"]),
                "baseimpo2": float(r["baseimpo2"]),
                "piva2": float(r["piva2"]),
                "iva2": float(r["iva2"]),
                "rec2": float(r["rec2"]),
                "baseimpo3": float(r["baseimpo3"]),
                "piva3": float(r["piva3"]),
                "iva3": float(r["iva3"]),
                "rec3": float(r["rec3"]),
                "irpf": float(r["irpf"]),
                "total": float(r["total"]),
                "fpago": fpago_code,
                "fpago_nombre": fpago_nombre,
                "pendiente": float(r["pendiente"]),
            })

        return {"facturas": facturas}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error libro IVA: {str(e)}")
    finally:
        if conn:
            conn.close()
