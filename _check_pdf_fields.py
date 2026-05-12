"""Verifica campos disponibles en ventas_cabeceras y ventas_lineas para PDF."""
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

for table in ['ventas_cabeceras', 'ventas_lineas', 'clientes']:
    cur.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = %s ORDER BY ordinal_position
    """, (table,))
    cols = cur.fetchall()
    print(f"\n=== {table} ===")
    for c in cols:
        print(f"  {c['column_name']:40s} {c['data_type']}")

# Ver una factura de ejemplo con datos completos
cur.execute("""
    SELECT c.*, cl.nombre as _cli_nombre, cl.cif as _cli_cif, cl.direccion as _cli_dir,
           cl.localidad as _cli_loc, cl.cpostal as _cli_cp, cl.provincia as _cli_prov,
           cl.telefono1 as _cli_tel
    FROM ventas_cabeceras c
    JOIN clientes cl ON cl.codigo = c.cli_codigo
    WHERE c.tipodoc IN (8,4)
    ORDER BY c.fecha DESC LIMIT 1
""")
row = cur.fetchone()
if row:
    print("\n=== EJEMPLO CABECERA ===")
    for k, v in dict(row).items():
        if v is not None and v != '' and str(v) != '0' and str(v) != '0.00':
            print(f"  {k}: {v}")

# Ver líneas de esa factura
cur.execute("SELECT * FROM ventas_lineas WHERE idcab=%s ORDER BY orden", (row['id'],))
lineas = cur.fetchall()
if lineas:
    print(f"\n=== EJEMPLO LÍNEAS (primera) ===")
    for k,v in dict(lineas[0]).items():
        if v is not None:
            print(f"  {k}: {v}")

conn.close()
