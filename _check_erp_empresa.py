import sys
sys.path.insert(0, 'backend')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import create_engine, Session, select
from app.config import settings

engine = create_engine(settings.database_url)
with Session(engine) as s:
    empresa_app = s.exec(select(Empresa)).first()

conn = get_pg_connection(empresa_app)
cur = conn.cursor()

# Ver columnas de tabla empresa
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='empresa' ORDER BY ordinal_position")
cols = cur.fetchall()
print('Columnas empresa:')
for c in cols:
    print(' ', c['column_name'], '-', c['data_type'])

# Ver un registro
cur.execute("SELECT * FROM empresa LIMIT 1")
row = cur.fetchone()
if row:
    print('\nDatos empresa:')
    for k, v in row.items():
        if v and str(v).strip():
            print(f"  {k}: {str(v)[:80]}")

cur.close()
conn.close()
