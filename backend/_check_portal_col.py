from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name='locales' ORDER BY ordinal_position"
    ))
    cols = [r[0] for r in result]
    print("Columnas en locales:", cols)
    print("portal_activo existe:", "portal_activo" in cols)
