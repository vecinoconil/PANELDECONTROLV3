import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 60)
print("BUSCANDO TABLAS RELACIONADAS CON CONTRATOS")
print("=" * 60)
cur.execute("""
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND (
        table_name ILIKE '%contrat%' OR
        table_name ILIKE '%suscri%' OR
        table_name ILIKE '%cuota%' OR
        table_name ILIKE '%mantenimiento%' OR
        table_name ILIKE '%manten%' OR
        table_name ILIKE '%servicio%' OR
        table_name ILIKE '%recurrente%' OR
        table_name ILIKE '%facturacion%'
    )
    ORDER BY table_name
""")
rows = cur.fetchall()
print("Tablas encontradas:", [r['table_name'] for r in rows])
print()

# Explorar todas las tablas que contengan 'contrat'
for row in rows:
    t = row['table_name']
    print(f"\n{'='*50}")
    print(f"TABLA: {t}")
    cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{t}' ORDER BY ordinal_position")
    cols = cur.fetchall()
    print("  Columnas:", [(c['column_name'], c['data_type']) for c in cols])
    
    cur.execute(f"SELECT COUNT(*) as cnt FROM {t}")
    cnt = cur.fetchone()
    print(f"  Registros: {cnt['cnt']}")
    
    if cnt['cnt'] > 0:
        cur.execute(f"SELECT * FROM {t} LIMIT 3")
        samples = cur.fetchall()
        for s in samples:
            print(f"  Sample: {dict(s)}")

print("\n" + "=" * 60)
print("BUSCANDO TABLAS GENÉRICAS (todas las tablas del ERP)")
print("=" * 60)
cur.execute("""
    SELECT table_name, 
           (SELECT COUNT(*) FROM information_schema.columns WHERE table_name=t.table_name) as ncols
    FROM information_schema.tables t
    WHERE table_schema='public'
    ORDER BY table_name
""")
all_tables = cur.fetchall()
print("Todas las tablas:")
for t in all_tables:
    print(f"  {t['table_name']} ({t['ncols']} cols)")

conn.close()
