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

idcab = 66239  # P 20-5

print("=== ESTADO ANTES: P 20-5 (id=66239) ===")
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.total,
           COALESCE(SUM(ve.importe), 0) AS cobrado,
           COUNT(ve.id) AS num_ve
    FROM ventas_cabeceras vc
    LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
    WHERE vc.id = %s
    GROUP BY vc.id, vc.serie, vc.numero, vc.total
""", (idcab,))
r = cur.fetchone()
total = float(r['total'])
cobrado = float(r['cobrado'])
print(f"  total={total:.2f}  cobrado={cobrado:.2f}  pendiente={total-cobrado:.2f}  num_ve={r['num_ve']}")

print("\n--- ventas_entregas ---")
cur.execute("SELECT id, importe, fecha, idregistro, idvencimiento FROM ventas_entregas WHERE idcab = %s ORDER BY id", (idcab,))
for ve in cur.fetchall():
    print(" ", dict(ve))

print("\n--- registro_cobros ---")
cur.execute("SELECT id, id_vto, es_entrega, importe FROM registro_cobros WHERE id_cab = %s ORDER BY id", (idcab,))
for rc in cur.fetchall():
    print(" ", dict(rc))

print("\n--- IDs máximos actuales ---")
cur.execute("SELECT MAX(id) AS max_id FROM ventas_entregas")
print(f"  ventas_entregas MAX id = {cur.fetchone()['max_id']}")
cur.execute("SELECT MAX(id) AS max_id FROM registro_cobros")
print(f"  registro_cobros MAX id = {cur.fetchone()['max_id']}")
cur.execute("SELECT MAX(id) AS max_id FROM cajas_registro")
print(f"  cajas_registro  MAX id = {cur.fetchone()['max_id']}")

conn.close()
