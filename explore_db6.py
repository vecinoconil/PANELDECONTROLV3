from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Columnas relevantes de compras_cabeceras
    print("=== Columnas compras_cabeceras (selección) ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='compras_cabeceras'
        AND column_name LIKE ANY(ARRAY['%total%','%base%','%iva%','%pendiente%','%pago%','%pro_%','tipodoc','serie','fecha','numero'])
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    # tipodoc en compras
    print()
    print("=== tipodoc en compras ===")
    rows = c.execute(text("""
        SELECT tipodoc, COUNT(*), SUM(total) 
        FROM compras_cabeceras 
        WHERE fecha >= '2026-01-01'
        GROUP BY tipodoc ORDER BY tipodoc
    """)).fetchall()
    for r in rows:
        print(f"  tipodoc={r[0]} count={r[1]} sum_total={r[2]}")

    # Top proveedores 2026
    print()
    print("=== Top 10 proveedores compras 2026 ===")
    rows = c.execute(text("""
        SELECT pro_codigo, pro_nombre, SUM(total) as total_compras
        FROM compras_cabeceras 
        WHERE fecha >= '2026-01-01' AND tipodoc IN (3,4)
        GROUP BY pro_codigo, pro_nombre
        ORDER BY total_compras DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]} {str(r[1])[:40]:40s} {r[2]}")

    # Vencimientos pendientes de cobro (tipo=1 clientes, tipo=2 proveedores?)
    print()
    print("=== Vencimientos por tipo y situación ===")
    rows = c.execute(text("""
        SELECT tipo, situacion, COUNT(*), SUM(importe) 
        FROM vencimientos 
        GROUP BY tipo, situacion ORDER BY tipo, situacion
    """)).fetchall()
    for r in rows:
        print(f"  tipo={r[0]} sit={r[1]} count={r[2]} sum={r[3]}")

    # Vencimientos pendientes de cobro (clientes)
    print()
    print("=== Vencimientos pte cobro (tipo=1, sit=0) top 10 ===")
    rows = c.execute(text("""
        SELECT v.fecha_vencimiento, v.importe, v.clipro, v.situacion
        FROM vencimientos v
        WHERE v.tipo = 1 AND v.situacion = 0
        ORDER BY v.fecha_vencimiento ASC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  vto={r[0]} importe={r[1]} clipro={r[2]} sit={r[3]}")

    # Ventas por familia (consumo)
    print()
    print("=== articulos table? ===")
    rows = c.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='articulos'
        AND column_name IN ('codigo','nombre','familia','subfamilia','coste','pvp','pvp1','pvp2')
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    print()
    print("=== familias table? ===")
    rows = c.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='familias'
        ORDER BY ordinal_position LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    # Consumo por familia 2026
    print()
    print("=== Top familias por consumo 2026 ===")
    rows = c.execute(text("""
        SELECT COALESCE(f.nombre, 'Sin Familia') as familia, 
               SUM(vl.cantidad) as unidades,
               SUM(vl.total) as total_venta
        FROM ventas_lineas vl
        JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        LEFT JOIN articulos a ON vl.codigo = a.codigo
        LEFT JOIN familias f ON a.familia = f.codigo
        WHERE vc.fecha >= '2026-01-01' AND vc.tipodoc = 4
        GROUP BY f.nombre
        ORDER BY total_venta DESC LIMIT 15
    """)).fetchall()
    for r in rows:
        print(f"  {str(r[0])[:30]:30s} uds={r[1]} total={r[2]}")

    # Registro cobros resumen
    print()
    print("=== registro_cobros 2026 resumen ===")
    rows = c.execute(text("""
        SELECT COUNT(*), SUM(importe) 
        FROM registro_cobros 
        WHERE fecha >= '2026-01-01'
    """)).fetchall()
    for r in rows:
        print(f"  count={r[0]} sum_importe={r[1]}")

    # registro_pagos resumen
    print()
    print("=== registro_pagos 2026 resumen ===")
    rows = c.execute(text("""
        SELECT COUNT(*), SUM(importe) 
        FROM registro_pagos 
        WHERE fecha >= '2026-01-01'
    """)).fetchall()
    for r in rows:
        print(f"  count={r[0]} sum_importe={r[1]}")

    # Ventas mensuales 2026
    print()
    print("=== Ventas mensuales 2026 (facturas) ===")
    rows = c.execute(text("""
        SELECT EXTRACT(MONTH FROM fecha)::int as mes, 
               SUM(total) as total,
               SUM(baseimpo1) as base1,
               COUNT(*) as num_facturas
        FROM ventas_cabeceras 
        WHERE EXTRACT(YEAR FROM fecha) = 2026 AND tipodoc = 4
        GROUP BY mes ORDER BY mes
    """)).fetchall()
    for r in rows:
        print(f"  mes={r[0]} total={r[1]} base={r[2]} facturas={r[3]}")

    # Beneficio: necesitamos coste en ventas_lineas
    print()
    print("=== ventas_lineas cols con coste/beneficio ===")
    rows = c.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='ventas_lineas'
        AND column_name LIKE ANY(ARRAY['%coste%','%beneficio%','%margen%','%pvp%','%precio%','%total%','%dto%'])
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

eng.dispose()
