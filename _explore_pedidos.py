import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                        user='SOLBA', password='solba2012', cursor_factory=RealDictCursor)
cur = conn.cursor()

# 1. Columnas ventas_lineas
cur.execute("""SELECT column_name, data_type FROM information_schema.columns
               WHERE table_name='ventas_lineas' ORDER BY ordinal_position""")
cols = cur.fetchall()
print('=== ventas_lineas cols ===')
for c in cols:
    print(f'  {c["column_name"]:30s} {c["data_type"]}')

# 2. Columnas ventas_cabeceras
cur.execute("""SELECT column_name, data_type FROM information_schema.columns
               WHERE table_name='ventas_cabeceras' ORDER BY ordinal_position""")
cols = cur.fetchall()
print()
print('=== ventas_cabeceras cols ===')
for c in cols:
    print(f'  {c["column_name"]:30s} {c["data_type"]}')

# 3. Un pedido ejemplo con sus líneas
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.tipodoc, vc.fecha,
           vc.cli_nombre, vc.total, vc.observaciones
    FROM ventas_cabeceras vc
    WHERE vc.tipodoc=2
    ORDER BY vc.id DESC
    LIMIT 3
""")
pedidos = cur.fetchall()
print()
print('=== Pedidos recientes ===')
for p in pedidos:
    print(dict(p))
    cur.execute("""SELECT * FROM ventas_lineas WHERE idcab=%s
                   AND (linea_cabecera IS NULL OR linea_cabecera=0)
                   LIMIT 5""", (p['id'],))
    lineas = cur.fetchall()
    for l in lineas:
        d = {k: v for k, v in dict(l).items() if v is not None and v != '' and v != 0 and v != False}
        print(f'  LINEA: {d}')
    print()

# 4. Buscar pedido con albarán relacionado
print('=== Cabeceras con pteservir / pedido_origen ===')
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name='ventas_cabeceras'
    AND column_name ILIKE '%serv%' OR column_name ILIKE '%pte%'
    OR column_name ILIKE '%origen%' OR column_name ILIKE '%pedido%'
""")
cols = cur.fetchall()
print('Campos servir/pte/origen en ventas_cabeceras:', [c['column_name'] for c in cols])

cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name='ventas_lineas'
    AND (column_name ILIKE '%serv%' OR column_name ILIKE '%pte%'
    OR column_name ILIKE '%origen%' OR column_name ILIKE '%pedido%')
""")
cols = cur.fetchall()
print('Campos servir/pte/origen en ventas_lineas:', [c['column_name'] for c in cols])

# 5. articulos campos clave
cur.execute("""SELECT column_name FROM information_schema.columns
               WHERE table_name='articulos' ORDER BY ordinal_position""")
cols = cur.fetchall()
print()
print('=== articulos cols ===')
print([c['column_name'] for c in cols])

conn.close()
