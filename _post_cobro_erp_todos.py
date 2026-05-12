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

print("=== Todos los albaranes P 20 - estado cobro ===")
cur.execute("""
    SELECT vc.id, vc.numero, vc.total, vc.totalpendiente,
           COALESCE(SUM(ve.importe), 0) AS cobrado,
           COUNT(ve.id) AS num_ve
    FROM ventas_cabeceras vc
    LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
    WHERE vc.serie = 'P 20' AND vc.tipodoc = 4
    GROUP BY vc.id, vc.numero, vc.total, vc.totalpendiente
    ORDER BY vc.numero
""")
for r in cur.fetchall():
    total = float(r['total'])
    cobrado = float(r['cobrado'])
    print(f"  P 20-{r['numero']} (id={r['id']})  total={total:.2f}  cobrado={cobrado:.2f}  pendiente={total-cobrado:.2f}  totalpendiente={float(r['totalpendiente']):.2f}  num_ve={r['num_ve']}")

# Ver el ventas_entregas nuevo para P 20-4
print("\n=== ventas_entregas nuevos (id > 25342) ===")
cur.execute("SELECT * FROM ventas_entregas WHERE id > 25342 ORDER BY id")
for ve in cur.fetchall():
    print(" ", dict(ve))

print("\n=== registro_cobros nuevos (id > 20847) ===")
cur.execute("SELECT * FROM registro_cobros WHERE id > 20847 ORDER BY id")
for rc in cur.fetchall():
    print(" ", dict(rc))

print("\n=== cajas_registro nuevo id=57842 (detalle) ===")
cur.execute("SELECT * FROM cajas_registro WHERE id = 57842")
cr = cur.fetchone()
if cr:
    for k, v in dict(cr).items():
        print(f"  {k} = {v!r}")

conn.close()
