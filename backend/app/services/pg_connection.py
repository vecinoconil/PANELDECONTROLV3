"""
Service to obtain a read-only PostgreSQL connection for a given Empresa.
Each empresa stores its own PG credentials (host, port, db, user, password).
"""
import psycopg2
from psycopg2.extras import RealDictCursor

from app.models.app_models import Empresa


def get_pg_connection(empresa: Empresa):
    """Return a psycopg2 connection (RealDictCursor) for the empresa's business DB."""
    if not empresa.pg_host or not empresa.pg_name:
        raise ValueError(f"Empresa '{empresa.nombre}' no tiene configurada la conexión PostgreSQL")
    return psycopg2.connect(
        host=empresa.pg_host,
        port=empresa.pg_port or 5026,
        dbname=empresa.pg_name,
        user=empresa.pg_user,
        password=empresa.pg_password,
        connect_timeout=10,
        cursor_factory=RealDictCursor,
    )
