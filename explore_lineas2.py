"""Analizar pares albarán-factura y sus líneas para entender la duplicación."""
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012',
    cursor_factory=RealDictCursor, connect_timeout=15
)
cur = conn.cursor()

# 1. Buscar pares: un albarán facturado y la factura correspondiente (mismo cliente, misma fecha aprox, mismo total)
print("=" * 80)
print("1. Buscar albarán facturado (tipodoc=4 con fechafin) y factura vinculada")
print("   via campo 'factura' o 'numdoc' si existe")
print("=" * 80)

# Veamos las columnas de ventas_cabeceras que podrían vincular
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ventas_cabeceras'
    ORDER BY ordinal_position
""")
cols = [r['column_name'] for r in cur.fetchall()]
print("Columnas:", ', '.join(cols))

# 2. Ver un albarán facturado con TODOS sus campos
print("\n" + "=" * 80)
print("2. Ejemplo detallado de un albarán facturado (tipodoc=4 con fechafin)")
print("=" * 80)
cur.execute("""
    SELECT * FROM ventas_cabeceras
    WHERE tipodoc = 4 AND fechafin IS NOT NULL
      AND EXTRACT(YEAR FROM fecha) = 2025
    ORDER BY fecha DESC LIMIT 1
""")
alb = dict(cur.fetchone())
for k, v in alb.items():
    print(f"  {k:30s} = {v}")

# 3. Buscar la factura correspondiente
alb_id = alb['id']
alb_serie = alb['serie']
alb_numero = alb['numero']
alb_cli = alb['cli_codigo']
alb_fecha = alb['fechafin']
alb_total = alb['total']

print(f"\n  Buscando factura para albarán id={alb_id} serie={alb_serie} num={alb_numero} cli={alb_cli} total={alb_total}")

# Buscar factura tipodoc=8 del mismo cliente con fecha similar y total similar
cur.execute("""
    SELECT id, serie, numero, tipodoc, fecha, fechafin, total, cli_codigo, cli_nombre
    FROM ventas_cabeceras
    WHERE tipodoc = 8 AND cli_codigo = %(cli)s
      AND fecha BETWEEN %(fecha)s - interval '7 days' AND %(fecha)s + interval '7 days'
    ORDER BY ABS(total - %(total)s) LIMIT 3
""", {'cli': alb_cli, 'fecha': alb_fecha, 'total': float(alb_total)})
facturas = cur.fetchall()
print(f"  Facturas candidatas:")
for f in facturas:
    print(f"    id={f['id']} serie={f['serie']} num={f['numero']} fecha={f['fecha']} total={f['total']} fechafin={f['fechafin']}")

# 4. Comparar líneas del albarán vs factura
if facturas:
    fac = facturas[0]
    print(f"\n" + "=" * 80)
    print(f"3. Comparar líneas: albarán id={alb_id} vs factura id={fac['id']}")
    print("=" * 80)

    cur.execute("SELECT referencia, concepto, unidades, precio, importe, coste FROM ventas_lineas WHERE idcab = %s ORDER BY id", (alb_id,))
    lineas_alb = cur.fetchall()
    print(f"  Líneas ALBARÁN ({len(lineas_alb)}):")
    for l in lineas_alb:
        print(f"    ref={l['referencia']}  und={l['unidades']}  precio={l['precio']}  importe={l['importe']}  coste={l['coste']}")

    cur.execute("SELECT referencia, concepto, unidades, precio, importe, coste FROM ventas_lineas WHERE idcab = %s ORDER BY id", (fac['id'],))
    lineas_fac = cur.fetchall()
    print(f"  Líneas FACTURA ({len(lineas_fac)}):")
    for l in lineas_fac:
        print(f"    ref={l['referencia']}  und={l['unidades']}  precio={l['precio']}  importe={l['importe']}  coste={l['coste']}")

# 5. Verificar la suma total con el filtro actual vs sin filtro
print("\n" + "=" * 80)
print("4. Comparación de totales 2025 con diferentes filtros")
print("=" * 80)

cur.execute("""
    SELECT 'tipodoc=8 TODOS' AS filtro, COUNT(*) AS docs, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras WHERE tipodoc = 8 AND EXTRACT(YEAR FROM fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} docs={r['docs']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'tipodoc=4 SIN fechafin' AS filtro, COUNT(*) AS docs, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras WHERE tipodoc = 4 AND fechafin IS NULL AND EXTRACT(YEAR FROM fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} docs={r['docs']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'tipodoc=4 CON fechafin (duplicados)' AS filtro, COUNT(*) AS docs, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras WHERE tipodoc = 4 AND fechafin IS NOT NULL AND EXTRACT(YEAR FROM fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} docs={r['docs']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'FILTRO ACTUAL (8 + 4 sin fechafin)' AS filtro, COUNT(*) AS docs, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras
    WHERE (tipodoc = 8 OR (tipodoc = 4 AND fechafin IS NULL))
      AND EXTRACT(YEAR FROM fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} docs={r['docs']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'SIN FILTRO (8 + 4 todos)' AS filtro, COUNT(*) AS docs, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras WHERE tipodoc IN (4, 8) AND EXTRACT(YEAR FROM fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} docs={r['docs']:6d}  total={r['total']:>12.2f}")

# 6. Los mismos totales pero en LÍNEAS
print("\n" + "=" * 80)
print("5. Lo mismo pero a nivel de LÍNEAS (importe total)")
print("=" * 80)

cur.execute("""
    SELECT 'tipodoc=8 líneas' AS filtro, COUNT(*) AS lineas, COALESCE(SUM(vl.importe),0) AS total
    FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    WHERE vc.tipodoc = 8 AND EXTRACT(YEAR FROM vc.fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} líneas={r['lineas']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'tipodoc=4 sin fechafin líneas' AS filtro, COUNT(*) AS lineas, COALESCE(SUM(vl.importe),0) AS total
    FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    WHERE vc.tipodoc = 4 AND vc.fechafin IS NULL AND EXTRACT(YEAR FROM vc.fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} líneas={r['lineas']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'tipodoc=4 CON fechafin líneas' AS filtro, COUNT(*) AS lineas, COALESCE(SUM(vl.importe),0) AS total
    FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    WHERE vc.tipodoc = 4 AND vc.fechafin IS NOT NULL AND EXTRACT(YEAR FROM vc.fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} líneas={r['lineas']:6d}  total={r['total']:>12.2f}")

cur.execute("""
    SELECT 'FILTRO ACTUAL líneas' AS filtro, COUNT(*) AS lineas, COALESCE(SUM(vl.importe),0) AS total
    FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    WHERE (vc.tipodoc = 8 OR (vc.tipodoc = 4 AND vc.fechafin IS NULL))
      AND EXTRACT(YEAR FROM vc.fecha) = 2025
""")
r = cur.fetchone()
print(f"  {r['filtro']:40s} líneas={r['lineas']:6d}  total={r['total']:>12.2f}")

# 7. Otros tipodoc existentes
print("\n" + "=" * 80)
print("6. Otros tipodoc en ventas_cabeceras (2025)")
print("=" * 80)
cur.execute("""
    SELECT tipodoc, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
    FROM ventas_cabeceras WHERE EXTRACT(YEAR FROM fecha) = 2025
    GROUP BY tipodoc ORDER BY tipodoc
""")
for r in cur.fetchall():
    print(f"  tipodoc={r['tipodoc']}  cnt={r['cnt']}  total={r['total']:.2f}")

cur.close()
conn.close()
