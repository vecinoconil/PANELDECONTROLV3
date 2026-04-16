import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check tarifaespecial values from clientes
cur.execute("SELECT tarifaespecial, COUNT(*) as cnt FROM clientes WHERE tarifaespecial IS NOT NULL GROUP BY tarifaespecial ORDER BY cnt DESC LIMIT 10")
print('=== CLIENTES TARIFAESPECIAL VALUES:', [dict(r) for r in cur.fetchall()])

# Check tarifabase values from clientes
cur.execute("SELECT tarifabase, COUNT(*) as cnt FROM clientes WHERE tarifabase IS NOT NULL GROUP BY tarifabase ORDER BY cnt DESC LIMIT 10")
print('=== CLIENTES TARIFABASE VALUES:', [dict(r) for r in cur.fetchall()])

# Check tarifas_especiales table
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifas_especiales' ORDER BY ordinal_position")
print('=== TARIFAS_ESPECIALES COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifas_especiales LIMIT 5")
print('=== TARIFAS_ESPECIALES SAMPLE:', [dict(r) for r in cur.fetchall()])

# Check tarifas_especiales_detalle
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifas_especiales_detalle' ORDER BY ordinal_position")
print('=== TARIFAS_ESPECIALES_DETALLE COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifas_especiales_detalle LIMIT 5")
print('=== TARIFAS_ESPECIALES_DETALLE SAMPLE:', [dict(r) for r in cur.fetchall()])

# Check tarifas table 
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifas' ORDER BY ordinal_position")
print('=== TARIFAS COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifas LIMIT 5")
print('=== TARIFAS SAMPLE:', [dict(r) for r in cur.fetchall()])

# Check articulos for stock columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND (column_name ILIKE '%%stock%%' OR column_name ILIKE '%%exist%%' OR column_name ILIKE '%%cantid%%') ORDER BY column_name")
print('=== ARTICULOS STOCK/QTY COLUMNS:', [r['column_name'] for r in cur.fetchall()])

# Sample articulos stock
cur.execute("SELECT referencia, nombre, sinstock, stock_virtual_proveedores FROM articulos WHERE referencia != '' LIMIT 3")
print('=== ARTICULOS STOCK SAMPLE:', [dict(r) for r in cur.fetchall()])

# Check if there's a stock field in another table
cur.execute("SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%%stockactual%%' OR column_name = 'stock' ORDER BY table_name")
print('=== STOCK COLUMNS ACROSS TABLES:', [dict(r) for r in cur.fetchall()])

# Check contratos table 
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='contratos' ORDER BY ordinal_position LIMIT 25")
print('=== CONTRATOS COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT id, n_contrato, codigo_cli, descripcion, tipo FROM contratos LIMIT 5")
print('=== CONTRATOS SAMPLE:', [dict(r) for r in cur.fetchall()])

conn.close()
