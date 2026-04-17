import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check articulos_stock structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos_stock' ORDER BY ordinal_position")
print('=== ARTICULOS_STOCK COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM articulos_stock LIMIT 3")
print('=== ARTICULOS_STOCK SAMPLE:', [dict(r) for r in cur.fetchall()])

# Check almacenes_stock 
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='almacenes_stock' ORDER BY ordinal_position")
print('=== ALMACENES_STOCK COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM almacenes_stock LIMIT 3")
print('=== ALMACENES_STOCK SAMPLE:', [dict(r) for r in cur.fetchall()])

# Image 2 shows "Stock: 0 ⚠" - let's check how stock is calculated
# Try almacenes_stock sum by referencia
cur.execute("SELECT referencia, SUM(stock_actual) as stock FROM articulos_stock GROUP BY referencia HAVING SUM(stock_actual) > 0 LIMIT 5")
print('=== ARTICULOS WITH STOCK:', [dict(r) for r in cur.fetchall()])

# Check clientes fields for condiciones especiales screenshot  
# Shows: "1250 - 11140 Trazos, S.L. (Tarifa: 18)"
# 1250 = client code? Let me check
cur.execute("SELECT codigo, nombre, tarifaespecial FROM clientes WHERE codigo = 1250")
print('=== CLIENTE 1250:', [dict(r) for r in cur.fetchall()])

# The condiciones especiales tab shows clients with tarifaespecial > 0
# Let me check tarifas_especiales_detalle for a tarifa
cur.execute("SELECT * FROM tarifas_especiales_detalle WHERE codigo_tarifa = 9 LIMIT 10")
print('=== TARIFA 9 DETALLE:', [dict(r) for r in cur.fetchall()])

cur.execute("SELECT COUNT(*) as cnt FROM tarifas_especiales_detalle")
print('=== TOTAL TARIFAS_ESPECIALES_DETALLE:', dict(cur.fetchone()))

# Check ventas_cabeceras tipodoc values for contracts
cur.execute("SELECT tipodoc, COUNT(*) as cnt FROM ventas_cabeceras GROUP BY tipodoc ORDER BY tipodoc")
print('=== VENTAS_CABECERAS TIPODOC:', [dict(r) for r in cur.fetchall()])

# Check contratos_articulos for the "ventas por agente" expanded view
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='contratos_articulos' ORDER BY ordinal_position")
print('=== CONTRATOS_ARTICULOS COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM contratos_articulos LIMIT 3")
print('=== CONTRATOS_ARTICULOS SAMPLE:', [dict(r) for r in cur.fetchall()])

conn.close()
