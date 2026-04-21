import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012', cursor_factory=RealDictCursor, connect_timeout=10)
cur = conn.cursor()

# situacion values in vencimientos
cur.execute("SELECT situacion, COUNT(*) FROM vencimientos GROUP BY situacion ORDER BY situacion")
print('vencimientos.situacion counts:', [dict(r) for r in cur.fetchall()])
# 0=pendiente, 1=cobrado?

# Documents for a client that have pending vencimientos
cur.execute("""
    SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.cli_nombre, vc.total,
           COUNT(v.id) FILTER (WHERE v.situacion = 0) as venc_pendientes,
           COALESCE(SUM(v.importe) FILTER (WHERE v.situacion = 0), 0) as importe_pendiente,
           COALESCE(SUM(e.importe), 0) as entregas
    FROM ventas_cabeceras vc
    LEFT JOIN vencimientos v ON v.idcab = vc.id
    LEFT JOIN ventas_entregas e ON e.idcab = vc.id
    WHERE vc.cli_codigo = 18781
      AND vc.tipodoc IN (4, 8)
    GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.cli_nombre, vc.total
    HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0
        OR COALESCE(SUM(e.importe),0) > 0
    ORDER BY vc.fecha DESC
    LIMIT 5
""")
print('\ndocs con venc pendientes o entregas:')
for r in cur.fetchall(): print(dict(r))

# registro_cobros cols
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='registro_cobros' ORDER BY ordinal_position LIMIT 20")
print('\nregistro_cobros cols:', [r['column_name'] for r in cur.fetchall()])

# formaspago all
cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY codigo")
print('\nformaspago:')
for r in cur.fetchall(): print(dict(r))

conn.close()
