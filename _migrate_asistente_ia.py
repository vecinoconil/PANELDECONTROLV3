import sqlite3
db_path = r'C:\PANELDECONTROLV3\backend\panel.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("PRAGMA table_info(locales)")
cols = [row[1] for row in cur.fetchall()]
print('Columnas actuales:', cols)
if 'asistente_ia' not in cols:
    cur.execute('ALTER TABLE locales ADD COLUMN asistente_ia INTEGER NOT NULL DEFAULT 0')
    conn.commit()
    print('Columna asistente_ia añadida OK')
else:
    print('La columna asistente_ia ya existe')
conn.close()
