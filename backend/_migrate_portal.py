import sqlite3, os

db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'panel.db')
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute("PRAGMA table_info(locales)")
cols = [row[1] for row in cur.fetchall()]
print('Columnas actuales en locales:', cols)
if 'portal_activo' not in cols:
    cur.execute('ALTER TABLE locales ADD COLUMN portal_activo INTEGER NOT NULL DEFAULT 0')
    conn.commit()
    print('OK: columna portal_activo agregada.')
else:
    print('OK: columna portal_activo ya existia.')
conn.close()
