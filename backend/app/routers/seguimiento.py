"""
Seguimiento Locales – listado en tiempo real de la tabla actualizaciones de HTSOLUMEDIA.
Acceso exclusivo superadmin.
"""
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import require_superadmin
from app.models.app_models import Usuario

router = APIRouter()

_HT_CONN = dict(
    host="core2.solba.com",
    port=5000,
    dbname="HTSOLUMEDIA",
    user="SOLBA",
    password="solba2012",
    connect_timeout=10,
)


def _get_ht_conn():
    return psycopg2.connect(**_HT_CONN, cursor_factory=RealDictCursor)


@router.get("/locales")
def get_seguimiento_locales(
    _: Usuario = Depends(require_superadmin),
):
    """Devuelve toda la tabla actualizaciones ordenada por ultimaconexion DESC."""
    conn = None
    try:
        conn = _get_ht_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                idcliente,
                mac,
                idlocal,
                ultimaconexion,
                nombrelocal,
                version,
                versionactualizador,
                instancia,
                basedatoscashguard,
                tipocajon,
                grupo,
                servidor,
                nif,
                anydesk,
                distribuidor,
                tiempo,
                contrato,
                nombrecontrato,
                preciocontrato,
                basededatos,
                usuario,
                password,
                puerto,
                looker,
                subecashguard,
                subelineas,
                subetickets,
                subemesas,
                subeincidencias,
                subepicadas,
                subemovimientos,
                subecarta,
                actualizate,
                depuracion,
                ncierres,
                renovacion,
                localidad,
                error
            FROM actualizaciones
            ORDER BY ultimaconexion DESC NULLS LAST
        """)
        rows = cur.fetchall()
        result = []
        for r in rows:
            row = dict(r)
            # Serializar tipos no-JSON
            if row.get("ultimaconexion") is not None:
                row["ultimaconexion"] = row["ultimaconexion"].isoformat()
            if row.get("renovacion") is not None:
                row["renovacion"] = row["renovacion"].isoformat()
            if row.get("preciocontrato") is not None:
                row["preciocontrato"] = float(row["preciocontrato"])
            result.append(row)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando con HTSOLUMEDIA: {e}")
    finally:
        if conn:
            conn.close()


class LocalUpdate(BaseModel):
    idlocal: Optional[int] = None
    idcliente: Optional[str] = None
    tiempo: Optional[int] = None
    anydesk: Optional[str] = None
    distribuidor: Optional[str] = None
    grupo: Optional[str] = None
    basededatos: Optional[str] = None
    servidor: Optional[str] = None
    usuario: Optional[str] = None
    password: Optional[str] = None
    puerto: Optional[str] = None
    instancia: Optional[str] = None
    basedatoscashguard: Optional[str] = None
    tipocajon: Optional[str] = None
    looker: Optional[str] = None
    contrato: Optional[int] = None
    renovacion: Optional[str] = None
    ncierres: Optional[int] = None
    actualizate: Optional[bool] = None
    subecashguard: Optional[bool] = None
    subelineas: Optional[bool] = None
    subetickets: Optional[bool] = None
    subemesas: Optional[bool] = None
    subeincidencias: Optional[bool] = None
    subepicadas: Optional[bool] = None
    subemovimientos: Optional[bool] = None
    depuracion: Optional[bool] = None
    subecarta: Optional[bool] = None


@router.put("/locales/{mac}")
def update_local(
    mac: str,
    body: LocalUpdate,
    _: Usuario = Depends(require_superadmin),
):
    """Actualiza un registro de actualizaciones identificado por mac."""
    conn = None
    try:
        conn = _get_ht_conn()
        cur = conn.cursor()

        data = body.model_dump(exclude_none=True)
        if not data:
            return {"ok": True, "updated": 0}

        set_parts = []
        values = []
        for field, value in data.items():
            set_parts.append(f'"{field}" = %s')
            values.append(value)

        values.append(mac)
        sql = f'UPDATE actualizaciones SET {", ".join(set_parts)} WHERE mac = %s'
        cur.execute(sql, values)
        conn.commit()
        return {"ok": True, "updated": cur.rowcount}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
