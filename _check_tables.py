"""Buscar tablas de ERP relacionadas con formas de pago y agencias."""
import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import Session, create_engine, select

engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa)).first()

conn = get_pg_connection(emp)
cur = conn.cursor()

# Buscar tablas relevantes
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name ILIKE '%pago%' OR table_name ILIKE '%agencia%' OR table_name ILIKE '%provincia%' OR table_name ILIKE '%empresa%'
    ORDER BY table_name
""")
tables = [r['table_name'] for r in cur.fetchall()]
print("Tablas relacionadas:", tables)

# Buscar tabla de provincias
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
all_tables = [r['table_name'] for r in cur.fetchall()]
pago = [t for t in all_tables if 'pago' in t.lower() or 'age' in t.lower() or 'provin' in t.lower() or 'empresa' in t.lower()]
print("Filtradas:", pago)
conn.close()
