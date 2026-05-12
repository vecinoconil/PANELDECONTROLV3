"""Test directo al servidor HTTP para ver cuantos articulos devuelve"""
import sys, urllib.request, json

# Login
login_data = json.dumps({"email": "admin@solba.com", "password": "admin"}).encode()
try:
    req = urllib.request.Request(
        "http://localhost:4000/api/auth/login",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req, timeout=10)
    token_data = json.loads(resp.read())
    token = token_data.get("access_token", "")
    print("Login OK")
except Exception as e:
    print(f"Login fallido: {e}")
    sys.exit(1)

# Obtener primer cliente
req2 = urllib.request.Request(
    "http://localhost:4000/api/autoventa/clientes/buscar?q=",
    headers={"Authorization": f"Bearer {token}", "X-Empresa-Id": "1"}
)
try:
    resp2 = urllib.request.urlopen(req2, timeout=15)
    clientes = json.loads(resp2.read())
    if not clientes:
        print("No hay clientes")
        sys.exit(1)
    cli_codigo = clientes[0]["codigo"]
    print(f"Cliente: {cli_codigo} {clientes[0]['nombre']}")
except Exception as e:
    print(f"Error clientes: {e}")
    sys.exit(1)

# Obtener articulos
req3 = urllib.request.Request(
    f"http://localhost:4000/api/autoventa/articulos/buscar?q=&cli_codigo={cli_codigo}",
    headers={"Authorization": f"Bearer {token}", "X-Empresa-Id": "1"}
)
try:
    resp3 = urllib.request.urlopen(req3, timeout=60)
    articulos = json.loads(resp3.read())
    print(f"Articulos devueltos por la API: {len(articulos)}")
except Exception as e:
    print(f"Error articulos: {e}")
