from sqlalchemy import create_engine, text

eng = create_engine('postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/CONILINFORMATICA')
with eng.connect() as c:
    # Check formaspago (no underscore)
    cols = c.execute(text(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='formaspago' ORDER BY ordinal_position"
    )).fetchall()
    print("=== formaspago ===")
    for col in cols:
        print(f"  {col[0]:30s} {col[1]}")

    # Check formas_pago (with underscore)
    cols2 = c.execute(text(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='formas_pago' ORDER BY ordinal_position"
    )).fetchall()
    print("=== formas_pago ===")
    for col in cols2:
        print(f"  {col[0]:30s} {col[1]}")

    # Sample data
    if cols:
        print("\n=== sample formaspago ===")
        rows = c.execute(text("SELECT * FROM formaspago LIMIT 5")).fetchall()
        for r in rows:
            print(dict(r._mapping))
    
    if cols2:
        print("\n=== sample formas_pago ===")
        rows = c.execute(text("SELECT * FROM formas_pago LIMIT 5")).fetchall()
        for r in rows:
            print(dict(r._mapping))

eng.dispose()
