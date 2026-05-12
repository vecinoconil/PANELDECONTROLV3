import os, sys
os.chdir('C:/PANELDECONTROLV3/backend')
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select

engine = create_engine(settings.database_url, echo=False)
with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

# Explore inventario tables
for table in ['inventario_cabeceras', 'inventario_lineas']:
    try:
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{table}' ORDER BY ordinal_position")
        cols = cur.fetchall()
        print(f"\n=== {table} ===")
        for c in cols:
            print(f"  {c['column_name']}: {c['data_type']}")
        cur.execute(f"SELECT COUNT(*) as n FROM {table}")
        print(f"  Rows: {cur.fetchone()['n']}")
        # Sample data
        cur.execute(f"SELECT * FROM {table} LIMIT 3")
        rows = cur.fetchall()
        for r in rows:
            print(f"  SAMPLE: {dict(r)}")
    except Exception as e:
        print(f"{table}: {e}")

# Explore articulos table structure
print("\n=== articulos (columns) ===")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos' ORDER BY ordinal_position")
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']}")

# Explore familias
print("\n=== familias (sample) ===")
cur.execute("SELECT * FROM familias LIMIT 5")
for r in cur.fetchall():
    print(f"  {dict(r)}")

# Explore subfamilias
try:
    print("\n=== subfamilias (sample) ===")
    cur.execute("SELECT * FROM subfamilias LIMIT 5")
    for r in cur.fetchall():
        print(f"  {dict(r)}")
except Exception as e:
    print(f"  subfamilias: {e}")

# Explore marcas
try:
    print("\n=== articulos_marcas (sample) ===")
    cur.execute("SELECT * FROM articulos_marcas LIMIT 5")
    for r in cur.fetchall():
        print(f"  {dict(r)}")
except Exception as e:
    print(f"  articulos_marcas: {e}")

# Explore articulos_stock
print("\n=== articulos_stock (columns) ===")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos_stock' ORDER BY ordinal_position")
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']}")

# almacenes_stock columns
print("\n=== almacenes_stock (columns) ===")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='almacenes_stock' ORDER BY ordinal_position")
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']}")

# almacenes table
print("\n=== almacenes ===")
cur.execute("SELECT * FROM almacenes LIMIT 10")
for r in cur.fetchall():
    print(f"  {dict(r)}")

conn.close()
