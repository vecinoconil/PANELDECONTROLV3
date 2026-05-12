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

# Ver datos históricos donde SÍ hay cobros registrados en contratos_vencimientos
print("=== registros con fecha_cobro o id_linea_cobro > 0 ===")
cur.execute("""
    SELECT id, id_contrato, fecha, importe, id_factura, id_linea_cobro, fecha_cobro
    FROM contratos_vencimientos
    WHERE (id_linea_cobro > 0 OR fecha_cobro IS NOT NULL)
    LIMIT 15
""")
rows = cur.fetchall()
for r in rows:
    print(dict(r))

# Ver qué hay en la tabla vencimientos para uno de esos id_linea_cobro
if rows:
    sample_ids = [r['id_linea_cobro'] for r in rows if r['id_linea_cobro'] > 0][:5]
    if sample_ids:
        print(f"\n=== vencimientos con id in {sample_ids} ===")
        cur.execute("""
            SELECT id, tipo, idcab, fecha, fechacobro, situacion, idregistro, importe
            FROM vencimientos
            WHERE id = ANY(%s)
        """, [sample_ids])
        for r in cur.fetchall():
            print(dict(r))

# Situacion posibles valores en vencimientos
print("\n=== situacion values en vencimientos ===")
cur.execute("""
    SELECT situacion, COUNT(*) as cnt
    FROM vencimientos
    GROUP BY situacion ORDER BY cnt DESC
    LIMIT 10
""")
for r in cur.fetchall():
    print(dict(r))

# Ver para id_factura de contrato, qué hay en vencimientos
print("\n=== vencimientos vinculados a facturas de contratos ===")
cur.execute("""
    SELECT cv.id as venc_id, cv.id_factura, cv.id_linea_cobro, cv.fecha_cobro,
           v.id as vto_id, v.idcab, v.fechacobro, v.situacion, v.importe
    FROM contratos_vencimientos cv
    LEFT JOIN vencimientos v ON v.idcab = cv.id_factura AND cv.id_factura > 0
    WHERE cv.id_factura > 0
    LIMIT 15
""")
for r in cur.fetchall():
    print(dict(r))

conn.close()
