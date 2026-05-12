"""
Simula exactamente las consultas que pg_dump v16 ejecuta al iniciar.
Si alguna falla, ese es el problema del ERP.
"""
import psycopg2, sys
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026; USER='LOJO2026'; PASS='lojo2026'; DB='TRAS'

def conn(dbname=DB):
    return psycopg2.connect(host=HOST,port=PORT,dbname=dbname,user=USER,password=PASS,
                            connect_timeout=10,cursor_factory=RealDictCursor)

print("1. Conexión directa a TRAS...")
try:
    c = conn('TRAS'); c.autocommit=True; cur=c.cursor()
    print("   OK")
except Exception as e:
    print("   FALLO:", e); sys.exit(1)

print("2. Consulta de versión (pg_dump siempre la hace)...")
try:
    cur.execute("SELECT version()"); print("  ", cur.fetchone()['version'][:60])
except Exception as e: print("   FALLO:", e)

print("3. Consulta pg_settings (pg_dump la usa para configurar sesión)...")
try:
    cur.execute("SELECT name,setting FROM pg_settings WHERE name IN ('server_version','integer_datetimes','server_encoding')")
    for r in cur.fetchall(): print(f"   {r['name']}={r['setting']}")
except Exception as e: print("   FALLO:", e)

print("4. Acceso a pg_catalog.pg_class (tablas del dump)...")
try:
    cur.execute("SELECT COUNT(*) AS n FROM pg_catalog.pg_class WHERE relkind='r' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')")
    print(f"   {cur.fetchone()['n']} tablas en public")
except Exception as e: print("   FALLO:", e)

print("5. Acceso a pg_catalog.pg_attrdef (valores por defecto)...")
try:
    cur.execute("SELECT COUNT(*) AS n FROM pg_catalog.pg_attrdef")
    print(f"   {cur.fetchone()['n']} defaults")
except Exception as e: print("   FALLO:", e)

print("6. Acceso a pg_catalog.pg_constraint...")
try:
    cur.execute("SELECT COUNT(*) AS n FROM pg_catalog.pg_constraint")
    print(f"   {cur.fetchone()['n']} constraints")
except Exception as e: print("   FALLO:", e)

print("7. Acceso a pg_catalog.pg_extension...")
try:
    cur.execute("SELECT extname FROM pg_catalog.pg_extension")
    print("   extensiones:", [r['extname'] for r in cur.fetchall()])
except Exception as e: print("   FALLO:", e)

print("8. Acceso a pg_catalog.pg_largeobject_metadata...")
try:
    cur.execute("SELECT COUNT(*) AS n FROM pg_catalog.pg_largeobject_metadata")
    print(f"   {cur.fetchone()['n']} large objects")
except Exception as e: print("   FALLO:", e)

print("9. INTENTO CONEXIÓN A POSTGRES (pg_dumpall / algunos ERPs lo usan)...")
try:
    c2=conn('postgres'); c2.close()
    print("   PUEDE conectar a postgres")
except Exception as e:
    print(f"   BLOQUEADO: {str(e)[:100]}")

print("10. INTENTO CONEXIÓN A template1 (algunas herramientas lo usan)...")
try:
    c3=conn('template1'); c3.close()
    print("   PUEDE conectar a template1")
except Exception as e:
    print(f"   BLOQUEADO: {str(e)[:100]}")

print("11. Acceso a pg_roles globales (el ERP puede listarlos)...")
try:
    cur.execute("SELECT COUNT(*) AS n FROM pg_catalog.pg_roles")
    print(f"   {cur.fetchone()['n']} roles visibles")
except Exception as e: print("   FALLO:", e)

print("12. Acceso a pg_tablespace...")
try:
    cur.execute("SELECT spcname FROM pg_catalog.pg_tablespace")
    print("   tablespaces:", [r['spcname'] for r in cur.fetchall()])
except Exception as e: print("   FALLO:", e)

c.close()
print("\n=== FIN DEL TEST ===")
