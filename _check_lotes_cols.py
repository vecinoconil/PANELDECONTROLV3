import sys
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')
import os
os.chdir(r'C:\PANELDECONTROLV3\backend')

from app.config import settings
import psycopg2
import psycopg2.extras

from sqlalchemy import create_engine, text
engine = create_engine(settings.database_url, echo=False)
with engine.connect() as conn:
    r = conn.execute(text("SELECT pg_host, pg_port, pg_name, pg_user, pg_password FROM empresas WHERE activo=true LIMIT 1")).fetchone()
    if r:
        pg_conn = psycopg2.connect(host=r[0], port=r[1], dbname=r[2], user=r[3], password=r[4], cursor_factory=psycopg2.extras.RealDictCursor)
        cur = pg_conn.cursor()
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos_lotes_stock' ORDER BY ordinal_position")
        print("=== articulos_lotes_stock ===")
        for row in cur.fetchall(): print(row['column_name'], '-', row['data_type'])
        print()
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='articulos_lotes' ORDER BY ordinal_position")
        print("=== articulos_lotes ===")
        for row in cur.fetchall(): print(row['column_name'], '-', row['data_type'])
        print()
        # buscar articulo doble unidad con lote
        cur.execute("SELECT a.referencia, a.nombre, a.tipo_unidad, a.unidad FROM articulos a WHERE a.control_lotes=true AND a.tipo_unidad=1 LIMIT 3")
        print("=== articulos doble_unidad+lote ===")
        for row in cur.fetchall(): print(dict(row))
        print()
        # ver algunos registros de lotes_stock
        cur.execute("""
            SELECT al.referencia, al.lote, als.* 
            FROM articulos_lotes al 
            JOIN articulos_lotes_stock als ON als.id_lote=al.id 
            WHERE al.referencia IN (SELECT referencia FROM articulos WHERE tipo_unidad=1 AND control_lotes=true LIMIT 1)
            LIMIT 5
        """)
        print("=== sample lotes_stock doble unidad ===")
        for row in cur.fetchall(): print(dict(row))
        pg_conn.close()
