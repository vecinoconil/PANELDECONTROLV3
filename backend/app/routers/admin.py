import io
import json
import zipfile

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
import psycopg2

from app.auth.dependencies import require_superadmin, require_gerente_or_above, get_current_user
from app.auth.service import hash_password
from app.database import get_session
from app.models.app_models import Empresa, Local, Usuario, UsuarioLocal
from app.schemas import (
    EmpresaCreate, EmpresaRead, EmpresaUpdate,
    LocalCreate, LocalRead, LocalUpdate,
    UsuarioCreate, UsuarioRead, UsuarioUpdate,
)
from app.services.email import send_credentials
from app.services.pg_connection import get_pg_connection

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
    data["permisos"] = json.loads(data.get("permisos") or "[]")
    data["fpagos_autoventa"] = json.loads(data.get("fpagos_autoventa") or "[]")
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


@router.post("/empresas/test-connection")
def test_pg_connection(
    pg_host: str = Body(...),
    pg_port: int = Body(5026),
    pg_name: str = Body(...),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    try:
        conn = psycopg2.connect(
            host=pg_host,
            port=pg_port,
            dbname=pg_name,
            user=pg_user,
            password=pg_password,
            connect_timeout=5,
        )
        conn.close()
        return {"ok": True, "message": "Conexión exitosa"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.get("/empresas/{empresa_id}/frpc-download")
def download_frpc_installer(
    empresa_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if not empresa.usar_tunnel or not empresa.tunnel_port:
        raise HTTPException(status_code=400, detail="Esta empresa no tiene túnel configurado")

    frpc_path = r"C:\frp\frpc.exe"
    try:
        with open(frpc_path, "rb") as f:
            frpc_bytes = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="frpc.exe no encontrado en el servidor")

    # frpc.toml config
    frpc_toml = f"""serverAddr = "panelv3.solba.com"
serverPort = 7000
auth.token = "SolbaFRP2024!"

[[proxies]]
name = "bd-{empresa.nombre.lower().replace(' ', '-')}-{empresa_id}"
type = "tcp"
localIP = "127.0.0.1"
localPort = {empresa.pg_port or 5026}
remotePort = {empresa.tunnel_port}
"""

    # install.bat — instala frpc como tarea programada de Windows
    install_bat = f"""@echo off
setlocal
set "DIR=%~dp0"
set "FRPC=%DIR%frpc.exe"
set "CFG=%DIR%frpc.toml"

echo Instalando tunel FRP para {empresa.nombre}...

:: Eliminar tarea anterior si existe
schtasks /delete /tn "frpc-solba" /f >nul 2>&1

:: Crear tarea programada que arranca al inicio como SYSTEM
schtasks /create /tn "frpc-solba" /tr "\"%FRPC%\" -c \"%CFG%\"" /sc onstart /ru SYSTEM /rl HIGHEST /f

:: Arrancar ahora
schtasks /run /tn "frpc-solba"

echo.
echo Tunel instalado y arrancado correctamente.
echo Puerto remoto asignado: {empresa.tunnel_port}
echo.
pause
"""

    # uninstall.bat
    uninstall_bat = """@echo off
schtasks /end /tn "frpc-solba" >nul 2>&1
schtasks /delete /tn "frpc-solba" /f >nul 2>&1
echo Tunel desinstalado.
pause
"""

    # Build zip in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("frpc.toml", frpc_toml)
        zf.writestr("instalar.bat", install_bat)
        zf.writestr("desinstalar.bat", uninstall_bat)
        zf.write(frpc_path, "frpc.exe")
    buf.seek(0)

    nombre_safe = empresa.nombre.replace(" ", "_").replace("/", "-")
    filename = f"tunel_frp_{nombre_safe}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
        permisos=json.dumps(body.permisos),
        agente_autoventa=body.agente_autoventa,
        serie_autoventa=body.serie_autoventa,
        autoventa_modifica_precio=body.autoventa_modifica_precio,
        fpagos_autoventa=json.dumps(body.fpagos_autoventa),
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
    if "permisos" in update_data:
        update_data["permisos"] = json.dumps(update_data["permisos"])
    if "fpagos_autoventa" in update_data:
        update_data["fpagos_autoventa"] = json.dumps(update_data["fpagos_autoventa"] or [])

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


@router.post("/usuarios/{usuario_id}/send-credentials", status_code=status.HTTP_200_OK)
def send_user_credentials(
    usuario_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    user = session.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    _assert_can_manage(current_user, user)
    if not user.plain_password:
        raise HTTPException(status_code=400, detail="Este usuario no tiene contraseña almacenada")
    try:
        send_credentials(user.email, user.nombre, user.plain_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {e}")
    return {"ok": True, "message": f"Credenciales enviadas a {user.email}"}


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


# ── PG data helpers (for admin config) ───────────────────────────────────

@router.get("/pg-data/formaspago")
def pg_formaspago(
    empresa_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Return formas de pago from business PG for a given empresa."""
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if current_user.rol == "gerente" and empresa.id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY codigo")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando a BD: {e}")
    finally:
        if conn:
            conn.close()


@router.get("/pg-data/agentes")
def pg_agentes(
    empresa_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Return agents list from business PG for a given empresa."""
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if current_user.rol == "gerente" and empresa.id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM agentes WHERE baja = false ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando a BD: {e}")
    finally:
        if conn:
            conn.close()


@router.get("/pg-data/series")
def pg_series(
    empresa_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Return series list from business PG for a given empresa."""
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if current_user.rol == "gerente" and empresa.id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT serie FROM series WHERE obsoleta = false ORDER BY serie")
        return [{"serie": r["serie"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando a BD: {e}")
    finally:
        if conn:
            conn.close()
