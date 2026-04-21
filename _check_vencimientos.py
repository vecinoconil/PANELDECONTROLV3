import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012', connect_timeout=10, cursor_factory=RealDictCursor
)
cur = conn.cursor()

print("=== Columnas vencimientos ===")
cur.execute("""SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='vencimientos' ORDER BY ordinal_position""")
for r in cur.fetchall():
    print(f"  {r['column_name']:30s} {r['data_type']}")

print("\n=== Ejemplo vencimiento COBRADO (tipo=0, situacion<>0) ===")
cur.execute("SELECT * FROM vencimientos WHERE tipo=0 AND situacion<>0 LIMIT 1")
r = cur.fetchone()
if r:
    for k, v in r.items():
        print(f"  {k}: {v}")

print("\n=== Columnas clientes ===")
cur.execute("""SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='clientes' ORDER BY ordinal_position""")
for r in cur.fetchall():
    print(f"  {r['column_name']:30s} {r['data_type']}")

print("\n=== Ejemplo cliente ===")
cur.execute("SELECT * FROM clientes LIMIT 1")
r = cur.fetchone()
if r:
    for k, v in r.items():
        print(f"  {k}: {v}")

print("\n=== tipodoc values in ventas_cabeceras ===")
cur.execute("SELECT tipodoc, COUNT(*) as cnt FROM ventas_cabeceras GROUP BY tipodoc ORDER BY tipodoc")
for r in cur.fetchall():
    print(f"  tipodoc={r['tipodoc']}: {r['cnt']} registros")

conn.close()
