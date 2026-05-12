"""Medir el tiempo de apertura de conexión."""
import sys, time
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as s:
    emp = s.exec(select(Empresa).where(Empresa.activo==True)).first()

for i in range(5):
    t0 = time.time()
    conn = get_pg_connection(emp)
    t1 = time.time()
    cur = conn.cursor()
    cur.execute("SELECT 1")
    t2 = time.time()
    conn.close()
    print(f"Intento {i+1}: connect={int((t1-t0)*1000)}ms  query={int((t2-t1)*1000)}ms  total={int((t2-t0)*1000)}ms")
