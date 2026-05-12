import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import Session, create_engine, select
engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa)).first()
conn = get_pg_connection(emp)
cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='agentes' ORDER BY column_name")
    cols = [r['column_name'] for r in cur.fetchall()]
    print("Columnas:", cols)
    # Try the actual query
    try:
        cur.execute("SELECT codigo, nombre FROM agentes WHERE baja = false ORDER BY nombre")
        rows = cur.fetchall()
        print(f"Resultado con baja=false: {len(rows)} agentes")
        for r in rows[:5]:
            print(" ", dict(r))
    except Exception as e:
        print("Error con baja=false:", e)
    # Try without filter
    try:
        cur.execute("SELECT codigo, nombre FROM agentes ORDER BY nombre LIMIT 5")
        rows = cur.fetchall()
        print(f"Sin filtro: {len(rows)} agentes (primeros 5)")
        for r in rows[:5]:
            print(" ", dict(r))
    except Exception as e:
        print("Error sin filtro:", e)
conn.close()
