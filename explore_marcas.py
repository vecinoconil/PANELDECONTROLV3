import psycopg2, psycopg2.extras
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Buscar tablas con "marca"
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%marca%' ORDER BY table_name")
print("Tables like marca:", [r['table_name'] for r in cur.fetchall()])

# articulos_modelos (tiene columna marca)
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos_modelos' ORDER BY ordinal_position")
print("\narticulos_modelos cols:", [(r['column_name'], r['data_type']) for r in cur.fetchall()])

cur.execute("SELECT * FROM articulos_modelos WHERE marca IS NOT NULL ORDER BY marca, codigo LIMIT 20")
print("articulos_modelos sample:", [dict(r) for r in cur.fetchall()])

# Buscar tabla articulos_marcas
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'articulos%' ORDER BY table_name")
print("\nTables like articulos%:", [r['table_name'] for r in cur.fetchall()])

# Intentar marcas directamente
try:
    cur.execute("SELECT * FROM marcas LIMIT 5")
    print("\nmarcas sample:", [dict(r) for r in cur.fetchall()])
except Exception as e:
    print(f"\nmarcas error: {e}")
    conn.rollback()

# Buscar cualquier tabla con codigo+nombre que pueda ser marcas
cur.execute("""
    SELECT t.table_name, 
           STRING_AGG(c.column_name, ', ' ORDER BY c.ordinal_position) as cols
    FROM information_schema.tables t
    JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE t.table_schema = 'public'
      AND t.table_name LIKE '%marca%'
    GROUP BY t.table_name
""")
print("\nMarca tables detail:", [dict(r) for r in cur.fetchall()])

# Probar con un ID de marca conocido (29 es el más usado)
cur.execute("SELECT DISTINCT a.marca FROM articulos a WHERE a.marca IS NOT NULL AND a.marca > 0 ORDER BY a.marca")
marcas_ids = [r['marca'] for r in cur.fetchall()]
print(f"\nAll marca IDs in articulos: {marcas_ids}")

cur.close()
conn.close()
