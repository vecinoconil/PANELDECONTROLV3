"""
Busca cómo determinar si una factura de contrato está cobrada.
"""
import sys, os
sys.path.insert(0, 'backend')
from app.services.pg_connection import get_pg_connection
from app.database import get_session
from app.models.app_models import Empresa
from sqlmodel import select

session = next(get_session())
empresa = session.exec(select(Empresa)).first()
conn = get_pg_connection(empresa)
cur = conn.cursor()

# Columnas de ventas_cabeceras relacionadas con cobro
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ventas_cabeceras'
      AND (column_name ILIKE '%cobr%' OR column_name ILIKE '%pago%'
           OR column_name ILIKE '%pagad%' OR column_name ILIKE '%vto%'
           OR column_name ILIKE '%venc%' OR column_name ILIKE '%liquid%'
           OR column_name ILIKE '%saldo%' OR column_name ILIKE '%pendiente%')
    ORDER BY ordinal_position
""")
print("=== ventas_cabeceras cols relacionadas con cobro ===")
for r in cur.fetchall():
    print(f"  {r['column_name']:30s} {r['data_type']}")

# Muestra de facturas de contratos para ver qué campos tienen
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.fecha, vc.importe_total,
           vc.cobrado, vc.forma_pago
    FROM ventas_cabeceras vc
    INNER JOIN contratos_vencimientos cv ON cv.id_factura = vc.id
    WHERE cv.id_factura > 0
    LIMIT 10
""")
rows = cur.fetchall()
print(f"\n=== Facturas de contratos (sample {len(rows)}) ===")
for r in rows:
    print(dict(r))

# Columnas de registro_cobros
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'registro_cobros'
    ORDER BY ordinal_position
""")
print("\n=== COLUMNAS registro_cobros ===")
for r in cur.fetchall():
    print(f"  {r['column_name']:30s} {r['data_type']}")

cur.close()
conn.close()
