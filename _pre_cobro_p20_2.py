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

cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.total, vc.totalpendiente,
           COALESCE(SUM(ve.importe), 0) AS suma_entregas,
           COUNT(ve.id) AS num_ve
    FROM ventas_cabeceras vc
    LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
    WHERE vc.serie = 'P 20' AND vc.numero = 2 AND vc.tipodoc = 4
    GROUP BY vc.id, vc.serie, vc.numero, vc.total, vc.totalpendiente
""")
r = cur.fetchone()
idcab = r['id']
total = float(r['total'] or 0)
cobrado = float(r['suma_entregas'] or 0)
pendiente = round(total - cobrado, 2)

print(f"=== ventas_cabeceras P 20-2 ===")
print(f"  id={idcab}  total={total:.2f}  cobrado={cobrado:.2f}  pendiente={pendiente:.2f}  num_ve={r['num_ve']}")

cur.execute("SELECT id, importe, fecha, idregistro, cajabanco, codigo_cb, usuario FROM ventas_entregas WHERE idcab = %s ORDER BY id", (idcab,))
ves = cur.fetchall()
print(f"\nventas_entregas ({len(ves)} registros):")
for ve in ves:
    print(" ", dict(ve))

cur.execute("SELECT id, fecha, importe, fpago, concepto FROM registro_cobros WHERE idcab = %s ORDER BY id", (idcab,))
rcs = cur.fetchall()
print(f"\nregistro_cobros ({len(rcs)} registros):")
for rc in rcs:
    print(" ", dict(rc))

cur.execute("SELECT id, fecha, importe, concepto, cajabanco FROM cajas_registro WHERE idcab = %s ORDER BY id", (idcab,))
crs = cur.fetchall()
print(f"\ncajas_registro ({len(crs)} registros):")
for cr in crs:
    print(" ", dict(cr))

conn.close()
