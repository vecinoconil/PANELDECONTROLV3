import sqlite3
con = sqlite3.connect("panel.db")
tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tablas:", tables)
if "visita" in tables:
    cols = con.execute("PRAGMA table_info(visita)").fetchall()
    print("Columnas visita:", cols)
con.close()
