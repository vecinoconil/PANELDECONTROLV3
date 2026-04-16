import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Contratos sample 
cur.execute("SELECT id, cli_codigo, numero_contrato, concepto, importe, fecha_entrada_en_vigor, fecha_fin FROM contratos LIMIT 5")
print('=== CONTRATOS SAMPLE:', [dict(r) for r in cur.fetchall()])

# Count contratos 
cur.execute("SELECT COUNT(*) as cnt FROM contratos")
print('=== CONTRATOS COUNT:', dict(cur.fetchone()))

# Check almacen/stock tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%almac%%' OR table_name ILIKE '%%invent%%' ORDER BY table_name")
print('=== ALMACEN/INVENTARIO TABLES:', [r['table_name'] for r in cur.fetchall()])

# Check articulos_almacen for stock
cur.execute("SELECT table_name, column_name FROM information_schema.columns WHERE table_name ILIKE '%%articulos_almac%%' ORDER BY table_name, ordinal_position LIMIT 20")
print('=== ARTICULOS_ALMACEN COLUMNS:', [dict(r) for r in cur.fetchall()])

# Try articulos_almacen
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'articulos_almacen'")
aa = cur.fetchone()
if aa:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='articulos_almacen' ORDER BY ordinal_position")
    print('=== ARTICULOS_ALMACEN COLS:', [r['column_name'] for r in cur.fetchall()])
    cur.execute("SELECT * FROM articulos_almacen LIMIT 3")
    print('=== ARTICULOS_ALMACEN SAMPLE:', [dict(r) for r in cur.fetchall()])

# Look for stock actual
cur.execute("SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%%stockact%%' OR column_name ILIKE '%%stock_act%%' ORDER BY table_name")
print('=== STOCK ACTUAL COLS:', [dict(r) for r in cur.fetchall()])

# Check articulos_almacenes
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%%articulos%%almac%%'")
print('=== ARTICULOS ALMACEN TABLES:', [r['table_name'] for r in cur.fetchall()])

# Tarifas_especiales - check how client condiciones especiales work
# From screenshot: "1250 - 11140 Trazos, S.L. (Tarifa: 18)"
# So tarifa number is tarifaespecial from clientes table
cur.execute("SELECT codigo, nombre FROM tarifas_especiales ORDER BY codigo")
print('=== ALL TARIFAS_ESPECIALES:', [dict(r) for r in cur.fetchall()])

# Check tarifa_esp_dto
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifa_esp_dto' ORDER BY ordinal_position")
print('=== TARIFA_ESP_DTO COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifa_esp_dto LIMIT 5")
print('=== TARIFA_ESP_DTO SAMPLE:', [dict(r) for r in cur.fetchall()])

# Check tarifa_esp_dto_detalle
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tarifa_esp_dto_detalle' ORDER BY ordinal_position")
print('=== TARIFA_ESP_DTO_DETALLE COLUMNS:', [r['column_name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM tarifa_esp_dto_detalle LIMIT 5")
print('=== TARIFA_ESP_DTO_DETALLE SAMPLE:', [dict(r) for r in cur.fetchall()])

conn.close()
