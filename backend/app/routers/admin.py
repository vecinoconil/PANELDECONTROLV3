import io
import json
import os
import shutil
import subprocess
import zipfile
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, status, UploadFile, File
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
    UsuarioCreate, UsuarioRead, UsuarioUpdate, normalize_permisos,
)
from app.services.email import send_credentials
from app.services.pg_connection import get_pg_connection

router = APIRouter()

VALID_ROLES = {"superadmin", "gerente", "encargado", "usuario", "distribuidor"}
GERENTE_ALLOWED_ROLES = {"encargado", "usuario", "distribuidor"}


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
    data["permisos"] = normalize_permisos(data.get("permisos") or "{}")
    data["tipodocs_autoventa"] = json.loads(data.get("tipodocs_autoventa") or "[]")
    raw_se = data.get("serie_expediciones") or "[]"
    try:
        parsed = json.loads(raw_se)
        data["serie_expediciones"] = parsed if isinstance(parsed, list) else [parsed]
    except (json.JSONDecodeError, TypeError):
        # Valor antiguo: string plano → convertir a lista de un elemento
        data["serie_expediciones"] = [raw_se] if raw_se and raw_se != "[]" else []
    if not include_password:
        data.pop("plain_password", None)
    return UsuarioRead(**data)


# ── Empresas ──────────────────────────────────────────────────────────────

@router.get("/empresas", response_model=list[EmpresaRead])
def list_empresas(
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    if current_user.rol == "superadmin":
        return session.exec(select(Empresa)).all()
    # Gerente: solo su propia empresa
    empresa = session.get(Empresa, current_user.empresa_id)
    return [empresa] if empresa else []


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
    # watchdog.bat — arranca frpc solo si no está ya en ejecución
    watchdog_bat = r"""@echo off
tasklist /fi "IMAGENAME eq frpc.exe" 2>nul | find /i "frpc.exe" >nul 2>&1
if %ERRORLEVEL% == 0 exit /b 0
set "DIR=%~dp0"
start /b "" "%DIR%frpc.exe" -c "%DIR%frpc.toml"
"""

    install_bat = f"""@echo off
setlocal
set "DIR=%~dp0"
set "WATCHDOG=%DIR%watchdog.bat"

:: Verificar permisos de administrador y auto-elevar si es necesario
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

echo Instalando tunel FRP para {empresa.nombre}...

:: Eliminar tareas anteriores si existen
schtasks /delete /tn "frpc-solba" /f >nul 2>&1
schtasks /delete /tn "frpc-solba-watch" /f >nul 2>&1

:: Tarea al inicio del sistema
schtasks /create /tn "frpc-solba" /tr "cmd /c \\"%WATCHDOG%\\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
if %errorLevel% NEQ 0 (
    echo Error: No se pudo crear la tarea de inicio. Codigo: %errorLevel%
    pause
    exit /b 1
)

:: Watchdog cada 15 minutos (reinicia el tunel si se ha cerrado)
schtasks /create /tn "frpc-solba-watch" /tr "cmd /c \\"%WATCHDOG%\\"" /sc minute /mo 15 /ru SYSTEM /rl HIGHEST /f
if %errorLevel% NEQ 0 (
    echo Error: No se pudo crear la tarea watchdog. Codigo: %errorLevel%
    pause
    exit /b 1
)

:: Arrancar ahora
schtasks /run /tn "frpc-solba"

echo.
echo Tunel instalado y arrancado correctamente.
echo Puerto remoto asignado: {empresa.tunnel_port}
echo El watchdog revisara el tunel cada 15 minutos automaticamente.
echo.
pause
"""

    # uninstall.bat
    uninstall_bat = """@echo off
taskkill /f /im frpc.exe >nul 2>&1
schtasks /end /tn "frpc-solba" >nul 2>&1
schtasks /delete /tn "frpc-solba" /f >nul 2>&1
schtasks /end /tn "frpc-solba-watch" >nul 2>&1
schtasks /delete /tn "frpc-solba-watch" /f >nul 2>&1
echo Tunel desinstalado.
pause
"""

    # Build zip in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("frpc.toml", frpc_toml)
        zf.writestr("instalar.bat", install_bat)
        zf.writestr("desinstalar.bat", uninstall_bat)
        zf.writestr("watchdog.bat", watchdog_bat)
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


@router.patch("/locales/{local_id}/pasar-definitiva", response_model=LocalRead)
def pasar_local_definitiva(
    local_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    """Convierte un local de prueba a definitiva (solo superadmin)."""
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    if local.tipo == "definitiva":
        raise HTTPException(status_code=400, detail="El local ya es definitivo")
    local.tipo = "definitiva"
    local.fecha_definitiva = datetime.utcnow()
    session.commit()
    session.refresh(local)
    return local


@router.patch("/locales/{local_id}/toggle-asistente", response_model=LocalRead)
def toggle_asistente_ia(
    local_id: int,
    session: Session = Depends(get_session),
    _: Usuario = Depends(require_superadmin),
):
    """Activa/desactiva el Asistente IA para un local (solo superadmin)."""
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    local.asistente_ia = not local.asistente_ia
    session.commit()
    session.refresh(local)
    return local


@router.patch("/locales/{local_id}/toggle-portal", response_model=LocalRead)
def toggle_portal_local(
    local_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Activa/desactiva el Portal de Clientes para un local (superadmin o gerente)."""
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    if current_user.rol == "gerente" and local.empresa_id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a este local")
    local.portal_activo = not local.portal_activo
    session.commit()
    session.refresh(local)
    return local


# Directorio donde se almacenan los FRX subidos
_FRX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "frx")


@router.post("/locales/{local_id}/frx", response_model=LocalRead)
async def upload_frx(
    local_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Sube un fichero .frx (FastReport) como plantilla de facturas para el local."""
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    if current_user.rol == "gerente" and local.empresa_id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a este local")

    if not file.filename or not file.filename.lower().endswith(".frx"):
        raise HTTPException(status_code=400, detail="Solo se permiten ficheros .frx")

    os.makedirs(_FRX_DIR, exist_ok=True)

    # Nombre seguro: frx_<local_id>.frx (sobrescribe el anterior)
    dest_filename = f"frx_{local_id}.frx"
    dest_path = os.path.join(_FRX_DIR, dest_filename)

    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)

    local.frx_factura = dest_filename
    session.commit()
    session.refresh(local)
    return local


@router.delete("/locales/{local_id}/frx", response_model=LocalRead)
def delete_frx(
    local_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Elimina la plantilla FRX del local (vuelve a usar la predeterminada)."""
    local = session.get(Local, local_id)
    if not local:
        raise HTTPException(status_code=404, detail="Local no encontrado")
    if current_user.rol == "gerente" and local.empresa_id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a este local")

    if local.frx_factura:
        path = os.path.join(_FRX_DIR, local.frx_factura)
        if os.path.isfile(path):
            os.remove(path)
        local.frx_factura = None
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
        permisos=json.dumps(normalize_permisos(body.permisos)),
        agente_autoventa=body.agente_autoventa,
        serie_autoventa=body.serie_autoventa,
        autoventa_modifica_precio=body.autoventa_modifica_precio,
        tipodocs_autoventa=json.dumps(body.tipodocs_autoventa),
        caja_autoventa=body.caja_autoventa,
        almacen_autoventa=body.almacen_autoventa,
        fpago_autoventa=body.fpago_autoventa,
        solo_clientes_agente=body.solo_clientes_agente,
        precargar_historial_autoventa=body.precargar_historial_autoventa,
        serie_expediciones=json.dumps(body.serie_expediciones or []),
        caja_reparto=body.caja_reparto,
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
        update_data["permisos"] = json.dumps(normalize_permisos(update_data["permisos"]))
    if "tipodocs_autoventa" in update_data:
        update_data["tipodocs_autoventa"] = json.dumps(update_data["tipodocs_autoventa"] or [])
    if "serie_expediciones" in update_data:
        update_data["serie_expediciones"] = json.dumps(update_data["serie_expediciones"] or [])
    # caja_autoventa y fpago_autoventa son int o None, se guardan directamente

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
        cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando a BD: {e}")
    finally:
        if conn:
            conn.close()


@router.get("/pg-data/cajas")
def pg_cajas(
    empresa_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Return active cajas from business PG for a given empresa."""
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if current_user.rol == "gerente" and empresa.id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM cajas WHERE inactiva = false ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando a BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Gestión de Bases de Datos (solo superadmin) ───────────────────────────

import re as _re

def _pg_direct(host: str, port: int, user: str, password: str, dbname: str = "postgres"):
    from psycopg2.extras import RealDictCursor
    conn = psycopg2.connect(
        host=host, port=port, dbname=dbname,
        user=user, password=password,
        connect_timeout=8,
        cursor_factory=RealDictCursor,
    )
    return conn


@router.post("/pgserver/databases")
def pgserver_list_databases(
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """Lista todas las bases de datos (no templates) de un servidor PostgreSQL."""
    conn = None
    try:
        conn = _pg_direct(pg_host, pg_port, pg_user, pg_password)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("""
            SELECT d.datname,
                   pg_catalog.pg_get_userbyid(d.datdba) AS owner,
                   pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
                   d.datcollate
            FROM pg_catalog.pg_database d
            WHERE d.datistemplate = false
            ORDER BY d.datname
        """)
        return [
            {
                "datname": r["datname"],
                "owner": r["owner"],
                "encoding": r["encoding"],
                "collate": r["datcollate"],
            }
            for r in cur.fetchall()
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando al servidor: {e}")
    finally:
        if conn:
            conn.close()


@router.post("/pgserver/{dbname}/users")
def pgserver_list_users(
    dbname: str,
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """Lista roles/usuarios con sus privilegios en una base de datos concreta."""
    conn = None
    try:
        conn = _pg_direct(pg_host, pg_port, pg_user, pg_password, dbname=dbname)
        cur = conn.cursor()

        # ACL de la base de datos
        cur.execute("SELECT datacl, pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = %s", (dbname,))
        db_row = cur.fetchone()
        datacl = db_row["datacl"] if db_row else None
        db_owner = db_row["owner"] if db_row else None
        datacl_str = str(datacl) if datacl else None

        # Roles con acceso explícito en el ACL de la BD
        acl_roles: set[str] = set()
        if datacl:
            for entry in str(datacl).strip("{}").split(","):
                m = _re.match(r'^"?([^"=]+)"?=', entry)
                if m and m.group(1):
                    acl_roles.add(m.group(1))

        # Roles que poseen objetos dentro de esta BD
        cur.execute("""
            SELECT DISTINCT r.rolname
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
            WHERE r.rolname NOT LIKE 'pg_%%'
        """)
        obj_owners = {r["rolname"] for r in cur.fetchall()}

        # Unión: superusers + dueño BD + roles con ACL explícito + dueños de objetos
        cur.execute("""
            SELECT r.rolname,
                   r.rolsuper,
                   r.rolinherit,
                   r.rolcreaterole,
                   r.rolcreatedb,
                   r.rolcanlogin,
                   r.rolreplication,
                   r.rolbypassrls,
                   r.rolconnlimit,
                   ARRAY(
                       SELECT m.rolname FROM pg_auth_members am
                       JOIN pg_roles m ON m.oid = am.roleid
                       WHERE am.member = r.oid
                   ) AS member_of
            FROM pg_roles r
            WHERE r.rolname NOT LIKE 'pg_%%'
            ORDER BY r.rolcanlogin DESC, r.rolname
        """)
        all_roles = [dict(r) for r in cur.fetchall()]

        result = []
        for r in all_roles:
            name = r["rolname"]
            is_super = bool(r["rolsuper"])
            # Incluir solo si: superusuario, dueño de la BD, tiene ACL explícito o posee objetos
            if not is_super and name != db_owner and name not in acl_roles and name not in obj_owners:
                continue
            result.append({
                "rolname": name,
                "superuser": is_super,
                "can_login": bool(r["rolcanlogin"]),
                "replication": bool(r["rolreplication"]),
                "create_role": bool(r["rolcreaterole"]),
                "create_db": bool(r["rolcreatedb"]),
                "bypass_rls": bool(r["rolbypassrls"]),
                "conn_limit": r["rolconnlimit"],
                "member_of": list(r["member_of"] or []),
                "db_acl": datacl_str,
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")
    finally:
        if conn:
            conn.close()


@router.post("/pgserver/{dbname}/create-user")
def pgserver_create_user(
    dbname: str,
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    new_username: str = Body(...),
    new_password: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """
    Crea un usuario con acceso total a la base de datos indicada.
    - LOGIN + REPLICATION (para pg_dump backups)
    - GRANT ALL PRIVILEGES ON DATABASE
    - En la BD: GRANT ALL en schema public, tablas, secuencias, funciones existentes
    - ALTER DEFAULT PRIVILEGES para objetos futuros
    - Hereda del owner actual del schema para ALTER TABLE en objetos existentes
    """
    # Validar nombre: solo letras, números y guión bajo
    if not _re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', new_username):
        raise HTTPException(status_code=400, detail="Nombre de usuario inválido (solo letras, números y _)")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    conn_server = None
    conn_db = None
    try:
        # 1. Conectar al servidor (postgres) para crear el rol
        conn_server = _pg_direct(pg_host, pg_port, pg_user, pg_password)
        conn_server.autocommit = True
        cur_s = conn_server.cursor()

        # Comprobar si ya existe
        cur_s.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (new_username,))
        if cur_s.fetchone():
            raise HTTPException(status_code=409, detail=f"El usuario '{new_username}' ya existe en el servidor")

        # Crear rol con atributos útiles (sin superuser)
        cur_s.execute(
            f"CREATE ROLE {psycopg2.extensions.quote_ident(new_username, cur_s)} "
            f"WITH LOGIN REPLICATION PASSWORD %s",
            (new_password,)
        )

        # ── Revocar CONNECT de PUBLIC en TODAS las BDs del servidor ──────────
        # En PostgreSQL no es posible revocar a un usuario concreto un privilegio
        # heredado de PUBLIC. La única forma de aislar BDs por cliente es revocar
        # CONNECT de PUBLIC globalmente y concederlo solo de forma explícita.
        cur_s.execute("""
            SELECT datname FROM pg_database
            WHERE datistemplate = false
        """)
        all_dbs = [r["datname"] for r in cur_s.fetchall()]
        for db in all_dbs:
            db_q = psycopg2.extensions.quote_ident(db, cur_s)
            cur_s.execute(f"REVOKE CONNECT ON DATABASE {db_q} FROM PUBLIC")

        # ── Conceder acceso solo a la BD objetivo ─────────────────────────────
        uid_s = psycopg2.extensions.quote_ident(new_username, cur_s)
        db_q  = psycopg2.extensions.quote_ident(dbname, cur_s)
        cur_s.execute(f"GRANT ALL PRIVILEGES ON DATABASE {db_q} TO {uid_s}")

        # CONNECT en DBs de mantenimiento para que herramientas de backup (pg_dump, ERP) puedan conectar
        for _maint in ("postgres", "template1"):
            try:
                _mq = psycopg2.extensions.quote_ident(_maint, cur_s)
                cur_s.execute(f"GRANT CONNECT ON DATABASE {_mq} TO {uid_s}")
            except Exception:
                pass

        conn_server.close()
        conn_server = None

        # 2. Conectar a la BD concreta para dar permisos dentro
        conn_db = _pg_direct(pg_host, pg_port, pg_user, pg_password, dbname=dbname)
        conn_db.autocommit = True
        cur_d = conn_db.cursor()

        uid = psycopg2.extensions.quote_ident(new_username, cur_d)

        # Schema public
        cur_d.execute(f"GRANT ALL ON SCHEMA public TO {uid}")
        cur_d.execute(f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {uid}")
        cur_d.execute(f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {uid}")
        cur_d.execute(f"GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO {uid}")
        cur_d.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {uid}")
        cur_d.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {uid}")
        cur_d.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO {uid}")
        try:
            cur_d.execute(f"GRANT pg_read_all_data TO {uid}")
        except Exception:
            pass  # PG < 14 no tiene este rol; ignorar

        # Transferir propiedad de todas las tablas y secuencias al usuario
        # (necesario para ALTER TABLE, CREATE INDEX, DROP, etc.)
        cur_d.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        for row in cur_d.fetchall():
            t_q = psycopg2.extensions.quote_ident(row["tablename"], cur_d)
            try:
                cur_d.execute(f"ALTER TABLE public.{t_q} OWNER TO {uid}")
            except Exception:
                pass
        cur_d.execute("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'")
        for row in cur_d.fetchall():
            s_q = psycopg2.extensions.quote_ident(row["sequence_name"], cur_d)
            try:
                cur_d.execute(f"ALTER SEQUENCE public.{s_q} OWNER TO {uid}")
            except Exception:
                pass

        # Large objects: pg_read_all_data NO los cubre; hay que granar SELECT uno a uno
        # (necesario para que pg_dump/ERP pueda exportarlos)
        try:
            cur_d.execute("SELECT oid FROM pg_catalog.pg_largeobject_metadata")
            for lo_row in cur_d.fetchall():
                try:
                    cur_d.execute(f"GRANT SELECT ON LARGE OBJECT {lo_row['oid']} TO {uid}")
                except Exception:
                    pass
        except Exception:
            pass

        return {
            "ok": True,
            "message": (
                f"Usuario '{new_username}' creado con acceso exclusivo a '{dbname}'. "
                f"CONNECT en postgres/template1 para backup. "
                f"CONNECT revocado de PUBLIC en {len(all_dbs)} base(s) del servidor."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando usuario: {e}")
    finally:
        if conn_server:
            conn_server.close()
        if conn_db:
            conn_db.close()


@router.post("/pgserver/repair-user")
def pgserver_repair_user(
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    username: str = Body(...),
    dbname: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """
    Reasigna todos los permisos necesarios a un usuario existente:
    - pg_read_all_data (para pg_dump sin superuser)
    - ALL en tablas, secuencias, funciones del schema public
    - DEFAULT PRIVILEGES para objetos futuros
    """
    conn_db = None
    try:
        conn_db = _pg_direct(pg_host, pg_port, pg_user, pg_password, dbname=dbname)
        conn_db.autocommit = True
        cur_d = conn_db.cursor()
        uid = psycopg2.extensions.quote_ident(username, cur_d)

        cur_d.execute(f"GRANT ALL ON SCHEMA public TO {uid}")
        cur_d.execute(f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {uid}")
        cur_d.execute(f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {uid}")
        cur_d.execute(f"GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO {uid}")
        cur_d.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {uid}")
        cur_d.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {uid}")
        cur_d.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO {uid}")
        try:
            cur_d.execute(f"GRANT pg_read_all_data TO {uid}")
        except Exception:
            pass

        # Transferir propiedad de todas las tablas y secuencias al usuario
        # (necesario para ALTER TABLE, CREATE INDEX, DROP, etc.)
        cur_d.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        for row in cur_d.fetchall():
            t_q = psycopg2.extensions.quote_ident(row["tablename"], cur_d)
            try:
                cur_d.execute(f"ALTER TABLE public.{t_q} OWNER TO {uid}")
            except Exception:
                pass
        cur_d.execute("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'")
        for row in cur_d.fetchall():
            s_q = psycopg2.extensions.quote_ident(row["sequence_name"], cur_d)
            try:
                cur_d.execute(f"ALTER SEQUENCE public.{s_q} OWNER TO {uid}")
            except Exception:
                pass

        # Large objects: pg_read_all_data NO los cubre; hay que granar SELECT uno a uno
        try:
            cur_d.execute("SELECT oid FROM pg_catalog.pg_largeobject_metadata")
            for lo_row in cur_d.fetchall():
                try:
                    cur_d.execute(f"GRANT SELECT ON LARGE OBJECT {lo_row['oid']} TO {uid}")
                except Exception:
                    pass
        except Exception:
            pass
        conn_db.close()
        conn_db = None
        # CONNECT en postgres y template1 para backup tools y pg_dump
        conn_srv = _pg_direct(pg_host, pg_port, pg_user, pg_password)
        conn_srv.autocommit = True
        cur_s2 = conn_srv.cursor()
        uid2 = psycopg2.extensions.quote_ident(username, cur_s2)
        for maint_db in ("postgres", "template1"):
            try:
                mq = psycopg2.extensions.quote_ident(maint_db, cur_s2)
                cur_s2.execute(f"GRANT CONNECT ON DATABASE {mq} TO {uid2}")
            except Exception:
                pass
        conn_srv.close()
        return {"ok": True, "message": f"Permisos de '{username}' reparados en '{dbname}' (incluye propiedad de tablas para ALTER TABLE)"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reparando permisos: {e}")
    finally:
        if conn_db:
            conn_db.close()


@router.post("/pgserver/delete-user")
def pgserver_delete_user(
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    username: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """Elimina un rol de PostgreSQL del servidor, reasignando primero todos sus objetos."""
    if not _re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', username):
        raise HTTPException(status_code=400, detail="Nombre de usuario inválido")

    conn = None
    try:
        conn = _pg_direct(pg_host, pg_port, pg_user, pg_password)
        conn.autocommit = True
        cur = conn.cursor()

        # Comprobar que existe y no es superusuario
        cur.execute("SELECT rolsuper FROM pg_roles WHERE rolname = %s", (username,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"El usuario '{username}' no existe")
        if row["rolsuper"]:
            raise HTTPException(status_code=403, detail="No se puede eliminar un superusuario")

        uid = psycopg2.extensions.quote_ident(username, cur)

        # Obtener el usuario admin actual (quien ejecuta) para reasignar propiedad
        cur.execute("SELECT current_user AS cu")
        admin_uid = psycopg2.extensions.quote_ident(cur.fetchone()["cu"], cur)

        # 1. Si el usuario es dueño de alguna BD, cambiar el owner al admin
        cur.execute("""
            SELECT datname FROM pg_database
            WHERE datistemplate = false
              AND pg_catalog.pg_get_userbyid(datdba) = %s
        """, (username,))
        owned_dbs = [r["datname"] for r in cur.fetchall()]
        for db in owned_dbs:
            db_q = psycopg2.extensions.quote_ident(db, cur)
            cur.execute(f"ALTER DATABASE {db_q} OWNER TO {admin_uid}")

        # 2. En cada BD: REASSIGN OWNED + DROP OWNED + REVOKE
        cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false")
        all_dbs = [r["datname"] for r in cur.fetchall()]

        conn_db = None
        for db in all_dbs:
            db_q = psycopg2.extensions.quote_ident(db, cur)
            # Revocar privilegios de BD
            try:
                cur.execute(f"REVOKE ALL PRIVILEGES ON DATABASE {db_q} FROM {uid}")
            except Exception:
                pass
            # Conectar a la BD para reasignar objetos internos
            # REASSIGN OWNED y DROP OWNED son seguros aunque no haya nada que reasignar
            try:
                conn_db = _pg_direct(pg_host, pg_port, pg_user, pg_password, dbname=db)
                conn_db.autocommit = True
                cur_d = conn_db.cursor()
                cur_d.execute(f"REASSIGN OWNED BY {uid} TO {admin_uid}")
                cur_d.execute(f"DROP OWNED BY {uid}")
            except Exception:
                pass
            finally:
                if conn_db:
                    conn_db.close()
                conn_db = None

        # 3. DROP ROLE
        cur.execute(f"DROP ROLE {uid}")

        return {"ok": True, "message": f"Usuario '{username}' eliminado correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando usuario: {e}")
    finally:
        if conn:
            conn.close()


# Rutas posibles de pg_dump según la versión instalada
_PG_DUMP_CANDIDATES = [
    r"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\13\bin\pg_dump.exe",
]

def _find_pg_dump() -> str | None:
    for p in _PG_DUMP_CANDIDATES:
        if os.path.isfile(p):
            return p
    return shutil.which("pg_dump")


@router.post("/pgserver/{dbname}/get-db-version")
def pgserver_get_db_version(
    dbname: str,
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """Lee el campo version de la tabla db_version de una base de datos."""
    conn = None
    try:
        conn = _pg_direct(pg_host, pg_port, pg_user, pg_password, dbname=dbname)
        cur = conn.cursor()
        cur.execute("SELECT version FROM db_version LIMIT 1")
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Tabla db_version vacía")
        return {"version": row["version"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo db_version: {e}")
    finally:
        if conn:
            conn.close()


@router.post("/pgserver/{dbname}/set-db-version")
def pgserver_set_db_version(
    dbname: str,
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    new_version: str = Body(...),
    _: Usuario = Depends(require_superadmin),
):
    """Actualiza el campo version de la tabla db_version."""
    if not new_version or not new_version.strip():
        raise HTTPException(status_code=400, detail="La versión no puede estar vacía")
    conn = None
    try:
        conn = _pg_direct(pg_host, pg_port, pg_user, pg_password, dbname=dbname)
        conn.autocommit = False
        cur = conn.cursor()
        cur.execute("UPDATE db_version SET version = %s", (new_version.strip(),))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="No se encontró ningún registro en db_version para actualizar")
        conn.commit()
        return {"ok": True, "version": new_version.strip()}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error actualizando db_version: {e}")
    finally:
        if conn:
            conn.close()


@router.post("/pgserver/{dbname}/backup")
def pgserver_backup(
    dbname: str,
    pg_host: str = Body(...),
    pg_port: int = Body(5432),
    pg_user: str = Body(...),
    pg_password: str = Body(...),
    backup_user: str = Body(...),       # usuario con el que hacer el dump
    backup_password: str = Body(...),   # contraseña de ese usuario
    _: Usuario = Depends(require_superadmin),
):
    """
    Genera una copia de seguridad (pg_dump -Fc) de la BD indicada usando
    las credenciales del usuario cliente y la devuelve como descarga.
    """
    pg_dump = _find_pg_dump()
    if not pg_dump:
        raise HTTPException(
            status_code=500,
            detail="pg_dump no encontrado en el servidor. Instala PostgreSQL client tools."
        )

    env = os.environ.copy()
    env["PGPASSWORD"] = backup_password

    filename = f"{dbname}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.dump"

    try:
        result = subprocess.run(
            [
                pg_dump,
                "-h", pg_host,
                "-p", str(pg_port),
                "-U", backup_user,
                "-Fc",           # formato custom (comprimido, restaurable con pg_restore)
                "--no-password",
                dbname,
            ],
            capture_output=True,
            env=env,
            timeout=600,         # 10 min max
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="El backup tardó demasiado (timeout 10 min)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ejecutando pg_dump: {e}")

    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise HTTPException(status_code=500, detail=f"pg_dump falló: {stderr}")

    dump_bytes = result.stdout
    return StreamingResponse(
        io.BytesIO(dump_bytes),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/pg-data/almacenes")
def pg_almacenes(
    empresa_id: int,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(require_gerente_or_above),
):
    """Return almacenes from business PG for a given empresa."""
    empresa = session.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if current_user.rol == "gerente" and empresa.id != current_user.empresa_id:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM almacenes ORDER BY codigo")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error conectando a BD: {e}")
    finally:
        if conn:
            conn.close()
