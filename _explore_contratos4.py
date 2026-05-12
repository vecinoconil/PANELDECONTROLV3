import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 70)
print("CONTRATOS_TIPOS - todos los registros activos")
cur.execute("SELECT codigo, concepto, cuota_recibo, indefinido, obsoleto FROM contratos_tipos ORDER BY obsoleto, codigo")
for r in cur.fetchall():
    print(f"  cod={r['codigo']} | obsoleto={r['obsoleto']} | cuota={r['cuota_recibo']} | indefinido={r['indefinido']} | {r['concepto']}")

print("\n" + "=" * 70)
print("CONTRATOS - resumen por tipo_contrato + nombre del tipo")
cur.execute("""
    SELECT ct.codigo, ct.concepto as tipo_nombre, ct.obsoleto,
           COUNT(c.id) as total,
           COUNT(c.id) FILTER (WHERE c.desactivado != TRUE AND c.fecha_baja IS NULL) as activos,
           COUNT(c.id) FILTER (WHERE c.desactivado = TRUE OR c.fecha_baja IS NOT NULL) as bajas,
           SUM(c.cuota_recibo) FILTER (WHERE c.desactivado != TRUE AND c.fecha_baja IS NULL) as cuota_total_mensual
    FROM contratos_tipos ct
    LEFT JOIN contratos c ON c.tipo_contrato = ct.codigo
    GROUP BY ct.codigo, ct.concepto, ct.obsoleto
    HAVING COUNT(c.id) > 0
    ORDER BY activos DESC
""")
for r in cur.fetchall():
    print(f"  [{r['codigo']}] {r['tipo_nombre'][:50]:50s} activos={r['activos']} bajas={r['bajas']} cuota/mes={r['cuota_total_mensual']}")

print("\n" + "=" * 70)
print("CONTRATOS ACTIVOS con cliente")
cur.execute("""
    SELECT c.id, c.numero_contrato, c.cli_codigo, cl.nombre as cli_nombre,
           ct.concepto as tipo_nombre,
           c.cuota_recibo, c.periodicidad, c.fecha_entrada_en_vigor, c.fecha_fin,
           c.indefinido, c.desactivado, c.fecha_baja, c.meses_activos,
           c.impago, c.tipo_iva
    FROM contratos c
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    LEFT JOIN contratos_tipos ct ON ct.codigo = c.tipo_contrato
    WHERE (c.desactivado IS NULL OR c.desactivado = FALSE) AND c.fecha_baja IS NULL
    LIMIT 10
""")
for r in cur.fetchall():
    print(f"  {dict(r)}")

print("\n" + "=" * 70)
print("CONTRATOS_VENCIMIENTOS - muestra con factura relacionada")
cur.execute("""
    SELECT cv.id, cv.id_contrato, cv.numero, cv.fecha, cv.fecha_cobro,
           cv.importe, cv.cli_codigo, cv.id_factura, cv.id_albaran
    FROM contratos_vencimientos cv
    ORDER BY cv.fecha DESC
    LIMIT 10
""")
for r in cur.fetchall():
    print(f"  {dict(r)}")

print("\n" + "=" * 70)
print("CONTRATOS sin factura en un mes concreto (muestra lógica)")
print("Vencimientos de Mayo 2026 - ¿cuáles tienen id_factura NULL?")
cur.execute("""
    SELECT cv.id_contrato, cv.fecha, cv.importe, cv.id_factura, cv.id_albaran,
           c.cli_codigo, cl.nombre as cli_nombre, ct.concepto as tipo
    FROM contratos_vencimientos cv
    LEFT JOIN contratos c ON c.id = cv.id_contrato
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    LEFT JOIN contratos_tipos ct ON ct.codigo = c.tipo_contrato
    WHERE EXTRACT(year FROM cv.fecha) = 2026 AND EXTRACT(month FROM cv.fecha) = 5
    ORDER BY cv.id_factura NULLS FIRST
    LIMIT 20
""")
for r in cur.fetchall():
    print(f"  contrato={r['id_contrato']} fecha={r['fecha']} importe={r['importe']} factura={r['id_factura']} albaran={r['id_albaran']} | {r['cli_nombre']} | {r['tipo']}")

print("\n" + "=" * 70)
print("Contratos que vencen próximos 30 días (fecha_fin no indefinido)")
cur.execute("""
    SELECT c.id, c.numero_contrato, c.cli_codigo, cl.nombre as cli_nombre,
           ct.concepto as tipo_nombre, c.cuota_recibo, c.fecha_fin, c.fecha_renovacion
    FROM contratos c
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    LEFT JOIN contratos_tipos ct ON ct.codigo = c.tipo_contrato
    WHERE c.indefinido != TRUE 
      AND c.fecha_baja IS NULL AND (c.desactivado IS NULL OR c.desactivado = FALSE)
      AND c.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
    ORDER BY c.fecha_fin
    LIMIT 15
""")
rows = cur.fetchall()
print(f"  Encontrados: {len(rows)}")
for r in rows:
    print(f"  {dict(r)}")

conn.close()
