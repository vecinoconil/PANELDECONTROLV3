import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Buscar pedido P 20 / 2
    cur.execute("SELECT id, tipodoc, serie, numero, fecha FROM ventas_cabeceras WHERE serie='P 20' AND numero=2")
    cabs = cur.fetchall()
    for c in cabs:
        print("CAB:", dict(c))

    if cabs:
        idcab = cabs[0]['id']
        cur.execute("""
            SELECT id, orden, referencia, descripcion,
                   unidades, gramos, precio, importe, piva,
                   almacen, tipo_unidad, usuario
            FROM ventas_lineas
            WHERE idcab=%s ORDER BY orden
        """, (idcab,))
        for r in cur.fetchall():
            print("LIN:", dict(r))

        # Buscar lotes asociados
        cur.execute("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name='articulos_lotes_movimientos' 
            ORDER BY ordinal_position LIMIT 20
        """)
        cols = [r['column_name'] for r in cur.fetchall()]
        print("COLS lotes_mov:", cols)

        cur.execute("""
            SELECT * FROM articulos_lotes_movimientos 
            WHERE idcab=%s LIMIT 20
        """, (idcab,))
        movs = cur.fetchall()
        print("Movimientos lotes:", len(movs))
        for m in movs:
            print(dict(m))

    conn.close()
