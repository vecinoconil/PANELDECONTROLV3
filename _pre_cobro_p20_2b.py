import sys, os
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')
os.chdir(r'C:\PANELDECONTROLV3\backend')
from app.services.pg_connection import get_pg_connection
from app.database import get_session
from sqlmodel import select
from app.models.app_models import Empresa

with next(get_session()) as s:
    empresa = s.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

idcab = 66236

# Columnas de registro_cobros
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='registro_cobros' ORDER BY ordinal_position")
cols_rc = [r['column_name'] for r in cur.fetchall()]
print("registro_cobros cols:", cols_rc)

cur.execute("SELECT * FROM registro_cobros WHERE idcab = %s ORDER BY id", (idcab,))
rcs = cur.fetchall()
print(f"\nregistro_cobros ({len(rcs)} registros):")
for rc in rcs:
    print(" ", dict(rc))

# Columnas de cajas_registro
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='cajas_registro' ORDER BY ordinal_position")
cols_cr = [r['column_name'] for r in cur.fetchall()]
print("\ncajas_registro cols:", cols_cr)

cur.execute("SELECT * FROM cajas_registro WHERE idcab = %s ORDER BY id", (idcab,))
crs = cur.fetchall()
print(f"\ncajas_registro ({len(crs)} registros):")
for cr in crs:
    print(" ", dict(cr))

conn.close()
