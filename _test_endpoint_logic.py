"""Test del endpoint buscar_articulos replicando la logica exacta"""
import sys
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')

from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import select, Session
from app.database import engine

CLI_CODIGO = None  # se busca el primer cliente disponible

with Session(engine) as s:
    emp = s.exec(select(Empresa).where(Empresa.activo == True)).first()
    if not emp:
        print("No hay empresa activa")
        sys.exit(1)
    
    conn = get_pg_connection(emp)
    cur = conn.cursor()
    
    # Obtener primer cliente disponible
    cur.execute("SELECT codigo, tarifabase, tarifaespecial FROM clientes LIMIT 1")
    cli = cur.fetchone()
    if not cli:
        cur.execute("SELECT codigo, tarifabase, tarifaespecial FROM clientes LIMIT 1")
        cli = cur.fetchone()
    
    print(f"Cliente: {cli['codigo']}, tarifabase: {cli['tarifabase']}, tarifaespecial: {cli['tarifaespecial']}")
    
    tarifabase = int(cli['tarifabase'] or 1)
    tarifaespecial = int(cli['tarifaespecial'] or 0)
    cli_codigo = cli['codigo']
    
    q = ""
    words = [w for w in q.strip().split() if w]
    art_params = {"tarifa": tarifabase}
    
    if words:
        limit = "20"
        art_where = "AND ..."
    else:
        art_where = ""
        limit = "ALL"
    
    print(f"limit = {repr(limit)}, art_where = {repr(art_where)}")
    
    cur.execute(
        f"""
        SELECT
            a.referencia,
            a.nombre,
            a.familia
        FROM articulos a
        LEFT JOIN articulos_precios ap
               ON ap.referencia = a.referencia AND ap.tarifa = %(tarifa)s
        WHERE a.obsoleto = 0
          {art_where}
        ORDER BY a.nombre
        LIMIT {limit}
        """,
        art_params,
    )
    rows = [dict(r) for r in cur.fetchall()]
    print(f"Filas devueltas por query: {len(rows)}")
    
    # refs para precios_clipro
    refs = [r["referencia"] for r in rows]
    print(f"refs len: {len(refs)}")
    
    # precios_clipro  
    cur.execute(
        """
        SELECT DISTINCT ON (referencia) referencia, pvp::float
        FROM precios_clipro
        WHERE cliente = %s AND anulado = 0 AND referencia = ANY(%s)
        ORDER BY referencia, id DESC
        """,
        (cli_codigo, refs),
    )
    clipro_rows = cur.fetchall()
    print(f"precios_clipro devueltos: {len(clipro_rows)}")
    
    # result final
    result = []
    for r in rows:
        result.append({"referencia": r["referencia"]})
    
    print(f"Result final: {len(result)} articulos")
    conn.close()
