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

print("=== ESTADO DESPUÉS entrega a/c ERP: P 20-5 (id=66239) ===")
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

print("\n--- ventas_entregas nuevas (id > 25344) ---")
cur.execute("SELECT * FROM ventas_entregas WHERE id > 25344 ORDER BY id")
for ve in cur.fetchall():
    print(" ", dict(ve))

print("\n--- registro_cobros nuevos (id > 20849) ---")
cur.execute("SELECT * FROM registro_cobros WHERE id > 20849 ORDER BY id")
for rc in cur.fetchall():
    print(" ", dict(rc))

print("\n--- cajas_registro nuevos (id > 57843) ---")
cur.execute("SELECT * FROM cajas_registro WHERE id > 57843 ORDER BY id")
for cr in cur.fetchall():
    for k, v in dict(cr).items():
        print(f"    {k} = {v!r}")
    print()

conn.close()
