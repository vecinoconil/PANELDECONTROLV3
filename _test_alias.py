import psycopg2
from sqlmodel import Session, select, create_engine
from app.models.app_models import Empresa
from app.config import settings
import sys
sys.path.insert(0, r'C:\PANELDECONTROLV3\backend')

engine = create_engine(settings.database_url)
with Session(engine) as s:
    empresa = s.exec(select(Empresa).limit(1)).first()
    dsn = f'host={empresa.pg_host} port={empresa.pg_port} dbname={empresa.pg_name} user={empresa.pg_user} password={empresa.pg_password}'

conn = psycopg2.connect(dsn)
cur = conn.cursor()
cur.execute("""
    SELECT c.id, c.numero_contrato,
        cl.nombre AS cli_nombre,
        COALESCE(cl.alias, '') AS cli_alias
    FROM contratos c
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    WHERE cl.alias IS NOT NULL AND trim(cl.alias) != ''
    AND (c.desactivado IS NULL OR c.desactivado = FALSE) AND c.fecha_baja IS NULL
    LIMIT 5
""")

cols = [d[0] for d in cur.description]
rows = [dict(zip(cols, r)) for r in cur.fetchall()]
print('Columnas devueltas:', cols)
for r in rows:
    print(r)
cur.close()
conn.close()
