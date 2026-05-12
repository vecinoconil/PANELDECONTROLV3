"""
Test rápido post repair-user: verifica CONNECT a postgres como LOJO2026
y lo que puede necesitar el ERP para backup.
"""
import psycopg2
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026
USER='LOJO2026'; PASS='lojo2026'

def test(label, dbname, sql=None):
    try:
        c = psycopg2.connect(host=HOST, port=PORT, dbname=dbname,
                             user=USER, password=PASS, connect_timeout=10,
                             cursor_factory=RealDictCursor)
        c.autocommit = True
        if sql:
            cur = c.cursor()
            cur.execute(sql)
            row = cur.fetchone()
            val = list(row.values())[0] if row else None
            c.close()
            print(f"  OK  {label}: {val}")
        else:
            c.close()
            print(f"  OK  {label}")
    except psycopg2.OperationalError as e:
        msg = str(e)
        if 'codec' in msg or 'decode' in msg:
            msg = "BLOQUEADO (error encoding — permiso denegado en servidor)"
        print(f"  !! {label}: {msg[:100]}")
    except Exception as e:
        print(f"  !! {label}: {str(e)[:100]}")

print("=== LOJO2026 post repair-user ===\n")
test("CONNECT a 'postgres'",   'postgres')
test("CONNECT a 'template1'",  'template1')
test("CONNECT a 'TRAS'",       'TRAS')

# En TRAS: consultas que hace pg_dump
try:
    c = psycopg2.connect(host=HOST, port=PORT, dbname='TRAS',
                         user=USER, password=PASS, connect_timeout=10,
                         cursor_factory=RealDictCursor)
    c.autocommit = True
    cur = c.cursor()
    print()
    for sql, lbl in [
        ("SELECT current_user AS u", "current_user"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_class WHERE relkind='r'", "tablas en pg_class"),
        ("SELECT count(*) AS n FROM pg_catalog.pg_largeobject_metadata", "large objects"),
        ("SELECT DISTINCT nspname FROM pg_namespace WHERE nspname='public'", "schema public visible"),
        ("SELECT has_schema_privilege(current_user,'public','USAGE') AS ok", "USAGE en public"),
        ("SELECT count(*) AS n FROM public.vcab LIMIT 0", "SELECT en vcab"),
    ]:
        try:
            cur.execute(sql)
            row = cur.fetchone()
            val = list(row.values())[0] if row else None
            print(f"  OK  {lbl}: {val}")
        except Exception as e:
            print(f"  !! {lbl}: {str(e)[:80]}")
    c.close()
except Exception as e:
    print(f"No pudo conectar a TRAS: {e}")

# ── intentar pg_dump schema-only con pg_dump v14 (puede fallar por versión) ──
import subprocess, os
from pathlib import Path
pg_dump = r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"
if Path(pg_dump).exists():
    print(f"\npg_dump v14 encontrado. Probando schema-only (puede dar error por versión)...")
    env = os.environ.copy(); env['PGPASSWORD'] = PASS
    cmd = [pg_dump, '-h', HOST, '-p', str(PORT), '-U', USER, '-d', 'TRAS',
           '--schema-only', '--no-password', '-t', 'vcab', '--if-exists']
    res = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=20)
    if res.returncode == 0:
        print(f"  OK - {len(res.stdout.splitlines())} líneas")
    else:
        for ln in (res.stderr or '').splitlines()[:5]:
            print(f"  !! {ln}")
else:
    print("\npg_dump v14 no encontrado en", pg_dump)

print("\n=== FIN ===")
