import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from collections import defaultdict

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012', connect_timeout=10,
    cursor_factory=RealDictCursor
)
cur = conn.cursor()

# Probar varios albaranes con lotes
for idcab in [66240, 66239, 66238]:
    cur.execute("SELECT id FROM ventas_lineas WHERE idcab=%s ORDER BY orden", (idcab,))
    lineas = cur.fetchall()
    ids_linea = [int(l['id']) for l in lineas]

    cur.execute(
        "SELECT DISTINCT alr.id_lin, al.lote FROM articulos_lotes_registro alr "
        "JOIN articulos_lotes al ON al.id = alr.id_lote "
        "WHERE alr.id_lin = ANY(%s)",
        (ids_linea,)
    )
    lotes = cur.fetchall()
    print("idcab=%s lineas=%s ids=%s lotes=%s" % (idcab, len(lineas), ids_linea, [(r['id_lin'], r['lote']) for r in lotes]))

conn.close()
