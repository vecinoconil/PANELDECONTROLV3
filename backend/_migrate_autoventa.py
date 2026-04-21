from app.database import engine
from sqlmodel import text

with engine.connect() as conn:
    res = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='usuarios' ORDER BY ordinal_position"
    )).fetchall()
    cols = [r[0] for r in res]
    print('Current columns:', cols)

    if 'agente_autoventa' not in cols:
        conn.execute(text('ALTER TABLE usuarios ADD COLUMN agente_autoventa INTEGER'))
        print('Added agente_autoventa')
    if 'serie_autoventa' not in cols:
        conn.execute(text('ALTER TABLE usuarios ADD COLUMN serie_autoventa VARCHAR(20)'))
        print('Added serie_autoventa')
    if 'autoventa_modifica_precio' not in cols:
        conn.execute(text('ALTER TABLE usuarios ADD COLUMN autoventa_modifica_precio BOOLEAN NOT NULL DEFAULT false'))
        print('Added autoventa_modifica_precio')
    if 'fpagos_autoventa' not in cols:
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN fpagos_autoventa TEXT NOT NULL DEFAULT '[]'"))
        print('Added fpagos_autoventa')
    conn.commit()
    print('Done')
