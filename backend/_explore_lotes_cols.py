from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select
from app.config import settings

engine = create_engine(settings.database_url, echo=False)
with Session(engine) as session:
    empresa = session.exec(select(Empresa).where(Empresa.activo == True)).first()
    if empresa:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        sql = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position"
        cur.execute(sql, ('articulos_lotes_stock',))
        for r in cur.fetchall(): print(r['column_name'], '-', r['data_type'])
        conn.close()
