import psycopg2, psycopg2.extras

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012',
    cursor_factory=psycopg2.extras.RealDictCursor
)
cur = conn.cursor()
CLI = 126

# Datos del cliente
cur.execute("SELECT codigo, nombre, tarifabase, tarifaespecial FROM clientes WHERE codigo = %s", (CLI,))
cli = dict(cur.fetchone())
print("Cliente:", cli)
tarifabase = int(cli['tarifabase'] or 1)
tarifaespecial = int(cli['tarifaespecial'] or 0)

# TODAS las condiciones especiales de su tarifa
print(f"\nTarifaespecial = {tarifaespecial}")
if tarifaespecial > 0:
    cur.execute("SELECT * FROM tarifas_especiales_detalle WHERE codigo_tarifa = %s ORDER BY referencia, familia", (tarifaespecial,))
    rows = cur.fetchall()
    print(f"Condiciones en tarifas_especiales_detalle ({len(rows)}):")
    for r in rows:
        print(" ", dict(r))
else:
    print("  (sin tarifa especial asignada)")

# Precios específicos por cliente (precios_clipro)
cur.execute("SELECT referencia, pvp FROM precios_clipro WHERE cliente = %s AND anulado = 0 ORDER BY referencia", (CLI,))
clipro = cur.fetchall()
print(f"\nPrecios_clipro cliente {CLI} ({len(clipro)}):")
for r in clipro:
    print(" ", dict(r))

# Consumo 90 días
cur.execute("""
    SELECT vl.referencia, vl.descripcion,
           SUM(vl.unidades)::float AS uds,
           COALESCE(MAX(ap.precio), 0.0)::float AS precio_base,
           COALESCE(MAX(a.familia), 0)::int AS familia
    FROM ventas_lineas vl
    JOIN ventas_cabeceras vc ON vc.id = vl.idcab
    LEFT JOIN articulos a ON a.referencia = vl.referencia
    LEFT JOIN articulos_precios ap ON ap.referencia = vl.referencia AND ap.tarifa = %(tarifa)s
    WHERE vc.cli_codigo = %(cli)s
      AND vc.tipodoc IN (2,4,8)
      AND vc.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND vl.referencia IS NOT NULL AND vl.referencia != ''
      AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)
      AND vl.unidades > 0
    GROUP BY vl.referencia, vl.descripcion
    ORDER BY MAX(vc.fecha) DESC
    LIMIT 20
""", {"cli": CLI, "tarifa": tarifabase})
consumo = cur.fetchall()
print(f"\nConsumo 90 días ({len(consumo)} refs):")
for r in consumo:
    print(f"  {r['referencia']:25s} | precio_base={r['precio_base']:.4f} | familia={r['familia']} | {r['descripcion'][:40]}")

conn.close()
