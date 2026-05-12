from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Columnas de compras_lineas
    cols = c.execute(text(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='compras_lineas' ORDER BY ordinal_position"
    )).fetchall()
    print('=== compras_lineas columns ===')
    for col in cols:
        print(f'  {col[0]:40s} {col[1]}')
    print()

    # Columnas de compras_cabeceras
    cols = c.execute(text(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='compras_cabeceras' ORDER BY ordinal_position"
    )).fetchall()
    print('=== compras_cabeceras columns ===')
    for col in cols:
        print(f'  {col[0]:40s} {col[1]}')
    print()

    # tipodoc en compras_cabeceras
    rows = c.execute(text(
        "SELECT tipodoc, COUNT(*) cnt FROM compras_cabeceras WHERE fecha >= '2026-01-01' GROUP BY tipodoc ORDER BY tipodoc"
    )).fetchall()
    print('=== tipodoc en compras_cabeceras 2026 ===')
    for r in rows:
        print(f'  tipodoc={r[0]} count={r[1]}')
    print()

    # tipodoc en compras_cabeceras todos
    rows = c.execute(text(
        "SELECT tipodoc, COUNT(*) cnt FROM compras_cabeceras GROUP BY tipodoc ORDER BY tipodoc"
    )).fetchall()
    print('=== tipodoc en compras_cabeceras (todos) ===')
    for r in rows:
        print(f'  tipodoc={r[0]} count={r[1]}')
    print()

    # Sample de pedidos de compra - buscar el correcto
    for td in [1, 2, 5]:
        rows = c.execute(text(
            f"SELECT cc.id, cc.tipodoc, cc.serie, cc.numero, cc.pro_codigo, cc.pro_nombre, "
            f"cl.referencia, cl.unidades, cl.udservidas, cl.ud_pte_entrega "
            f"FROM compras_cabeceras cc "
            f"JOIN compras_lineas cl ON cl.idcab=cc.id "
            f"WHERE cc.tipodoc={td} AND cc.fecha >= '2026-01-01' AND cl.unidades > COALESCE(cl.udservidas,0) "
            f"ORDER BY cc.id DESC LIMIT 3"
        )).fetchall()
        if rows:
            print(f'=== Sample PEDIDOS tipodoc={td} (con pendientes) ===')
            for r in rows:
                print(f'  id={r[0]} serie={r[2]} num={r[3]} pro={r[4]} {str(r[5])[:30]:30s} ref={r[6]} uds={r[7]} serv={r[8]} pte={r[9]}')
            print()

    # compras_lineas tiene talla/color/control_lotes?
    rows = c.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='compras_lineas' "
        "AND column_name IN ('talla','color','control_lotes','tallas_colores','articulo_nombre','descripcion','precio','importe','piva','pdto1')"
    )).fetchall()
    print('=== Campos clave en compras_lineas ===')
    for r in rows:
        print(f'  {r[0]}')
    print()

    # Series de compras disponibles
    rows = c.execute(text(
        "SELECT DISTINCT TRIM(serie) as serie FROM compras_cabeceras WHERE serie IS NOT NULL ORDER BY serie LIMIT 20"
    )).fetchall()
    print('=== Series compras ===')
    for r in rows:
        print(f'  [{r[0]}]')

eng.dispose()
