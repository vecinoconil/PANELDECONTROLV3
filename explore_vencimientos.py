from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    print("=== Columnas de vencimientos ===")
    rows = c.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='vencimientos'
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:40s} {r[1]}")

    print("\n=== tipo x situacion ===")
    rows = c.execute(text("""
        SELECT tipo, situacion, COUNT(*) as cnt, COALESCE(SUM(importe),0) as total
        FROM vencimientos GROUP BY tipo, situacion ORDER BY tipo, situacion
    """)).fetchall()
    for r in rows:
        print(f"  tipo={r[0]}, situacion={r[1]}: {r[2]} registros, total={r[3]}")

    print("\n=== Ejemplo tipo=0, situacion=0 (2 filas) ===")
    rows = c.execute(text("""
        SELECT * FROM vencimientos WHERE tipo=0 AND situacion=0 LIMIT 2
    """)).fetchall()
    for r in rows:
        print(dict(r._mapping))

    print("\n=== Ejemplo tipo=1, situacion=0 (2 filas) ===")
    rows = c.execute(text("""
        SELECT * FROM vencimientos WHERE tipo=1 AND situacion=0 LIMIT 2
    """)).fetchall()
    for r in rows:
        print(dict(r._mapping))

eng.dispose()
