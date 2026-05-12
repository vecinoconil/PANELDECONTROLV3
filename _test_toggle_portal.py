"""Test script para diagnosticar el endpoint toggle-portal."""
import urllib.request
import json

BASE = "http://localhost:4000"

def req(url, method="GET", token="", data=None):
    body = json.dumps(data).encode() if data is not None else b"{}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        try:
            body_err = json.loads(e.read())
        except:
            body_err = "non-JSON"
        return e.code, body_err

# Login
s, d = req(f"{BASE}/api/auth/login", "POST", data={"email": "admin@solba.com", "password": "padrino75"})
print(f"Login: {s}")
if s != 200:
    print("ERROR al hacer login:", d)
    exit(1)
token = d["access_token"]
print(f"Token obtenido (rol: {d.get('rol')} / empresa: {d.get('empresa_id')})")

print()
print("=== GET a toggle-portal (debería dar 405 si el path existe) ===")
s1, r1 = req(f"{BASE}/api/admin/locales/2/toggle-portal", "GET", token)
print(f"  Status: {s1}  |  Body: {r1}")

print()
print("=== GET a ruta inexistente (debería dar 404) ===")
s2, r2 = req(f"{BASE}/api/admin/locales/2/ruta-que-no-existe-xyz", "GET", token)
print(f"  Status: {s2}  |  Body: {r2}")

print()
print("=== PATCH toggle-asistente (debería dar 200) ===")
s3, r3 = req(f"{BASE}/api/admin/locales/2/toggle-asistente", "PATCH", token)
print(f"  Status: {s3}  |  Body keys: {list(r3.keys()) if isinstance(r3, dict) else r3}")

print()
print("=== PATCH toggle-portal (el que falla) ===")
s4, r4 = req(f"{BASE}/api/admin/locales/2/toggle-portal", "PATCH", token)
print(f"  Status: {s4}  |  Body: {r4}")

print()
print("=== Listar todas las rutas que contienen 'toggle' en el servidor en vivo ===")
try:
    s5, r5 = req(f"{BASE}/openapi.json", "GET")
    if isinstance(r5, dict) and "paths" in r5:
        for path, methods in r5["paths"].items():
            if "toggle" in path.lower():
                print(f"  {path}: {list(methods.keys())}")
    else:
        print("  No se pudo leer openapi.json:", s5)
except Exception as e:
    print("  Error:", e)
