import httpx

c = httpx.Client()
r = c.post('http://localhost:4000/api/auth/login', json={'email':'admin@solba.com','password':'padrino75'})
print('Login:', r.status_code)
token = r.json()['access_token']

r2 = c.get('http://localhost:4000/api/dashboard/ficha-cliente', 
           params={'cli_codigo': 1000995, 'anio': 2026},
           headers={'Authorization': f'Bearer {token}'})
print('Ficha:', r2.status_code)
if r2.status_code == 200:
    data = r2.json()
    print('Keys:', list(data.keys()))
    print('Cliente:', data.get('cliente', {}).get('nombre'))
else:
    print('Error:', r2.text[:2000])
