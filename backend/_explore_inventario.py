import os, sys
os.chdir('C:/PANELDECONTROLV3/backend')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
import psycopg2, psycopg2.extras
conn = psycopg2.connect(settings.database_url.replace('postgresql+psycopg2://', 'postgresql://'))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Todas las tablas
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
all_tables = [r['table_name'] for r in cur.fetchall()]
print('ALL TABLES:', all_tables)

# Filtros
for kw in ['invent', 'articul', 'familia', 'marca', 'subfamilia', 'lote', 'talla', 'color', 'almacen', 'stock']:
    found = [t for t in all_tables if kw.lower() in t.lower()]
    if found:
        print(f'{kw.upper()}: {found}')

conn.close()
