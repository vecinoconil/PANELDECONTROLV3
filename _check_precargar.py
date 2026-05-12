import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Todos los usuarios con su agente_autoventa y precargar
    rows = conn.execute(text(
        "SELECT id, nombre, email, agente_autoventa, precargar_historial_autoventa FROM usuarios ORDER BY id"
    )).fetchall()
    print("ID | NOMBRE | EMAIL | AGENTE_AUTOVENTA | PRECARGAR")
    for r in rows:
        print(f"  {r[0]} | {r[1]} | {r[2]} | agente={r[3]} | precargar={r[4]}")
