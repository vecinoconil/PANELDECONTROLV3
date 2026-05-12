import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))

from dotenv import load_dotenv
load_dotenv()

from app.config import settings
print("superadmin_email:", settings.superadmin_email)

import requests

# Login
r = requests.post('http://localhost:4000/api/auth/login', json={
    'email': settings.superadmin_email,
    'password': settings.superadmin_password
})
print("Login status:", r.status_code)
if r.status_code != 200:
    print(r.text)
    exit()
token = r.json()['access_token']
hdrs = {'Authorization': f'Bearer {token}'}

# Ver usuarios
users = requests.get('http://localhost:4000/api/admin/usuarios', headers=hdrs)
print("Usuarios status:", users.status_code)
# Buscar a "aaaa" o primer usuario con agente
for u in users.json():
    print(f"  id={u['id']} nombre={u['nombre']} precargar={u.get('precargar_historial_autoventa')}")

# Intentar PUT con solo el campo
uid = users.json()[0]['id']
put_r = requests.put(f'http://localhost:4000/api/admin/usuarios/{uid}',
    json={'precargar_historial_autoventa': False},
    headers=hdrs
)
print(f"\nPUT /usuarios/{uid} con precargar=False:")
print("  Status:", put_r.status_code)
if put_r.ok:
    print("  precargar en respuesta:", put_r.json().get('precargar_historial_autoventa'))
else:
    print("  Error:", put_r.text[:300])
