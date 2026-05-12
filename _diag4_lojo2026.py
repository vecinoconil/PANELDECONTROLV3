"""
Diagnóstico ampliado para LOJO2026 tras aplicar repair-user.
Verifica: CONNECT a postgres, privilegios para pg_dump/backup ERP en TRAS.
"""
import psycopg2, sys
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026; DB='TRAS'
USER_LOJO='LOJO2026'; PASS_LOJO='lojo2026'

# ─── credenciales superadmin (leer de .env o poner aquí) ─────────────────────
import os
from pathlib import Path
env_path = Path(__file__).parent / "backend" / ".env"
SA_USER = SA_PASS = None
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if line.startswith("PGADMIN_USER="):
            SA_USER = line.split("=",1)[1].strip()
        if line.startswith("PGADMIN_PASS=") or line.startswith("PGADMIN_PASSWORD="):
            SA_PASS = line.split("=",1)[1].strip()
# Si no hay .env, poner manualmente:
if not SA_USER:
    SA_USER = input("Superadmin user: ").strip() or None
if not SA_PASS:
    SA_PASS = input("Superadmin pass: ").strip() or None

def conn_lojo(dbname=DB):
    return psycopg2.connect(host=HOST, port=PORT, dbname=dbname,
                            user=USER_LOJO, password=PASS_LOJO,
                            connect_timeout=10, cursor_factory=RealDictCursor)

def conn_sa(dbname='postgres'):
    return psycopg2.connect(host=HOST, port=PORT, dbname=dbname,
                            user=SA_USER, password=SA_PASS,
                            connect_timeout=10, cursor_factory=RealDictCursor)

PASS_OK = {}
print("=" * 60)
print("DIAGNÓSTICO LOJO2026 — post repair-user")
print("=" * 60)

# ── 1. CONNECT como LOJO a postgres ─────────────────────────────────────────
print("\n1. CONNECT como LOJO2026 a 'postgres'...")
try:
    c = conn_lojo('postgres'); c.close()
    print("   ✅ OK — acceso a postgres FUNCIONA")
    PASS_OK['postgres'] = True
except Exception as e:
    print(f"   ❌ FALLO: {str(e)[:120]}")
    PASS_OK['postgres'] = False

# ── 2. CONNECT como LOJO a TRAS ─────────────────────────────────────────────
print("2. CONNECT como LOJO2026 a 'TRAS'...")
try:
    c = conn_lojo('TRAS'); c.close()
    print("   ✅ OK")
    PASS_OK['tras'] = True
except Exception as e:
    print(f"   ❌ FALLO: {str(e)[:120]}")
    PASS_OK['tras'] = False

# ── 3. Como superadmin: ver membresías y privilegios actuales ─────────────────
if SA_USER:
    print(f"\n3. Membresías de LOJO2026 (como superadmin)...")
    try:
        csa = conn_sa('TRAS')
        csa.autocommit = True
        cur = csa.cursor()
        cur.execute("""
            SELECT r.rolname AS role
            FROM pg_roles m
            JOIN pg_auth_members am ON am.member = m.oid
            JOIN pg_roles r ON r.oid = am.roleid
            WHERE m.rolname = 'LOJO2026'
        """)
        rows = cur.fetchall()
        if rows:
            for r in rows: print(f"   miembro de: {r['role']}")
        else:
            print("   (sin membresías)")
    except Exception as e:
        print(f"   FALLO: {e}")

    print("4. Privilegios de LOJO2026 en bases de datos (datname, priv)...")
    try:
        cur.execute("""
            SELECT datname,
                   has_database_privilege('LOJO2026', datname, 'CONNECT') AS can_connect,
                   has_database_privilege('LOJO2026', datname, 'CREATE')  AS can_create
            FROM pg_database
            WHERE datname IN ('postgres','template1','TRAS')
            ORDER BY datname
        """)
        for r in cur.fetchall():
            print(f"   {r['datname']:20s}  CONNECT={r['can_connect']}  CREATE={r['can_create']}")
    except Exception as e:
        print(f"   FALLO: {e}")

    print("5. LOJO2026 es dueño de la BD TRAS?...")
    try:
        cur.execute("SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname='TRAS'")
        r = cur.fetchone()
        if r:
            print(f"   BD TRAS owner: {r['owner']}")
        else:
            print("   BD TRAS no encontrada")
    except Exception as e:
        print(f"   FALLO: {e}")

    csa.close()

# ── 4. Como LOJO: intentar pg_dump queries clave ────────────────────────────
print("\n6. Consultas críticas de pg_dump como LOJO2026 en TRAS...")
try:
    cl = conn_lojo('TRAS')
    cl.autocommit = True
    cur2 = cl.cursor()

    tests = [
        ("SELECT current_user", "current_user"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_class WHERE relkind='r'", "pg_class count"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_largeobject_metadata", "pg_largeobject_metadata"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_largeobject", "pg_largeobject (datos)"),
        ("SELECT lo_get(0::oid)", "lo_get"),
        ("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'", "information_schema.tables"),
        ("SHOW server_encoding", "server_encoding"),
        ("SHOW client_encoding", "client_encoding"),
        ("SELECT pg_is_in_recovery()", "pg_is_in_recovery"),
        ("SELECT count(*) AS n FROM public.vcab LIMIT 0", "SELECT en vcab (tabla ERP)"),
    ]
    for sql, label in tests:
        try:
            cur2.execute(sql)
            row = cur2.fetchone()
            val = list(row.values())[0] if row else None
            print(f"   ✅ {label}: {val}")
        except Exception as e:
            print(f"   ❌ {label}: {str(e)[:80]}")
    cl.close()
except Exception as e:
    print(f"   No pudo conectar a TRAS como LOJO2026: {e}")

# ── 5. Intentar pg_dump desde esta máquina ───────────────────────────────────
import subprocess, shutil
print("\n7. Buscar pg_dump local y probar dump pequeño (schema only)...")
candidates = [
    r"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
    r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
]
pg_dump = next((p for p in candidates if Path(p).exists()), shutil.which("pg_dump"))
if pg_dump:
    print(f"   pg_dump encontrado: {pg_dump}")
    import subprocess, os
    env = os.environ.copy()
    env['PGPASSWORD'] = PASS_LOJO
    cmd = [pg_dump, '-h', HOST, '-p', str(PORT), '-U', USER_LOJO, '-d', DB,
           '--schema-only', '--no-password', '-t', 'vcab', '--if-exists']
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=30)
        if result.returncode == 0:
            lines = result.stdout.splitlines()
            print(f"   ✅ pg_dump schema OK ({len(lines)} líneas output)")
        else:
            print(f"   ❌ pg_dump FALLÓ (rc={result.returncode}):")
            for ln in (result.stderr or '').splitlines()[:10]:
                print(f"      {ln}")
    except subprocess.TimeoutExpired:
        print("   TIMEOUT al intentar pg_dump")
    except Exception as e:
        print(f"   Error ejecutando pg_dump: {e}")
else:
    print("   No se encontró pg_dump instalado localmente")

print("\n=== FIN DIAGNÓSTICO ===")
