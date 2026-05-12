import psycopg2, psycopg2.extras
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Find a client with tarifaespecial > 0
cur.execute("SELECT codigo, nombre, tarifabase, tarifaespecial FROM clientes WHERE tarifaespecial > 0 AND obsoleto=0 AND activo=true LIMIT 5")
clients = cur.fetchall()
print('Clientes con tarifaespecial:', [dict(c) for c in clients])

if not clients:
    print('No hay clientes con tarifaespecial')
    conn.close()
    exit()

cli = clients[0]
cli_codigo = cli['codigo']
tarifabase = int(cli['tarifabase'] or 1)
tarifaespecial = int(cli['tarifaespecial'] or 0)
print(f'\nUsando cliente {cli_codigo} ({cli["nombre"]}): tarifabase={tarifabase}, tarifaespecial={tarifaespecial}')

# Get consumption refs
cur.execute("""
    SELECT vl.referencia, vl.descripcion, SUM(vl.unidades)::float as uds
    FROM ventas_lineas vl
    JOIN ventas_cabeceras vc ON vc.id = vl.idcab
    WHERE vc.cli_codigo = %s
      AND vc.tipodoc IN (2,4,8)
      AND vc.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND vl.referencia IS NOT NULL AND vl.referencia != ''
      AND vl.unidades > 0
    GROUP BY vl.referencia, vl.descripcion
    LIMIT 10
""", (cli_codigo,))
rows = cur.fetchall()
refs = [r['referencia'] for r in rows]
print(f'\nRefs consumo 90d: {refs}')

if not refs:
    print('Sin consumo en 90 dias')
    conn.close()
    exit()

# Get base prices + families
cur.execute("""
    SELECT a.referencia, a.familia, COALESCE(ap.precio, 0.0)::float AS precio_base
    FROM articulos a
    LEFT JOIN articulos_precios ap ON ap.referencia = a.referencia AND ap.tarifa = %s
    WHERE a.referencia = ANY(%s)
""", (tarifabase, refs))
pbs = cur.fetchall()
precios_base = {}
familias_set = set()
for pb in pbs:
    precios_base[pb['referencia']] = {'precio': float(pb['precio_base']), 'familia': pb['familia'] or 0}
    if pb['familia'] and pb['familia'] > 0:
        familias_set.add(pb['familia'])
familias = list(familias_set)
print(f'\nFamilias encontradas: {familias}')
print(f'Precios base: {precios_base}')

# Check special conditions
print(f'\nBuscando condiciones especiales para tarifa {tarifaespecial}, refs={refs}, fams={familias if familias else [-1]}')
cur.execute("""
    SELECT referencia, familia, descuento::float, precio::float
    FROM tarifas_especiales_detalle
    WHERE codigo_tarifa = %(cod)s
      AND (
        (referencia = ANY(%(refs)s) AND referencia != '')
        OR (familia = ANY(%(fams)s) AND referencia = '')
        OR (familia = 0 AND referencia = '')
      )
""", {'cod': tarifaespecial, 'refs': refs, 'fams': familias if familias else [-1]})
esp_rows = cur.fetchall()
print(f'Condiciones especiales encontradas ({len(esp_rows)}):', [dict(r) for r in esp_rows])

# Verify global conditions exist for this tariff
cur.execute("SELECT * FROM tarifas_especiales_detalle WHERE codigo_tarifa = %s", (tarifaespecial,))
all_esp = cur.fetchall()
print(f'\nTODAS las condiciones de la tarifa {tarifaespecial} ({len(all_esp)}):', [dict(r) for r in all_esp])

conn.close()
