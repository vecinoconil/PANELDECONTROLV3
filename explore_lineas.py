"""Analizar relación entre cabeceras tipodoc=4 y tipodoc=8 y sus líneas."""
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012',
    cursor_factory=RealDictCursor, connect_timeout=15
)
cur = conn.cursor()

# 1. Cabeceras tipodoc=8 (facturas) vs tipodoc=4 con fechafin (albaranes facturados)
print("=" * 80)
print("1. Contar cabeceras por tipodoc y estado de fechafin (anio=2025)")
print("=" * 80)
cur.execute("""
    SELECT tipodoc,
           CASE WHEN fechafin IS NULL THEN 'fechafin NULL' ELSE 'fechafin RELLENO' END AS estado,
           COUNT(*) AS cnt,
           COALESCE(SUM(total), 0) AS total
    FROM ventas_cabeceras
    WHERE EXTRACT(YEAR FROM fecha) = 2025
      AND tipodoc IN (4, 8)
    GROUP BY tipodoc, estado
    ORDER BY tipodoc, estado
""")
for r in cur.fetchall():
    print(f"  tipodoc={r['tipodoc']}  {r['estado']:20s}  cnt={r['cnt']}  total={r['total']:.2f}")

# 2. Verificar si las facturas (tipodoc=8) tienen líneas
print("\n" + "=" * 80)
print("2. Cabeceras CON y SIN líneas por tipodoc (2025)")
print("=" * 80)
cur.execute("""
    SELECT vc.tipodoc,
           CASE WHEN vc.fechafin IS NULL THEN 'fechafin NULL' ELSE 'fechafin RELLENO' END AS estado,
           CASE WHEN (SELECT COUNT(*) FROM ventas_lineas vl WHERE vl.idcab = vc.id) > 0
                THEN 'CON líneas' ELSE 'SIN líneas' END AS tiene_lineas,
           COUNT(*) AS num_cabeceras,
           COALESCE(SUM(vc.total), 0) AS total
    FROM ventas_cabeceras vc
    WHERE EXTRACT(YEAR FROM vc.fecha) = 2025
      AND vc.tipodoc IN (4, 8)
    GROUP BY vc.tipodoc, estado, tiene_lineas
    ORDER BY vc.tipodoc, estado, tiene_lineas
""")
for r in cur.fetchall():
    print(f"  tipodoc={r['tipodoc']}  {r['estado']:20s}  {r['tiene_lineas']:12s}  cabeceras={r['num_cabeceras']}  total={r['total']:.2f}")

# 3. Ejemplo concreto: una factura (tipodoc=8) y ver si tiene líneas
print("\n" + "=" * 80)
print("3. Ejemplo: 5 facturas (tipodoc=8) y cuantas líneas tienen")
print("=" * 80)
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.tipodoc, vc.fecha, vc.total, vc.fechafin,
           (SELECT COUNT(*) FROM ventas_lineas vl WHERE vl.idcab = vc.id) AS num_lineas
    FROM ventas_cabeceras vc
    WHERE EXTRACT(YEAR FROM vc.fecha) = 2025 AND vc.tipodoc = 8
    ORDER BY vc.fecha DESC LIMIT 5
""")
for r in cur.fetchall():
    print(f"  id={r['id']}  serie={r['serie']}  num={r['numero']}  tipodoc={r['tipodoc']}  "
          f"fecha={r['fecha']}  total={r['total']:.2f}  fechafin={r['fechafin']}  lineas={r['num_lineas']}")

# 4. Ejemplo: albaranes facturados (tipodoc=4, fechafin relleno) y sus líneas
print("\n" + "=" * 80)
print("4. Ejemplo: 5 albaranes facturados (tipodoc=4 con fechafin) y sus líneas")
print("=" * 80)
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.tipodoc, vc.fecha, vc.total, vc.fechafin,
           (SELECT COUNT(*) FROM ventas_lineas vl WHERE vl.idcab = vc.id) AS num_lineas
    FROM ventas_cabeceras vc
    WHERE EXTRACT(YEAR FROM vc.fecha) = 2025 AND vc.tipodoc = 4 AND vc.fechafin IS NOT NULL
    ORDER BY vc.fecha DESC LIMIT 5
""")
for r in cur.fetchall():
    print(f"  id={r['id']}  serie={r['serie']}  num={r['numero']}  tipodoc={r['tipodoc']}  "
          f"fecha={r['fecha']}  total={r['total']:.2f}  fechafin={r['fechafin']}  lineas={r['num_lineas']}")

# 5. Albaranes pendientes (tipodoc=4, fechafin NULL) y sus líneas
print("\n" + "=" * 80)
print("5. Ejemplo: 5 albaranes pendientes (tipodoc=4 sin fechafin) y sus líneas")
print("=" * 80)
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.tipodoc, vc.fecha, vc.total, vc.fechafin,
           (SELECT COUNT(*) FROM ventas_lineas vl WHERE vl.idcab = vc.id) AS num_lineas
    FROM ventas_cabeceras vc
    WHERE EXTRACT(YEAR FROM vc.fecha) = 2025 AND vc.tipodoc = 4 AND vc.fechafin IS NULL
    ORDER BY vc.fecha DESC LIMIT 5
""")
for r in cur.fetchall():
    print(f"  id={r['id']}  serie={r['serie']}  num={r['numero']}  tipodoc={r['tipodoc']}  "
          f"fecha={r['fecha']}  total={r['total']:.2f}  fechafin={r['fechafin']}  lineas={r['num_lineas']}")

cur.close()
conn.close()
