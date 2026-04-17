import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

for table in ['clientes', 'articulos', 'familias', 'subfamilias', 'ventas_lineas', 'ventas_cabeceras', 'marcas']:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position", (table,))
    rows = cur.fetchall()
    print(f"\n=== {table.upper()} ({len(rows)} cols) ===")
    for r in rows:
        print(f"  {r['column_name']}")

# Check sample data for filters
print("\n=== SAMPLE clientes (tipo_cliente, ruta, poblacion, codpostal) ===")
cur.execute("SELECT DISTINCT tipo_cliente FROM clientes WHERE tipo_cliente IS NOT NULL AND tipo_cliente != '' LIMIT 20")
print("tipo_cliente:", [r['tipo_cliente'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT ruta FROM clientes WHERE ruta IS NOT NULL AND ruta != '' ORDER BY ruta LIMIT 20")
print("ruta:", [r['ruta'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT poblacion FROM clientes WHERE poblacion IS NOT NULL AND poblacion != '' ORDER BY poblacion LIMIT 10")
print("poblacion:", [r['poblacion'] for r in cur.fetchall()])

# Check tipoarticulo in articulos
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name LIKE '%tipo%'")
print("\narticulos tipo cols:", [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name LIKE '%marca%'")
print("articulos marca cols:", [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name LIKE '%subfam%'")
print("articulos subfam cols:", [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name LIKE '%stock%'")
print("articulos stock cols:", [r['column_name'] for r in cur.fetchall()])

# Check marcas table
cur.execute("SELECT * FROM marcas LIMIT 5")
print("\nmarcas sample:", [dict(r) for r in cur.fetchall()])

# count clientes
cur.execute("SELECT COUNT(*) as c FROM clientes")
print("\ntotal clientes:", cur.fetchone()['c'])

# Subfamilias structure
cur.execute("SELECT * FROM subfamilias LIMIT 5")
print("\nsubfamilias sample:", [dict(r) for r in cur.fetchall()])

cur.close()
conn.close()
