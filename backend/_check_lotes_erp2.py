import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Columnas de articulos_lotes (el registro principal del lote)
    cur.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name='articulos_lotes'
        ORDER BY ordinal_position
    """)
    print("COLS articulos_lotes:", [(r['column_name'], r['data_type']) for r in cur.fetchall()])

    # Ver lotes del artículo de lotes ref=2000000055183
    cur.execute("""
        SELECT * FROM articulos_lotes
        WHERE referencia='2000000055183' LIMIT 5
    """)
    print("\nLotes del artículo 55183:", [dict(r) for r in cur.fetchall()])

    # Ver el lote_registro de una línea existente (línea 192689 del albarán CI26/374 q ya hicimos)
    cur.execute("""
        SELECT * FROM articulos_lotes_registro WHERE id_lin IN (192689, 192690, 192691) LIMIT 10
    """)
    print("\nlotes_registro de lineas CI26/374:", [dict(r) for r in cur.fetchall()])

    # Ver también lotes registro del albaran reciente (lineas 192692-192695)
    cur.execute("""
        SELECT * FROM articulos_lotes_registro WHERE id_lin IN (192692, 192693, 192694, 192695) LIMIT 10
    """)
    print("\nlotes_registro recientes:", [dict(r) for r in cur.fetchall()])

    conn.close()
