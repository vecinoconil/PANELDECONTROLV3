import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select
engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa).where(Empresa.id == 4)).first()
    print("Nombre:", emp.nombre)
    print("usar_tunnel:", emp.usar_tunnel)
    print("tunnel_port:", emp.tunnel_port)
    print("pg_host:", emp.pg_host)
    print("pg_port:", emp.pg_port)
    print("pg_name:", emp.pg_name)
    print("pg_user:", emp.pg_user)
    print("pg_password:", emp.pg_password)
