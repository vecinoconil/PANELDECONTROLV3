from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # registro_cobros columns
    print("=== registro_cobros columns ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='registro_cobros'
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    # registro_pagos columns
    print()
    print("=== registro_pagos columns ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='registro_pagos'
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    # ventas_cabeceras: ventas mensuales 2026
    print()
    print("=== Ventas mensuales facturas 2026 ===")
    rows = c.execute(text("""
        SELECT EXTRACT(MONTH FROM fecha)::int as mes, 
               SUM(total) as total,
               SUM(baseimpo1+COALESCE(baseimpo2,0)+COALESCE(baseimpo3,0)) as base,
               COUNT(*) as num
        FROM ventas_cabeceras 
        WHERE EXTRACT(YEAR FROM fecha) = 2026 AND tipodoc = 4
        GROUP BY mes ORDER BY mes
    """)).fetchall()
    for r in rows:
        print(f"  mes={r[0]} total={r[1]} base={r[2]} facturas={r[3]}")

    # IVA series 2026
    print()
    print("=== IVA series 2026 ===")
    rows = c.execute(text("""
        SELECT serie, 
               SUM(baseimpo1) as base1, SUM(iva1) as iva1,
               SUM(COALESCE(baseimpo2,0)) as base2, SUM(COALESCE(iva2,0)) as iva2,
               SUM(total) as total
        FROM ventas_cabeceras 
        WHERE EXTRACT(YEAR FROM fecha) = 2026 AND tipodoc = 4
        GROUP BY serie ORDER BY total DESC
    """)).fetchall()
    for r in rows:
        print(f"  serie={str(r[0]):10s} base1={r[1]} iva1={r[2]} base2={r[3]} iva2={r[4]} total={r[5]}")

    # Beneficio
    print()
    print("=== Beneficio 2026 ===")
    rows = c.execute(text("""
        SELECT SUM(vl.importe) as venta, 
               SUM(vl.coste * vl.unidades) as coste,
               SUM(vl.importe) - SUM(vl.coste * vl.unidades) as beneficio
        FROM ventas_lineas vl
        JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        WHERE vc.fecha >= '2026-01-01' AND vc.tipodoc = 4
    """)).fetchall()
    print(f"  ventas={rows[0][0]} coste={rows[0][1]} beneficio={rows[0][2]}")

    # Vencimientos pendientes  
    print()
    print("=== Vencimientos pendientes ===")
    rows = c.execute(text("""
        SELECT tipo, SUM(importe) FROM vencimientos WHERE situacion = 0 GROUP BY tipo ORDER BY tipo
    """)).fetchall()
    for r in rows:
        print(f"  tipo={r[0]} importe_pte={r[1]}")

    # Tablas con gasto
    print()
    print("=== Tablas gastos ===")
    rows = c.execute(text("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_name LIKE '%gasto%'
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    # Agentes
    print()
    print("=== agentes cols ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='agentes'
        ORDER BY ordinal_position LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:30s} {r[1]}")

    # ventas_cabeceras agente column
    print()
    print("=== ventas_cabeceras agente cols ===")
    rows = c.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='ventas_cabeceras'
        AND column_name LIKE '%agente%'
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    # Agentes con ventas en 2026
    print()
    print("=== agentes con ventas 2026 ===")
    rows = c.execute(text("""
        SELECT vc.agente, a.nombre, SUM(vc.total) as total
        FROM ventas_cabeceras vc
        LEFT JOIN agentes a ON vc.agente = a.codigo
        WHERE vc.fecha >= '2026-01-01' AND vc.tipodoc = 4
        GROUP BY vc.agente, a.nombre
        ORDER BY total DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  agente={r[0]} nombre={r[1]} total={r[2]}")

    # Compras mensuales 2026
    print()
    print("=== Compras mensuales 2026 (albaranes tipodoc=8) ===")
    rows = c.execute(text("""
        SELECT EXTRACT(MONTH FROM fecha)::int as mes, SUM(total), COUNT(*)
        FROM compras_cabeceras 
        WHERE EXTRACT(YEAR FROM fecha) = 2026 AND tipodoc = 8
        GROUP BY mes ORDER BY mes
    """)).fetchall()
    for r in rows:
        print(f"  mes={r[0]} total={r[1]} count={r[2]}")

eng.dispose()
