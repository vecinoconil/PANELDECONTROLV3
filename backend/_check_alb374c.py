import sys; sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from app.database import engine
from sqlmodel import Session

with Session(engine) as session:
    empresa = session.get(Empresa, 1)
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Buscar por CI26 y numero 374
    cur.execute("SELECT id, tipodoc, serie, numero, fecha, usuario FROM ventas_cabeceras WHERE serie='CI26' AND numero=374")
    rows = cur.fetchall()
    print("CI26/374:", len(rows))
    for r in rows:
        print(dict(r))

    if not rows:
        # Buscar los ultimos albaranes CI para ver como es la serie 
        cur.execute("SELECT id, tipodoc, serie, numero, fecha, usuario FROM ventas_cabeceras WHERE serie LIKE 'CI%' ORDER BY id DESC LIMIT 10")
        rows = cur.fetchall()
        print("Ultimos CI*:")
        for r in rows:
            print(dict(r))

    conn.close()
