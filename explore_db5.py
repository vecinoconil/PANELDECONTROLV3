from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Vencimientos (para cobros pendientes y vencimientos de pago)
    for t in ['vencimientos', 'vencimientos_cartera']:
        cols = c.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:tname ORDER BY ordinal_position"
        ), {"tname": t}).fetchall()
        if cols:
            print(f"=== {t} ({len(cols)} cols) ===")
            for col in cols:
                print(f"  {col[0]:45s} {col[1]}")
            print()

    # Datos de compras 2026
    print("=== SAMPLE compras_cabeceras 2026 ===")
    rows = c.execute(text("""
        SELECT tipodoc, serie, numero, fecha, pro_codigo, pro_nombre, 
               total, totalpendiente
        FROM compras_cabeceras 
        WHERE fecha >= '2026-01-01' AND tipodoc IN (3,4)
        ORDER BY total DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  tipo={r[0]} serie={r[1]} num={r[2]} fecha={r[3]} prov={r[4]} {str(r[5])[:35]:35s} total={r[6]} pte={r[7]}")

    # Totales de compra por proveedor 2026
    print()
    print("=== Top 10 proveedores compras 2026 ===")
    rows = c.execute(text("""
        SELECT pro_codigo, pro_nombre, SUM(total) as total_compras, SUM(totalpendiente) as pendiente
        FROM compras_cabeceras 
        WHERE fecha >= '2026-01-01' AND tipodoc IN (3,4)
        GROUP BY pro_codigo, pro_nombre
        ORDER BY total_compras DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  prov={r[0]} {str(r[1])[:35]:35s} compras={r[2]} pte={r[3]}")

    # Ventas por agente/cliente
    print()
    print("=== Top clientes ventas 2026 (tipodoc=4 facturas) ===")
    rows = c.execute(text("""
        SELECT cli_codigo, cli_nombre, SUM(total) as total, 
               SUM(baseimpo1+COALESCE(baseimpo2,0)+COALESCE(baseimpo3,0)) as beneficio,
               SUM(totalpendiente) as pendiente
        FROM ventas_cabeceras 
        WHERE fecha >= '2026-01-01' AND tipodoc = 4
        GROUP BY cli_codigo, cli_nombre
        ORDER BY total DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  cli={r[0]} {str(r[1])[:35]:35s} total={r[2]} base={r[3]} pte={r[4]}")

    # Vencimientos pendientes de cobro
    print()
    print("=== Vencimientos pendientes de cobro (primeros 10) ===")
    rows = c.execute(text("""
        SELECT v.id, v.fecha, v.importe, v.cobrado, v.tipo, vc.cli_codigo, vc.cli_nombre
        FROM vencimientos v
        JOIN ventas_cabeceras vc ON v.idcab = vc.id
        WHERE v.cobrado = false AND v.tipo = 1
        ORDER BY v.fecha DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  id={r[0]} fecha={r[1]} importe={r[2]} cobrado={r[3]} cli={r[5]} {str(r[6])[:30]}")

eng.dispose()
