"""
Test de privilegios del usuario LOJO3 en core.solba.com
"""
import psycopg2
from psycopg2.extras import RealDictCursor

HOST = "core.solba.com"
PORT = 5026
USER = "LOJO3"
PASS = "muebleslojo123"
DB_OBJETIVO = "TRAS"
DB_OTRA = "PANELCONTROLV3"   # otra BD del mismo servidor para verificar que no puede

sep = "-" * 60

def conectar(dbname):
    return psycopg2.connect(
        host=HOST, port=PORT, dbname=dbname,
        user=USER, password=PASS,
        connect_timeout=10,
        cursor_factory=RealDictCursor,
    )

def ok(msg):   print(f"  ✓  {msg}")
def fail(msg): print(f"  ✗  {msg}")
def info(msg): print(f"     {msg}")

# ─────────────────────────────────────────────────────────────
print(sep)
print("1. CONEXIÓN A LA BD OBJETIVO:", DB_OBJETIVO)
print(sep)
try:
    conn = conectar(DB_OBJETIVO)
    ok(f"Conectado a {DB_OBJETIVO}")
    conn.autocommit = True
    cur = conn.cursor()
except Exception as e:
    fail(f"No se pudo conectar: {e}")
    exit(1)

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("2. INFORMACIÓN DEL ROL")
print(sep)
cur.execute("""
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
           rolcanlogin, rolreplication, rolbypassrls, rolconnlimit
    FROM pg_roles WHERE rolname = current_user
""")
row = cur.fetchone()
for k, v in row.items():
    info(f"{k:<20} = {v}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("3. PRIVILEGIOS SOBRE LA BD", DB_OBJETIVO)
print(sep)
for priv in ("CONNECT", "CREATE", "TEMP"):
    cur.execute("SELECT has_database_privilege(current_user, %s, %s)", (DB_OBJETIVO, priv))
    v = cur.fetchone()
    r = list(v.values())[0]
    (ok if r else fail)(f"has_database_privilege({priv}) = {r}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("4. CREAR TABLA TEMPORAL")
print(sep)
try:
    cur.execute("CREATE TEMP TABLE _test_lojo3 (id serial, txt text)")
    ok("CREATE TEMP TABLE → OK")
    cur.execute("INSERT INTO _test_lojo3 (txt) VALUES ('hola'), ('mundo')")
    ok("INSERT en temp table → OK")
    cur.execute("SELECT COUNT(*) AS n FROM _test_lojo3")
    n = cur.fetchone()["n"]
    ok(f"SELECT en temp table → {n} filas")
    cur.execute("DROP TABLE _test_lojo3")
    ok("DROP TEMP TABLE → OK")
except Exception as e:
    fail(f"Error con tabla temporal: {e}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("5. ACCESO A TABLAS DEL SCHEMA PUBLIC")
print(sep)
try:
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name LIMIT 10
    """)
    rows = cur.fetchall()
    if rows:
        ok(f"Puede leer information_schema → {len(rows)} tablas visibles (muestra):")
        for r in rows:
            info(f"  {r['table_name']}")
    else:
        info("No hay tablas en public o no tiene SELECT")
except Exception as e:
    fail(f"Error listando tablas: {e}")

# Intentar SELECT en la primera tabla pública
try:
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name LIMIT 1
    """)
    row = cur.fetchone()
    if row:
        tbl = row["table_name"]
        cur.execute(f'SELECT COUNT(*) AS n FROM public."{tbl}"')
        n = cur.fetchone()["n"]
        ok(f"SELECT COUNT(*) FROM {tbl} → {n} filas")
except Exception as e:
    fail(f"Error haciendo SELECT en tabla: {e}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("6. OBJETOS GRANDES (LARGE OBJECTS)")
print(sep)
try:
    conn.autocommit = False
    import psycopg2.extensions
    lobj = conn.lobject(0, 'wb')
    oid = lobj.oid
    lobj.write(b"Prueba de large object LOJO3")
    lobj.close()
    ok(f"Creó large object con OID={oid}")
    # Leer
    lobj2 = conn.lobject(oid, 'rb')
    data = lobj2.read()
    lobj2.close()
    ok(f"Leyó large object: {data}")
    # Borrar
    conn.execute = None  # reset
    cur2 = conn.cursor()
    cur2.execute("SELECT lo_unlink(%s)", (oid,))
    ok(f"Eliminó large object OID={oid}")
    conn.commit()
except Exception as e:
    conn.rollback()
    fail(f"Error con large objects: {e}")
finally:
    conn.autocommit = True

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("7. BACKUP (pg_dump via REPLICATION / COPY)")
print(sep)
import subprocess, shutil

pg_dump = shutil.which("pg_dump")
if pg_dump:
    import os
    env = os.environ.copy()
    env["PGPASSWORD"] = PASS
    result = subprocess.run(
        [pg_dump, "-h", HOST, "-p", str(PORT), "-U", USER, "-Fc",
         "--schema=public", "-t", "\"\"\"\"",  # tabla inexistente → solo comprueba acceso
         "--no-password", DB_OBJETIVO],
        capture_output=True, text=True, env=env, timeout=20
    )
    # Ejecutar de verdad con --schema-only para no tardar
    result2 = subprocess.run(
        [pg_dump, "-h", HOST, "-p", str(PORT), "-U", USER,
         "--schema-only", "--no-password", DB_OBJETIVO],
        capture_output=True, text=True, env=env, timeout=30
    )
    if result2.returncode == 0:
        lines = result2.stdout.strip().splitlines()
        ok(f"pg_dump --schema-only completado: {len(lines)} líneas de salida")
    else:
        fail(f"pg_dump fallido: {result2.stderr[:300]}")
else:
    info("pg_dump no encontrado en PATH — omitiendo (se comprueba vía REPLICATION flag)")
    cur.execute("SELECT pg_is_in_recovery()")
    cur.execute("IDENTIFY_SYSTEM")  # solo funciona con REPLICATION privilege
    
# Alternativa: comprobar el flag REPLICATION directamente
cur.execute("SELECT rolreplication FROM pg_roles WHERE rolname = current_user")
rep = list(cur.fetchone().values())[0]
(ok if rep else fail)(f"pg_roles.rolreplication = {rep} (necesario para pg_dump de ciertas opciones)")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("8. INTENTO DE ACCESO A OTRA BD:", DB_OTRA)
print(sep)
try:
    conn2 = conectar(DB_OTRA)
    fail(f"¡PUDO conectarse a {DB_OTRA}! Verifica permisos")
    conn2.close()
except psycopg2.OperationalError as e:
    ok(f"Acceso a {DB_OTRA} DENEGADO (esperado): {str(e).strip()}")
except Exception as e:
    info(f"No se pudo conectar a {DB_OTRA}: {type(e).__name__}: {e}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("9. RESUMEN DE MEMBRESÍAS / ROLES")
print(sep)
cur.execute("""
    SELECT r.rolname AS grupo
    FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles u ON u.oid = m.member
    WHERE u.rolname = current_user
""")
grupos = [r["grupo"] for r in cur.fetchall()]
if grupos:
    ok(f"Miembro de: {', '.join(grupos)}")
else:
    info("No pertenece a ningún grupo adicional")

print()
print(sep)
print("FIN DEL TEST")
print(sep)
conn.close()
