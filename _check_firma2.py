import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import Session, create_engine, select
engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa).where(Empresa.id == 1)).first()
conn = get_pg_connection(emp)
cur = conn.cursor()

# Ver columnas de ventas_cabeceras para buscar firma/imagen/observaciones
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ventas_cabeceras' ORDER BY column_name")
cols = cur.fetchall()
print("ventas_cabeceras columnas:")
for c in cols:
    print(f"  {c['column_name']:40s} {c['data_type']}")

# Ver si existe columna firma o similar
firma_cols = [c['column_name'] for c in cols if 'firma' in c['column_name'].lower() or 'sign' in c['column_name'].lower() or 'imagen' in c['column_name'].lower()]
print("\nColumnas relacionadas con firma/imagen:", firma_cols)

# Ver columnas de ventas_imagenes
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ventas_imagenes' ORDER BY column_name")
print("\nventas_imagenes columnas:", [{r['column_name']: r['data_type']} for r in cur.fetchall()])

conn.close()
