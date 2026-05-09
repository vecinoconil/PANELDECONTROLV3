from sqlmodel import SQLModel, Session, create_engine
from app.config import settings

engine = create_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
)


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    """Create all tables on startup if they do not exist."""
    from app.models.app_models import Empresa, Local, Usuario, UsuarioLocal, Visita  # noqa: F401
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def _run_migrations():
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos VARCHAR(2000) DEFAULT '[]'"
        ))
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipodocs_autoventa VARCHAR(100) DEFAULT '[]'"
        ))
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS caja_autoventa INTEGER"
        ))
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS serie_expediciones VARCHAR(500)"
        ))
        try:
            conn.execute(text(
                "ALTER TABLE usuarios ALTER COLUMN serie_expediciones TYPE VARCHAR(500)"
            ))
        except Exception:
            pass  # SQLite no soporta ALTER COLUMN TYPE
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS almacen_autoventa INTEGER"
        ))
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fpago_autoventa INTEGER"
        ))
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS solo_clientes_agente BOOLEAN DEFAULT FALSE"
        ))
        # Locales: tipo prueba/definitiva y fechas
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS caja_reparto INTEGER"
        ))
        conn.execute(text(
            "ALTER TABLE locales ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'definitiva'"
        ))
        conn.execute(text(
            "ALTER TABLE locales ADD COLUMN IF NOT EXISTS fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ))
        conn.execute(text(
            "ALTER TABLE locales ADD COLUMN IF NOT EXISTS fecha_definitiva TIMESTAMP"
        ))
        conn.commit()


def create_superadmin():
    """Create the initial superadmin user if it doesn't exist."""
    from app.models.app_models import Usuario
    from app.auth.service import hash_password

    with Session(engine) as session:
        from sqlmodel import select
        existing = session.exec(
            select(Usuario).where(Usuario.email == settings.superadmin_email)
        ).first()
        if not existing:
            admin = Usuario(
                email=settings.superadmin_email,
                nombre="Administrador",
                hashed_password=hash_password(settings.superadmin_password),
                plain_password=settings.superadmin_password,
                rol="superadmin",
                activo=True,
            )
            session.add(admin)
            session.commit()
