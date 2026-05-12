"""Buscar tablas banco/cuenta."""
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
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND (table_name ILIKE '%banco%' OR table_name ILIKE '%cuenta%')
    ORDER BY table_name
""")
print("Banco/cuenta:", [r['table_name'] for r in cur.fetchall()])
# Emp cols full
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='empresa' ORDER BY ordinal_position")
print("Empresa cols:", [r['column_name'] for r in cur.fetchall()])
conn.close()
