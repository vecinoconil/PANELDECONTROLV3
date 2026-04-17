from fastapi import APIRouter, Depends, HTTPException, status
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
from app.schemas import LoginRequest, RefreshRequest, TokenResponse, UserMe, LocalInfo

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

    return UserMe(
        id=current_user.id,
        email=current_user.email,
        nombre=current_user.nombre,
        rol=current_user.rol,
        empresa_id=current_user.empresa_id,
        locales=[LocalInfo.model_validate(l) for l in locales],
    )
