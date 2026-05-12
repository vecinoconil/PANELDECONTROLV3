"""Explorar tabla de cajas en PostgreSQL."""
import sys
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')

from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as session:
    empresa = session.exec(select(Empresa).where(Empresa.activo == True)).first()
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Buscar tablas relacionadas con caja
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name ILIKE '%caja%'
        ORDER BY table_name
    """)
    print("=== Tablas con 'caja' ===")
    for r in cur.fetchall():
        print(r['table_name'])

    # Columnas de cajasbancos si existe
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    """)
    all_tables = [r['table_name'] for r in cur.fetchall()]
    print("\n=== Todas las tablas ===")
    for t in all_tables:
        print(t)

    conn.close()
