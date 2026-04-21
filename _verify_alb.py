import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                        user='SOLBA', password='solba2012', cursor_factory=RealDictCursor)
cur = conn.cursor()
cur.execute("""
    SELECT COUNT(*) as cnt,
           COALESCE(SUM(baseimpo1+COALESCE(baseimpo2,0)+COALESCE(baseimpo3,0)),0) as base,
           COALESCE(SUM(iva1+COALESCE(iva2,0)),0) as iva,
           COALESCE(SUM(total),0) as total
    FROM ventas_cabeceras
    WHERE tipodoc=4 AND fechafin IS NULL AND serie='CI 26'
      AND fecha>='2026-01-01' AND fecha<'2026-04-01'
""")
r = cur.fetchone()
print(f"BD:       {r['cnt']} docs | Base: {float(r['base']):>10.2f} | IVA: {float(r['iva']):>8.2f} | Total: {float(r['total']):>10.2f}")
print(f"Listado:  28 docs | Base:   16829.46 | IVA:  3534.19 | Total:   20363.63")
conn.close()
