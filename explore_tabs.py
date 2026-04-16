import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check articulos columns for stock
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name ILIKE '%%stock%%' ORDER BY column_name")
print('=== ARTICULOS STOCK COLUMNS:', [r['column_name'] for r in cur.fetchall()])

# Check clientes tarifa columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='clientes' AND column_name ILIKE '%%tarif%%' ORDER BY column_name")
print('=== CLIENTES TARIFA COLUMNS:', [r['column_name'] for r in cur.fetchall()])

# Check tarifas tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%tarif%%' ORDER BY table_name")
print('=== TARIFA TABLES:', [r['table_name'] for r in cur.fetchall()])

# Check tarifas_lineas columns (if exists)
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%tarif%%linea%%' OR table_name ILIKE '%%tarif%%det%%' ORDER BY table_name")
print('=== TARIFA DETAIL TABLES:', [r['table_name'] for r in cur.fetchall()])

# Check contratos tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%contrat%%' ORDER BY table_name")
print('=== CONTRATOS TABLES:', [r['table_name'] for r in cur.fetchall()])

# Check vencimientos structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='vencimientos' ORDER BY ordinal_position LIMIT 25")
print('=== VENCIMIENTOS COLUMNS:', [r['column_name'] for r in cur.fetchall()])

# Sample tarifa values from clientes
cur.execute("SELECT tarifa, COUNT(*) as cnt FROM clientes WHERE tarifa IS NOT NULL GROUP BY tarifa ORDER BY cnt DESC LIMIT 10")
print('=== CLIENTES TARIFA VALUES:', [dict(r) for r in cur.fetchall()])

# Check all tarifas table columns
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%tarif%%' ORDER BY table_name")
tarifa_tables = [r['table_name'] for r in cur.fetchall()]
for t in tarifa_tables:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{t}' ORDER BY ordinal_position")
    cols = [r['column_name'] for r in cur.fetchall()]
    print(f'=== {t.upper()} COLUMNS:', cols)
    cur.execute(f"SELECT * FROM {t} LIMIT 3")
    rows = [dict(r) for r in cur.fetchall()]
    print(f'=== {t.upper()} SAMPLE:', rows)

# Check clientes.agente field and tarifas connection
cur.execute("SELECT codigo, nombre, tarifa, agente FROM clientes WHERE tarifa IS NOT NULL AND tarifa > 0 LIMIT 5")
print('=== CLIENTES WITH TARIFA:', [dict(r) for r in cur.fetchall()])

conn.close()
