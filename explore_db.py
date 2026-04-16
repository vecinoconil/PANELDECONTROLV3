from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

tables_to_check = [
    'ventas_cab', 'ventas_lin', 'compras_cab', 'compras_lin',
    'efectos', 'agentes', 'clientes', 'proveedores',
    'familias', 'articulos', 'cajas_cierre', 'cajas_registro',
    'series', 'gastos_cab', 'gastos_lin', 'iva_repercutido', 'iva_soportado',
    'cobros', 'pagos', 'ventas_cobros', 'clientes_cuenta',
]

with eng.connect() as c:
    for t in tables_to_check:
        cols = c.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:tname ORDER BY ordinal_position"
        ), {"tname": t}).fetchall()
        if cols:
            print(f"=== {t} ({len(cols)} cols) ===")
            for col in cols:
                print(f"  {col[0]:45s} {col[1]}")
            print()
        else:
            print(f"--- {t}: NO EXISTE ---")
            print()

eng.dispose()
