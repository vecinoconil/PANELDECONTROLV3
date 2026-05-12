import os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select

engine = create_engine(settings.database_url, echo=False)
with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

print('=== inventario_cabeceras COLUMNS ===')
cur.execute("""SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name='inventario_cabeceras' ORDER BY ordinal_position""")
for c in cur.fetchall():
    print(f"  {c['column_name']}: {c['data_type']} nullable={c['is_nullable']} default={c['column_default']}")

print()
print('=== SAMPLE (5 rows) ===')
cur.execute('SELECT * FROM inventario_cabeceras ORDER BY id DESC LIMIT 5')
rows = cur.fetchall()
if rows:
    for r in rows:
        print(dict(r))
else:
    print('  (sin filas)')

conn.close()
