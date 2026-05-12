import os, sys
os.chdir('C:/PANELDECONTROLV3/backend')
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
import psycopg2, psycopg2.extras

# Use settings.database_url directly (PostgreSQL)
url = settings.database_url.replace('postgresql+psycopg2://', 'postgresql://')
print("Connecting to:", url[:60], "...")
conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

# Get all tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
all_tables = [r['table_name'] for r in cur.fetchall()]
print('ALL TABLES:', all_tables)
print()

# Filtros relevantes
for kw in ['invent', 'articul', 'familia', 'subfamilia', 'marca', 'lote', 'talla', 'color', 'almacen', 'stock']:
    found = [t for t in all_tables if kw.lower() in t.lower()]
    if found:
        print(f'{kw.upper()}: {found}')

conn.close()
