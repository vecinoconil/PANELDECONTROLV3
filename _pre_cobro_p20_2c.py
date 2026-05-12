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

print(f"=== P 20-2 (id={idcab}) ANTES del cobro ===")
print("  total=57.46  ventas_entregas=0 registros  => pendiente=57.46")

cur.execute("SELECT * FROM registro_cobros WHERE id_cab = %s ORDER BY id", (idcab,))
rcs = cur.fetchall()
print(f"\nregistro_cobros ({len(rcs)} registros):")
for rc in rcs:
    print(" ", dict(rc))

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='cajas_registro' ORDER BY ordinal_position")
cols_cr = [r['column_name'] for r in cur.fetchall()]
print("\ncajas_registro cols:", cols_cr)

# cajas_registro: buscar por idcab o id_cab
col_idcab = 'idcab' if 'idcab' in cols_cr else 'id_cab'
cur.execute(f"SELECT * FROM cajas_registro WHERE {col_idcab} = %s ORDER BY id", (idcab,))
crs = cur.fetchall()
print(f"\ncajas_registro ({len(crs)} registros):")
for cr in crs:
    print(" ", dict(cr))

conn.close()
