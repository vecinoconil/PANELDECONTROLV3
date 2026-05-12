import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, orden, referencia, descripcion,
               unidades, gramos, precio, importe, piva, pdto1,
               almacen, tipo_unidad, talla, color,
               coste, pmp, usuario
        FROM ventas_lineas
        WHERE idcab=66235
        ORDER BY orden
    """)
    for r in cur.fetchall():
        d = dict(r)
        print(f"\n--- Linea orden={d['orden']} ---")
        for k, v in d.items():
            print(f"  {k}: {v}")
    conn.close()
