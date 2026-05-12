import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    rows = conn.execute(text("SELECT id, nombre, email, empresa_id, precargar_historial_autoventa FROM usuarios ORDER BY id DESC LIMIT 20")).fetchall()
    for r in rows: print(r)
