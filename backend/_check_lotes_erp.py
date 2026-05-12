import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Estructura de articulos_lotes_registro
    cur.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name='articulos_lotes_registro'
        ORDER BY ordinal_position
    """)
    print("COLS lotes_registro:", [(r['column_name'], r['data_type']) for r in cur.fetchall()])

    # Estructura de articulos_lotes_stock
    cur.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name='articulos_lotes_stock'
        ORDER BY ordinal_position
    """)
    print("\nCOLS lotes_stock:", [(r['column_name'], r['data_type']) for r in cur.fetchall()])

    # Buscar un lote del articulo de lotes (ref=2000000055183) para ver ejemplo
    cur.execute("""
        SELECT * FROM articulos_lotes_registro 
        WHERE referencia='2000000055183' LIMIT 3
    """)
    print("\nEjemplo lotes_registro:", [dict(r) for r in cur.fetchall()])

    # Ver un movimiento reciente en lotes_stock para entender patron
    cur.execute("""
        SELECT als.*, alr.referencia, alr.descripcion 
        FROM articulos_lotes_stock als
        JOIN articulos_lotes_registro alr ON als.id_lote = alr.id
        WHERE alr.referencia='2000000055183'
        LIMIT 5
    """)
    print("\nStock por lote ref 55183:", [dict(r) for r in cur.fetchall()])

    conn.close()
