import urllib.request
import urllib.parse
import json

base = "http://localhost:4000"

# Login
login_data = urllib.parse.urlencode({"username": "admin@solba.com", "password": "padrino75"}).encode()
req = urllib.request.Request(f"{base}/api/auth/login", data=login_data, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")
resp = urllib.request.urlopen(req)
token = json.loads(resp.read())["access_token"]

# Ficha cliente
params = urllib.parse.urlencode({"cli_codigo": 1000995, "anio": 2026})
req2 = urllib.request.Request(f"{base}/api/dashboard/ficha-cliente?{params}")
req2.add_header("Authorization", f"Bearer {token}")
try:
    resp2 = urllib.request.urlopen(req2)
    print("Status: 200")
    data = json.loads(resp2.read())
    print("Keys:", list(data.keys()))
    print("Cliente:", data.get("cliente", {}).get("nombre"))
    print("Familias:", len(data.get("productos_familia", [])))
except urllib.error.HTTPError as e:
    print(f"Status: {e.code}")
    print("Error:", e.read().decode()[:2000])
