import os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select

engine = create_engine(settings.database_url, echo=False)
with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

cur.execute("SELECT COUNT(*) AS total FROM articulos WHERE obsoleto = 0")
print("Artículos no obsoletos:", cur.fetchone()["total"])

cur.execute("SELECT COUNT(*) AS total FROM articulos")
print("Artículos total:", cur.fetchone()["total"])

conn.close()
