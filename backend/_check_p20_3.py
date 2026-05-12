import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    cur.execute("SELECT id, tipodoc, serie, numero FROM ventas_cabeceras WHERE serie='P 20' AND numero=3")
    cabs = cur.fetchall()
    for c in cabs:
        print("CAB:", dict(c))
        cur.execute("""
            SELECT id, orden, referencia, descripcion,
                   unidades, gramos, precio, importe, piva,
                   almacen, tipo_unidad, usuario
            FROM ventas_lineas WHERE idcab=%s ORDER BY orden
        """, (c['id'],))
        for r in cur.fetchall():
            print("  LIN:", dict(r))
    conn.close()
