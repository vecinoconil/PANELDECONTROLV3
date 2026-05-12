import sys; sys.path.insert(0, '.')
from app.database import engine
from app.models.app_models import Usuario
from sqlmodel import Session, select

with Session(engine) as s:
    user = s.exec(select(Usuario).where(Usuario.email=='admin@solba.com')).first()
    print('autoventa_modifica_precio:', repr(user.autoventa_modifica_precio))
    print('tipodocs_autoventa:', repr(user.tipodocs_autoventa))
    print('almacen_autoventa:', repr(user.almacen_autoventa))
    print('serie_expediciones:', repr(user.serie_expediciones))

    try:
        from app.schemas import UserMe, LocalInfo
        from app.schemas import normalize_permisos
        me = UserMe(
            id=user.id,
            email=user.email,
            nombre=user.nombre,
            rol=user.rol,
            empresa_id=user.empresa_id,
            empresa_nombre=None,
            locales=[],
            permisos=normalize_permisos(user.permisos or '{}'),
            agente_autoventa=user.agente_autoventa,
            serie_autoventa=user.serie_autoventa,
            autoventa_modifica_precio=user.autoventa_modifica_precio,
            tipodocs_autoventa=user.tipodocs_autoventa or '[]',
            caja_autoventa=user.caja_autoventa,
            almacen_autoventa=user.almacen_autoventa,
            serie_expediciones=user.serie_expediciones or '[]',
        )
        print('OK:', me.model_dump())
    except Exception as e:
        import traceback; traceback.print_exc()
