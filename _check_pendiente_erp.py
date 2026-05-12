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

# Ver albaranes que tienen cobros (ventas_entregas) en el ERP real
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.total, vc.totalpendiente,
           COALESCE(SUM(ve.importe), 0) AS suma_entregas,
           COUNT(ve.id) AS num_entregas
    FROM ventas_cabeceras vc
    LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
    WHERE vc.tipodoc = 4
    GROUP BY vc.id, vc.serie, vc.numero, vc.total, vc.totalpendiente
    HAVING COALESCE(SUM(ve.importe), 0) > 0
    ORDER BY vc.id DESC
    LIMIT 20
""")
rows = cur.fetchall()
print(f"Albaranes con entregas: {len(rows)}")
for r in rows:
    total = float(r['total'] or 0)
    entregado = float(r['suma_entregas'] or 0)
    pte_campo = float(r['totalpendiente'] or 0)
    pte_calc = round(total - entregado, 2)
    print(f"  id={r['id']} serie={r['serie']!r} num={r['numero']} total={total:.2f} totalpendiente={pte_campo:.2f} suma_ve={entregado:.2f} pte_calc={pte_calc:.2f} n_ve={r['num_entregas']}")

print()
print("=== ventas_entregas columns ===")
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ventas_entregas'
    ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(f"  {r['column_name']} - {r['data_type']}")

print()
# Ver un ejemplo de ventas_entregas de un albaran conocido del ERP (no nuestro)
print("=== Ejemplo ventas_entregas para un albaran del ERP ===")
cur.execute("""
    SELECT ve.*, vc.serie, vc.numero, vc.total
    FROM ventas_entregas ve
    JOIN ventas_cabeceras vc ON vc.id = ve.idcab
    WHERE vc.tipodoc = 4 AND vc.serie NOT LIKE 'P %%'
    ORDER BY ve.id DESC
    LIMIT 5
""")
for r in cur.fetchall():
    print(dict(r))

conn.close()
