import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# precios_clipro - precios especificos por cliente
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='precios_clipro' ORDER BY ordinal_position")
rows = cur.fetchall()
print('=== PRECIOS_CLIPRO COLS:', [(r['column_name'], r['data_type']) for r in rows])
cur.execute("SELECT * FROM precios_clipro LIMIT 5")
print('=== PRECIOS_CLIPRO SAMPLE:', [dict(r) for r in cur.fetchall()])
print()

# tipoiva is already the % or a code?
# check with a real article
cur.execute("SELECT referencia, nombre, tipoiva FROM articulos WHERE obsoleto=0 AND referencia IS NOT NULL LIMIT 10")
print('=== ARTICULOS TIPOIVA SAMPLE:', [dict(r) for r in cur.fetchall()])
print()

# tipos_iva table
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%tipo%iva%' OR table_name ILIKE '%iva%tipo%' ORDER BY table_name")
print('=== TABLA TIPOS_IVA:', [r['table_name'] for r in cur.fetchall()])

# articulos_precios: get a real example with tarifa 1
cur.execute("""
    SELECT ap.referencia, ap.tarifa, ap.precio, ap.precio_iva, a.nombre, a.tipoiva
    FROM articulos_precios ap
    JOIN articulos a ON a.referencia = ap.referencia
    WHERE ap.tarifa = 1 AND a.obsoleto = 0
    LIMIT 5
""")
print('=== PRECIOS CON TARIFA 1:', [dict(r) for r in cur.fetchall()])
print()

# Check a client with tarifaespecial
cur.execute("SELECT codigo, nombre, tarifabase, tarifaespecial FROM clientes WHERE tarifaespecial > 0 LIMIT 5")
print('=== CLIENTES CON TARIFA ESPECIAL:', [dict(r) for r in cur.fetchall()])

conn.close()
