"""Migration: add SMTP fields to empresas table."""
from app.database import engine
from sqlmodel import text

with engine.connect() as conn:
    res = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='empresas'")).fetchall()
    cols = [r[0] for r in res]
    print('Current cols:', cols)
    migs = []
    if 'smtp_host' not in cols:
        migs.append("ALTER TABLE empresas ADD COLUMN smtp_host VARCHAR(200)")
    if 'smtp_port' not in cols:
        migs.append("ALTER TABLE empresas ADD COLUMN smtp_port INTEGER NOT NULL DEFAULT 465")
    if 'smtp_user' not in cols:
        migs.append("ALTER TABLE empresas ADD COLUMN smtp_user VARCHAR(200)")
    if 'smtp_password' not in cols:
        migs.append("ALTER TABLE empresas ADD COLUMN smtp_password VARCHAR(200)")
    if 'smtp_from_name' not in cols:
        migs.append("ALTER TABLE empresas ADD COLUMN smtp_from_name VARCHAR(200)")
    for m in migs:
        conn.execute(text(m))
        print('Executed:', m)
    conn.commit()
    print('Done')
