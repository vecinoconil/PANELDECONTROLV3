import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012', connect_timeout=10, cursor_factory=RealDictCursor)
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='familias' ORDER BY ordinal_position")
print('familias:', [(r['column_name'], r['data_type']) for r in cur.fetchall()])
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos' AND column_name='familia'")
print('articulos.familia:', [(r['column_name'], r['data_type']) for r in cur.fetchall()])
cur.execute("SELECT a.familia, f.nombre FROM articulos a LEFT JOIN familias f ON a.familia = f.codigo LIMIT 5")
for r in cur.fetchall():
    print(dict(r))
conn.close()
