import sys; sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as s:
    emp = s.exec(select(Empresa).where(Empresa.activo==True)).first()
    conn = get_pg_connection(emp)
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='ventas_cabeceras' ORDER BY ordinal_position")
    cols = [r['column_name'] for r in cur.fetchall()]
    print("Columnas:", cols)
    cur.execute("SELECT serie, numero FROM ventas_cabeceras WHERE tipodoc=4 ORDER BY id DESC LIMIT 3")
    for r in cur.fetchall():
        print(dict(r))
    conn.close()
