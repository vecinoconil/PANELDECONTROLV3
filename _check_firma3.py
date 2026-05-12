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

# Ver PK de ventas_cabeceras
cur.execute("""
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'ventas_cabeceras' AND tc.constraint_type = 'PRIMARY KEY'
""")
print("PK ventas_cabeceras:", [r['column_name'] for r in cur.fetchall()])

# Ver un ejemplo de linea de hoja para entender cómo relacionar
cur.execute("""
    SELECT hl.tipodoc, hl.serie, hl.numero, vc.id, vc.tipodoc as vc_tipodoc, vc.serie as vc_serie
    FROM hojas_de_carga_lineas hl
    JOIN ventas_cabeceras vc ON vc.tipodoc = hl.tipodoc AND vc.serie = hl.serie AND vc.numero = hl.numero
    LIMIT 3
""")
rows = cur.fetchall()
print("Ejemplo join:", [dict(r) for r in rows])

# Ver columnas tipodoc, serie, numero en ventas_cabeceras
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ventas_cabeceras'
    AND column_name IN ('tipodoc', 'serie', 'numero', 'id', 'firma', 'hora_firma', 'huella_firma', 'imagen_firma')
    ORDER BY column_name
""")
print("Cols clave:", [r['column_name'] for r in cur.fetchall()])

conn.close()
