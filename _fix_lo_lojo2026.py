"""
Aplica directamente los grants de large objects a LOJO2026 en TRAS,
simulando lo que hace repair-user ahora.
Usar si no quieres esperar a que el backend recargue.
"""
import psycopg2
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026; DB='TRAS'

# Credenciales superadmin — completar aquí o poner en backend/.env
import os
from pathlib import Path
env = {}
env_path = Path(__file__).parent / "backend" / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()

SA_USER = env.get('PGADMIN_USER') or input("Superadmin user: ")
SA_PASS = env.get('PGADMIN_PASS') or env.get('PGADMIN_PASSWORD') or input("Superadmin pass: ")
TARGET_USER = 'LOJO2026'

print(f"Conectando a {DB} como {SA_USER}...")
conn = psycopg2.connect(host=HOST, port=PORT, dbname=DB,
                        user=SA_USER, password=SA_PASS,
                        connect_timeout=10, cursor_factory=RealDictCursor)
conn.autocommit = True
cur = conn.cursor()
uid = psycopg2.extensions.quote_ident(TARGET_USER, cur)

cur.execute("SELECT oid FROM pg_catalog.pg_largeobject_metadata")
oids = [r['oid'] for r in cur.fetchall()]
print(f"Large objects encontrados: {len(oids)}")

ok = 0
for oid in oids:
    try:
        cur.execute(f"GRANT SELECT ON LARGE OBJECT {oid} TO {uid}")
        ok += 1
    except Exception as e:
        print(f"  FALLO oid={oid}: {e}")

print(f"GRANT aplicados: {ok}/{len(oids)}")
conn.close()

# Verificar que LOJO2026 ahora puede leer
print("\nVerificando como LOJO2026...")
cl = psycopg2.connect(host=HOST, port=PORT, dbname=DB,
                      user=TARGET_USER, password='lojo2026',
                      connect_timeout=10, cursor_factory=RealDictCursor)
cl.autocommit = True; slc = cl.cursor()
slc.execute("SELECT oid FROM pg_catalog.pg_largeobject_metadata LIMIT 3")
test_oids = [r['oid'] for r in slc.fetchall()]
for oid in test_oids:
    try:
        slc.execute(f"SELECT lo_get({oid}::oid) IS NOT NULL AS ok")
        print(f"  lo_get({oid}): OK")
    except Exception as e:
        print(f"  lo_get({oid}): FALLO — {str(e)[:60]}")
cl.close()
print("\nListo. Ahora intenta la copia desde el ERP.")
