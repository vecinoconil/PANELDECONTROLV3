import psycopg2, psycopg2.extras

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='PANELCONTROLV3',
    user='SOLBA', password='solba2012',
    cursor_factory=psycopg2.extras.RealDictCursor
)
cur = conn.cursor()

print("=== Empresas ===")
cur.execute("SELECT id, nombre, pg_host, pg_port, pg_name, pg_user, pg_password FROM empresas WHERE id=1")
emp = dict(cur.fetchone())
print(emp)
conn.close()

# Conectar a la BD ERP
conn2 = psycopg2.connect(
    host=emp['pg_host'], port=emp['pg_port'], dbname=emp['pg_name'],
    user=emp['pg_user'], password=emp['pg_password'],
    cursor_factory=psycopg2.extras.RealDictCursor
)
cur2 = conn2.cursor()

print()
print("=== Columnas articulos relacionadas con unidad ===")
cur2.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos' AND column_name ILIKE '%unidad%' ORDER BY ordinal_position")
for r in cur2.fetchall():
    print(r['column_name'], '-', r['data_type'])

print()
print("=== Columnas ventas_lineas ===")
cur2.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ventas_lineas' ORDER BY ordinal_position")
for r in cur2.fetchall():
    print(r['column_name'], '-', r['data_type'])

cur.execute("SELECT id, nombre, pg_host, pg_port, pg_name, pg_user, pg_password FROM empresas WHERE id=5")
emp5 = dict(cur.fetchone())
conn.close()

conn3 = psycopg2.connect(
    host=emp5['pg_host'], port=emp5['pg_port'], dbname=emp5['pg_name'],
    user=emp5['pg_user'], password=emp5['pg_password'],
    cursor_factory=psycopg2.extras.RealDictCursor
)
cur3 = conn3.cursor()
print(f"=== Empresa: {emp5['nombre']} ===")
print()
print("=== Articulos con tipo_unidad=1 (muestra) ===")
cur3.execute("SELECT referencia, nombre, tipo_unidad, unidad FROM articulos WHERE tipo_unidad = 1 LIMIT 10")
for r in cur3.fetchall():
    print(dict(r))

print()
print("=== Ventas lineas con tipo_unidad=1 (muestra) ===")
cur3.execute("""
    SELECT vl.referencia, vl.descripcion, vl.unidades, vl.gramos, vl.tipo_unidad, a.unidad
    FROM ventas_lineas vl
    JOIN articulos a ON a.referencia = vl.referencia
    WHERE vl.tipo_unidad = 1
    LIMIT 5
""")
for r in cur3.fetchall():
    print(dict(r))

conn3.close()

conn.close()
