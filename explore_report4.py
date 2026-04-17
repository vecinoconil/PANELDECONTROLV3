import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT COUNT(*) as c FROM clientes WHERE obsoleto = 0 OR obsoleto IS NULL")
print("Clientes activos:", cur.fetchone()['c'])
cur.execute("SELECT COUNT(*) as c FROM clientes")
print("Clientes total:", cur.fetchone()['c'])

# agentes table cols
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='agentes' ORDER BY ordinal_position")
print("\nagentes cols:", [r['column_name'] for r in cur.fetchall()])
cur.execute("SELECT codigo, nombre FROM agentes ORDER BY nombre LIMIT 10")
print("agentes:", [(r['codigo'], r['nombre']) for r in cur.fetchall()])

# clientes_tipos
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='clientes_tipos' ORDER BY ordinal_position")
print("\nclientes_tipos cols:", [r['column_name'] for r in cur.fetchall()])
cur.execute("SELECT * FROM clientes_tipos ORDER BY codigo LIMIT 20")
print("clientes_tipos:", [dict(r) for r in cur.fetchall()])

# articulos_tipos
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos_tipos' ORDER BY ordinal_position")
print("\narticulos_tipos cols:", [r['column_name'] for r in cur.fetchall()])
cur.execute("SELECT * FROM articulos_tipos ORDER BY codigo LIMIT 20")
print("articulos_tipos:", [dict(r) for r in cur.fetchall()])

# articulos_modelos (for marcas)
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos_modelos' ORDER BY ordinal_position")
print("\narticulos_modelos cols:", [r['column_name'] for r in cur.fetchall()])

# Check if there are actual brand names stored elsewhere
cur.execute("SELECT DISTINCT a.marca, COUNT(*) as c FROM articulos a WHERE a.marca IS NOT NULL AND a.marca > 0 GROUP BY a.marca ORDER BY c DESC LIMIT 10")
print("\narticulos marca ids + count:", [(r['marca'], r['c']) for r in cur.fetchall()])

# Sample ventas to verify the join
cur.execute("""
    SELECT COUNT(DISTINCT vc.cli_codigo) as clientes_2025
    FROM ventas_cabeceras vc
    WHERE vc.tipodoc = 8 AND vc.fecha >= '2025-01-01' AND vc.fecha < '2026-01-01'
""")
print("\nClientes con facturas 2025:", cur.fetchone()['clientes_2025'])

cur.execute("""
    SELECT COUNT(DISTINCT vc.cli_codigo) as clientes_2026
    FROM ventas_cabeceras vc
    WHERE vc.tipodoc = 8 AND vc.fecha >= '2026-01-01' AND vc.fecha < '2027-01-01'
""")
print("Clientes con facturas 2026:", cur.fetchone()['clientes_2026'])

cur.close(); conn.close()
