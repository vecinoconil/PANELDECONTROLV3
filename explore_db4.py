from sqlalchemy import create_engine, text

eng = create_engine('postgresql://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA', connect_args={'connect_timeout': 15})

with eng.connect() as c:
    # Buscar tablas de vencimientos
    rows = c.execute(text("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_name LIKE '%vencimiento%'
        ORDER BY table_name
    """)).fetchall()
    print("=== Tablas vencimiento ===")
    for r in rows:
        print(f"  {r[0]}")
    print()

    # ventas_cabeceras_aux tiene los vencimientos?
    for t in ['ventas_cabeceras_aux', 'compras_cabeceras_aux', 'cajas_registro', 'cajas_cierre', 'cajas_registro_desg', 'gastos_fijos']:
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

    # Sample data from ventas_cabeceras (year 2026, first rows)
    print("=== SAMPLE ventas_cabeceras 2026 ===")
    rows = c.execute(text("""
        SELECT tipodoc, serie, numero, fecha, cli_codigo, cli_nombre, agente, 
               total, baseimpo1+COALESCE(baseimpo2,0)+COALESCE(baseimpo3,0) as base_total,
               iva1+COALESCE(iva2,0)+COALESCE(iva3,0) as iva_total,
               totalpendiente
        FROM ventas_cabeceras 
        WHERE fecha >= '2026-01-01' AND tipodoc IN (3,4)
        ORDER BY fecha DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  tipo={r[0]} serie={r[1]} num={r[2]} fecha={r[3]} cli={r[4]} {r[5][:30]:30s} agente={r[6]} total={r[7]} base={r[8]} iva={r[9]} pte={r[10]}")

    print()
    print("=== TIPODOC values in ventas_cabeceras ===")
    rows = c.execute(text("""
        SELECT tipodoc, COUNT(*) FROM ventas_cabeceras GROUP BY tipodoc ORDER BY tipodoc
    """)).fetchall()
    for r in rows:
        print(f"  tipodoc={r[0]}: {r[1]} registros")

    print()
    print("=== Series usadas en ventas 2026 ===")
    rows = c.execute(text("""
        SELECT serie, COUNT(*), SUM(total) FROM ventas_cabeceras 
        WHERE fecha >= '2026-01-01' GROUP BY serie ORDER BY serie
    """)).fetchall()
    for r in rows:
        print(f"  serie={r[0]}: {r[1]} docs, total={r[2]}")

eng.dispose()
