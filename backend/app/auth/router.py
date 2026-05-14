import json

from fastapi import APIRouter, Body, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy import asc
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.auth.service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.database import get_session
from app.models.app_models import Local, Usuario, UsuarioLocal
from app.schemas import LoginRequest, RefreshRequest, TokenResponse, UserMe, LocalInfo, normalize_permisos
from app.services.email import send_password_recovery

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(Usuario).where(Usuario.email == body.email)).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    if not user.activo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, session: Session = Depends(get_session)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    user = session.get(Usuario, user_id)
    if not user or not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/recover-password", status_code=status.HTTP_200_OK)
def recover_password(
    email: str = Body(..., embed=True),
    session: Session = Depends(get_session),
):
    user = session.exec(select(Usuario).where(Usuario.email == email)).first()
    # Always return OK to avoid email enumeration
    if not user or not user.plain_password:
        return {"ok": True, "message": "Si el email está registrado, recibirás un correo"}
    try:
        send_password_recovery(user.email, user.nombre, user.plain_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {e}")
    return {"ok": True, "message": "Si el email está registrado, recibirás un correo"}


@router.get("/me", response_model=UserMe)
def me(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    if current_user.rol == "superadmin":
        locales = session.exec(select(Local).where(Local.activo == True).order_by(asc(Local.id))).all()
    elif current_user.rol == "gerente":
        locales = session.exec(
            select(Local).where(Local.empresa_id == current_user.empresa_id, Local.activo == True).order_by(asc(Local.id))
        ).all()
    else:
        assigned = session.exec(
            select(UsuarioLocal).where(UsuarioLocal.usuario_id == current_user.id)
        ).all()
        local_ids = sorted([ul.local_id for ul in assigned])
        locales = [session.get(Local, lid) for lid in local_ids if session.get(Local, lid)]

    empresa_nombre = None
    if current_user.empresa_id:
        from app.models.app_models import Empresa
        emp = session.get(Empresa, current_user.empresa_id)
        empresa_nombre = emp.nombre if emp else None

    return UserMe(
        id=current_user.id,
        email=current_user.email,
        nombre=current_user.nombre,
        rol=current_user.rol,
        empresa_id=current_user.empresa_id,
        empresa_nombre=empresa_nombre,
        locales=[LocalInfo.model_validate(l) for l in locales],
        permisos=normalize_permisos(current_user.permisos or '{}'),
        agente_autoventa=current_user.agente_autoventa,
        serie_autoventa=current_user.serie_autoventa,
        autoventa_modifica_precio=current_user.autoventa_modifica_precio,
        tipodocs_autoventa=current_user.tipodocs_autoventa or '[]',
        caja_autoventa=current_user.caja_autoventa,
        almacen_autoventa=current_user.almacen_autoventa,
        caja_reparto=current_user.caja_reparto,
        precargar_historial_autoventa=current_user.precargar_historial_autoventa,
        paper_width_impresora=current_user.paper_width_impresora or 80,
        ticket_design_autoventa=current_user.ticket_design_autoventa or 1,
        serie_expediciones=current_user.serie_expediciones or '[]',
    )
