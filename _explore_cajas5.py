"""Explorar cómo obtener el turno activo y el saldo de caja."""
import sys
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as session:
    empresa = session.exec(select(Empresa).where(Empresa.activo == True)).first()
    conn = get_pg_connection(empresa)
    cur = conn.cursor()

    # Estructura de cajas_turnos si existe
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE '%turno%'
    """)
    print("Tablas con 'turno':", [r['table_name'] for r in cur.fetchall()])

    # Ver si hay tabla cajas_turnos
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'cajas_turnos'
        ORDER BY ordinal_position
    """)
    cols = cur.fetchall()
    if cols:
        print("\n=== Columnas cajas_turnos ===")
        for r in cols:
            print(f"  {r['column_name']}: {r['data_type']}")

        cur.execute("SELECT * FROM cajas_turnos ORDER BY id DESC LIMIT 5")
        print("\n=== Turnos recientes ===")
        for r in cur.fetchall():
            print(dict(r))

    # Última entrada de la caja 1
    cur.execute("""
        SELECT saldo, numregistro, turno
        FROM cajas_registro
        WHERE codigo = 1
        ORDER BY id DESC LIMIT 3
    """)
    print("\n=== Últimas filas caja 1 ===")
    for r in cur.fetchall():
        print(dict(r))

    # Ver cómo se hace un cobro de albarán en cajas_registro (es_entrega_alb=1)
    cur.execute("""
        SELECT * FROM cajas_registro WHERE es_entrega_alb = 1 ORDER BY id DESC LIMIT 5
    """)
    rows = cur.fetchall()
    print(f"\n=== Registros con es_entrega_alb=1 ({len(rows)}) ===")
    for r in rows:
        print(dict(r))

    conn.close()
