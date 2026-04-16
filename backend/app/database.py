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
    from app.models.app_models import Empresa, Local, Usuario, UsuarioLocal  # noqa: F401
    SQLModel.metadata.create_all(engine)


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
