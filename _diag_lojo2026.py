import psycopg2, sys
from psycopg2.extras import RealDictCursor

HOST='core.solba.com'; PORT=5026; USER='LOJO2026'; PASS='lojo2026'; DB='TRAS'

try:
    conn = psycopg2.connect(host=HOST,port=PORT,dbname=DB,user=USER,password=PASS,
                            connect_timeout=10,cursor_factory=RealDictCursor)
    conn.autocommit=True; cur=conn.cursor()

    print('=== VERSION ===')
    cur.execute('SHOW server_version')
    print(cur.fetchone()['server_version'])

    print('\n=== ROL ===')
    cur.execute('SELECT rolsuper,rolreplication,rolcanlogin FROM pg_roles WHERE rolname=current_user')
    print(dict(cur.fetchone()))

    print('\n=== MEMBERSHIPS ===')
    cur.execute("""SELECT r.rolname FROM pg_auth_members m
                   JOIN pg_roles r ON r.oid=m.roleid
                   JOIN pg_roles u ON u.oid=m.member
                   WHERE u.rolname=current_user""")
    print([x['rolname'] for x in cur.fetchall()])

    print('\n=== has_database_privilege ===')
    for p in ('CONNECT','CREATE','TEMP'):
        cur.execute('SELECT has_database_privilege(current_user,%s,%s)',('TRAS',p))
        print(f'  {p}:', list(cur.fetchone().values())[0])

    print('\n=== Tablas sin SELECT (primeras 5) ===')
    cur.execute("""SELECT t.table_schema,t.table_name
                   FROM information_schema.tables t
                   WHERE t.table_type='BASE TABLE'
                   AND NOT has_table_privilege(current_user,
                       quote_ident(t.table_schema)||'.'||quote_ident(t.table_name),'SELECT')
                   LIMIT 5""")
    rows=cur.fetchall()
    print('  Ninguna' if not rows else '\n'.join(f"  {dict(r)}" for r in rows))

    print('\n=== Secuencias sin USAGE ===')
    cur.execute("""SELECT COUNT(*) AS n FROM information_schema.sequences
                   WHERE NOT has_sequence_privilege(current_user,
                       quote_ident(sequence_schema)||'.'||quote_ident(sequence_name),'USAGE')""")
    print(' ', cur.fetchone()['n'])

    # Probar acceso a pg_largeobject (necesario para pg_dump)
    print('\n=== Acceso pg_largeobject ===')
    try:
        cur.execute('SELECT COUNT(*) AS n FROM pg_catalog.pg_largeobject_metadata')
        print('  OK, large objects:', cur.fetchone()['n'])
    except Exception as e:
        print('  ERROR:', e)

    conn.close()
    print('\nDiagnóstico completado OK')

except Exception as e:
    print('ERROR CONEXION:', e, file=sys.stderr)
    sys.exit(1)
