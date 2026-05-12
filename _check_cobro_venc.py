"""
Explora cómo se registra el cobro en contratos_vencimientos.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from app.services.pg_connection import get_pg_connection
from app.database import get_session
from app.models.app_models import Empresa
from sqlmodel import select

session = next(get_session())
empresa = session.exec(select(Empresa)).first()
print(f"Empresa: {empresa.nombre}")

conn = get_pg_connection(empresa)
cur = conn.cursor()

# 1. Columnas de contratos_vencimientos
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'contratos_vencimientos'
    ORDER BY ordinal_position
""")
print("\n=== COLUMNAS contratos_vencimientos ===")
for r in cur.fetchall():
    print(f"  {r['column_name']:30s} {r['data_type']}")

# 2. Muestras con id_factura NOT NULL - qué más tienen?
cur.execute("""
    SELECT id, id_factura, id_albaran, id_linea_cobro, fecha_cobro, fecha
    FROM contratos_vencimientos
    WHERE id_factura IS NOT NULL
    LIMIT 10
""")
rows = cur.fetchall()
print(f"\n=== VENCIMIENTOS CON FACTURA (sample {len(rows)}) ===")
for r in rows:
    print(dict(r))

# 3. Cuántos tienen id_linea_cobro o fecha_cobro?
cur.execute("""
    SELECT
        COUNT(*) FILTER (WHERE id_factura IS NOT NULL) AS con_factura,
        COUNT(*) FILTER (WHERE id_linea_cobro IS NOT NULL) AS con_linea_cobro,
        COUNT(*) FILTER (WHERE fecha_cobro IS NOT NULL) AS con_fecha_cobro,
        COUNT(*) FILTER (WHERE id_albaran IS NOT NULL) AS con_albaran
    FROM contratos_vencimientos
""")
print("\n=== CONTEOS GLOBALES ===")
print(dict(cur.fetchone()))

# 4. Buscar en tablas de cobros si hay referencia a contratos_vencimientos
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name ILIKE '%cobr%' OR table_name ILIKE '%pago%' OR table_name ILIKE '%recib%')
    ORDER BY table_name
""")
print("\n=== TABLAS RELACIONADAS CON COBROS ===")
for r in cur.fetchall():
    print(f"  {r['table_name']}")

# 5. Columnas de ventas_cobros o tabla similar si existe
for tname in ['ventas_cobros', 'cobros', 'cobros_lineas', 'recibos']:
    try:
        cur.execute(f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = '{tname}'
            ORDER BY ordinal_position
        """)
        cols = cur.fetchall()
        if cols:
            print(f"\n=== COLUMNAS {tname} ===")
            print([r['column_name'] for r in cols])
    except Exception as e:
        print(f"  {tname}: {e}")

cur.close()
conn.close()
print("\nDone.")
