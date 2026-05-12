import sys
sys.path.insert(0, 'c:/PANELDECONTROLV3/backend')
import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT c.*, cl.nombre AS cli_nombre, cl.cif AS cli_cif, cl.direccion AS cli_direccion,
           cl.localidad AS cli_localidad, cl.cpostal AS cli_cpostal, cl.telefono1 AS cli_telefono
    FROM ventas_cabeceras c
    LEFT JOIN clientes cl ON cl.codigo = c.cli_codigo
    WHERE c.tipodoc IN (2,4,8) ORDER BY c.fecha DESC LIMIT 1
""")
doc = dict(cur.fetchone())
cur.execute("SELECT * FROM ventas_lineas WHERE idcab = %s ORDER BY orden", (doc['id'],))
lineas = [dict(r) for r in cur.fetchall()]
print('Doc tipo:', doc['tipodoc'], 'serie:', doc.get('serie'), 'num:', doc.get('numero'), 'lineas:', len(lineas))

from app.services.pdf_docs import generate_pdf
pdf_bytes = generate_pdf('a4_basico_logo_izq', doc, lineas, conn)
with open('C:/PANELDECONTROLV3/_test_output.pdf', 'wb') as f:
    f.write(pdf_bytes)
print('PDF generado:', len(pdf_bytes), 'bytes -> _test_output.pdf')
conn.close()
