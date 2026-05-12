import psycopg2
from psycopg2.extras import RealDictCursor

HOST = 'core.solba.com'
PORT = 5026
USER = 'SOLBA'
PASS = 'solba2012'
DB   = 'PANELCONTROLV3'

conn = psycopg2.connect(host=HOST, port=PORT, dbname=DB, user=USER,
                        password=PASS, connect_timeout=10, cursor_factory=RealDictCursor)
conn.autocommit = True
cur = conn.cursor()

# 1. Atributos del rol
cur.execute("""
    SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin,
           rolreplication, rolbypassrls
    FROM pg_roles WHERE LOWER(rolname) = 'lojo2026'
""")
row = cur.fetchone()
if not row:
    print("==> Usuario LOJO2026 NO encontrado en este servidor")
    conn.close()
    exit()
print("=== ATRIBUTOS DEL ROL ===")
for k, v in dict(row).items():
    print(f"  {k}: {v}")

# 2. Probar conexión como LOJO2026
conn2 = psycopg2.connect(host=HOST, port=PORT, dbname=DB, user='LOJO2026',
                         password='lojo2026', connect_timeout=10, cursor_factory=RealDictCursor)
cur2 = conn2.cursor()

# 3. ¿Puede hacer SELECT en alguna tabla?
try:
    cur2.execute("SELECT COUNT(*) FROM ventas_cabeceras LIMIT 1")
    print("\n==> SELECT en ventas_cabeceras: OK")
except Exception as e:
    print(f"\n==> SELECT en ventas_cabeceras: ERROR -> {e}")

# 4. ¿Puede hacer ALTER TABLE?
try:
    cur2.execute("ALTER TABLE ventas_cabeceras ADD COLUMN _test_col INTEGER")
    print("==> ALTER TABLE: OK (tiene permisos DDL!)")
    conn2.rollback()
except Exception as e:
    print(f"==> ALTER TABLE: ERROR -> {e}")

# 5. Propietario de las tablas principales
cur.execute("""
    SELECT tablename, tableowner
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
    LIMIT 15
""")
print("\n=== PROPIETARIOS DE TABLAS (primeras 15) ===")
for r in cur.fetchall():
    print(f"  {r['tablename']}: owner={r['tableowner']}")

# 6. Privilegios que tiene LOJO2026 en el schema public
cur.execute("""
    SELECT grantee, privilege_type
    FROM information_schema.role_schema_grants
    WHERE LOWER(grantee) = 'lojo2026'
""")
rows = cur.fetchall()
print(f"\n=== SCHEMA GRANTS para LOJO2026 ===")
if rows:
    for r in rows:
        print(f"  {dict(r)}")
else:
    print("  (ninguno)")

conn2.close()
conn.close()
print("\nDiagnóstico completo.")
