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

# Coger albaranes cobrados por el ERP real (no serie 'P 20')
# B10-1 (id=63985) fue cobrado por el ERP
idcab = 63985

print(f"=== ventas_cabeceras id={idcab} ===")
cur.execute("SELECT id, serie, numero, total, totalpendiente, cli_codigo, fpago FROM ventas_cabeceras WHERE id = %s", (idcab,))
vc = cur.fetchone()
print(" ", dict(vc))

print(f"\n=== ventas_entregas para idcab={idcab} ===")
cur.execute("SELECT * FROM ventas_entregas WHERE idcab = %s ORDER BY id", (idcab,))
ves = cur.fetchall()
for ve in ves:
    print(" ", dict(ve))

# Ahora ver registro_cobros usando id_cab
print(f"\n=== registro_cobros para id_cab={idcab} ===")
cur.execute("SELECT * FROM registro_cobros WHERE id_cab = %s ORDER BY id", (idcab,))
rcs = cur.fetchall()
for rc in rcs:
    print(" ", dict(rc))

# Ver si cajas_registro tiene alguna relación con el cobro
# el link podría ser: ve.idregistro -> registro_cobros.id, y cajas_registro por turno/fecha
# o bien cajas_registro.idcobroguid
if ves:
    idregistro = ves[0]['idregistro']
    print(f"\n=== cajas_registro buscando idregistro={idregistro} ===")
    # Buscar por hora/fecha aproximada o por idcobroguid
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='cajas_registro' ORDER BY ordinal_position")
    cols = [r['column_name'] for r in cur.fetchall()]
    
    # Buscar en ventas_entregas el cajabanco y codigo_cb
    ve0 = ves[0]
    cajabanco = ve0.get('cajabanco', 0)
    codigo_cb = ve0.get('codigo_cb', 0)
    turno = ve0.get('turno', 0)
    print(f"  ventas_entregas.cajabanco={cajabanco}, codigo_cb={codigo_cb}, turno={turno}, idregistro={idregistro}")
    
    if turno and turno > 0:
        # Buscar cajas_registro en el mismo turno con ingreso similar
        cur.execute("""
            SELECT * FROM cajas_registro 
            WHERE turno = %s AND ingreso > 0
            ORDER BY id
            LIMIT 10
        """, (turno,))
        crs = cur.fetchall()
        print(f"  cajas_registro con turno={turno} ({len(crs)} filas):")
        for cr in crs:
            print("   ", dict(cr))

# También ver el idregistro en registro_cobros
if ves:
    idregistro = ves[0]['idregistro']
    print(f"\n=== registro_cobros id={idregistro} ===")
    cur.execute("SELECT * FROM registro_cobros WHERE id = %s", (idregistro,))
    rc = cur.fetchone()
    if rc:
        print(" ", dict(rc))

conn.close()
