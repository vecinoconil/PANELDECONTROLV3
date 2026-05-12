"""
Portal de facturas para clientes del ERP.

Flujo:
1. Superadmin/gerente activa portal_activo en un Local (vía admin router).
2. Superadmin/gerente genera un enlace JWT para un cliente ERP:
       GET /api/portal/generar-token?empresa_id=X&cli_codigo=Y
3. El cliente abre la URL pública /portal/<token> en el navegador:
   - GET /api/portal/{token}/info  → datos básicos
   - GET /api/portal/{token}/facturas → listado de facturas/albaranes
   - GET /api/portal/{token}/facturas/{id} → detalle con líneas (para imprimir)
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from jose import jwt, JWTError
from sqlmodel import Session, select
import io

from app.config import settings
from app.database import get_session
from app.models.app_models import Empresa, Local, Usuario
from app.auth.dependencies import require_gerente_or_above
from app.services.pg_connection import get_pg_connection
from app.services.pdf_factura import query_factura_data, generar_pdf

router = APIRouter()

_PORTAL_TOKEN_EXPIRE_DAYS = 90


# ── Helpers ───────────────────────────────────────────────────────────────

def _create_portal_token(empresa_id: int, cli_codigo: int) -> str:
    payload = {
        "type": "portal",
        "empresa_id": empresa_id,
        "sub": str(cli_codigo),
        "exp": datetime.utcnow() + timedelta(days=_PORTAL_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _decode_portal_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Enlace de portal inválido o caducado")
    if payload.get("type") != "portal":
        raise HTTPException(status_code=401, detail="Enlace de portal inválido")
    return payload


def _get_empresa_con_portal_activo(empresa_id: int, session: Session) -> Empresa:
    """Verifica que exista al menos un local activo con portal_activo=True."""
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    local_portal = session.exec(
        select(Local).where(Local.empresa_id == empresa_id, Local.portal_activo == True)
    ).first()
    if not local_portal:
        raise HTTPException(
            status_code=403,
            detail="El portal de clientes no está activado para esta empresa. "
                   "Actívalo en Administración → Locales.",
        )
    return empresa


# ── Endpoints autenticados ────────────────────────────────────────────────

@router.get("/generar-token")
def generar_token_portal(
    empresa_id: int = Query(..., description="ID de la empresa (SQLite)"),
    cli_codigo: int = Query(..., description="Código del cliente en el ERP"),
    current_user: Usuario = Depends(require_gerente_or_above),
    session: Session = Depends(get_session),
):
    """
    Genera un enlace JWT de portal para un cliente del ERP.
    Solo superadmin y gerentes; el gerente solo puede generar para su propia empresa.
    """
    if current_user.rol == "gerente" and current_user.empresa_id != empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")

    empresa = _get_empresa_con_portal_activo(empresa_id, session)

    # Verificar que el cliente existe en el ERP
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT nombre FROM clientes WHERE codigo = %s",
            (cli_codigo,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Cliente no encontrado en el ERP")
        cli_nombre = row["nombre"]
        cur.close()
    finally:
        if conn:
            conn.close()

    token = _create_portal_token(empresa_id, cli_codigo)
    return {
        "token": token,
        "cli_codigo": cli_codigo,
        "cli_nombre": cli_nombre,
        "empresa_nombre": empresa.nombre,
        "expires_days": _PORTAL_TOKEN_EXPIRE_DAYS,
    }


# ── Endpoints públicos (sin autenticación) ────────────────────────────────

@router.get("/{token}/info")
def portal_info(
    token: str,
    session: Session = Depends(get_session),
):
    """Datos básicos del portal (cliente y empresa). Sin autenticación."""
    payload = _decode_portal_token(token)
    empresa_id = int(payload["empresa_id"])
    cli_codigo = int(payload["sub"])

    empresa = _get_empresa_con_portal_activo(empresa_id, session)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT nombre, alias, cif, direccion, localidad, cpostal, telefono1, email"
            " FROM clientes WHERE codigo = %s",
            (cli_codigo,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        cur.close()
        return {
            "empresa_nombre": empresa.nombre,
            "cli_codigo": cli_codigo,
            "cli_nombre": row["nombre"],
            "cli_alias": row["alias"],
            "cli_cif": row["cif"],
            "cli_direccion": row["direccion"],
            "cli_localidad": row["localidad"],
            "cli_cpostal": row["cpostal"],
            "cli_telefono": row["telefono1"],
            "cli_email": row["email"],
        }
    finally:
        if conn:
            conn.close()


@router.get("/{token}/facturas")
def portal_facturas(
    token: str,
    anio: Optional[int] = Query(None, description="Filtrar por año (opcional)"),
    session: Session = Depends(get_session),
):
    """Lista facturas y albaranes del cliente. Sin autenticación."""
    payload = _decode_portal_token(token)
    empresa_id = int(payload["empresa_id"])
    cli_codigo = int(payload["sub"])

    empresa = _get_empresa_con_portal_activo(empresa_id, session)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        params: dict = {"cli": cli_codigo}
        anio_filter = ""
        if anio:
            anio_filter = "AND EXTRACT(YEAR FROM vc.fecha) = %(anio)s"
            params["anio"] = anio

        cur.execute(f"""
            SELECT vc.id, vc.tipodoc, vc.serie, vc.numero,
                   vc.fecha::text AS fecha, vc.total,
                   COALESCE(
                       (SELECT SUM(v.importe)
                        FROM vencimientos v
                        WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0),
                       0
                   ) AS pendiente,
                   CASE vc.tipodoc
                       WHEN 8 THEN 'Factura'
                       WHEN 4 THEN 'Albarán'
                       WHEN 3 THEN 'Albarán'
                       ELSE 'Doc'
                   END AS tipo_doc
            FROM ventas_cabeceras vc
            WHERE vc.cli_codigo = %(cli)s
              AND (vc.tipodoc = 8 OR (vc.tipodoc = 4 AND vc.fechafin IS NULL))
            {anio_filter}
            ORDER BY vc.fecha DESC, vc.numero DESC
            LIMIT 500
        """, params)

        facturas = []
        for r in cur.fetchall():
            facturas.append({
                "id": int(r["id"]),
                "tipodoc": int(r["tipodoc"]),
                "serie": r["serie"],
                "numero": int(r["numero"]),
                "fecha": r["fecha"],
                "total": float(r["total"]),
                "pendiente": float(r["pendiente"]) if r["pendiente"] else 0.0,
                "tipo_doc": r["tipo_doc"],
            })

        # Años disponibles para el filtro
        cur.execute("""
            SELECT DISTINCT EXTRACT(YEAR FROM fecha)::int AS anio
            FROM ventas_cabeceras
            WHERE cli_codigo = %(cli)s
              AND (tipodoc = 8 OR (tipodoc = 4 AND fechafin IS NULL))
            ORDER BY anio DESC
        """, {"cli": cli_codigo})
        anios = [int(r["anio"]) for r in cur.fetchall()]

        cur.close()
        return {"facturas": facturas, "anios": anios}
    finally:
        if conn:
            conn.close()


@router.get("/{token}/facturas/{fac_id}")
def portal_factura_detalle(
    token: str,
    fac_id: int,
    session: Session = Depends(get_session),
):
    """Detalle de una factura (cabecera + líneas + vencimientos). Sin autenticación."""
    payload = _decode_portal_token(token)
    empresa_id = int(payload["empresa_id"])
    cli_codigo = int(payload["sub"])

    empresa = _get_empresa_con_portal_activo(empresa_id, session)

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Cabecera — verificar que pertenece a este cliente
        cur.execute("""
            SELECT c.id, c.tipodoc, c.serie, c.numero,
                   c.fecha, c.cli_codigo, c.cli_nombre,
                   c.baseimpo1,
                   COALESCE(c.baseimpo2, 0) AS baseimpo2,
                   COALESCE(c.baseimpo3, 0) AS baseimpo3,
                   c.piva1, c.piva2, c.piva3,
                   c.iva1,
                   COALESCE(c.iva2, 0) AS iva2,
                   COALESCE(c.iva3, 0) AS iva3,
                   c.rec1,
                   COALESCE(c.rec2, 0) AS rec2,
                   COALESCE(c.rec3, 0) AS rec3,
                   c.irpf, c.total, c.descripcion, c.observaciones, c.fpago
            FROM ventas_cabeceras c
            WHERE c.id = %(id)s
              AND c.cli_codigo = %(cli)s
              AND c.tipodoc IN (8, 4)
        """, {"id": fac_id, "cli": cli_codigo})
        cab_row = cur.fetchone()
        if not cab_row:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        cabecera = {
            k: (str(v) if k == "fecha" and v else float(v) if hasattr(v, "as_tuple") else v)
            for k, v in dict(cab_row).items()
        }

        # Líneas
        cur.execute("""
            SELECT l.orden, l.referencia, l.descripcion, l.unidades, l.precio,
                   l.importe, l.pdto1, l.pdto2, l.pdto3, l.descuento, l.piva
            FROM ventas_lineas l
            WHERE l.idcab = %(id)s
            ORDER BY l.orden
        """, {"id": fac_id})
        lineas = [
            {k: (float(v) if hasattr(v, "as_tuple") else v) for k, v in dict(r).items()}
            for r in cur.fetchall()
        ]

        # Vencimientos
        cur.execute("""
            SELECT v.fecha, v.importe, v.situacion
            FROM vencimientos v
            WHERE v.idcab = %(id)s AND v.tipo = 0
            ORDER BY v.fecha
        """, {"id": fac_id})
        vencimientos = [
            {
                "fecha": str(r["fecha"]) if r["fecha"] else None,
                "importe": float(r["importe"]),
                "situacion": r["situacion"],
            }
            for r in cur.fetchall()
        ]

        # Datos de la empresa para encabezado de impresión
        emp_info = {
            "nombre": empresa.nombre,
        }

        cur.close()
        return {
            "cabecera": cabecera,
            "lineas": lineas,
            "vencimientos": vencimientos,
            "empresa": emp_info,
        }
    finally:
        if conn:
            conn.close()


@router.get("/{token}/facturas/{fac_id}/pdf")
def portal_factura_pdf(
    token: str,
    fac_id: int,
    session: Session = Depends(get_session),
):
    """Genera y devuelve el PDF de una factura/albarán del cliente."""
    payload = _decode_portal_token(token)
    empresa_id = int(payload["empresa_id"])
    cli_codigo = int(payload["sub"])

    empresa = _get_empresa_con_portal_activo(empresa_id, session)

    try:
        data = query_factura_data(empresa, fac_id, cli_codigo)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar datos: {e}")

    if not data:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    try:
        pdf_bytes = generar_pdf(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar PDF: {e}")

    cab = data["cab"]
    # Normalizar tipo_documento: quitar tildes para el nombre de archivo ASCII
    import unicodedata
    tipo_raw = cab.get("tipo_documento", "doc").lower()
    tipo_ascii = unicodedata.normalize("NFD", tipo_raw)
    tipo_ascii = "".join(c for c in tipo_ascii if unicodedata.category(c) != "Mn")
    filename_ascii = f"{tipo_ascii}_{cab.get('serie','').strip()}_{cab.get('numero','')}.pdf"
    filename_ascii = filename_ascii.replace(" ", "_").replace("/", "-")
    # Nombre UTF-8 codificado para RFC 5987
    from urllib.parse import quote
    filename_utf8 = f"{tipo_raw}_{cab.get('serie','').strip()}_{cab.get('numero','')}.pdf"
    filename_utf8 = filename_utf8.replace(" ", "_").replace("/", "-")
    content_disposition = (
        f'attachment; filename="{filename_ascii}"; '
        f"filename*=UTF-8''{quote(filename_utf8)}"
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
    )
