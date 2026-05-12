import sqlite3
conn = sqlite3.connect(r'c:\PANELDECONTROLV3\backend\panel.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Tablas:", [r[0] for r in cur.fetchall()])
cur.execute("PRAGMA table_info(usuario)")
cols = [r[1] for r in cur.fetchall()]
print("Columnas usuario:", cols)
if 'fpago_autoventa' not in cols:
    cur.execute('ALTER TABLE usuario ADD COLUMN fpago_autoventa INTEGER')
    conn.commit()
    print('Columna fpago_autoventa añadida OK')
else:
    print('Columna ya existe')
conn.close()
