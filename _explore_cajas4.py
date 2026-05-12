"""Explorar estructura de cajas_registro."""
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

    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'cajas_registro'
        ORDER BY ordinal_position
    """)
    print("=== Columnas de 'cajas_registro' ===")
    for r in cur.fetchall():
        print(f"  {r['column_name']}: {r['data_type']}")

    cur.execute("""
        SELECT * FROM cajas_registro ORDER BY id DESC LIMIT 5
    """)
    rows = cur.fetchall()
    if rows:
        print("\n=== Filas recientes ===")
        for r in rows:
            print(dict(r))

    cur.execute("SELECT codigo, nombre FROM cajas ORDER BY codigo LIMIT 10")
    print("\n=== Cajas ===")
    for r in cur.fetchall():
        print(f"  codigo={r['codigo']}, nombre={r['nombre']}")

    cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY codigo LIMIT 15")
    print("\n=== Formas de pago ===")
    for r in cur.fetchall():
        print(f"  codigo={r['codigo']}, nombre={r['nombre']}")

    conn.close()
