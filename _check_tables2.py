"""Ver columnas de tablas relevantes."""
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

for table in ['formaspago', 'empresa', 'empresa_lopd', 'provincias']:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position LIMIT 10", (table,))
    cols = [r['column_name'] for r in cur.fetchall()]
    print(f"{table}: {cols}")

# Tabla agencias (buscar en tablas existentes)
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%agenc%' ORDER BY table_name")
a = [r['table_name'] for r in cur.fetchall()]
print("Agencias?", a)

# Muestra empresa
cur.execute("SELECT * FROM empresa LIMIT 1")
r = cur.fetchone()
print("\nEmpresa:", {k:v for k,v in dict(r).items() if v and k != 'imagen_logo'})
conn.close()
