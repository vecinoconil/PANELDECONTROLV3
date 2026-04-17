from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Buscar tablas que contengan venta, compra, factura, efecto, cobro, pago, gasto, iva
    rows = c.execute(text("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' 
        AND (
            table_name LIKE '%venta%' OR table_name LIKE '%factura%' 
            OR table_name LIKE '%compra%' OR table_name LIKE '%efecto%'
            OR table_name LIKE '%cobro%' OR table_name LIKE '%pago%'
            OR table_name LIKE '%gasto%' OR table_name LIKE '%iva%'
            OR table_name LIKE '%serie%' OR table_name LIKE '%albaran%'
            OR table_name LIKE '%consumo%'
        )
        ORDER BY table_name
    """)).fetchall()
    print("=== Tablas relacionadas con ventas/compras/cobros ===")
    for r in rows:
        print(f"  {r[0]}")

eng.dispose()
