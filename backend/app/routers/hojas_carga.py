"""
Hojas de Carga — Generación de hojas de reparto para conductores.
Trabaja con pedidos/albaranes sin fecha de entrega asignada.
Guarda las hojas en tablas propias en el PostgreSQL del ERP.
"""
import json as _json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select as sql_select

from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter(dependencies=[Depends(require_permiso("hojas_carga"))])


# ── Helpers ────────────────────────────────────────────────────────────────

def _ensure_tables(conn):
    """Crea las tablas si no existen en la BD del ERP."""
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hojas_de_carga (
            id              SERIAL PRIMARY KEY,
            fecha           TIMESTAMP NOT NULL DEFAULT NOW(),
            empresa_id      INTEGER,
            repartidor_codigo INTEGER,
            repartidor_usuario_id INTEGER,
            repartidor_nombre VARCHAR(100),
            usuario_nombre  VARCHAR(100),
            observaciones   TEXT DEFAULT '',
            estado          VARCHAR(20) DEFAULT 'activa',
            fecha_prevista  DATE
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hojas_de_carga_lineas (
            id              SERIAL PRIMARY KEY,
            hoja_id         INTEGER REFERENCES hojas_de_carga(id) ON DELETE CASCADE,
            orden           INTEGER DEFAULT 0,
            tipodoc         INTEGER,
            serie           VARCHAR(10),
            numero          INTEGER,
            cli_codigo      INTEGER,
            cli_nombre      VARCHAR(200),
            cli_localidad   VARCHAR(100),
            fecha_doc       DATE,
            total           NUMERIC(12,2),
            observaciones   TEXT DEFAULT '',
            servido         BOOLEAN DEFAULT FALSE,
            pagado          BOOLEAN DEFAULT FALSE,
            importe_cobrado NUMERIC(12,2) DEFAULT 0
        )
    """)
    # Migraciones para tablas ya existentes
    cur.execute("ALTER TABLE hojas_de_carga ADD COLUMN IF NOT EXISTS repartidor_usuario_id INTEGER")
    cur.execute("ALTER TABLE hojas_de_carga ADD COLUMN IF NOT EXISTS fecha_prevista DATE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS servido BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS importe_cobrado NUMERIC(12,2) DEFAULT 0")
    conn.commit()


# ── Schemas ────────────────────────────────────────────────────────────────

class HojaLineaCreate(BaseModel):
    tipodoc: int
    serie: str
    numero: int
    cli_codigo: int
    cli_nombre: str
    cli_localidad: str
    fecha_doc: Optional[str] = None
    total: float
    observaciones: str = ""
    orden: int = 0


class HojaCargaCreate(BaseModel):
    repartidor_usuario_id: int
    repartidor_nombre: str
    observaciones: str = ""
    fecha_prevista: Optional[str] = None
    lineas: List[HojaLineaCreate]


class HojaCargaUpdate(BaseModel):
    repartidor_usuario_id: int
    repartidor_nombre: str
    observaciones: str = ""
    fecha_prevista: Optional[str] = None
    lineas: List[HojaLineaCreate]


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/hojas-carga/conductores")
def list_conductores(
    empresa: Empresa = Depends(get_empresa_from_local),
    session: Session = Depends(get_session),
):
    """Retorna usuarios del panel que tienen permiso \'reparto\' activo en la misma empresa."""
    users = session.exec(
        sql_select(Usuario).where(
            Usuario.empresa_id == empresa.id,
            Usuario.activo == True,  # noqa: E712
        )
    ).all()
    result = []
    for u in users:
        raw = u.permisos or '{}'
        try:
            permisos = _json.loads(raw)
        except Exception:
            permisos = {}
        if isinstance(permisos, dict):
            tiene = permisos.get('reparto', {}).get('entrar', False)
        elif isinstance(permisos, list):
            tiene = 'reparto' in permisos
        else:
            tiene = False
        if tiene:
            result.append({"id": u.id, "nombre": u.nombre})
    return result


@router.get("/hojas-carga/documentos")
def list_documentos_pendientes(
    tipodoc: Optional[int] = Query(None, description="null=todos, 2=pedidos, 4=albaran"),
    localidad: Optional[str] = Query(None),
    hoja_id_exclude: Optional[int] = Query(None, description="Excluir docs de esta hoja al editar"),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()

        series_usuario = _json.loads(current_user.serie_expediciones or "[]")

        params: dict = {}

        # Excluir docs ya asignados a una hoja activa (excepto la hoja que se está editando)
        if hoja_id_exclude is not None:
            not_exists = (
                "NOT EXISTS ("
                "  SELECT 1 FROM hojas_de_carga_lineas hl "
                "  JOIN hojas_de_carga h ON h.id = hl.hoja_id "
                "  WHERE hl.tipodoc = vc.tipodoc "
                "    AND hl.serie = TRIM(vc.serie) "
                "    AND hl.numero = vc.numero "
                "    AND h.estado = 'activa'"
                "    AND h.id != %(hoja_id_exclude)s"
                ")"
            )
            params["hoja_id_exclude"] = hoja_id_exclude
        else:
            not_exists = (
                "NOT EXISTS ("
                "  SELECT 1 FROM hojas_de_carga_lineas hl "
                "  JOIN hojas_de_carga h ON h.id = hl.hoja_id "
                "  WHERE hl.tipodoc = vc.tipodoc "
                "    AND hl.serie = TRIM(vc.serie) "
                "    AND hl.numero = vc.numero "
                "    AND h.estado = 'activa'"
                ")"
            )

        conditions = [
            "vc.tipodoc IN (2, 4)",
            "vc.fechaentrega IS NULL",
            not_exists,
        ]

        if tipodoc is not None:
            conditions.append("vc.tipodoc = %(tipodoc)s")
            params["tipodoc"] = tipodoc

        if series_usuario:
            placeholders = ", ".join(
                [f"%(serie_{i})s" for i in range(len(series_usuario))]
            )
            conditions.append(f"TRIM(vc.serie) IN ({placeholders})")
            for i, s in enumerate(series_usuario):
                params[f"serie_{i}"] = s.strip()

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
                vc.tipodoc,
                vc.serie,
                vc.numero,
                vc.cli_codigo,
                vc.cli_nombre,
                COALESCE(
                    NULLIF(TRIM(vc.cli_localidad), ''),
                    COALESCE(TRIM(c.localidad), '')
                ) AS cli_localidad,
                vc.fecha,
                vc.total,
                vc.observaciones
            FROM ventas_cabeceras vc
            LEFT JOIN clientes c ON c.codigo = vc.cli_codigo
            WHERE {where}
            ORDER BY vc.fecha DESC, vc.id DESC
            LIMIT 300
            """,
            params or None,
        )

        result = []
        for r in cur.fetchall():
            result.append(
                {
                    "id": r["id"],
                    "tipodoc": r["tipodoc"],
                    "tipo_label": "Pedido" if r["tipodoc"] == 2 else "Albarán",
                    "serie": (r["serie"] or "").strip(),
                    "numero": r["numero"],
                    "cli_codigo": r["cli_codigo"],
                    "cli_nombre": r["cli_nombre"] or "",
                    "cli_localidad": r["cli_localidad"] or "",
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "total": float(r["total"] or 0),
                    "observaciones": r["observaciones"] or "",
                }
            )
        return result
    finally:
        if conn:
            conn.close()


@router.get("/hojas-carga/localidades")
def list_localidades_documentos(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve la lista de localidades únicas de los documentos pendientes."""
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()

        series_usuario = _json.loads(current_user.serie_expediciones or "[]")
        conditions = ["vc.tipodoc IN (2, 4)", "vc.fechaentrega IS NULL"]
        params: dict = {}

        if series_usuario:
            placeholders = ", ".join(
                [f"%(serie_{i})s" for i in range(len(series_usuario))]
            )
            conditions.append(f"TRIM(vc.serie) IN ({placeholders})")
            for i, s in enumerate(series_usuario):
                params[f"serie_{i}"] = s.strip()

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT DISTINCT COALESCE(
                NULLIF(TRIM(vc.cli_localidad), ''),
                COALESCE(TRIM(c.localidad), '')
            ) AS localidad
            FROM ventas_cabeceras vc
            LEFT JOIN clientes c ON c.codigo = vc.cli_codigo
            WHERE {where}
              AND COALESCE(NULLIF(TRIM(vc.cli_localidad), ''), COALESCE(TRIM(c.localidad), '')) != ''
            ORDER BY 1
            """,
            params or None,
        )
        return [r["localidad"] for r in cur.fetchall()]
    finally:
        if conn:
            conn.close()


@router.get("/hojas-carga")
def list_hojas_carga(
    empresa: Empresa = Depends(get_empresa_from_local),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT h.id, h.fecha, h.fecha_prevista, h.repartidor_nombre, h.usuario_nombre,
                   h.observaciones, h.estado,
                   COUNT(hl.id) AS num_lineas,
                   COALESCE(SUM(hl.total), 0) AS total
            FROM hojas_de_carga h
            LEFT JOIN hojas_de_carga_lineas hl ON hl.hoja_id = h.id
            WHERE h.empresa_id = %(empresa_id)s
            GROUP BY h.id, h.fecha, h.fecha_prevista, h.repartidor_nombre, h.usuario_nombre,
                     h.observaciones, h.estado
            ORDER BY h.fecha DESC
            LIMIT 100
            """,
            {"empresa_id": empresa.id},
        )
        result = []
        for r in cur.fetchall():
            result.append(
                {
                    "id": r["id"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "repartidor_nombre": r["repartidor_nombre"] or "",
                    "usuario_nombre": r["usuario_nombre"] or "",
                    "observaciones": r["observaciones"] or "",
                    "estado": r["estado"] or "activa",
                    "fecha_prevista": r["fecha_prevista"].isoformat() if r["fecha_prevista"] else None,
                    "num_lineas": int(r["num_lineas"] or 0),
                    "total": float(r["total"] or 0),
                }
            )
        return result
    finally:
        if conn:
            conn.close()


@router.get("/hojas-carga/{hoja_id}")
def get_hoja_carga(
    hoja_id: int,
    empresa: Empresa = Depends(get_empresa_from_local),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()

        cur.execute(
            "SELECT * FROM hojas_de_carga WHERE id = %(id)s",
            {"id": hoja_id},
        )
        h = cur.fetchone()
        if not h:
            raise HTTPException(status_code=404, detail="Hoja no encontrada")

        cur.execute(
            "SELECT * FROM hojas_de_carga_lineas "
            "WHERE hoja_id = %(hoja_id)s ORDER BY orden",
            {"hoja_id": hoja_id},
        )
        lineas = []
        for l in cur.fetchall():
            lineas.append(
                {
                    "id": l["id"],
                    "orden": l["orden"],
                    "tipodoc": l["tipodoc"],
                    "tipo_label": "Pedido" if l["tipodoc"] == 2 else "Albarán",
                    "serie": (l["serie"] or "").strip(),
                    "numero": l["numero"],
                    "cli_codigo": l["cli_codigo"],
                    "cli_nombre": l["cli_nombre"] or "",
                    "cli_localidad": l["cli_localidad"] or "",
                    "fecha_doc": l["fecha_doc"].isoformat() if l["fecha_doc"] else None,
                    "total": float(l["total"] or 0),
                    "observaciones": l["observaciones"] or "",
                }
            )

        return {
            "id": h["id"],
            "fecha": h["fecha"].isoformat() if h["fecha"] else None,
            "repartidor_codigo": h["repartidor_codigo"],
            "repartidor_usuario_id": h["repartidor_usuario_id"],
            "repartidor_nombre": h["repartidor_nombre"] or "",
            "usuario_nombre": h["usuario_nombre"] or "",
            "observaciones": h["observaciones"] or "",
            "estado": h["estado"] or "activa",
            "fecha_prevista": h["fecha_prevista"].isoformat() if h["fecha_prevista"] else None,
            "lineas": lineas,
        }
    finally:
        if conn:
            conn.close()


@router.post("/hojas-carga")
def create_hoja_carga(
    body: HojaCargaCreate,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    if not body.lineas:
        raise HTTPException(status_code=400, detail="La hoja debe tener al menos una línea")

    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO hojas_de_carga
                (empresa_id, repartidor_usuario_id, repartidor_nombre, usuario_nombre, observaciones, fecha_prevista)
            VALUES
                (%(empresa_id)s, %(rep_uid)s, %(rep_nombre)s, %(usuario)s, %(obs)s, %(fecha_prevista)s)
            RETURNING id
            """,
            {
                "empresa_id": empresa.id,
                "rep_uid": body.repartidor_usuario_id,
                "rep_nombre": body.repartidor_nombre,
                "usuario": current_user.nombre,
                "obs": body.observaciones,
                "fecha_prevista": body.fecha_prevista or None,
            },
        )
        hoja_id = cur.fetchone()["id"]

        for i, linea in enumerate(body.lineas):
            cur.execute(
                """
                INSERT INTO hojas_de_carga_lineas
                    (hoja_id, orden, tipodoc, serie, numero, cli_codigo,
                     cli_nombre, cli_localidad, fecha_doc, total, observaciones)
                VALUES
                    (%(hoja_id)s, %(orden)s, %(tipodoc)s, %(serie)s, %(numero)s,
                     %(cli_codigo)s, %(cli_nombre)s, %(cli_localidad)s,
                     %(fecha_doc)s, %(total)s, %(obs)s)
                """,
                {
                    "hoja_id": hoja_id,
                    "orden": linea.orden if linea.orden else i,
                    "tipodoc": linea.tipodoc,
                    "serie": linea.serie,
                    "numero": linea.numero,
                    "cli_codigo": linea.cli_codigo,
                    "cli_nombre": linea.cli_nombre,
                    "cli_localidad": linea.cli_localidad,
                    "fecha_doc": linea.fecha_doc,
                    "total": linea.total,
                    "obs": linea.observaciones,
                },
            )

        conn.commit()
        return {"id": hoja_id}
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.put("/hojas-carga/{hoja_id}")
def update_hoja_carga(
    hoja_id: int,
    body: HojaCargaUpdate,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    if not body.lineas:
        raise HTTPException(status_code=400, detail="La hoja debe tener al menos una línea")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM hojas_de_carga WHERE id = %(id)s AND empresa_id = %(eid)s",
            {"id": hoja_id, "eid": empresa.id},
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Hoja no encontrada")
        cur.execute(
            """
            UPDATE hojas_de_carga SET
                repartidor_usuario_id = %(rep_uid)s,
                repartidor_nombre = %(rep_nombre)s,
                observaciones = %(obs)s,
                fecha_prevista = %(fecha_prevista)s
            WHERE id = %(id)s
            """,
            {
                "id": hoja_id,
                "rep_uid": body.repartidor_usuario_id,
                "rep_nombre": body.repartidor_nombre,
                "obs": body.observaciones,
                "fecha_prevista": body.fecha_prevista or None,
            },
        )
        cur.execute("DELETE FROM hojas_de_carga_lineas WHERE hoja_id = %(hoja_id)s", {"hoja_id": hoja_id})
        for i, linea in enumerate(body.lineas):
            cur.execute(
                """
                INSERT INTO hojas_de_carga_lineas
                    (hoja_id, orden, tipodoc, serie, numero, cli_codigo,
                     cli_nombre, cli_localidad, fecha_doc, total, observaciones)
                VALUES
                    (%(hoja_id)s, %(orden)s, %(tipodoc)s, %(serie)s, %(numero)s,
                     %(cli_codigo)s, %(cli_nombre)s, %(cli_localidad)s,
                     %(fecha_doc)s, %(total)s, %(obs)s)
                """,
                {
                    "hoja_id": hoja_id,
                    "orden": linea.orden if linea.orden else i,
                    "tipodoc": linea.tipodoc,
                    "serie": linea.serie,
                    "numero": linea.numero,
                    "cli_codigo": linea.cli_codigo,
                    "cli_nombre": linea.cli_nombre,
                    "cli_localidad": linea.cli_localidad,
                    "fecha_doc": linea.fecha_doc,
                    "total": linea.total,
                    "obs": linea.observaciones,
                },
            )
        conn.commit()
        return {"id": hoja_id}
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.delete("/hojas-carga/{hoja_id}")
def delete_hoja_carga(
    hoja_id: int,
    empresa: Empresa = Depends(get_empresa_from_local),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_tables(conn)
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM hojas_de_carga WHERE id = %(id)s RETURNING id",
            {"id": hoja_id},
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Hoja no encontrada")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
