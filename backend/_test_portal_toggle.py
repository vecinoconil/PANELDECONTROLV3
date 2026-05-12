import urllib.request, json

def post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read())

def patch(url, token):
    req = urllib.request.Request(url, data=b'', headers={'Authorization': f'Bearer {token}'}, method='PATCH')
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read())

def get(url, token):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read())

status, data = post('http://localhost:4000/api/auth/login', {'email': 'admin@solba.com', 'password': 'padrino75'})
print(f'Login: {status}')
token = data.get('access_token', '')

status2, locales = get('http://localhost:4000/api/admin/locales', token)
print(f'Locales ({status2}): {len(locales)} locales')
if locales:
    lid = locales[0]['id']
    pactivo = locales[0].get('portal_activo')
    print(f'  Local id={lid}, portal_activo={pactivo}')
    status3, res = patch(f'http://localhost:4000/api/admin/locales/{lid}/toggle-portal', token)
    print(f'  Toggle ({status3}): portal_activo ahora={res.get("portal_activo")}')
