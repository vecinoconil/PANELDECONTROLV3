"""
Reparto — Módulo para repartidores.
Los repartidores ven sus hojas de carga asignadas, marcan documentos
como servido/pagado con importe cobrado, y pueden consultar el arqueo.
"""
import json as _json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter(dependencies=[Depends(require_permiso("reparto"))])


# ── Schemas ────────────────────────────────────────────────────────────────

class RepartoConfigUpdate(BaseModel):
    caja_reparto: Optional[int] = None


class LineaEstadoUpdate(BaseModel):
    servido: Optional[bool] = None
    pagado: Optional[bool] = None
    importe_cobrado: Optional[float] = None


# ── Helpers ────────────────────────────────────────────────────────────────

def _ensure_reparto_cols(conn):
    """Asegura que las columnas de reparto existen en las tablas."""
    cur = conn.cursor()
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS servido BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS importe_cobrado NUMERIC(12,2) DEFAULT 0")
    cur.execute("ALTER TABLE hojas_de_carga ADD COLUMN IF NOT EXISTS repartidor_usuario_id INTEGER")
    conn.commit()


# ── Config del repartidor ──────────────────────────────────────────────────

@router.get("/reparto/config")
def get_reparto_config(
    current_user: Usuario = Depends(get_current_user),
    empresa: Empresa = Depends(get_empresa_from_local),
):
    """Devuelve la configuración de reparto del usuario actual más las cajas disponibles."""
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT codigo, nombre FROM cajas WHERE activo = true OR activo IS NULL ORDER BY nombre"
        )
        cajas = [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
        return {
            "caja_reparto": current_user.caja_reparto,
            "cajas": cajas,
        }
    finally:
        if conn:
            conn.close()


@router.put("/reparto/config")
def update_reparto_config(
    body: RepartoConfigUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    current_user.caja_reparto = body.caja_reparto
    session.add(current_user)
    session.commit()
    return {"ok": True}


# ── Mis hojas ───────────────────────────────────────────────────────────────

@router.get("/reparto/mis-hojas")
def mis_hojas(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_reparto_cols(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                h.id,
                h.fecha,
                h.repartidor_nombre,
                h.usuario_nombre,
                h.observaciones,
                h.estado,
                COUNT(hl.id)  AS num_lineas,
                COUNT(hl.id) FILTER (WHERE hl.servido = true) AS servidos,
                COUNT(hl.id) FILTER (WHERE hl.pagado  = true) AS pagados,
                COALESCE(SUM(hl.total), 0) AS total,
                COALESCE(SUM(hl.importe_cobrado) FILTER (WHERE hl.pagado = true), 0) AS cobrado
            FROM hojas_de_carga h
            LEFT JOIN hojas_de_carga_lineas hl ON hl.hoja_id = h.id
            WHERE h.empresa_id = %(empresa_id)s
              AND h.repartidor_usuario_id = %(usuario_id)s
              AND h.estado = 'activa'
            GROUP BY h.id, h.fecha, h.repartidor_nombre, h.usuario_nombre,
                     h.observaciones, h.estado
            ORDER BY h.fecha DESC
            LIMIT 50
            """,
            {"empresa_id": empresa.id, "usuario_id": current_user.id},
        )
        result = []
        for r in cur.fetchall():
            result.append({
                "id": r["id"],
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "repartidor_nombre": r["repartidor_nombre"] or "",
                "usuario_nombre": r["usuario_nombre"] or "",
                "observaciones": r["observaciones"] or "",
                "estado": r["estado"] or "activa",
                "num_lineas": int(r["num_lineas"] or 0),
                "servidos": int(r["servidos"] or 0),
                "pagados": int(r["pagados"] or 0),
                "total": float(r["total"] or 0),
                "cobrado": float(r["cobrado"] or 0),
            })
        return result
    finally:
        if conn:
            conn.close()


@router.get("/reparto/mis-hojas/{hoja_id}")
def get_mi_hoja(
    hoja_id: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_reparto_cols(conn)
        cur = conn.cursor()

        cur.execute(
            "SELECT * FROM hojas_de_carga WHERE id = %(id)s AND empresa_id = %(emp)s",
            {"id": hoja_id, "emp": empresa.id},
        )
        h = cur.fetchone()
        if not h:
            raise HTTPException(status_code=404, detail="Hoja no encontrada")
        # Verificar que la hoja pertenece al repartidor actual
        if h["repartidor_usuario_id"] and h["repartidor_usuario_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta hoja")

        cur.execute(
            """
            SELECT id, orden, tipodoc, serie, numero, cli_codigo, cli_nombre,
                   cli_localidad, fecha_doc, total, observaciones,
                   COALESCE(servido, false) AS servido,
                   COALESCE(pagado, false)  AS pagado,
                   COALESCE(importe_cobrado, 0) AS importe_cobrado
            FROM hojas_de_carga_lineas
            WHERE hoja_id = %(hoja_id)s
            ORDER BY orden
            """,
            {"hoja_id": hoja_id},
        )
        lineas = []
        for l in cur.fetchall():
            lineas.append({
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
                "servido": bool(l["servido"]),
                "pagado": bool(l["pagado"]),
                "importe_cobrado": float(l["importe_cobrado"] or 0),
            })

        return {
            "id": h["id"],
            "fecha": h["fecha"].isoformat() if h["fecha"] else None,
            "repartidor_nombre": h["repartidor_nombre"] or "",
            "usuario_nombre": h["usuario_nombre"] or "",
            "observaciones": h["observaciones"] or "",
            "estado": h["estado"] or "activa",
            "lineas": lineas,
        }
    finally:
        if conn:
            conn.close()


@router.patch("/reparto/mis-hojas/{hoja_id}/lineas/{linea_id}")
def update_linea_estado(
    hoja_id: int,
    linea_id: int,
    body: LineaEstadoUpdate,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_reparto_cols(conn)
        cur = conn.cursor()

        # Verificar propiedad de la hoja
        cur.execute(
            "SELECT repartidor_usuario_id FROM hojas_de_carga WHERE id = %(id)s AND empresa_id = %(emp)s",
            {"id": hoja_id, "emp": empresa.id},
        )
        h = cur.fetchone()
        if not h:
            raise HTTPException(status_code=404, detail="Hoja no encontrada")
        if h["repartidor_usuario_id"] and h["repartidor_usuario_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Sin acceso")

        fields = []
        params: dict = {"id": linea_id, "hoja_id": hoja_id}
        if body.servido is not None:
            fields.append("servido = %(servido)s")
            params["servido"] = body.servido
        if body.pagado is not None:
            fields.append("pagado = %(pagado)s")
            params["pagado"] = body.pagado
        if body.importe_cobrado is not None:
            fields.append("importe_cobrado = %(importe_cobrado)s")
            params["importe_cobrado"] = body.importe_cobrado

        if not fields:
            return {"ok": True}

        cur.execute(
            f"UPDATE hojas_de_carga_lineas SET {', '.join(fields)} "
            "WHERE id = %(id)s AND hoja_id = %(hoja_id)s",
            params,
        )
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


# ── Cerrar hoja ─────────────────────────────────────────────────────────────

@router.patch("/reparto/mis-hojas/{hoja_id}/cerrar")
def cerrar_hoja(
    hoja_id: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_reparto_cols(conn)
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE hojas_de_carga SET estado = 'cerrada'
            WHERE id = %(id)s AND empresa_id = %(eid)s
              AND repartidor_usuario_id = %(uid)s
            RETURNING id
            """,
            {"id": hoja_id, "eid": empresa.id, "uid": current_user.id},
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Hoja no encontrada o sin permiso")
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


# ── Arqueo ──────────────────────────────────────────────────────────────────

@router.get("/reparto/arqueo")
def arqueo_repartidor(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_pg_connection(empresa)
        _ensure_reparto_cols(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                hl.id,
                hl.serie,
                hl.numero,
                hl.tipodoc,
                hl.cli_nombre,
                hl.cli_localidad,
                hl.total,
                hl.importe_cobrado,
                hl.servido,
                hl.pagado,
                h.fecha AS hoja_fecha
            FROM hojas_de_carga_lineas hl
            JOIN hojas_de_carga h ON h.id = hl.hoja_id
            WHERE h.empresa_id = %(empresa_id)s
              AND h.repartidor_usuario_id = %(usuario_id)s
              AND h.estado = 'activa'
            ORDER BY h.fecha DESC, hl.orden
            """,
            {"empresa_id": empresa.id, "usuario_id": current_user.id},
        )
        rows = cur.fetchall()
        lineas = []
        for r in rows:
            lineas.append({
                "id": r["id"],
                "serie": (r["serie"] or "").strip(),
                "numero": r["numero"],
                "tipodoc": r["tipodoc"],
                "tipo_label": "Pedido" if r["tipodoc"] == 2 else "Albarán",
                "cli_nombre": r["cli_nombre"] or "",
                "cli_localidad": r["cli_localidad"] or "",
                "total": float(r["total"] or 0),
                "importe_cobrado": float(r["importe_cobrado"] or 0),
                "servido": bool(r["servido"]),
                "pagado": bool(r["pagado"]),
                "hoja_fecha": r["hoja_fecha"].isoformat() if r["hoja_fecha"] else None,
            })

        total_docs = len(lineas)
        total_servidos = sum(1 for l in lineas if l["servido"])
        total_pagados = sum(1 for l in lineas if l["pagado"])
        total_cobrado = sum(l["importe_cobrado"] for l in lineas if l["pagado"])
        total_pendiente = sum(l["total"] for l in lineas if not l["servido"])

        return {
            "total_docs": total_docs,
            "total_servidos": total_servidos,
            "total_no_servidos": total_docs - total_servidos,
            "total_pagados": total_pagados,
            "total_cobrado": total_cobrado,
            "total_pendiente": total_pendiente,
            "caja_reparto": current_user.caja_reparto,
            "lineas": lineas,
        }
    finally:
        if conn:
            conn.close()
