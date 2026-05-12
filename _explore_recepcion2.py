from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # tipodoc en compras_cabeceras
    rows = c.execute(text(
        "SELECT tipodoc, COUNT(*) cnt FROM compras_cabeceras GROUP BY tipodoc ORDER BY tipodoc"
    )).fetchall()
    print('=== tipodoc en compras_cabeceras (todos) ===')
    for r in rows:
        print(f'  tipodoc={r[0]} count={r[1]}')
    print()

    # Pedidos de compra pendientes (tipodoc=2, con udservidas < unidades)
    rows = c.execute(text("""
        SELECT cc.id, cc.tipodoc, cc.serie, cc.numero, cc.pro_codigo, cc.pro_nombre,
               COUNT(cl.id) as lineas, SUM(cl.unidades) as total_uds, SUM(COALESCE(cl.udservidas,0)) as serv_uds
        FROM compras_cabeceras cc
        JOIN compras_lineas cl ON cl.idcab=cc.id
        WHERE cc.tipodoc=2
          AND cl.referencia IS NOT NULL AND cl.referencia != ''
          AND cl.unidades > COALESCE(cl.udservidas,0)
        GROUP BY cc.id, cc.tipodoc, cc.serie, cc.numero, cc.pro_codigo, cc.pro_nombre
        ORDER BY cc.id DESC LIMIT 10
    """)).fetchall()
    print('=== Pedidos compra tipodoc=2 CON PENDIENTES ===')
    for r in rows:
        print(f'  id={r[0]} serie=[{r[2]}] num={r[3]} pro={r[4]} {str(r[5])[:30]:30s} lines={r[6]} uds={r[7]} serv={r[8]}')
    print(f'  Total: {len(rows)} pedidos')
    print()

    # Tipos de movimiento en articulos_lotes_registro
    try:
        rows = c.execute(text(
            "SELECT tipo, COUNT(*) cnt FROM articulos_lotes_registro GROUP BY tipo ORDER BY tipo LIMIT 10"
        )).fetchall()
        print('=== tipos en articulos_lotes_registro ===')
        for r in rows:
            print(f'  tipo={r[0]} count={r[1]}')
    except Exception as e:
        print(f'Error: {e}')
    print()

    # articulos_lotes_registro columns
    cols = c.execute(text(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='articulos_lotes_registro' ORDER BY ordinal_position"
    )).fetchall()
    print('=== articulos_lotes_registro columns ===')
    for col in cols:
        print(f'  {col[0]:40s} {col[1]}')
    print()

    # Series disponibles en compras
    rows = c.execute(text(
        "SELECT DISTINCT TRIM(serie) as serie FROM compras_cabeceras WHERE serie IS NOT NULL AND tipodoc=4 ORDER BY serie LIMIT 20"
    )).fetchall()
    print('=== Series albaranes compra (tipodoc=4) ===')
    for r in rows:
        print(f'  [{r[0]}]')
    print()

    # Check compras_lineas - tiene control_lotes?
    rows = c.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='compras_lineas' "
        "AND column_name IN ('talla','color','pdto1','precio','piva','almacen','coste','pmp','linea_cabecera')"
    )).fetchall()
    print('=== Campos clave en compras_lineas ===')
    for r in rows:
        print(f'  {r[0]}')
    print()

    # Version con serie: muestra series de pedidos compra
    rows = c.execute(text(
        "SELECT DISTINCT TRIM(serie) FROM compras_cabeceras WHERE tipodoc=2 ORDER BY 1"
    )).fetchall()
    print('=== Series pedidos compra (tipodoc=2) ===')
    for r in rows:
        print(f'  [{r[0]}]')

eng.dispose()
