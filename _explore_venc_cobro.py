import sys
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')
sys.path.insert(0, r'C:\PANELDECONTROLV3')
import psycopg2.extras
from sqlmodel import Session, select
from app.database import engine
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection

with Session(engine) as sess:
    emp = sess.exec(select(Empresa)).first()

conn = get_pg_connection(emp)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Estructura de contratos_vencimientos
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'contratos_vencimientos'
    ORDER BY ordinal_position
""")
print('=== contratos_vencimientos ===')
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']}")

# Ejemplo fila con factura
cur.execute("""
    SELECT cv.id, cv.id_contrato, cv.fecha, cv.importe,
           cv.id_factura, cv.id_albaran,
           vc.numero, vc.serie, vc.fecha AS fra_fecha, vc.cobrado,
           vc.tipodoc
    FROM contratos_vencimientos cv
    LEFT JOIN ventas_cabeceras vc ON vc.id = cv.id_factura
    WHERE cv.id_factura IS NOT NULL
    LIMIT 3
""")
print('\n=== Ejemplo con factura ===')
for r in cur.fetchall():
    print(dict(r))

# Ver columnas de ventas_cabeceras (cobrado / pagado?)
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ventas_cabeceras'
      AND column_name ILIKE '%cobr%'
    ORDER BY ordinal_position
""")
print('\n=== ventas_cabeceras cobro cols ===')
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']}")

# Ver vencimientos de cabeceras (ventas_vencimientos?)
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ventas_vencimientos'
    ORDER BY ordinal_position
""")
print('\n=== ventas_vencimientos cols ===')
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']}")

conn.close()
print('\nDone.')
