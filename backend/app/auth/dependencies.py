from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlmodel import Session, select

from app.auth.service import decode_token
from app.database import get_session
from app.models.app_models import Empresa, Local, Usuario, UsuarioLocal
from app.schemas import normalize_permisos

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Usuario:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    user = session.get(Usuario, int(user_id))
    if not user or not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")
    return user


def require_superadmin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.rol != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere superadmin")
    return current_user


def require_gerente_or_above(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.rol not in ("superadmin", "gerente"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido")
    return current_user


def require_permiso(permiso_key: str, action: str = "entrar"):
    """Dependency factory: verifica que el usuario tenga el permiso indicado.
    - superadmin y gerente pasan siempre (a menos que tengan el permiso explícitamente en False).
    - encargado y usuario se comprueban estrictamente contra el campo permisos.
    """
    def _checker(current_user: Usuario = Depends(get_current_user)) -> None:
        if current_user.rol == "superadmin":
            return
        permisos = normalize_permisos(current_user.permisos or '{}')
        if current_user.rol == "gerente":
            # Gerente: acceso por defecto a todo; solo se bloquea si el permiso
            # está explícitamente definido con entrar/ver = False.
            perm = permisos.get(permiso_key)
            if perm is not None and not bool(perm.get(action, True)):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No tienes permiso para acceder a este módulo",
                )
            return
        # encargado / usuario: comprobación estricta
        perm = permisos.get(permiso_key, {})
        ok = bool(perm.get(action, False)) if isinstance(perm, dict) else False
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para acceder a este módulo",
            )
    return _checker


def get_empresa_from_local(
    local_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Empresa:
    """
    Resuelve la Empresa a usar para la petición.
    - Si se pasa local_id: verifica que el usuario tenga acceso a ese local y
      devuelve la empresa del local.
    - Si no se pasa: usa el empresa_id del usuario (comportamiento original).
    """
    if local_id is not None:
        local = session.get(Local, local_id)
        if not local or not local.activo:
            raise HTTPException(status_code=404, detail="Local no encontrado")
        # Verificar que el usuario tenga acceso a este local
        if current_user.rol not in ("superadmin", "gerente"):
            acceso = session.exec(
                select(UsuarioLocal).where(
                    UsuarioLocal.usuario_id == current_user.id,
                    UsuarioLocal.local_id == local_id,
                )
            ).first()
            if not acceso:
                raise HTTPException(status_code=403, detail="Sin acceso a este local")
        empresa = session.get(Empresa, local.empresa_id)
        if not empresa:
            raise HTTPException(status_code=404, detail="Empresa del local no encontrada")
        return empresa

    # Fallback: empresa del usuario
    if not current_user.empresa_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa asignada")
    empresa = session.get(Empresa, current_user.empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return empresa
