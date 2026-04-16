from sqlalchemy import create_engine, text
eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})
with eng.connect() as c:
    rows = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='compras_cabeceras' AND column_name='serie'")).fetchall()
    print('compras_cabeceras tiene serie:', len(rows) > 0)
    
    rows = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='ventas_lineas' ORDER BY ordinal_position")).fetchall()
    print('ventas_lineas cols:', [r[0] for r in rows])
    
    rows = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='articulos' AND column_name IN ('descripcion','nombre','referencia','familia') ORDER BY ordinal_position")).fetchall()
    print('articulos relevant cols:', [r[0] for r in rows])
    
    rows = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='vencimientos' AND column_name LIKE '%fecha%' ORDER BY ordinal_position")).fetchall()
    print('vencimientos fecha cols:', [r[0] for r in rows])

    # Check a sample ventas_lineas row
    r = c.execute(text("SELECT referencia, descripcion, unidades, importe, coste FROM ventas_lineas LIMIT 1")).fetchone()
    print('ventas_lineas sample:', dict(r._mapping) if r else 'empty')
eng.dispose()
