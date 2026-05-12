import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                        user='SOLBA', password='solba2012', cursor_factory=RealDictCursor)
cur = conn.cursor()

# barcode tables
cur.execute("""SELECT table_name FROM information_schema.tables
               WHERE table_name ILIKE '%codigo%' OR table_name ILIKE '%barr%'
               OR table_name ILIKE '%ean%' ORDER BY 1""")
print("Tablas barcode:", [r["table_name"] for r in cur.fetchall()])

# articulos_codigos
try:
    cur.execute("""SELECT column_name FROM information_schema.columns
                   WHERE table_name='articulos_codigos' ORDER BY ordinal_position""")
    print("articulos_codigos cols:", [r["column_name"] for r in cur.fetchall()])
    cur.execute("SELECT * FROM articulos_codigos LIMIT 3")
    for r in cur.fetchall():
        print(" ", dict(r))
except Exception as e:
    print("Error articulos_codigos:", e)

# Check pedidos pendientes de servir
cur.execute("""
    SELECT vc.id, vc.serie, vc.numero, vc.cli_nombre, vc.fecha, vc.total,
           COUNT(vl.id) as num_lineas,
           SUM(vl.unidades) as total_uds,
           SUM(COALESCE(vl.udservidas, 0)) as total_servidas
    FROM ventas_cabeceras vc
    JOIN ventas_lineas vl ON vl.idcab = vc.id
                         AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera=0)
                         AND vl.referencia IS NOT NULL AND vl.referencia != ''
    WHERE vc.tipodoc = 2
    GROUP BY vc.id, vc.serie, vc.numero, vc.cli_nombre, vc.fecha, vc.total
    HAVING SUM(vl.unidades) > SUM(COALESCE(vl.udservidas, 0))
    ORDER BY vc.fecha DESC
    LIMIT 5
""")
print()
print("=== Pedidos pendientes de servir ===")
for r in cur.fetchall():
    print(dict(r))

# Check a line with udservidas filled
cur.execute("""
    SELECT vl.id, vl.referencia, vl.descripcion, vl.unidades, vl.udservidas, 
           vl.ud_pte_entrega, vl.idpedido, vl.talla, vl.color
    FROM ventas_lineas vl
    WHERE vl.udservidas > 0 AND vl.tipodoc = 2
    LIMIT 5
""")
print()
print("=== Lineas servidas parcialmente ===")
for r in cur.fetchall():
    d = {k: v for k, v in dict(r).items() if v is not None and v != '' and v != 0 and v != False}
    print(dict(r))

# Check albaran line with idpedido filled
cur.execute("""
    SELECT vl.id, vl.idcab, vl.tipodoc, vl.referencia, vl.unidades, vl.idpedido
    FROM ventas_lineas vl
    WHERE vl.tipodoc = 4 AND vl.idpedido IS NOT NULL AND vl.idpedido > 0
    LIMIT 5
""")
print()
print("=== Lineas albaran con pedido origen ===")
for r in cur.fetchall():
    print(dict(r))

conn.close()
