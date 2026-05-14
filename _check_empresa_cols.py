from app.database import engine
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, select

with Session(engine) as s:
    emp = s.exec(select(Empresa)).first()

conn = get_pg_connection(emp)
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='empresa' ORDER BY ordinal_position")
for row in cur.fetchall():
    print(row)

print("\n--- Valores que podrían ser logo/imagen ---")
cur.execute("SELECT * FROM empresa LIMIT 1")
row = dict(cur.fetchone())
for k, v in row.items():
    if v is not None and (isinstance(v, (bytes, memoryview)) or 'logo' in k.lower() or 'imagen' in k.lower() or 'photo' in k.lower() or 'img' in k.lower() or 'pic' in k.lower()):
        print(f"  {k}: type={type(v).__name__} len={len(v) if hasattr(v,'__len__') else 'N/A'}")

conn.close()
