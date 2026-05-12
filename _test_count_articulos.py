import sys
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')

from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import select, Session
from app.database import engine

with Session(engine) as s:
    emp = s.exec(select(Empresa).where(Empresa.activo == True)).first()
    if not emp:
        print("No hay empresa activa")
        sys.exit(1)
    
    conn = get_pg_connection(emp)
    cur = conn.cursor()
    
    # Probar la query EXACTA del endpoint con LIMIT ALL
    cur.execute("""
        SELECT
            a.referencia,
            a.nombre,
            a.familia,
            COALESCE(ti.iva, 21.0)::float       AS piva,
            COALESCE(ap.precio, 0.0)::float      AS precio_base
        FROM articulos a
        LEFT JOIN tipos_iva ti    ON ti.codigo = a.tipoiva
        LEFT JOIN articulos_precios ap
               ON ap.referencia = a.referencia AND ap.tarifa = %(tarifa)s
        WHERE a.obsoleto = 0
        ORDER BY a.nombre
        LIMIT ALL
    """, {"tarifa": 1})
    
    rows = cur.fetchall()
    print(f"LIMIT ALL devuelve: {len(rows)} filas")
    
    # Y con LIMIT 500
    cur.execute("""
        SELECT a.referencia FROM articulos a
        WHERE a.obsoleto = 0
        ORDER BY a.nombre
        LIMIT 500
    """)
    rows500 = cur.fetchall()
    print(f"LIMIT 500 devuelve: {len(rows500)} filas")
    
    conn.close()
