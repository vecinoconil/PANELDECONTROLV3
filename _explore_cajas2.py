"""Explorar estructura de tabla cajas."""
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

    # Columnas de cajas
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'cajas'
        ORDER BY ordinal_position
    """)
    print("=== Columnas de 'cajas' ===")
    for r in cur.fetchall():
        print(f"  {r['column_name']}: {r['data_type']} (nullable={r['is_nullable']})")

    # Primeras filas
    cur.execute("SELECT * FROM cajas LIMIT 10")
    rows = cur.fetchall()
    print(f"\n=== Datos de cajas ({len(rows)} filas) ===")
    for r in rows:
        print(dict(r))

    # Columnas de cajas_registro
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'cajas_registro'
        ORDER BY ordinal_position
    """)
    print("\n=== Columnas de 'cajas_registro' ===")
    for r in cur.fetchall():
        print(f"  {r['column_name']}: {r['data_type']}")

    # cajabanco en ventas_entregas → qué es
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'ventas_entregas'
        ORDER BY ordinal_position
    """)
    print("\n=== Columnas de 'ventas_entregas' ===")
    for r in cur.fetchall():
        print(f"  {r['column_name']}: {r['data_type']}")

    conn.close()
