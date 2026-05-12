"""
Verifica cuántos contratos_vencimientos tienen id_linea_cobro > 0 (realmente cobrado).
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

cur.execute("""
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE id_factura > 0) AS con_factura_real,
        COUNT(*) FILTER (WHERE id_linea_cobro > 0) AS cobrado_real,
        COUNT(*) FILTER (WHERE id_factura IS NULL OR id_factura = 0) AS sin_factura
    FROM contratos_vencimientos
    WHERE EXTRACT(year FROM fecha)::int = 2026
      AND EXTRACT(month FROM fecha)::int = 4
""")
print("=== Abril 2026 ===")
print(dict(cur.fetchone()))

# Muestra de cobrados reales
cur.execute("""
    SELECT cv.id, cv.id_factura, cv.id_linea_cobro, cv.fecha_cobro, cv.importe,
           cl.nombre AS cli_nombre
    FROM contratos_vencimientos cv
    LEFT JOIN contratos c ON c.id = cv.id_contrato
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    WHERE EXTRACT(year FROM cv.fecha)::int = 2026
      AND EXTRACT(month FROM cv.fecha)::int = 4
      AND cv.id_linea_cobro > 0
    LIMIT 5
""")
rows = cur.fetchall()
print(f"\n=== Cobrados reales en Abril 2026 (sample {len(rows)}) ===")
for r in rows:
    print(dict(r))

cur.close()
conn.close()
