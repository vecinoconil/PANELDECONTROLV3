import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                       user='SOLBA', password='solba2012', connect_timeout=10, cursor_factory=RealDictCursor)
cur = conn.cursor()

cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'igesvisitasfinal' ORDER BY ordinal_position")
print("=== IGESVISITASFINAL ===")
for r in cur.fetchall():
    print(r['column_name'], '-', r['data_type'])

cur.execute("SELECT * FROM igesvisitasfinal LIMIT 3")
print("\n=== SAMPLE ROWS ===")
for row in cur.fetchall():
    print("---")
    for k, v in row.items():
        print(f"  {k}: {v}")

cur.execute("SELECT COUNT(*) as cnt FROM igesvisitasfinal")
print(f"\nTotal rows: {cur.fetchone()['cnt']}")

cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'comisiones' ORDER BY ordinal_position")
print("\n=== COMISIONES ===")
for r in cur.fetchall():
    print(r['column_name'], '-', r['data_type'])

cur.execute("SELECT * FROM comisiones LIMIT 2")
print("\n=== SAMPLE COMISIONES ===")
for row in cur.fetchall():
    print("---")
    for k, v in row.items():
        print(f"  {k}: {v}")

for t in ['xmlvisitasmedios', 'xmlvisitasmotivos', 'xmlvisitasresultados']:
    cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t}' ORDER BY ordinal_position")
    print(f"\n=== {t} ===")
    for r in cur.fetchall():
        print(r['column_name'], '-', r['data_type'])
    cur.execute(f"SELECT * FROM {t} LIMIT 3")
    for row in cur.fetchall():
        print("---")
        for k, v in row.items():
            print(f"  {k}: {v}")

conn.close()
