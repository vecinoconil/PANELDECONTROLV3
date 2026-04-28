import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Buscar tablas de precios
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%precio%' OR table_name ILIKE '%tarifa%' ORDER BY table_name")
print('=== TABLAS PRECIO/TARIFA:', [r['table_name'] for r in cur.fetchall()])
print()

# articulos_precios
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos_precios' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== ARTICULOS_PRECIOS COLS:', [(r['column_name'], r['data_type']) for r in rows])
    cur.execute("SELECT * FROM articulos_precios LIMIT 3")
    print('=== ARTICULOS_PRECIOS SAMPLE:', [dict(r) for r in cur.fetchall()])
else:
    print('articulos_precios: NO EXISTE')
print()

# tarifas
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tarifas' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== TARIFAS COLS:', [(r['column_name'], r['data_type']) for r in rows])
    cur.execute("SELECT * FROM tarifas LIMIT 5")
    print('=== TARIFAS SAMPLE:', [dict(r) for r in cur.fetchall()])
else:
    print('tarifas: NO EXISTE')
print()

# tarifas_articulos
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tarifas_articulos' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== TARIFAS_ARTICULOS COLS:', [(r['column_name'], r['data_type']) for r in rows])
    cur.execute("SELECT * FROM tarifas_articulos LIMIT 3")
    print('=== TARIFAS_ARTICULOS SAMPLE:', [dict(r) for r in cur.fetchall()])
else:
    print('tarifas_articulos: NO EXISTE')
print()

# tiposiva
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tiposiva' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== TIPOSIVA COLS:', [r['column_name'] for r in rows])
    cur.execute("SELECT * FROM tiposiva LIMIT 5")
    print('=== TIPOSIVA SAMPLE:', [dict(r) for r in cur.fetchall()])
else:
    print('tiposiva: NO EXISTE')
print()

# tarifas_especiales
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tarifas_especiales' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== TARIFAS_ESPECIALES COLS:', [(r['column_name'], r['data_type']) for r in rows])
    cur.execute("SELECT * FROM tarifas_especiales LIMIT 5")
    print('=== TARIFAS_ESPECIALES SAMPLE:', [dict(r) for r in cur.fetchall()])
print()

# tarifas_especiales_detalle
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tarifas_especiales_detalle' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== TARIFAS_ESP_DET COLS:', [(r['column_name'], r['data_type']) for r in rows])
    cur.execute("SELECT * FROM tarifas_especiales_detalle LIMIT 5")
    print('=== TARIFAS_ESP_DET SAMPLE:', [dict(r) for r in cur.fetchall()])
print()

# clientes.tarifabase - sample
cur.execute("SELECT codigo, nombre, tarifabase, tarifaespecial FROM clientes WHERE tarifabase > 0 LIMIT 5")
print('=== CLIENTES CON TARIFA:', [dict(r) for r in cur.fetchall()])
print()

# condiciones especiales: precios especiales por cliente
cur.execute("""SELECT table_name FROM information_schema.tables 
   WHERE table_name ILIKE '%condicion%' OR table_name ILIKE '%precio_cliente%' 
   OR table_name ILIKE '%cliente_precio%' OR table_name ILIKE '%clientes_precio%'
   ORDER BY table_name""")
print('=== TABLAS CONDICION/PRECIO CLIENTE:', [r['table_name'] for r in cur.fetchall()])

conn.close()
