import sys, os
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')
os.chdir(r'C:\PANELDECONTROLV3\backend')
from app.services.pg_connection import get_pg_connection
from app.database import get_session
from sqlmodel import select
from app.models.app_models import Empresa

with next(get_session()) as s:
    empresa = s.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

# Columnas de vencimientos
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='vencimientos' ORDER BY ordinal_position")
print("=== vencimientos columnas ===")
for r in cur.fetchall():
    print(f"  {r['column_name']} - {r['data_type']}")

# Buscar vencimientos con entrega a cuenta parcial (entregas_cuenta > 0 y situacion = 0)
print("\n=== Vencimientos con entrega a cuenta parcial ===")
cur.execute("""
    SELECT v.id, v.idcab, v.importe, v.entregas_cuenta, v.situacion, v.fechacobro,
           v.cajabanco, v.codigo_cb, v.idregistro,
           vc.serie, vc.numero, vc.tipodoc
    FROM vencimientos v
    JOIN ventas_cabeceras vc ON vc.id = v.idcab
    WHERE v.entregas_cuenta > 0
    ORDER BY v.id DESC
    LIMIT 10
""")
for r in cur.fetchall():
    print(" ", dict(r))

# Tambien ver si hay ventas_entregas asociadas a esos vencimientos (idvencimiento > 0)
print("\n=== ventas_entregas con idvencimiento != 0 (muestra) ===")
cur.execute("""
    SELECT ve.*, v.importe AS vto_importe, v.entregas_cuenta, v.situacion
    FROM ventas_entregas ve
    JOIN vencimientos v ON v.id = ve.idvencimiento
    WHERE ve.idvencimiento > 0
    ORDER BY ve.id DESC
    LIMIT 5
""")
for r in cur.fetchall():
    print(" ", dict(r))

conn.close()
