import psycopg2
c = psycopg2.connect(host='core.solba.com', port=5026, dbname='PANELCONTROLV3', user='SOLBA', password='solba2012')
cur = c.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='locales' ORDER BY ordinal_position")
cols = [r[0] for r in cur.fetchall()]
print('locales columns:', cols)
print('tipo exists:', 'tipo' in cols)
print('fecha_alta exists:', 'fecha_alta' in cols)
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='usuarios' AND column_name='caja_reparto'")
print('caja_reparto in usuarios:', bool(cur.fetchone()))
c.close()
