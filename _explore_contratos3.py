import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 70)
print("TABLA: contratos - COLUMNAS")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='contratos' ORDER BY ordinal_position")
cols = cur.fetchall()
for c in cols:
    print(f"  {c['column_name']:40s} {c['data_type']}")

cur.execute("SELECT COUNT(*) as cnt FROM contratos")
print(f"\n  Total registros: {cur.fetchone()['cnt']}")

print("\n--- MUESTRA (3 registros no vacíos) ---")
cur.execute("SELECT * FROM contratos WHERE cli_codigo IS NOT NULL LIMIT 3")
rows = cur.fetchall()
for r in rows:
    for k, v in dict(r).items():
        if v is not None and v != '' and v != 0:
            print(f"  {k}: {v}")
    print()

# Tablas relacionadas con contratos
print("=" * 70)
print("TABLAS RELACIONADAS (contrat*)")
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%contrat%'
    ORDER BY table_name
""")
for r in cur.fetchall():
    t = r['table_name']
    cur.execute(f"SELECT COUNT(*) as cnt FROM {t}")
    cnt = cur.fetchone()['cnt']
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{t}' ORDER BY ordinal_position")
    cols2 = [c['column_name'] for c in cur.fetchall()]
    print(f"  {t}: {cnt} registros. Cols: {cols2}")

# Campos clave de contratos - buscar los que existen
print("\n" + "=" * 70)
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='contratos' ORDER BY ordinal_position")
all_cols = [c['column_name'] for c in cur.fetchall()]
print("Lista completa de columnas:", all_cols)

# Campos de fecha
print("\n" + "=" * 70)
print("CAMPOS DE FECHA en contratos:")
cur.execute("""SELECT column_name FROM information_schema.columns 
    WHERE table_name='contratos' AND data_type IN ('date','timestamp without time zone','timestamp with time zone') 
    ORDER BY ordinal_position""")
date_cols = [c['column_name'] for c in cur.fetchall()]
print(date_cols)

# Campos de importe
print("\nCAMPOS NUMÉRICOS en contratos:")
cur.execute("""SELECT column_name FROM information_schema.columns 
    WHERE table_name='contratos' AND data_type IN ('numeric','double precision','real','integer','bigint','smallint') 
    ORDER BY ordinal_position""")
num_cols = [c['column_name'] for c in cur.fetchall()]
print(num_cols)

# Probar distintos valores en campos candidatos a tipo/estado
for campo in ['tipocontrato', 'tipo', 'estado', 'activo', 'tipofacturacion', 'periodicidad']:
    if campo in all_cols:
        cur.execute(f"SELECT {campo}, COUNT(*) as cnt FROM contratos GROUP BY {campo} ORDER BY cnt DESC")
        rows = cur.fetchall()
        print(f"\nDistintos en '{campo}':")
        for r in rows:
            print(f"  {r[campo]}: {r['cnt']}")

# Relación con clientes - JOIN
print("\n" + "=" * 70)
print("CONTRATOS con cliente info - muestra:")
try:
    cur.execute("""
        SELECT c.id, c.cli_codigo, cl.nombre as cli_nombre, 
               c.fecha_inicio, c.fecha_fin, c.importe, c.activo
        FROM contratos c
        LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
        WHERE c.cli_codigo IS NOT NULL
        LIMIT 5
    """)
    rows = cur.fetchall()
    for r in rows:
        print(f"  {dict(r)}")
except Exception as e:
    print(f"Error en JOIN: {e}")

# ¿Hay tabla de tipos de contrato?
print("\n" + "=" * 70)
print("Tablas con 'tipo' + 'contrato' en el nombre:")
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (
        table_name ILIKE '%contrato%' OR table_name ILIKE '%contratos%'
    ) ORDER BY table_name
""")
for r in cur.fetchall():
    print(f"  {r['table_name']}")

conn.close()
