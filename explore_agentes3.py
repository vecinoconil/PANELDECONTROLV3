import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
                       user='SOLBA', password='solba2012', connect_timeout=10, cursor_factory=RealDictCursor)
cur = conn.cursor()

# Ventas mensuales agente 1 (aaaa), 2025 y 2026
cur.execute("""
    SELECT EXTRACT(YEAR FROM fecha)::int AS anio, EXTRACT(MONTH FROM fecha)::int AS mes, 
           SUM(total) AS total, COUNT(*) AS docs
    FROM ventas_cabeceras
    WHERE agente = 1 AND tipodoc IN (3, 4) AND fecha >= '2024-01-01'
    GROUP BY anio, mes ORDER BY anio, mes
""")
print("=== VENTAS MENSUALES AGENTE 1 ===")
for r in cur.fetchall():
    print(f"  {r['anio']}-{r['mes']:02d}: {r['total']:.2f} ({r['docs']} docs)")

# KPIs agente 1, 2026
cur.execute("""
    SELECT COUNT(DISTINCT cli_codigo) as clientes, COUNT(*) as documentos,
           SUM(total) as ventas, AVG(total) as ticket_medio
    FROM ventas_cabeceras
    WHERE agente = 1 AND tipodoc IN (3, 4) AND EXTRACT(YEAR FROM fecha) = 2026
""")
print("\n=== KPIs AGENTE 1 (2026) ===")
r = cur.fetchone()
for k, v in r.items():
    print(f"  {k}: {v}")

# Margen
cur.execute("""
    SELECT SUM(vl.importe) as total_venta,
           SUM(vl.coste * vl.unidades) as total_coste,
           SUM(vl.importe - vl.coste * vl.unidades) as margen
    FROM ventas_lineas vl
    JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    WHERE vc.agente = 1 AND vc.tipodoc IN (3, 4) AND EXTRACT(YEAR FROM vc.fecha) = 2026
""")
print("\n=== MARGEN AGENTE 1 (2026) ===")
r = cur.fetchone()
for k, v in r.items():
    print(f"  {k}: {v}")

# Pendiente cobro
cur.execute("""
    SELECT SUM(v.importe) as pendiente
    FROM vencimientos v
    JOIN ventas_cabeceras vc ON v.idcab = vc.id
    WHERE vc.agente = 1 AND v.tipo = 0 AND v.situacion = 0
""")
print(f"\n=== PENDIENTE COBRO: {cur.fetchone()['pendiente']} ===")

# Top productos
cur.execute("""
    SELECT a.referencia, a.descripcion, 
           SUM(vl.unidades) as uds, SUM(vl.importe) as total
    FROM ventas_lineas vl
    JOIN ventas_cabeceras vc ON vl.idcab = vc.id
    LEFT JOIN articulos a ON vl.referencia = a.referencia
    WHERE vc.agente = 1 AND vc.tipodoc IN (3, 4) AND EXTRACT(YEAR FROM vc.fecha) = 2026
    GROUP BY a.referencia, a.descripcion
    ORDER BY total DESC LIMIT 10
""")
print("\n=== TOP PRODUCTOS AGENTE 1 (2026) ===")
for r in cur.fetchall():
    print(f"  {r['referencia']}: {r['descripcion'][:40]} - Uds: {r['uds']} - {r['total']:.2f}")

# Crecimiento cartera (clientes nuevos vs perdidos)
cur.execute("""
    WITH cli_prev AS (
        SELECT DISTINCT cli_codigo FROM ventas_cabeceras
        WHERE agente = 1 AND tipodoc IN (3,4) AND EXTRACT(YEAR FROM fecha) = 2025
    ), cli_curr AS (
        SELECT DISTINCT cli_codigo FROM ventas_cabeceras
        WHERE agente = 1 AND tipodoc IN (3,4) AND EXTRACT(YEAR FROM fecha) = 2026
    )
    SELECT 
        (SELECT COUNT(*) FROM cli_curr) as clientes_actual,
        (SELECT COUNT(*) FROM cli_prev) as clientes_anterior,
        (SELECT COUNT(*) FROM cli_curr WHERE cli_codigo NOT IN (SELECT cli_codigo FROM cli_prev)) as nuevos,
        (SELECT COUNT(*) FROM cli_prev WHERE cli_codigo NOT IN (SELECT cli_codigo FROM cli_curr)) as perdidos
""")
print("\n=== CRECIMIENTO CARTERA ===")
r = cur.fetchone()
for k, v in r.items():
    print(f"  {k}: {v}")

conn.close()
