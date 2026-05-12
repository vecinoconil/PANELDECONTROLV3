import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))
from app.database import engine
from sqlalchemy import text
from app.schemas import UsuarioUpdate

# Estado actual
with engine.connect() as conn:
    r = conn.execute(text("SELECT id, nombre, precargar_historial_autoventa FROM usuarios WHERE id = 9")).fetchone()
    print("ANTES:", r)

# Simular lo que hace el endpoint update_usuario con un payload típico del frontend
payload = {
    "nombre": "Cristina Solba",
    "email": "solbainformatica@gmail.com",
    "rol": "superadmin",
    "empresa_id": 1,
    "agente_autoventa": 1,
    "serie_autoventa": "A",
    "autoventa_modifica_precio": True,
    "tipodocs_autoventa": [2, 4, 8],
    "precargar_historial_autoventa": False,
    "caja_autoventa": None,
    "fpago_autoventa": None,
    "almacen_autoventa": None,
    "solo_clientes_agente": False,
    "caja_reparto": None,
    "serie_expediciones": [],
}
body = UsuarioUpdate(**payload)
update_data = body.model_dump(exclude_unset=True)
print("update_data keys:", list(update_data.keys()))
print("precargar_historial_autoventa en update_data:", "precargar_historial_autoventa" in update_data, "=", update_data.get("precargar_historial_autoventa"))

# Simular el setattr
from app.models.app_models import Usuario
from sqlmodel import Session, select
with Session(engine) as session:
    user = session.get(Usuario, 9)
    print("user.precargar_historial_autoventa ANTES setattr:", user.precargar_historial_autoventa)
    for field, value in update_data.items():
        if field in ("local_ids", "password", "permisos"):
            continue
        if field == "tipodocs_autoventa":
            import json
            value = json.dumps(value or [])
        if field == "serie_expediciones":
            import json
            value = json.dumps(value or [])
        setattr(user, field, value)
    print("user.precargar_historial_autoventa DESPUES setattr:", user.precargar_historial_autoventa)
    session.commit()
    session.refresh(user)
    print("user.precargar_historial_autoventa DESPUES commit:", user.precargar_historial_autoventa)

with engine.connect() as conn:
    r = conn.execute(text("SELECT id, nombre, precargar_historial_autoventa FROM usuarios WHERE id = 9")).fetchone()
    print("DESPUES:", r)
