"""Diagnóstico avanzado: schemas, acceso postgres, y test pg_dump local"""
import psycopg2, subprocess, shutil, os, sys
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026; USER='LOJO2026'; PASS='lojo2026'; DB='TRAS'

conn = psycopg2.connect(host=HOST,port=PORT,dbname=DB,user=USER,password=PASS,
                        connect_timeout=10,cursor_factory=RealDictCursor)
conn.autocommit=True; cur=conn.cursor()

print("=== SCHEMAS EN TRAS ===")
cur.execute("""SELECT schema_name, schema_owner FROM information_schema.schemata ORDER BY schema_name""")
for r in cur.fetchall():
    print(f"  {r['schema_name']:<30} owner={r['schema_owner']}")

print("\n=== TABLAS POR SCHEMA (conteo) ===")
cur.execute("""SELECT table_schema, COUNT(*) AS n FROM information_schema.tables
               WHERE table_type='BASE TABLE' GROUP BY table_schema ORDER BY table_schema""")
for r in cur.fetchall():
    print(f"  {r['table_schema']:<30} {r['n']} tablas")

print("\n=== TABLAS EN SCHEMAS NO-public SIN SELECT ===")
cur.execute("""SELECT table_schema, table_name FROM information_schema.tables
               WHERE table_type='BASE TABLE' AND table_schema NOT IN ('public','information_schema','pg_catalog')
               AND NOT has_table_privilege(current_user,
                   quote_ident(table_schema)||'.'||quote_ident(table_name),'SELECT')
               LIMIT 10""")
rows=cur.fetchall()
print("  Ninguna" if not rows else "\n".join(f"  {dict(r)}" for r in rows))

print("\n=== ACCESO A BD postgres ===")
try:
    c2=psycopg2.connect(host=HOST,port=PORT,dbname='postgres',user=USER,password=PASS,connect_timeout=5)
    print("  PUEDE conectarse a postgres (inesperado)")
    c2.close()
except Exception as e:
    print(f"  BLOQUEADO (correcto): {str(e)[:80]}")

print("\n=== ACCESO A OTRAS BDs (muestra) ===")
cur.execute("SELECT datname FROM pg_database WHERE datistemplate=false AND datname != %s ORDER BY datname LIMIT 5", (DB,))
otras = [r['datname'] for r in cur.fetchall()]
for db in otras:
    try:
        c3=psycopg2.connect(host=HOST,port=PORT,dbname=db,user=USER,password=PASS,connect_timeout=5)
        print(f"  {db}: PUEDE conectar (revisar)")
        c3.close()
    except:
        print(f"  {db}: bloqueado OK")

print("\n=== TEST pg_dump LOCAL ===")
pg_dump=None
for p in [r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"]:
    if os.path.isfile(p): pg_dump=p; break
if pg_dump:
    env=os.environ.copy(); env['PGPASSWORD']=PASS
    r=subprocess.run([pg_dump,'-h',HOST,'-p',str(PORT),'-U',USER,
                      '--schema-only','--no-password',DB],
                     capture_output=True,text=True,env=env,timeout=30)
    if r.returncode==0:
        print("  pg_dump v14 OK (ignora el warning de versión si lo hay)")
    else:
        print("  ERROR pg_dump v14:")
        print(" ", r.stderr.strip()[:300])
else:
    print("  pg_dump no instalado localmente")

conn.close()
print("\nFIN")
