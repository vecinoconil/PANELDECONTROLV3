"""
Diagnóstico profundo: qué tablas hay en TRAS y si pg_dump puede leerlas.
También prueba lo_get, privilegios en postgres, y si falta ser owner de la BD.
"""
import psycopg2
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026
USER='LOJO2026'; PASS='lojo2026'

def make_conn(db):
    return psycopg2.connect(host=HOST, port=PORT, dbname=db,
                            user=USER, password=PASS, connect_timeout=10,
                            cursor_factory=RealDictCursor)

# ── 1. Listar tablas en TRAS ─────────────────────────────────────────────────
print("=== 1. Tablas accesibles en TRAS ===")
try:
    c = make_conn('TRAS'); c.autocommit = True; cur = c.cursor()
    cur.execute("""
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog','information_schema')
        ORDER BY schemaname, tablename
        LIMIT 30
    """)
    rows = cur.fetchall()
    for r in rows:
        print(f"  {r['schemaname']}.{r['tablename']}")
    if not rows:
        print("  (ninguna tabla visible — esquema vacío o sin acceso)")
    c.close()
except Exception as e:
    print(f"  FALLO: {e}")

# ── 2. Large objects: ¿podemos leer datos? ─────────────────────────────────
print("\n=== 2. Large objects en TRAS ===")
try:
    c = make_conn('TRAS'); c.autocommit = True; cur = c.cursor()
    cur.execute("SELECT oid FROM pg_catalog.pg_largeobject_metadata LIMIT 5")
    oids = [r['oid'] for r in cur.fetchall()]
    if oids:
        for oid in oids[:3]:
            try:
                cur.execute(f"SELECT lo_get({oid}::oid) IS NOT NULL AS ok")
                r = cur.fetchone()
                print(f"  lo_get({oid}): {'OK' if r and r['ok'] else 'NULL'}")
            except Exception as e2:
                print(f"  lo_get({oid}): FALLO — {str(e2)[:80]}")
    else:
        print("  (sin large objects)")
    c.close()
except Exception as e:
    print(f"  FALLO conexión: {e}")

# ── 3. Qué puede hacer LOJO2026 en la BD 'postgres' ─────────────────────────
print("\n=== 3. Privilegios dentro de 'postgres' ===")
try:
    cp = make_conn('postgres'); cp.autocommit = True; curp = cp.cursor()
    for sql, lbl in [
        ("SELECT current_user AS u", "current_user"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_database", "ver pg_database"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_roles", "ver pg_roles"),
        ("SELECT has_schema_privilege(current_user,'public','USAGE') AS ok", "USAGE public en postgres"),
        ("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'", "tablas public en postgres"),
    ]:
        try:
            curp.execute(sql)
            row = curp.fetchone()
            val = list(row.values())[0] if row else None
            print(f"  OK  {lbl}: {val}")
        except Exception as e:
            print(f"  !! {lbl}: {str(e)[:80]}")
    cp.close()
except Exception as e:
    print(f"  No conecta a postgres: {e}")

# ── 4. Propietario real de la BD TRAS ───────────────────────────────────────
print("\n=== 4. Owner de la BD TRAS y otras BDs ===")
try:
    ct = make_conn('TRAS'); ct.autocommit = True; curt = ct.cursor()
    curt.execute("""
        SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner
        FROM pg_catalog.pg_database
        WHERE datname NOT LIKE 'template%'
        ORDER BY datname
    """)
    for r in curt.fetchall():
        marker = " ← LOJO2026" if r['owner'] == 'LOJO2026' else ""
        print(f"  {r['datname']:25s} owner={r['owner']}{marker}")
    ct.close()
except Exception as e:
    print(f"  FALLO: {e}")

# ── 5. Intentar pg_dump real (schema+data, tabla pequeña) ───────────────────
print("\n=== 5. pg_dump real (primera tabla, schema+data) ===")
import subprocess, os
from pathlib import Path
pg_dump = r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"
if Path(pg_dump).exists():
    env = os.environ.copy(); env['PGPASSWORD'] = PASS
    # Sin tabla específica, solo schema (evitar incompatibilidad de datos)
    cmd = [pg_dump, '-h', HOST, '-p', str(PORT), '-U', USER, '-d', 'TRAS',
           '--schema-only', '--no-password', '--no-acl', '--no-owner']
    res = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=30)
    if res.returncode == 0:
        lines = res.stdout.splitlines()
        print(f"  OK — {len(lines)} líneas de DDL generadas")
        # Mostrar primeras líneas
        for ln in lines[:5]:
            print(f"    {ln}")
    else:
        print(f"  FALLO (rc={res.returncode}):")
        for ln in (res.stderr or '').splitlines()[:8]:
            print(f"    {ln}")
else:
    print("  pg_dump no encontrado")

print("\n=== FIN ===")
