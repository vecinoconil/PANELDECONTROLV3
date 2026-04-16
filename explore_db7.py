from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Columnas de ventas_lineas que parecen ser claves
    print("=== ventas_lineas cols con 'cod' o 'art' o 'fam' ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='ventas_lineas'
        AND (column_name LIKE '%cod%' OR column_name LIKE '%art%' OR column_name LIKE '%fam%'
             OR column_name LIKE '%ref%' OR column_name LIKE '%desc%' OR column_name = 'nombre')
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    # articulos primary key
    print()
    print("=== articulos cols principales ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='articulos'
        AND (column_name LIKE '%cod%' OR column_name = 'id' OR column_name = 'nombre' 
             OR column_name = 'familia' OR column_name = 'subfamilia' 
             OR column_name LIKE '%coste%' OR column_name LIKE '%pvp%')
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    # Sample ventas_lineas to see actual data
    print()
    print("=== Sample ventas_lineas (5 rows) ===")
    rows = c.execute(text("""
        SELECT vl.* FROM ventas_lineas vl 
        JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        WHERE vc.fecha >= '2026-01-01' AND vc.tipodoc = 4
        LIMIT 5
    """)).fetchall()
    if rows:
        cols = rows[0]._fields if hasattr(rows[0], '_fields') else list(rows[0]._mapping.keys())
        print(f"  Columns: {cols}")
        for r in rows:
            vals = dict(r._mapping)
            # Print first few relevant columns
            relevant = {k: v for k, v in vals.items() if any(x in k for x in ['cod', 'art', 'fam', 'desc', 'nombre', 'total', 'cantidad', 'precio', 'coste'])}
            print(f"  {relevant}")

    # Consumo por familia - corregido
    print()
    print("=== ventas_lineas cols relevantes ALL ===")
    rows = c.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='ventas_lineas'
        ORDER BY ordinal_position LIMIT 20
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}")

eng.dispose()
