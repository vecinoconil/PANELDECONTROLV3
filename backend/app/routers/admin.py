from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth.dependencies import require_superadmin, require_gerente_or_above, get_current_user
from app.auth.service import hash_password
from app.database import get_session
from app.models.app_models import Empresa, Local, Usuario, UsuarioLocal
from app.schemas import (
    EmpresaCreate, EmpresaRead, EmpresaUpdate,
    LocalCreate, LocalRead, LocalUpdate,
    UsuarioCreate, UsuarioRead, UsuarioUpdate,
)

router = APIRouter()

VALID_ROLES = {"superadmin", "gerente", "encargado", "usuario"}
GERENTE_ALLOWED_ROLES = {"encargado", "usuario"}


def _assert_can_manage(actor: Usuario, target: Usuario) -> None:
    if actor.rol == "gerente":
        if target.empresa_id != actor.empresa_id:
            raise HTTPException(status_code=403, detail="Sin acceso a este usuario")
        if target.rol not in GERENTE_ALLOWED_ROLES:
            raise HTTPException(status_code=403, detail="No puedes gestionar usuarios con este rol")


def _usuario_to_read(user: Usuario, session: Session, *, include_password: bool = False) -> UsuarioRead:
    ul_rows = session.exec(
        select(UsuarioLocal).where(UsuarioLocal.usuario_id == user.id)
    ).all()
    local_ids = [ul.local_id for ul in ul_rows]
    data = user.model_dump()
    data["local_ids"] = local_ids
    if not include_password:
        data.pop("plain_password", None)
    return UsuarioRead(**data)


# ── Empresas ──────────────────────────────────────────────────────────────

@router.get("/empresas", response_model=list[EmpresaRead])
def list_empresas(
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    return session.exec(select(Empresa)).all()


@router.post("/empresas", response_model=EmpresaRead, status_code=status.HTTP_201_CREATED)
def create_empresa(
    body: EmpresaCreate,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    empresa = Empresa(**body.model_dump())
    session.add(empresa)
    session.commit()
    session.refresh(empresa)
    return empresa


@router.put("/empresas/{empresa_id}", response_model=EmpresaRead)
def update_empresa(
    empresa_id: int,
    body: EmpresaUpdate,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(empresa, key, val)
    session.commit()
    session.refresh(empresa)
    return empresa


@router.delete("/empresas/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_empresa(
    empresa_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    loc_count = session.exec(select(Local).where(Local.empresa_id == empresa_id)).first()
    if loc_count:
        raise HTTPException(status_code=400, detail="No se puede eliminar: la empresa tiene locales asignados")
    session.delete(empresa)
    session.commit()


@router.patch("/empresas/{empresa_id}/toggle", response_model=EmpresaRead)
def toggle_empresa(
    empresa_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    empresa.activo = not empresa.activo
    session.commit()
    session.refresh(empresa)
    return empresa


# ── Locales ───────────────────────────────────────────────────────────────

@router.get("/locales", response_model=list[LocalRead])
def list_locales(
    empresa_id: int | None = None,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol == "superadmin":
        query = select(Local)
        if empresa_id:
            query = query.where(Local.empresa_id == empresa_id)
    else:
        query = select(Local).where(Local.empresa_id == current_user.empresa_id)
    return session.exec(query).all()


@router.post("/locales", response_model=LocalRead, status_code=status.HTTP_201_CREATED)
def create_local(
    body: LocalCreate,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    local = Local(**body.model_dump())
    session.add(local)
    session.commit()
    session.refresh(local)
    return local


@router.put("/locales/{local_id}", response_model=LocalRead)
def update_local(
    local_id: int,
    body: LocalUpdate,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(local, field, value)
    session.commit()
    session.refresh(local)
    return local


@router.patch("/locales/{local_id}/toggle", response_model=LocalRead)
def toggle_local(
    local_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    local.activo = not local.activo
    session.commit()
    session.refresh(local)
    return local


@router.delete("/locales/{local_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_local(
    local_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    session.delete(local)
    session.commit()


# ── Usuarios ──────────────────────────────────────────────────────────────

@router.get("/usuarios", response_model=list[UsuarioRead])
def list_usuarios(
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    if current_user.rol == "superadmin":
        query = select(Usuario)
    else:
        query = select(Usuario).where(Usuario.empresa_id == current_user.empresa_id)
    users = session.exec(query).all()
    show_pw = current_user.rol == "superadmin"
    return [_usuario_to_read(u, session, include_password=show_pw) for u in users]


@router.post("/usuarios", response_model=UsuarioRead, status_code=status.HTTP_201_CREATED)
def create_usuario(
    body: UsuarioCreate,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    if current_user.rol == "gerente":
        if body.rol not in GERENTE_ALLOWED_ROLES:
            raise HTTPException(status_code=403, detail="Solo puedes crear usuarios con rol encargado o usuario")
        body.empresa_id = current_user.empresa_id

    if body.rol not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {VALID_ROLES}")
    existing = session.exec(select(Usuario).where(Usuario.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    user = Usuario(
        empresa_id=body.empresa_id,
        email=body.email,
        nombre=body.nombre,
        hashed_password=hash_password(body.password),
        plain_password=body.password,
        rol=body.rol,
    )
    session.add(user)
    session.flush()

    for local_id in body.local_ids:
        session.add(UsuarioLocal(usuario_id=user.id, local_id=local_id))

    session.commit()
    session.refresh(user)
    return _usuario_to_read(user, session)


@router.put("/usuarios/{usuario_id}", response_model=UsuarioRead)
def update_usuario(
    usuario_id: int,
    body: UsuarioUpdate,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    user = session.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    _assert_can_manage(current_user, user)

    if user.rol == "superadmin" and body.rol and body.rol != "superadmin":
        raise HTTPException(status_code=400, detail="No se puede cambiar el rol del superadmin")

    if current_user.rol == "gerente" and body.rol and body.rol not in GERENTE_ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="No puedes asignar este rol")

    update_data = body.model_dump(exclude_unset=True)
    local_ids = update_data.pop("local_ids", None)
    password = update_data.pop("password", None)

    for field, value in update_data.items():
        setattr(user, field, value)

    if password:
        user.hashed_password = hash_password(password)
        user.plain_password = password

    if local_ids is not None:
        existing_ul = session.exec(
            select(UsuarioLocal).where(UsuarioLocal.usuario_id == usuario_id)
        ).all()
        for ul in existing_ul:
            session.delete(ul)
        session.flush()
        for lid in local_ids:
            session.add(UsuarioLocal(usuario_id=usuario_id, local_id=lid))

    session.commit()
    session.refresh(user)
    return _usuario_to_read(user, session)


@router.patch("/usuarios/{usuario_id}/toggle", response_model=UsuarioRead)
def toggle_usuario(
    usuario_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    user = session.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.rol == "superadmin":
        raise HTTPException(status_code=400, detail="No se puede desactivar al superadmin")
    _assert_can_manage(current_user, user)
    user.activo = not user.activo
    session.commit()
    session.refresh(user)
    return _usuario_to_read(user, session)


@router.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_usuario(
    usuario_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    user = session.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.rol == "superadmin":
        raise HTTPException(status_code=400, detail="No se puede eliminar al superadmin")
    _assert_can_manage(current_user, user)
    existing_ul = session.exec(
        select(UsuarioLocal).where(UsuarioLocal.usuario_id == usuario_id)
    ).all()
    for ul in existing_ul:
        session.delete(ul)
    session.flush()
    session.delete(user)
    session.commit()
