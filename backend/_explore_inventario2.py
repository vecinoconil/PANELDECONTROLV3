import os, sys
os.chdir('C:/PANELDECONTROLV3/backend')
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select
from app.config import settings

# Connect to SQLite to get the first empresa
sqlite_url = "sqlite:///panel.db"
engine = create_engine(sqlite_url)
with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()
    if not empresa:
        print("No empresa found!")
        sys.exit(1)
    print(f"Empresa: {empresa.nombre}")

conn = get_pg_connection(empresa)
cur = conn.cursor()

# Get all tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
all_tables = [r['table_name'] for r in cur.fetchall()]
print('ALL TABLES:', all_tables)
print()

# Filtros relevantes
for kw in ['invent', 'articul', 'familia', 'marca', 'subfamilia', 'lote', 'talla', 'color', 'almacen', 'stock']:
    found = [t for t in all_tables if kw.lower() in t.lower()]
    if found:
        print(f'{kw.upper()}: {found}')

conn.close()
