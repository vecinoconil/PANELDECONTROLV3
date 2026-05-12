import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import Session, create_engine, select
engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    empresas = s.exec(select(Empresa)).all()
    for e in empresas:
        print(f'Empresa {e.id}: {e.nombre}')
        try:
            conn = get_pg_connection(e)
            cur = conn.cursor()
            cur.execute('SELECT codigo, nombre FROM agentes WHERE baja = false ORDER BY nombre')
            rows = cur.fetchall()
            print(f'  -> {len(rows)} agentes')
            for r in rows[:3]:
                print('    ', dict(r))
            conn.close()
        except Exception as ex:
            print(f'  -> ERROR: {ex}')
