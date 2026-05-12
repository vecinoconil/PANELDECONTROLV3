"""Explorar vencimientos y cajas_registro."""
import sys
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')

from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as session:
    empresa = session.exec(select(Empresa).where(Empresa.activo == True)).first()
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Columnas de vencimientos
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'vencimientos'
        ORDER BY ordinal_position
    """)
    print("=== Columnas de 'vencimientos' ===")
    for r in cur.fetchall():
        print(f"  {r['column_name']}: {r['data_type']}")

    # Ejemplo de ventas_entregas cobradas a caja
    cur.execute("""
        SELECT cajabanco, codigo_cb, COUNT(*) 
        FROM ventas_entregas 
        GROUP BY cajabanco, codigo_cb 
        ORDER BY COUNT(*) DESC 
        LIMIT 15
    """)
    print("\n=== ventas_entregas cajabanco/codigo_cb distribución ===")
    for r in cur.fetchall():
        print(f"  cajabanco={r['cajabanco']}, codigo_cb={r['codigo_cb']}, count={r['count']}")

    # Ejemplo vencimientos cobrados
    cur.execute("""
        SELECT cajabanco, codigo_cb, COUNT(*) 
        FROM vencimientos 
        WHERE situacion = 1 
        GROUP BY cajabanco, codigo_cb 
        ORDER BY COUNT(*) DESC 
        LIMIT 15
    """)
    print("\n=== vencimientos cobrados cajabanco/codigo_cb ===")
    for r in cur.fetchall():
        print(f"  cajabanco={r['cajabanco']}, codigo_cb={r['codigo_cb']}, count={r['count']}")

    # Cajas activas
    cur.execute("SELECT codigo, nombre, inactiva FROM cajas ORDER BY codigo")
    print("\n=== Cajas ===")
    for r in cur.fetchall():
        print(f"  codigo={r['codigo']}, nombre={r['nombre']}, inactiva={r['inactiva']}")

    # Formas de pago
    cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY codigo LIMIT 20")
    print("\n=== Formas de pago ===")
    for r in cur.fetchall():
        print(f"  codigo={r['codigo']}, nombre={r['nombre']}")

    # Ejemplo cajas_registro reciente
    cur.execute("""
        SELECT id, codigo, fecha, concepto, ingreso, cajabanco, idsujeto, tiposujeto, es_entrega_alb
        FROM cajas_registro 
        ORDER BY id DESC LIMIT 10
    """)
    print("\n=== cajas_registro reciente ===")
    for r in cur.fetchall():
        print(dict(r))

    conn.close()
