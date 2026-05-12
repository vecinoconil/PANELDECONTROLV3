"""Test rápido del generador de PDF usando la primera factura real."""
import sys, os
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()

from app.models.app_models import Empresa
from app.services.pdf_factura import query_factura_data, generar_pdf
from sqlmodel import Session, create_engine, select
from app.services.pg_connection import get_pg_connection

# Obtener empresa
engine = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3')
with Session(engine) as s:
    emp = s.exec(select(Empresa)).first()
print(f"Empresa: {emp.nombre}")

# Obtener primera factura
conn = get_pg_connection(emp)
cur = conn.cursor()
cur.execute("""
    SELECT vc.id, vc.cli_codigo FROM ventas_cabeceras vc
    WHERE vc.tipodoc = 8
    ORDER BY vc.fecha DESC LIMIT 1
""")
row = cur.fetchone()
conn.close()
fac_id = row['id']
cli_codigo = row['cli_codigo']
print(f"Factura: id={fac_id}, cli={cli_codigo}")

# Consultar datos
data = query_factura_data(emp, fac_id, cli_codigo)
if not data:
    print("ERROR: sin datos")
    sys.exit(1)
print(f"Cab: {data['cab'].get('tipo_documento')} {data['cab'].get('serie')} {data['cab'].get('numero')}")
print(f"Líneas: {len(data['lineas'])}")
print(f"Venc: {len(data['venc'])}")

# Generar PDF
pdf_bytes = generar_pdf(data)
out_path = r'c:\PANELDECONTROLV3\_test_pdf_out.pdf'
with open(out_path, 'wb') as f:
    f.write(pdf_bytes)
print(f"PDF generado: {len(pdf_bytes)} bytes → {out_path}")
