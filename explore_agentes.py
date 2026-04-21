import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                       user='SOLBA', password='solba2012', connect_timeout=10, cursor_factory=RealDictCursor)
cur = conn.cursor()

# Check agentes table structure
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agentes' ORDER BY ordinal_position")
print("=== TABLA AGENTES ===")
for r in cur.fetchall():
    print(r['column_name'], '-', r['data_type'])

# Check if igesvisitas exists
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%visita%%' OR table_name ILIKE '%%iges%%'")
print("\n=== TABLAS VISITAS/IGES ===")
for r in cur.fetchall():
    print(r['table_name'])

# Sample agente row
cur.execute("SELECT * FROM agentes LIMIT 1")
r = cur.fetchone()
print("\n=== SAMPLE AGENTE ===")
if r:
    for k, v in r.items():
        print(f"{k}: {v}")

# Check comisiones table
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%comision%%'")
print("\n=== TABLAS COMISIONES ===")
for r in cur.fetchall():
    print(r['table_name'])

# Check vencimientos/cobros for agent related
cur.execute("""SELECT column_name FROM information_schema.columns 
               WHERE table_name = 'ventas_cabeceras' AND column_name ILIKE '%%agente%%'""")
print("\n=== CAMPOS AGENTE EN VENTAS_CABECERAS ===")
for r in cur.fetchall():
    print(r['column_name'])

# Check ventas_cabeceras columns
cur.execute("""SELECT column_name, data_type FROM information_schema.columns 
               WHERE table_name = 'ventas_cabeceras' ORDER BY ordinal_position""")
print("\n=== VENTAS_CABECERAS COLUMNAS ===")
for r in cur.fetchall():
    print(r['column_name'], '-', r['data_type'])

conn.close()
