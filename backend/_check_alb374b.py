import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Ver columnas de ventas_cabeceras
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='ventas_cabeceras' ORDER BY ordinal_position")
    cols = [r['column_name'] for r in cur.fetchall()]
    print("COLS CAB:", cols)

    # Buscar el albaran CI/374
    cur.execute("SELECT * FROM ventas_cabeceras WHERE serie ILIKE 'CI' AND numero=374 LIMIT 3")
    rows = cur.fetchall()
    print("Encontrados:", len(rows))
    for r in rows:
        print(dict(r))
    conn.close()
