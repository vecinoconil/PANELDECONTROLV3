"""
Busca cómo determinar si una factura de contrato está cobrada - v2.
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

# Muestra de facturas de contratos - todas las columnas
cur.execute("""
    SELECT vc.*
    FROM ventas_cabeceras vc
    INNER JOIN contratos_vencimientos cv ON cv.id_factura = vc.id
    WHERE cv.id_factura > 0
    LIMIT 3
""")
rows = cur.fetchall()
print(f"=== Facturas de contratos (sample) ===")
for r in rows:
    d = dict(r)
    # Solo mostrar campos no nulos / interesantes
    print({k: v for k, v in d.items() if v is not None and v != 0 and v != '' and v != False})

# totalpendiente en ventas_cabeceras
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.fecha, vc.totalpendiente, vc.fpago
    FROM ventas_cabeceras vc
    INNER JOIN contratos_vencimientos cv ON cv.id_factura = vc.id
    WHERE cv.id_factura > 0
    LIMIT 10
""")
rows = cur.fetchall()
print(f"\n=== totalpendiente / fpago para facturas de contratos ===")
for r in rows:
    print(dict(r))

# Cuántas tienen totalpendiente = 0 (pagadas)?
cur.execute("""
    SELECT
        COUNT(*) FILTER (WHERE vc.totalpendiente = 0) AS pagadas,
        COUNT(*) FILTER (WHERE vc.totalpendiente > 0) AS con_pendiente,
        COUNT(*) AS total
    FROM ventas_cabeceras vc
    INNER JOIN contratos_vencimientos cv ON cv.id_factura = vc.id
    WHERE cv.id_factura > 0
      AND EXTRACT(year FROM cv.fecha)::int = 2026
""")
print("\n=== Conteo 2026: pagadas vs pendientes ===")
print(dict(cur.fetchone()))

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
