import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                        user='SOLBA', password='solba2012', cursor_factory=RealDictCursor)
cur = conn.cursor()
for table in ['ventas_lineas', 'compras_lineas']:
    cur.execute("""SELECT column_name, data_type FROM information_schema.columns
                   WHERE table_name=%s ORDER BY ordinal_position""", (table,))
    cols = cur.fetchall()
    print(f"=== {table} ({len(cols)} cols) ===")
    for c in cols[:30]:
        print(f"  {c['column_name']:30s} {c['data_type']}")
    print()

# Also check a sample ventas_lineas row
cur.execute("SELECT * FROM ventas_lineas WHERE idcab=(SELECT id FROM ventas_cabeceras WHERE tipodoc=8 AND serie='CI 26' AND numero=1 LIMIT 1) LIMIT 3")
rows = cur.fetchall()
print("=== Sample ventas_lineas for CI 26/1 ===")
for r in rows:
    for k, v in r.items():
        if v is not None and v != '' and v != 0 and v != False:
            print(f"  {k:30s} = {v}")
    print("  ---")

cur.close()
conn.close()
