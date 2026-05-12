import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()
    # Buscar el albaran CI26 374
    cur.execute("""
        SELECT id, tipodoc, serie, numero, cli_codigo, fecha
        FROM ventas_cabeceras
        WHERE serie='CI' AND numero=374
        LIMIT 5
    """)
    cabs = cur.fetchall()
    for c in cabs:
        print("CAB:", dict(c))

    # Buscar lineas
    cur.execute("""
        SELECT id, orden, referencia, descripcion,
               unidades, gramos, precio, importe, piva, pdto1,
               almacen, tipo_unidad, talla, color,
               coste, pmp, usuario
        FROM ventas_lineas
        WHERE serie='CI' AND numero=374
        ORDER BY orden
    """)
    for r in cur.fetchall():
        print("LIN:", dict(r))
    conn.close()
