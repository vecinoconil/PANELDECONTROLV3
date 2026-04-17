import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# clientes.tipo (integer)
cur.execute("SELECT DISTINCT tipo FROM clientes WHERE tipo IS NOT NULL ORDER BY tipo LIMIT 20")
print("clientes.tipo:", [r['tipo'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT subtipo FROM clientes WHERE subtipo IS NOT NULL ORDER BY subtipo LIMIT 20")
print("clientes.subtipo:", [r['subtipo'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT ruta FROM clientes WHERE ruta IS NOT NULL ORDER BY ruta LIMIT 20")
print("clientes.ruta:", [r['ruta'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT localidad FROM clientes WHERE localidad IS NOT NULL AND localidad != '' ORDER BY localidad LIMIT 10")
print("clientes.localidad:", [r['localidad'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT cpostal FROM clientes WHERE cpostal IS NOT NULL AND cpostal != '' ORDER BY cpostal LIMIT 10")
print("clientes.cpostal:", [r['cpostal'] for r in cur.fetchall()])

# clientes.agente
cur.execute("SELECT DISTINCT agente FROM clientes WHERE agente IS NOT NULL AND agente != 0 ORDER BY agente LIMIT 20")
print("clientes.agente:", [r['agente'] for r in cur.fetchall()])

# articulos.tipo (prob integer), marca (prob integer)
cur.execute("SELECT DISTINCT tipo FROM articulos WHERE tipo IS NOT NULL ORDER BY tipo LIMIT 20")
print("\narticulos.tipo:", [r['tipo'] for r in cur.fetchall()])

cur.execute("SELECT DISTINCT marca FROM articulos WHERE marca IS NOT NULL AND marca != 0 ORDER BY marca LIMIT 10")
print("articulos.marca:", [r['marca'] for r in cur.fetchall()])

# familias
cur.execute("SELECT codigo, nombre FROM familias ORDER BY nombre LIMIT 10")
print("\nfamilias:", [(r['codigo'], r['nombre']) for r in cur.fetchall()])

# subfamilias
cur.execute("SELECT codigo, nombre, familia FROM subfamilias ORDER BY familia, nombre LIMIT 10")
print("subfamilias:", [(r['codigo'], r['nombre'], r['familia']) for r in cur.fetchall()])

# agentes table?
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%agente%'")
print("\nagentes table:", [r['table_name'] for r in cur.fetchall()])

# tipos_articulo table?
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%tipo%'")
print("tipos table:", [r['table_name'] for r in cur.fetchall()])

# Check if there are marcas
cur.execute("SELECT table_name, column_name FROM information_schema.columns WHERE column_name = 'marca' AND table_schema='public'")
print("cols named marca:", [(r['table_name'], r['column_name']) for r in cur.fetchall()])

cur.execute("SELECT COUNT(*) as c FROM clientes WHERE obsoleto IS NOT TRUE")
print("\nClientes activos:", cur.fetchone()['c'])
cur.execute("SELECT COUNT(*) as c FROM clientes")
print("Clientes total:", cur.fetchone()['c'])

cur.close(); conn.close()
