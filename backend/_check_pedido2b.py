import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # El albaran reciente es id=66236
    idcab = 66236
    cur.execute("""
        SELECT id, orden, referencia, descripcion,
               unidades, gramos, precio, importe, piva,
               almacen, tipo_unidad, usuario
        FROM ventas_lineas
        WHERE idcab=%s ORDER BY orden
    """, (idcab,))
    print("=== LINEAS ALBARAN id=66236 ===")
    for r in cur.fetchall():
        print(dict(r))

    # Buscar tabla de lotes/movimientos
    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_name LIKE '%lot%'
        ORDER BY table_name
    """)
    print("\nTablas con 'lot':", [r['table_name'] for r in cur.fetchall()])

    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_name LIKE '%mov%'
        ORDER BY table_name
    """)
    print("Tablas con 'mov':", [r['table_name'] for r in cur.fetchall()])

    conn.close()
