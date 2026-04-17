import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# clientes.tipo and subtipo
cur.execute("SELECT DISTINCT tipo FROM clientes WHERE tipo IS NOT NULL AND tipo != '' ORDER BY tipo LIMIT 20")
print("clientes.tipo:", [r['tipo'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT subtipo FROM clientes WHERE subtipo IS NOT NULL AND subtipo != '' ORDER BY subtipo LIMIT 20")
print("clientes.subtipo:", [r['subtipo'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT ruta FROM clientes WHERE ruta IS NOT NULL AND ruta != '' ORDER BY ruta LIMIT 20")
print("clientes.ruta:", [r['ruta'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT localidad FROM clientes WHERE localidad IS NOT NULL AND localidad != '' ORDER BY localidad LIMIT 10")
print("clientes.localidad (sample):", [r['localidad'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT cpostal FROM clientes WHERE cpostal IS NOT NULL AND cpostal != '' ORDER BY cpostal LIMIT 10")
print("clientes.cpostal:", [r['cpostal'] for r in cur.fetchall()])

# articulos.tipo, marca, subfamilia
cur.execute("SELECT DISTINCT tipo FROM articulos WHERE tipo IS NOT NULL AND tipo != '' ORDER BY tipo LIMIT 20")
print("\narticulos.tipo:", [r['tipo'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT marca FROM articulos WHERE marca IS NOT NULL AND marca != '' ORDER BY marca LIMIT 10")
print("articulos.marca (sample):", [r['marca'] for r in cur.fetchall()])

# Check if there's a marcas-like table by looking at tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%marca%'")
print("\ntables like marca:", [r['table_name'] for r in cur.fetchall()])

# familias sample
cur.execute("SELECT codigo, nombre FROM familias ORDER BY nombre LIMIT 10")
print("\nfamilias:", [(r['codigo'], r['nombre']) for r in cur.fetchall()])

# subfamilias sample
cur.execute("SELECT codigo, nombre, familia FROM subfamilias ORDER BY familia, nombre LIMIT 10")
print("subfamilias:", [(r['codigo'], r['nombre'], r['familia']) for r in cur.fetchall()])

# ventas_cabeceras.agente - check agentes table
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%agente%'")
print("\ntables like agente:", [r['table_name'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT agente FROM ventas_cabeceras WHERE agente IS NOT NULL AND agente != 0 ORDER BY agente LIMIT 20")
print("agentes en ventas:", [r['agente'] for r in cur.fetchall()])

# Count
cur.execute("SELECT COUNT(*) as c FROM clientes WHERE obsoleto = FALSE OR obsoleto IS NULL")
print("\nClientes activos:", cur.fetchone()['c'])

cur.execute("SELECT COUNT(*) as c FROM clientes")
print("Clientes total:", cur.fetchone()['c'])

cur.close(); conn.close()
