"""Test PDF con factura de múltiples líneas."""
import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.models.app_models import Empresa
from app.services.pdf_factura import query_factura_data, generar_pdf
from app.services.pg_connection import get_pg_connection
from sqlmodel import Session, create_engine, select

engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa)).first()

# Factura con múltiples líneas
conn = get_pg_connection(emp)
cur = conn.cursor()
cur.execute("""
    SELECT vc.id, vc.cli_codigo, COUNT(vl.id) as nlineas
    FROM ventas_cabeceras vc
    JOIN ventas_lineas vl ON vl.idcab = vc.id
    WHERE vc.tipodoc = 8
    GROUP BY vc.id, vc.cli_codigo
    HAVING COUNT(vl.id) >= 5
    ORDER BY vc.fecha DESC LIMIT 3
""")
rows = cur.fetchall()
conn.close()

for row in rows:
    print(f"Factura {row['id']} ({row['nlineas']} líneas)...")
    data = query_factura_data(emp, row['id'], row['cli_codigo'])
    if data:
        pdf = generar_pdf(data)
        fname = f"c:\\PANELDECONTROLV3\\_test_pdf_{row['id']}.pdf"
        open(fname, 'wb').write(pdf)
        print(f"  → {len(pdf)} bytes → {fname}")
