import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Ver columnas de cajas
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='cajas' ORDER BY ordinal_position")
    print("COLS CAJAS:", [r['column_name'] for r in cur.fetchall()])

    # Ver cajas existentes
    cur.execute("SELECT codigo, nombre, almacen FROM cajas LIMIT 10")
    for r in cur.fetchall():
        print("CAJA:", dict(r))

    conn.close()
