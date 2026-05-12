"""Prueba el endpoint de PDF generando un token y llamando a la API."""
import sys, os, requests
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
os.chdir(r'c:\PANELDECONTROLV3\backend')
from dotenv import load_dotenv; load_dotenv()
from app.routers.portal import _create_portal_token
from app.models.app_models import Empresa, Local
from sqlmodel import Session, create_engine, select
from app.config import settings

engine = create_engine(settings.database_url, echo=False)
with Session(engine) as s:
    emp = s.exec(select(Empresa)).first()
    local = s.exec(select(Local).where(Local.empresa_id == emp.id)).first()
    print(f"Empresa: {emp.id} - {emp.nombre}")
    print(f"Local portal_activo: {local.portal_activo if local else 'sin local'}")

# Generar token para factura id=66280, cli=1003040
token = _create_portal_token(emp.id, 1003040)
print(f"Token: {token[:40]}...")

# Llamar al endpoint /info
r = requests.get(f"http://localhost:4000/api/portal/{token}/info")
print(f"\nInfo status: {r.status_code}")
if r.status_code == 200:
    print(f"Info: {r.json()}")
else:
    print(f"Error info: {r.text}")

# Llamar al endpoint facturas
r2 = requests.get(f"http://localhost:4000/api/portal/{token}/facturas")
print(f"\nFacturas status: {r2.status_code}")
if r2.status_code == 200:
    facs = r2.json().get('facturas', [])
    print(f"Facturas: {len(facs)} documentos")
    if facs:
        fac_id = facs[0]['id']
        print(f"Primera factura id: {fac_id}")
        
        # Llamar al endpoint PDF
        r3 = requests.get(f"http://localhost:4000/api/portal/{token}/facturas/{fac_id}/pdf")
        print(f"\nPDF status: {r3.status_code}")
        if r3.status_code == 200:
            print(f"PDF OK: {len(r3.content)} bytes")
        else:
            print(f"PDF ERROR: {r3.text}")
else:
    print(f"Error facturas: {r2.text}")
