import os, sys
os.chdir('C:/PANELDECONTROLV3/backend')
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
import psycopg2, psycopg2.extras
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select

# Connect to panel database to get empresa
engine = create_engine(settings.database_url, echo=False)
with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()
    if not empresa:
        print("No empresa found!")
        sys.exit(1)
    print(f"Empresa: {empresa.nombre}, host={empresa.pg_host}, db={empresa.pg_name}, tunnel={empresa.usar_tunnel}")

# Connect to empresa's ERP DB
conn = get_pg_connection(empresa)
cur = conn.cursor()

cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
all_tables = [r['table_name'] for r in cur.fetchall()]
print('\nALL ERP TABLES:', all_tables)
print()

for kw in ['invent', 'articul', 'familia', 'subfamilia', 'marca', 'lote', 'talla', 'color', 'almacen', 'stock']:
    found = [t for t in all_tables if kw.lower() in t.lower()]
    if found:
        print(f'{kw.upper()}: {found}')

conn.close()
