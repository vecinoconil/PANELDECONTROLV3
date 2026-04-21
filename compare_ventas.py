"""Comparar totales de facturas CI 26 + R 26 meses 1-3 de 2026 con el listado del usuario."""
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012',
    cursor_factory=RealDictCursor, connect_timeout=15
)
cur = conn.cursor()

# Valores esperados del listado del usuario
ESPERADO_BASE = 110057.36
ESPERADO_IVA = 23112.05
ESPERADO_IRPF = 1031.39
ESPERADO_TOTAL = 132137.97

print("=" * 90)
print("COMPARACIÓN: Listado usuario vs Query BD")
print("Series: CI 26, R 26  |  Meses: Ene-Mar 2026  |  Solo tipodoc=8 (facturas)")
print("=" * 90)

# 1. Query con el filtro ACTUAL del dashboard (tipodoc=8 OR tipodoc=4 sin fechafin)
cur.execute("""
    SELECT COUNT(*) AS num_docs,
           COALESCE(SUM(baseimpo1 + COALESCE(baseimpo2,0) + COALESCE(baseimpo3,0)), 0) AS base,
           COALESCE(SUM(iva1 + COALESCE(iva2,0) + COALESCE(iva3,0)), 0) AS iva,
           COALESCE(SUM(irpf), 0) AS irpf,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE (tipodoc = 8 OR (tipodoc = 4 AND fechafin IS NULL))
      AND serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
""")
r = cur.fetchone()
print(f"\n1. FILTRO ACTUAL (tipodoc=8 + tipodoc=4 sin fechafin):")
print(f"   Docs: {r['num_docs']}")
print(f"   Base:  {float(r['base']):>12.2f}  (esperado: {ESPERADO_BASE:>12.2f})  diff: {float(r['base'])-ESPERADO_BASE:>+10.2f}")
print(f"   IVA:   {float(r['iva']):>12.2f}  (esperado: {ESPERADO_IVA:>12.2f})  diff: {float(r['iva'])-ESPERADO_IVA:>+10.2f}")
print(f"   IRPF:  {float(r['irpf']):>12.2f}  (esperado: {ESPERADO_IRPF:>12.2f})  diff: {float(r['irpf'])-ESPERADO_IRPF:>+10.2f}")
print(f"   Total: {float(r['total']):>12.2f}  (esperado: {ESPERADO_TOTAL:>12.2f})  diff: {float(r['total'])-ESPERADO_TOTAL:>+10.2f}")

# 2. Query SOLO tipodoc=8 (solo facturas, sin albaranes)
cur.execute("""
    SELECT COUNT(*) AS num_docs,
           COALESCE(SUM(baseimpo1 + COALESCE(baseimpo2,0) + COALESCE(baseimpo3,0)), 0) AS base,
           COALESCE(SUM(iva1 + COALESCE(iva2,0) + COALESCE(iva3,0)), 0) AS iva,
           COALESCE(SUM(irpf), 0) AS irpf,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE tipodoc = 8
      AND serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
""")
r = cur.fetchone()
print(f"\n2. SOLO FACTURAS (tipodoc=8):")
print(f"   Docs: {r['num_docs']}")
print(f"   Base:  {float(r['base']):>12.2f}  (esperado: {ESPERADO_BASE:>12.2f})  diff: {float(r['base'])-ESPERADO_BASE:>+10.2f}")
print(f"   IVA:   {float(r['iva']):>12.2f}  (esperado: {ESPERADO_IVA:>12.2f})  diff: {float(r['iva'])-ESPERADO_IVA:>+10.2f}")
print(f"   IRPF:  {float(r['irpf']):>12.2f}  (esperado: {ESPERADO_IRPF:>12.2f})  diff: {float(r['irpf'])-ESPERADO_IRPF:>+10.2f}")
print(f"   Total: {float(r['total']):>12.2f}  (esperado: {ESPERADO_TOTAL:>12.2f})  diff: {float(r['total'])-ESPERADO_TOTAL:>+10.2f}")

# 3. Desglose por tipo para entender la diferencia
cur.execute("""
    SELECT tipodoc,
           CASE WHEN fechafin IS NULL THEN 'sin_fechafin' ELSE 'con_fechafin' END AS estado,
           COUNT(*) AS num_docs,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
    GROUP BY tipodoc, estado
    ORDER BY tipodoc, estado
""")
print(f"\n3. DESGLOSE por tipodoc y fechafin (series CI 26, R 26, ene-mar 2026):")
for r in cur.fetchall():
    print(f"   tipodoc={r['tipodoc']}  {r['estado']:15s}  docs={r['num_docs']:4d}  total={float(r['total']):>12.2f}")

# 4. Cuántas facturas (tipodoc=8) del listado hay? El usuario dice CI 26/1 a CI 26/258 + R 26/1 a R 26/5
# Contar facturas tipodoc=8 en la serie CI 26 y R 26
cur.execute("""
    SELECT serie, COUNT(*) AS cnt, MIN(numero) AS min_num, MAX(numero) AS max_num,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE tipodoc = 8
      AND serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
    GROUP BY serie ORDER BY serie
""")
print(f"\n4. Facturas tipodoc=8 por serie:")
for r in cur.fetchall():
    print(f"   serie='{r['serie']}'  cnt={r['cnt']}  numeros: {r['min_num']}-{r['max_num']}  total={float(r['total']):>12.2f}")

# 5. Albaranes pendientes tipodoc=4 sin fechafin
cur.execute("""
    SELECT serie, COUNT(*) AS cnt, MIN(numero) AS min_num, MAX(numero) AS max_num,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE tipodoc = 4 AND fechafin IS NULL
      AND serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
    GROUP BY serie ORDER BY serie
""")
print(f"\n5. Albaranes PENDIENTES (tipodoc=4, sin fechafin) por serie:")
rows = cur.fetchall()
if rows:
    for r in rows:
        print(f"   serie='{r['serie']}'  cnt={r['cnt']}  numeros: {r['min_num']}-{r['max_num']}  total={float(r['total']):>12.2f}")
else:
    print("   (ninguno)")

# 6. Listar esos albaranes pendientes que inflan el total
cur.execute("""
    SELECT id, serie, numero, tipodoc, fecha, total, cli_nombre, descripcion
    FROM ventas_cabeceras
    WHERE tipodoc = 4 AND fechafin IS NULL
      AND serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
    ORDER BY fecha, numero
""")
print(f"\n6. Detalle albaranes pendientes que se suman con el filtro actual:")
albs = cur.fetchall()
for r in albs:
    print(f"   {r['fecha']}  serie={r['serie']}  num={r['numero']:4d}  total={float(r['total']):>10.2f}  {r['cli_nombre'][:40]}  {r['descripcion'][:40] if r['descripcion'] else ''}")

# 7. Contar el listado del usuario: tiene 258 facturas CI + 5 rectificativas R = ¿cuántas?
# Contamos en el listado: CI 26/1 hasta CI 26/258 y R 26/1 hasta R 26/5 
print(f"\n7. El listado del usuario tiene facturas CI 26/1..258 + R 26/1..5")
print(f"   Total esperado del listado: {ESPERADO_TOTAL:>12.2f}")

# 8. Ver otros tipodoc que existan para estas series
cur.execute("""
    SELECT tipodoc, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras
    WHERE serie IN ('CI 26', 'R 26')
      AND fecha >= '2026-01-01' AND fecha < '2026-04-01'
    GROUP BY tipodoc ORDER BY tipodoc
""")
print(f"\n8. Todos los tipodoc para CI 26 + R 26 (ene-mar 2026):")
for r in cur.fetchall():
    print(f"   tipodoc={r['tipodoc']}  cnt={r['cnt']}  total={float(r['total']):>12.2f}")

cur.close()
conn.close()
