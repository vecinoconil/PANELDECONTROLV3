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
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ventas_cabeceras'
    ORDER BY ordinal_position
""")
print("=== ventas_cabeceras columns ===")
for r in cur.fetchall():
    print(r['column_name'], '-', r['data_type'])

# Ver también algunos registros con id_factura de contratos_vencimientos
print("\n=== sample vencimientos con factura ===")
cur.execute("""
    SELECT cv.id, cv.id_factura, vc.totalpendiente
    FROM contratos_vencimientos cv
    JOIN ventas_cabeceras vc ON vc.id = cv.id_factura
    WHERE cv.id_factura > 0
    LIMIT 20
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== conteo por estado ===")
cur.execute("""
    SELECT
        COUNT(*) FILTER (WHERE cv.id_factura > 0 AND vc.totalpendiente = 0) AS cobrados,
        COUNT(*) FILTER (WHERE cv.id_factura > 0 AND vc.totalpendiente > 0) AS facturado_sin_cobrar,
        COUNT(*) FILTER (WHERE cv.id_factura > 0 AND vc.totalpendiente IS NULL) AS factura_sin_totalpendiente,
        COUNT(*) FILTER (WHERE cv.id_factura IS NULL OR cv.id_factura = 0) AS sin_factura,
        COUNT(*) AS total
    FROM contratos_vencimientos cv
    LEFT JOIN ventas_cabeceras vc ON vc.id = cv.id_factura AND cv.id_factura > 0
    WHERE EXTRACT(year FROM cv.fecha)::int = 2026
      AND EXTRACT(month FROM cv.fecha)::int = 4
""")
for r in cur.fetchall():
    print(dict(r))

conn.close()
