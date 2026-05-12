import sqlite3
c = sqlite3.connect(r'c:\PANELDECONTROLV3\backend\panel.db')
tables = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tablas:", [t[0] for t in tables])
# Get first empresa
row = c.execute("SELECT * FROM empresa LIMIT 1").fetchone()
print("Empresa:", row)
