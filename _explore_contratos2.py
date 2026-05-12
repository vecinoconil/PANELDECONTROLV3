import psycopg2, psycopg2.extras, json

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 70)
print("TABLA: contratos - COLUMNAS")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='contratos' ORDER BY ordinal_position")
cols = cur.fetchall()
for c in cols:
    print(f"  {c['column_name']:40s} {c['data_type']}")

cur.execute("SELECT COUNT(*) as cnt FROM contratos")
print(f"\n  Total registros: {cur.fetchone()['cnt']}")

print("\n--- MUESTRA (3 registros) ---")
cur.execute("SELECT * FROM contratos LIMIT 3")
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

# ¿Tiene tabla de tipos?
print("\n" + "=" * 70)
print("¿Existe contratos_tipos o similar?")
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (
        table_name ILIKE '%contrato_tipo%' OR 
        table_name ILIKE '%contratos_tipo%' OR
        table_name ILIKE '%tipo_contrato%'
    )
""")
for r in cur.fetchall():
    print(" ", r['table_name'])

# Campos clave de contratos
print("\n" + "=" * 70)
print("VALORES DISTINTOS en campos de tipo/estado")
for campo in ['tipocontrato', 'tipo', 'estado', 'activo', 'tipofacturacion', 'periodicidad', 'tipocliente']:
    try:
        cur.execute(f"SELECT {campo}, COUNT(*) as cnt FROM contratos GROUP BY {campo} ORDER BY cnt DESC LIMIT 10")
        rows = cur.fetchall()
        if rows:
            print(f"\n  Campo '{campo}':")
            for r in rows:
                print(f"    {r[campo]}: {r['cnt']}")
    except Exception as e:
        pass  # campo no existe

# Campos de fechas disponibles
print("\n" + "=" * 70)
print("CAMPOS DE FECHA en contratos:")
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='contratos' AND data_type IN ('date','timestamp without time zone','timestamp with time zone') ORDER BY ordinal_position")
for c in cur.fetchall():
    print(f"  {c['column_name']}")

# Campos de importe
print("\n" + "=" * 70)
print("CAMPOS DE IMPORTE en contratos:")
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='contratos' AND (data_type LIKE 'numeric%' OR data_type LIKE 'double%' OR data_type LIKE 'real%') ORDER BY ordinal_position")
for c in cur.fetchall():
    print(f"  {c['column_name']}")

# Relación con clientes
print("\n" + "=" * 70)
print("CONTRATOS con cliente info (JOIN clientes) - muestra:")
cur.execute("""
    SELECT c.id, c.cli_codigo, cl.nombre as cli_nombre, 
           c.fecha_inicio, c.fecha_fin, c.importe, c.activo
    FROM contratos c
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    LIMIT 5
""")
rows = cur.fetchall()
for r in rows:
    print(f"  {dict(r)}")

conn.close()
