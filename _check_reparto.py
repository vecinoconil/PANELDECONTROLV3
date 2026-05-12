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

# Comprobar columnas de cajas
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='cajas' ORDER BY column_name")
print("Columnas cajas:", [r['column_name'] for r in cur.fetchall()])

# Comprobar si existe hojas_de_carga
cur.execute("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='hojas_de_carga')")
print("Tabla hojas_de_carga:", cur.fetchone()['exists'])

cur.execute("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='hojas_de_carga_lineas')")
print("Tabla hojas_de_carga_lineas:", cur.fetchone()['exists'])

# Probar query de config con la columna correcta
try:
    cur.execute("SELECT codigo, nombre FROM cajas WHERE activo = true OR activo IS NULL ORDER BY nombre LIMIT 3")
    print("Query activo OK:", cur.fetchall())
except Exception as e:
    print("Error con activo:", e)

try:
    cur.execute("SELECT codigo, nombre FROM cajas WHERE inactiva = false ORDER BY nombre LIMIT 3")
    print("Query inactiva OK:", [dict(r) for r in cur.fetchall()])
except Exception as e:
    print("Error con inactiva:", e)

conn.close()
