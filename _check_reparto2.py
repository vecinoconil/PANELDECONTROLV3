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

# 1. Comprobar columnas de hojas_de_carga_lineas
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hojas_de_carga_lineas' ORDER BY column_name")
print("Columnas hojas_de_carga_lineas:", [r['column_name'] for r in cur.fetchall()])

# 2. Comprobar columnas de hojas_de_carga
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hojas_de_carga' ORDER BY column_name")
print("Columnas hojas_de_carga:", [r['column_name'] for r in cur.fetchall()])

# 3. Probar la query exacta de config
try:
    cur.execute("SELECT codigo, nombre FROM cajas WHERE inactiva = false ORDER BY nombre")
    r = cur.fetchall()
    print(f"Cajas OK: {len(r)} cajas")
    for c in r[:3]: print(" ", dict(c))
except Exception as e:
    print("Error cajas:", e)
    conn.rollback()

# 4. Probar _ensure_reparto_cols
try:
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS servido BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE hojas_de_carga_lineas ADD COLUMN IF NOT EXISTS importe_cobrado NUMERIC(12,2) DEFAULT 0")
    cur.execute("ALTER TABLE hojas_de_carga ADD COLUMN IF NOT EXISTS repartidor_usuario_id INTEGER")
    conn.commit()
    print("_ensure_reparto_cols OK")
except Exception as e:
    print("Error en ensure_reparto_cols:", e)

conn.close()
