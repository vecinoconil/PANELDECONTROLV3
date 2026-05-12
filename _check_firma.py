import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import Session, create_engine, select
engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa).where(Empresa.id == 1)).first()
conn = get_pg_connection(emp)
cur = conn.cursor()

# Buscar tablas de cabeceras de documentos (vcab, albaranes, pedidos...)
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    AND (table_name ILIKE '%vcab%' OR table_name ILIKE '%albaran%' OR table_name ILIKE '%pedido%' OR table_name ILIKE '%venta%' OR table_name ILIKE '%cabecera%')
    ORDER BY table_name
""")
print("Tablas cabecera:", [r['table_name'] for r in cur.fetchall()])

# Mirar las lineas de hoja para ver cómo se relacionan con los documentos
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hojas_de_carga_lineas' ORDER BY column_name")
print("Cols hojas_lineas:", [r['column_name'] for r in cur.fetchall()])

conn.close()
