import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='ventas_lineas' ORDER BY ordinal_position")
    for r in cur.fetchall():
        print(r['column_name'])
    conn.close()
