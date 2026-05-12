"""Verificar bancos_cuentas."""
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
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='bancos_cuentas' ORDER BY ordinal_position LIMIT 15")
cols = [r['column_name'] for r in cur.fetchall()]
print("bancos_cuentas:", cols)
cur.execute("SELECT * FROM bancos_cuentas LIMIT 2")
for r in cur.fetchall():
    print({k:v for k,v in dict(r).items() if v and 'imagen' not in k})
conn.close()
