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

# 1. Propietarios de tablas
cur.execute("""
    SELECT tablename, tableowner
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
    LIMIT 20
""")
print("=== PROPIETARIOS DE TABLAS ===")
owners = set()
for r in cur.fetchall():
    print(f"  {r['tablename']}: owner={r['tableowner']}")
    owners.add(r['tableowner'])
print(f"Owners únicos: {owners}")

# 2. Grants de tabla para LOJO2026
cur.execute("""
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE LOWER(grantee) = 'lojo2026'
    ORDER BY table_name, privilege_type
""")
rows = cur.fetchall()
print(f"\n=== TABLE GRANTS para LOJO2026 ({len(rows)} filas) ===")
if rows:
    for r in rows:
        print(f"  {r['table_name']}: {r['privilege_type']}")
else:
    print("  (ninguno - no tiene grants explícitos)")

# 3. Default privileges
cur.execute("""
    SELECT defaclrole::regrole AS grantor, defaclnamespace::regnamespace AS schema,
           defaclobjtype, defaclacl
    FROM pg_default_acl
""")
rows = cur.fetchall()
print(f"\n=== DEFAULT PRIVILEGES ===")
if rows:
    for r in rows:
        print(f"  {dict(r)}")
else:
    print("  (ninguno)")

# 4. Schema public grants
cur.execute("""
    SELECT nspname, nspacl
    FROM pg_namespace
    WHERE nspname = 'public'
""")
r = cur.fetchone()
print(f"\n=== SCHEMA PUBLIC ACL ===")
print(f"  {r['nspacl']}")

# 5. Intentar ALTER TABLE como superadmin para verificar qué pasaría
print("\n=== ¿ALTER TABLE está disponible para LOJO2026? ===")
cur.execute("""
    SELECT has_table_privilege('LOJO2026', 'ventas_cabeceras', 'SELECT') as sel,
           has_table_privilege('LOJO2026', 'ventas_cabeceras', 'INSERT') as ins,
           has_table_privilege('LOJO2026', 'ventas_cabeceras', 'UPDATE') as upd
""")
r = cur.fetchone()
print(f"  ventas_cabeceras -> SELECT:{r['sel']}, INSERT:{r['ins']}, UPDATE:{r['upd']}")
# ALTER TABLE no tiene has_table_privilege - requiere ser owner o superuser

cur.execute("""
    SELECT tableowner FROM pg_tables WHERE tablename='ventas_cabeceras' AND schemaname='public'
""")
r = cur.fetchone()
owner = r['tableowner'] if r else 'desconocido'
print(f"  Owner de ventas_cabeceras: {owner}")
print(f"  ALTER TABLE requiere ser owner o superuser. LOJO2026 no es ninguno de los dos.")

conn.close()
print("\nDiagnóstico completo.")
