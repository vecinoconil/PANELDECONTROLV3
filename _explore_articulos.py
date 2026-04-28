import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# articulos cols
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos' ORDER BY ordinal_position")
print('=== ARTICULOS COLS:', [(r['column_name'], r['data_type']) for r in cur.fetchall()])
print()

# articulos sample - find precio cols
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name ILIKE '%precio%' ORDER BY column_name")
print('=== ARTICULOS PRECIO COLS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name ILIKE '%piva%' ORDER BY column_name")
print('=== ARTICULOS PIVA COLS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT referencia, nombre, tipoiva FROM articulos WHERE obsoleto=0 LIMIT 3")
print('=== ARTICULOS SAMPLE:', [dict(r) for r in cur.fetchall()])
print()

# tarifas especiales cols
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifas_especiales' ORDER BY ordinal_position")
print('=== TARIFAS_ESPECIALES COLS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifas_especiales LIMIT 5")
print('=== TARIFAS_ESPECIALES:', [dict(r) for r in cur.fetchall()])
print()

# tarifas_especiales_detalle
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifas_especiales_detalle' ORDER BY ordinal_position")
print('=== TARIFA_ESP_DET COLS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifas_especiales_detalle LIMIT 5")
print('=== TARIFA_ESP_DET SAMPLE:', [dict(r) for r in cur.fetchall()])
print()

# tablas condicion/especial
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%condicion%' OR table_name ILIKE '%especial%' ORDER BY table_name")
print('=== TABLAS CONDICION/ESPECIAL:', [r['table_name'] for r in cur.fetchall()])
print()

# clientes_condiciones
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='clientes_condiciones' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== CLIENTES_CONDICIONES COLS:', [r['column_name'] for r in rows])
    cur.execute("SELECT * FROM clientes_condiciones LIMIT 5")
    print('=== CLIENTES_CONDICIONES SAMPLE:', [dict(r) for r in cur.fetchall()])
else:
    print('clientes_condiciones: NO EXISTE')
print()

# clientes_especiales (precios especiales por cliente y articulo)
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='clientes_especiales' ORDER BY ordinal_position")
rows = cur.fetchall()
if rows:
    print('=== CLIENTES_ESPECIALES COLS:', [r['column_name'] for r in rows])
    cur.execute("SELECT * FROM clientes_especiales LIMIT 5")
    print('=== CLIENTES_ESPECIALES SAMPLE:', [dict(r) for r in cur.fetchall()])
else:
    print('clientes_especiales: NO EXISTE')

conn.close()
