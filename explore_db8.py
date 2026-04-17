from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Articulos: first columns and PK
    print("=== articulos ALL cols (first 15) ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='articulos'
        ORDER BY ordinal_position LIMIT 15
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    # Consumo por familia usando referencia
    print()
    print("=== Top familias por consumo 2026 ===")
    rows = c.execute(text("""
        SELECT COALESCE(f.nombre, 'Sin Familia') as familia, 
               SUM(vl.unidades) as unidades,
               SUM(vl.importe) as total_venta,
               SUM(vl.coste * vl.unidades) as total_coste
        FROM ventas_lineas vl
        JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        LEFT JOIN articulos a ON vl.referencia = a.referencia
        LEFT JOIN familias f ON a.familia = f.codigo
        WHERE vc.fecha >= '2026-01-01' AND vc.tipodoc = 4
        GROUP BY f.nombre
        ORDER BY total_venta DESC LIMIT 15
    """)).fetchall()
    for r in rows:
        print(f"  {str(r[0])[:30]:30s} uds={r[1]} total={r[2]} coste={r[3]}")

    # Registro cobros 2026
    print()
    print("=== registro_cobros 2026 ===")
    rows = c.execute(text("""
        SELECT COUNT(*), SUM(importe) FROM registro_cobros WHERE fecha >= '2026-01-01'
    """)).fetchall()
    print(f"  count={rows[0][0]} sum={rows[0][1]}")

    # Registro pagos 2026
    print()
    print("=== registro_pagos 2026 ===")
    rows = c.execute(text("""
        SELECT COUNT(*), SUM(importe) FROM registro_pagos WHERE fecha >= '2026-01-01'
    """)).fetchall()
    print(f"  count={rows[0][0]} sum={rows[0][1]}")

    # Ventas mensuales 2026
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

    # IVA por serie
    print()
    print("=== IVA series 2026 ===")
    rows = c.execute(text("""
        SELECT serie, 
               SUM(baseimpo1) as base1, SUM(iva1) as iva1,
               SUM(baseimpo2) as base2, SUM(iva2) as iva2,
               SUM(total) as total
        FROM ventas_cabeceras 
        WHERE EXTRACT(YEAR FROM fecha) = 2026 AND tipodoc = 4
        GROUP BY serie ORDER BY total DESC
    """)).fetchall()
    for r in rows:
        print(f"  serie={r[0]} base1={r[1]} iva1={r[2]} base2={r[3]} iva2={r[4]} total={r[5]}")

    # Beneficio: total venta vs coste en lineas
    print()
    print("=== Beneficio total 2026 (ventas - coste) ===")
    rows = c.execute(text("""
        SELECT SUM(vl.importe) as tot_venta, 
               SUM(vl.coste * vl.unidades) as tot_coste,
               SUM(vl.importe) - SUM(vl.coste * vl.unidades) as beneficio
        FROM ventas_lineas vl
        JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        WHERE vc.fecha >= '2026-01-01' AND vc.tipodoc = 4
    """)).fetchall()
    print(f"  ventas={rows[0][0]} coste={rows[0][1]} beneficio={rows[0][2]}")

    # Vencimientos p.cobro y p.pago resumen
    print()
    print("=== Vencimientos pendientes resumen ===")
    rows = c.execute(text("""
        SELECT tipo, SUM(importe) as total_pte
        FROM vencimientos WHERE situacion = 0
        GROUP BY tipo ORDER BY tipo
    """)).fetchall()
    for r in rows:
        tipo_name = "Proveedores" if r[0] == 0 else "Clientes" if r[0] == 1 else f"tipo={r[0]}"
        print(f"  {tipo_name}: {r[1]}")

    # Gastos fijos: check gastos tables
    print()
    print("=== Tablas con 'gasto' ===")
    rows = c.execute(text("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_name LIKE '%gasto%'
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    print()
    print("=== ventas_cabeceras cols con 'agente' ===")
    rows = c.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='ventas_cabeceras'
        AND column_name LIKE '%agente%'
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    # Agentes
    print()
    print("=== Tablas con 'agente' ===")
    rows = c.execute(text("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_name LIKE '%agente%'
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    print()
    r = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='agentes' ORDER BY ordinal_position LIMIT 10")).fetchall()
    print("=== agentes cols ===")
    for x in r:
        print(f"  {x[0]}")

eng.dispose()
