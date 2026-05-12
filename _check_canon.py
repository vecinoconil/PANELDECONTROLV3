import psycopg2
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor()

print("=== articulos_canon COMPLETO ===")
cur.execute("SELECT * FROM articulos_canon")
for r in cur.fetchall(): print(r)

# Buscar la referencia del articulo canon en articulos (codigo2 podria ser la ref)
print("\n=== BUSCAR ARTICULO POR REFERENCIA CANON ===")
cur.execute("SELECT referencia, nombre, es_servicio, pvd FROM articulos WHERE referencia='2000000049724' OR referencia='2000000049175'")
for r in cur.fetchall(): print(r)

# Ver si lineas de venta del pedido de prueba tienen la referencia del canon
print("\n=== LINEAS CANON EN PEDIDOS/ALBARANES RECIENTES ===")
cur.execute("""
    SELECT vc.tipodoc, vc.serie, vc.numero, vc.fecha,
           vl.referencia, vl.descripcion, vl.unidades, vl.precio, vl.importe, vl.piva
    FROM ventas_lineas vl
    JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    WHERE lower(vl.descripcion) LIKE '%canon%'
    ORDER BY vc.fecha DESC, vc.id LIMIT 15
""")
for r in cur.fetchall(): print(r)

cur.close(); conn.close()
print('done')



