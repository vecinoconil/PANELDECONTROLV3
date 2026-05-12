import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Ver default de almacen en ventas_lineas
    cur.execute("""
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name='ventas_lineas' AND column_name IN ('almacen','tipo_unidad','gramos','usuario')
    """)
    for r in cur.fetchall():
        print(dict(r))

    # Ver cabeceras que tenemos en almacenes
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='almacenes' ORDER BY ordinal_position LIMIT 5")
    print("ALMACENES COLS:", [r['column_name'] for r in cur.fetchall()])

    cur.execute("SELECT codigo, nombre FROM almacenes ORDER BY codigo")
    for r in cur.fetchall():
        print("ALM:", dict(r))

    conn.close()
