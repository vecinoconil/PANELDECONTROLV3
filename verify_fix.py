"""Verificar que el nuevo filtro (solo tipodoc=8) da los totales correctos."""
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012',
    cursor_factory=RealDictCursor, connect_timeout=15
)
cur = conn.cursor()

# Nuevo filtro: solo tipodoc=8
cur.execute("""
    SELECT COUNT(*) AS num_docs,
           COALESCE(SUM(baseimpo1 + COALESCE(baseimpo2,0) + COALESCE(baseimpo3,0)), 0) AS base,
           COALESCE(SUM(iva1 + COALESCE(iva2,0) + COALESCE(iva3,0)), 0) AS iva,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE tipodoc = 8
      AND serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
""")
r = cur.fetchone()
print(f"SOLO tipodoc=8 (CI 26 + R 26, ene-mar 2026):")
print(f"  Docs:  {r['num_docs']}")
print(f"  Base:  {float(r['base']):>12.2f}  (esperado: 110.057,36)")
print(f"  IVA:   {float(r['iva']):>12.2f}  (esperado:  23.112,05)")
print(f"  Total: {float(r['total']):>12.2f}  (esperado: 132.137,97)")
print(f"  Match total: {'OK' if abs(float(r['total']) - 132137.97) < 0.01 else 'FALLO!'}")

cur.close()
conn.close()
