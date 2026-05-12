"""
Test de privilegios LOJO3 - parte 2: backup y acceso otra BD
"""
import psycopg2
from psycopg2.extras import RealDictCursor
import subprocess, shutil, os

HOST = "core.solba.com"
PORT = 5026
USER = "LOJO3"
PASS = "muebleslojo123"
DB_OBJETIVO = "TRAS"
DB_OTRA     = "PANELCONTROLV3"

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
print("6b. LARGE OBJECTS — limpieza del OID creado antes")
print(sep)
conn = conectar(DB_OBJETIVO)
conn.autocommit = False
cur = conn.cursor()
# Buscar large objects que pertenezcan a LOJO3
try:
    cur.execute("SELECT oid FROM pg_largeobject_metadata WHERE lomowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)")
    loids = [r["oid"] for r in cur.fetchall()]
    if loids:
        info(f"Large objects del usuario: {loids}")
        for oid in loids:
            cur.execute("SELECT lo_unlink(%s)", (oid,))
            ok(f"Eliminado OID={oid}")
    else:
        info("No quedan large objects del usuario (o ya limpiados)")
    conn.commit()
except Exception as e:
    conn.rollback()
    fail(f"Error limpiando LO: {e}")
conn.autocommit = True
cur = conn.cursor()

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("7. BACKUP con pg_dump")
print(sep)

pg_dump_paths = [
    r"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
    shutil.which("pg_dump") or "",
]
pg_dump = next((p for p in pg_dump_paths if p and os.path.isfile(p)), None)

if pg_dump:
    info(f"pg_dump encontrado: {pg_dump}")
    env = os.environ.copy()
    env["PGPASSWORD"] = PASS
    result = subprocess.run(
        [pg_dump, "-h", HOST, "-p", str(PORT), "-U", USER,
         "--schema-only", "--no-password", DB_OBJETIVO],
        capture_output=True, text=True, env=env, timeout=30
    )
    if result.returncode == 0:
        lines = result.stdout.strip().splitlines()
        ok(f"pg_dump --schema-only completado: {len(lines)} líneas")
        info(f"Primera línea: {lines[0] if lines else '(vacío)'}")
    else:
        err = result.stderr.strip()
        fail(f"pg_dump falló (exit {result.returncode}): {err[:300]}")
else:
    info("pg_dump no está instalado localmente — verificando flag REPLICATION directamente:")
    cur.execute("SELECT rolreplication FROM pg_roles WHERE rolname = current_user")
    rep = list(cur.fetchone().values())[0]
    (ok if rep else fail)(f"rolreplication = {rep}")
    if rep:
        info("Con REPLICATION=true, herramientas como pg_basebackup y pg_dump --wal-method pueden usarse")
    
    # Verificar también con has_table_privilege en una tabla real
    try:
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
            LIMIT 1
        """)
        tbl = cur.fetchone()["table_name"]
        cur.execute("SELECT has_table_privilege(current_user, %s, 'SELECT')", (f'public."{tbl}"',))
        can_sel = list(cur.fetchone().values())[0]
        (ok if can_sel else fail)(f"SELECT en {tbl}: {can_sel} (necesario para pg_dump datos)")
    except Exception as e:
        fail(f"Error verificando SELECT: {e}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("8. INTENTO ACCESO A OTRA BD:", DB_OTRA)
print(sep)
try:
    conn2 = conectar(DB_OTRA)
    fail(f"¡PUDO conectarse a {DB_OTRA}! Revisar permisos")
    conn2.close()
except psycopg2.OperationalError as e:
    ok(f"Acceso a {DB_OTRA} DENEGADO (correcto)")
    info(f"Error: {str(e).strip()}")
except Exception as e:
    info(f"Error al intentar {DB_OTRA}: {type(e).__name__}: {str(e).strip()}")

# Probar una tercera BD "postgres" (siempre existe)
print()
print(sep)
print("8b. INTENTO ACCESO A BD: postgres")
print(sep)
try:
    conn3 = psycopg2.connect(
        host=HOST, port=PORT, dbname="postgres",
        user=USER, password=PASS, connect_timeout=8
    )
    fail("¡PUDO conectarse a 'postgres'! Revisar permisos")
    conn3.close()
except psycopg2.OperationalError as e:
    ok("Acceso a 'postgres' DENEGADO (correcto)")
    info(f"Error: {str(e).strip()}")
except Exception as e:
    info(f"Error al intentar 'postgres': {type(e).__name__}: {str(e).strip()}")

# ─────────────────────────────────────────────────────────────
print()
print(sep)
print("9. MEMBRESÍAS")
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
print("FIN DEL TEST PARTE 2")
print(sep)
conn.close()
