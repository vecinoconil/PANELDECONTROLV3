import sys, os
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')
os.chdir(r'C:\PANELDECONTROLV3\backend')
from app.services.pg_connection import get_pg_connection
from app.database import get_session
from sqlmodel import select
from app.models.app_models import Empresa

with next(get_session()) as s:
    empresa = s.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

# Ver el cajas_registro de P 20-2 (id=57843)
print("=== cajas_registro id=57843 (P 20-2) ===")
cur.execute("SELECT * FROM cajas_registro WHERE id = 57843")
cr = cur.fetchone()
if cr:
    for k, v in dict(cr).items():
        print(f"  {k} = {v!r}")

conn.close()
