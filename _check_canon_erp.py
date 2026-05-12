"""
Explorar estructura de pedido con línea de canon digital en el ERP
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))
from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as s:
    empresa = s.exec(select(Empresa)).first()

print(f"Empresa: {empresa.nombre} -> {empresa.pg_host}:{empresa.pg_port}/{empresa.pg_name}")
conn = get_pg_connection(empresa)
cur = conn.cursor()

# 1. Artículos con canon
cur.execute("""
    SELECT a.referencia, a.descripcion_qr AS descripcion, a.canon_suma_importe, a.canon_importe
    FROM articulos a
    WHERE a.canon_suma_importe = true
    LIMIT 10
""")
arts = cur.fetchall()
print("=== ARTICULOS CON CANON ===")
for r in arts:
    print(r)

if not arts:
    print("No hay artículos con canon_suma_importe=true")
    cur.close()
    conn.close()
    exit()

refs = tuple(r['referencia'] for r in arts)
placeholder = ','.join(['%s'] * len(refs))

# 2. Pedidos recientes con esos artículos - ver TODAS las líneas del pedido
cur.execute(f"""
    SELECT DISTINCT vc.id
    FROM ventas_cabeceras vc
    JOIN ventas_lineas vl ON vl.idcab = vc.id
    WHERE vl.referencia IN ({placeholder})
    ORDER BY vc.id DESC
    LIMIT 5
""", refs)
ids = [r['id'] for r in cur.fetchall()]
print(f"\n=== PEDIDOS RECIENTES CON ARTICULO CANON (ids: {ids}) ===")

if ids:
    id_placeholder = ','.join(['%s'] * len(ids))
    cur.execute(f"""
        SELECT vc.id, vc.tipodoc, vc.serie || vc.numero::text AS ncompleto, vc.fecha,
               vl.id as linea_id, vl.orden as numlinea, vl.referencia, vl.descripcion as descripcion,
               vl.unidades as uds, vl.precio, vl.piva, vl.gramos
        FROM ventas_cabeceras vc
        JOIN ventas_lineas vl ON vl.idcab = vc.id
        WHERE vc.id IN ({id_placeholder})
        ORDER BY vc.id DESC, vl.orden ASC
    """, ids)
    lineas = cur.fetchall()
    
    cab_actual = None
    for l in lineas:
        if l['id'] != cab_actual:
            cab_actual = l['id']
            print(f"\n--- Pedido ID={l['id']} tipodoc={l['tipodoc']} num={l['ncompleto']} fecha={l['fecha']} ---")
        print(f"  Lin#{str(l['numlinea']):3s} | ref={str(l['referencia']):25s} | desc={str(l['descripcion'])[:40]:40s} | uds={str(l['uds']):6s} | pvp={str(l['precio']):8s} | piva={str(l['piva']):4s} | gramos={str(l['gramos'])}")

# 3. Tabla articulos_canon
print("\n=== TABLA articulos_canon ===")
try:
    cur.execute("SELECT * FROM articulos_canon LIMIT 10")
    cols = [d[0] for d in cur.description]
    print("Columnas:", cols)
    for r in cur.fetchall():
        print(dict(r))
except Exception as e:
    print(f"Error: {e}")

# 4. Pedido más reciente (cualquiera)
print("\n=== PEDIDO MAS RECIENTE ===")
cur.execute("""
    SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha,
           vl.orden, vl.referencia, vl.descripcion, vl.unidades, vl.precio, vl.piva
    FROM ventas_cabeceras vc
    JOIN ventas_lineas vl ON vl.idcab = vc.id
    WHERE vc.tipodoc IN (1,2,4,8)
    ORDER BY vc.id DESC, vl.orden ASC
    LIMIT 30
""")
rows2 = cur.fetchall()
cab = None
for r in rows2:
    if r['id'] != cab:
        cab = r['id']
        print(f"-- ID={r['id']} tipo={r['tipodoc']} {r['serie']}{r['numero']} {r['fecha']} --")
    canon_flag = ' <<< CANON' if not r['referencia'] and 'canon' in (r['descripcion'] or '').lower() else ''
    print(f"  #{r['orden']:2d} ref={str(r['referencia']):20s} desc={str(r['descripcion'])[:50]:50s} u={r['unidades']:6} pvp={r['precio']:8}{canon_flag}")

cur.close()
conn.close()
