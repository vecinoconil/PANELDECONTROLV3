from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

tables = [
    'ventas_cabeceras', 'ventas_lineas', 'compras_cabeceras', 'compras_lineas',
    'series', 'registro_cobros', 'registro_pagos', 'registro_ventas', 'registro_compras',
    'tipos_iva', 'formaspago', 'ventas_impagos',
]

with eng.connect() as c:
    for t in tables:
        cols = c.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:tname ORDER BY ordinal_position"
        ), {"tname": t}).fetchall()
        if cols:
            print(f"=== {t} ({len(cols)} cols) ===")
            for col in cols:
                print(f"  {col[0]:45s} {col[1]}")
            print()

eng.dispose()
