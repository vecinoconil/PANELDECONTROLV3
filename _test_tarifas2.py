import psycopg2, psycopg2.extras

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012',
    cursor_factory=psycopg2.extras.RealDictCursor
)
cur = conn.cursor()

# Find client with tarifaespecial AND recent consumption
cur.execute("""
    SELECT c.codigo, c.nombre, c.tarifabase, c.tarifaespecial, COUNT(DISTINCT vl.referencia) AS refs
    FROM clientes c
    JOIN ventas_cabeceras vc ON vc.cli_codigo = c.codigo
    JOIN ventas_lineas vl ON vl.idcab = vc.id
    WHERE c.tarifaespecial > 0 AND c.obsoleto=0 AND c.activo=true
      AND vc.tipodoc IN (2,4,8) AND vc.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND vl.referencia IS NOT NULL AND vl.referencia != '' AND vl.unidades > 0
    GROUP BY c.codigo, c.nombre, c.tarifabase, c.tarifaespecial
    HAVING COUNT(DISTINCT vl.referencia) > 0
    ORDER BY refs DESC LIMIT 3
""")
clientes = cur.fetchall()
print("Clientes con tarifaespecial y consumo reciente:")
for c in clientes:
    print(dict(c))

if not clientes:
    print("NINGUNO encontrado")
    conn.close()
    exit()

cli = {'codigo': 126, 'nombre': 'INNOVA, 24h, S.L.', 'tarifabase': 0, 'tarifaespecial': 0}  # sustituir tras consulta
cli_codigo = int(cli['codigo'])
tarifabase = int(cli['tarifabase'] or 1)
tarifaespecial = int(cli['tarifaespecial'] or 0)
print(f"\nCliente seleccionado: {cli_codigo} ({cli['nombre']}), tarifabase={tarifabase}, tarifaespecial={tarifaespecial}")

# Get consumption refs
cur.execute("""
    SELECT vl.referencia, a.familia, COALESCE(ap.precio, 0.0)::float AS precio_base
    FROM ventas_lineas vl
    JOIN ventas_cabeceras vc ON vc.id = vl.idcab
    LEFT JOIN articulos a ON a.referencia = vl.referencia
    LEFT JOIN articulos_precios ap ON ap.referencia = vl.referencia AND ap.tarifa = %(tarifa)s
    WHERE vc.cli_codigo = %(cli)s
      AND vc.tipodoc IN (2,4,8)
      AND vc.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND vl.referencia IS NOT NULL AND vl.referencia != ''
      AND vl.unidades > 0
    GROUP BY vl.referencia, a.familia, ap.precio
    LIMIT 20
""", {"cli": cli_codigo, "tarifa": tarifabase})
rows = cur.fetchall()
refs = [r['referencia'] for r in rows]
familias = list({r['familia'] for r in rows if r['familia'] and r['familia'] > 0})
print(f"\nRefs en consumo: {refs}")
print(f"Familias: {familias}")

# Show ALL conditions for this special tariff
cur.execute("SELECT * FROM tarifas_especiales_detalle WHERE codigo_tarifa = %s LIMIT 30", (tarifaespecial,))
all_esp = cur.fetchall()
print(f"\nTODAS las condiciones de tarifa {tarifaespecial} ({len(all_esp)} filas):")
for r in all_esp:
    print(dict(r))

# Check which ones match our refs/families
cur.execute("""
    SELECT referencia, familia, descuento::float, precio::float
    FROM tarifas_especiales_detalle
    WHERE codigo_tarifa = %(cod)s
      AND (
        (referencia = ANY(%(refs)s) AND referencia != '')
        OR (familia = ANY(%(fams)s) AND referencia = '')
        OR (familia = 0 AND referencia = '')
      )
""", {"cod": tarifaespecial, "refs": refs, "fams": familias if familias else [-1]})
matched = cur.fetchall()
print(f"\nCondiciones que APLICAN ({len(matched)}):")
for r in matched:
    print(dict(r))

# Also show precios_clipro for this client
cur.execute("""
    SELECT referencia, pvp::float FROM precios_clipro
    WHERE cliente = %s AND anulado = 0 AND referencia = ANY(%s)
    ORDER BY referencia
""", (cli_codigo, refs))
clipro = cur.fetchall()
print(f"\nPrecios_clipro para cliente {cli_codigo} ({len(clipro)}):")
for r in clipro:
    print(dict(r))

conn.close()
