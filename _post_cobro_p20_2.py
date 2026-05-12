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

print("=== ESTADO DESPUÉS del cobro ERP: P 20-2 (id=66236) ===")

cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.total, vc.totalpendiente,
           COALESCE(SUM(ve.importe), 0) AS cobrado,
           COUNT(ve.id) AS num_ve
    FROM ventas_cabeceras vc
    LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
    WHERE vc.id = %s
    GROUP BY vc.id, vc.serie, vc.numero, vc.total, vc.totalpendiente
""", (idcab,))
r = cur.fetchone()
print(f"  total={float(r['total']):.2f}  cobrado={float(r['cobrado']):.2f}  pendiente={float(r['total'])-float(r['cobrado']):.2f}  totalpendiente={float(r['totalpendiente']):.2f}  num_ve={r['num_ve']}")

print("\n--- ventas_entregas (nuevos: id > 25342) ---")
cur.execute("SELECT * FROM ventas_entregas WHERE idcab = %s ORDER BY id", (idcab,))
for ve in cur.fetchall():
    print(" ", dict(ve))

print("\n--- registro_cobros (nuevos: id > 20847) ---")
cur.execute("SELECT * FROM registro_cobros WHERE id_cab = %s ORDER BY id", (idcab,))
for rc in cur.fetchall():
    print(" ", dict(rc))

print("\n--- cajas_registro (nuevos: id > 57841) ---")
cur.execute("SELECT * FROM cajas_registro WHERE id > 57841 ORDER BY id")
for cr in cur.fetchall():
    print(" ", dict(cr))

conn.close()
