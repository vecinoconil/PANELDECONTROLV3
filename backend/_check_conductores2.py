import sys
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
from app.services.pg_connection import get_pg_connection
from app.database import get_session
from sqlmodel import select
from app.models.app_models import Empresa

# Get first empresa
session = next(get_session())
empresa = session.exec(select(Empresa)).first()
print("Empresa:", empresa.nombre if empresa else "None")

conn = get_pg_connection(empresa)
cur = conn.cursor()

# Check conductores table
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='conductores' ORDER BY ordinal_position")
rows = cur.fetchall()
print("\nColumnas conductores:")
for r in rows:
    print(" ", r)

# Sample data
cur.execute("SELECT * FROM conductores LIMIT 5")
rows = cur.fetchall()
print("\nMuestra conductores:")
for r in rows:
    print(" ", dict(r))

conn.close()
