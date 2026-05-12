"""Migración: poner portal_activo=FALSE en filas que tienen NULL."""
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT COUNT(*) FROM locales WHERE portal_activo IS NULL"
    ))
    nulls = result.scalar()
    print(f"Filas con portal_activo NULL: {nulls}")
    if nulls:
        conn.execute(text(
            "UPDATE locales SET portal_activo = FALSE WHERE portal_activo IS NULL"
        ))
        conn.commit()
        print("Actualizado: portal_activo=FALSE en todas las filas NULL")
    else:
        print("No hay NULLs, nada que hacer")
