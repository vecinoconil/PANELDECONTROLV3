import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# tipos_iva
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tipos_iva' ORDER BY ordinal_position")
print('=== TIPOS_IVA COLS:', [r['column_name'] for r in cur.fetchall()])
cur.execute("SELECT * FROM tipos_iva LIMIT 10")
print('=== TIPOS_IVA:', [dict(r) for r in cur.fetchall()])
print()

# precios_clipro - check for a specific client
cur.execute("""SELECT * FROM precios_clipro WHERE cliente=104 AND anulado=0 LIMIT 5""")
print('=== PRECIOS_CLIPRO CLIENTE 104:', [dict(r) for r in cur.fetchall()])
print()

# tarifas_especiales_detalle for tarifa 9 (used by client 104)
cur.execute("SELECT * FROM tarifas_especiales_detalle WHERE codigo_tarifa=9 LIMIT 10")
print('=== TARIFA ESP 9 DETALLE:', [dict(r) for r in cur.fetchall()])
print()

# Check if tipoiva in articulos is the code or the % 
# Let's check tipos_iva table
cur.execute("SELECT * FROM tipos_iva")
print('=== ALL TIPOS_IVA:', [dict(r) for r in cur.fetchall()])
print()

# Check articulo familia join to understand special conditions
cur.execute("""
    SELECT a.referencia, a.nombre, a.tipoiva, a.familia,
           ap.precio, ap.precio_iva
    FROM articulos a
    JOIN articulos_precios ap ON ap.referencia = a.referencia AND ap.tarifa = 1
    WHERE a.obsoleto = 0 AND a.familia = 45
    LIMIT 5
""")
print('=== ARTICULOS FAMILIA 45 (tarifa 1):', [dict(r) for r in cur.fetchall()])

conn.close()
