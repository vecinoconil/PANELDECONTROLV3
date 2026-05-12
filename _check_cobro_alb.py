"""Investigar cómo el ERP marca un albarán como cobrado."""
import sys
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as s:
    emp = s.exec(select(Empresa).where(Empresa.activo==True)).first()
    conn = get_pg_connection(emp)
    cur = conn.cursor()

    # El albarán P 20-5 que cobré manualmente
    cur.execute("""
        SELECT id, serie, numero, total, tipodoc
        FROM ventas_cabeceras
        WHERE serie = 'P 20' AND numero = 5 AND tipodoc = 4
    """)
    alb = cur.fetchone()
    print("=== Albarán ===")
    print(dict(alb))
    idcab = alb['id']

    # Ver entregas/cobros vinculados
    cur.execute("SELECT * FROM ventas_entregas WHERE idcab = %(id)s", {"id": idcab})
    print("\n=== ventas_entregas ===")
    for r in cur.fetchall():
        print(dict(r))

    # Ver registro_cobros
    cur.execute("SELECT * FROM registro_cobros WHERE id_cab = %(id)s", {"id": idcab})
    print("\n=== registro_cobros ===")
    for r in cur.fetchall():
        print(dict(r))

    # Cómo se calcula el pendiente en la query de documentos pendientes
    # Busca la query del endpoint documentos_cliente
    # vc.total - COALESCE(SUM(ve.importe), 0)
    cur.execute("""
        SELECT vc.id, vc.total,
               COALESCE(SUM(ve.importe), 0) AS cobrado,
               vc.total - COALESCE(SUM(ve.importe), 0) AS pendiente
        FROM ventas_cabeceras vc
        LEFT JOIN ventas_entregas ve ON ve.idcab = vc.id
        WHERE vc.serie = 'P 20' AND vc.numero = 5 AND vc.tipodoc = 4
        GROUP BY vc.id, vc.total
    """)
    print("\n=== Cálculo pendiente actual ===")
    for r in cur.fetchall():
        print(dict(r))

    # También ver albarán cobrado por el ERP real (P 20-5) 
    # que cobré con el botón del ERP al principio
    cur.execute("""
        SELECT * FROM ventas_entregas WHERE idcab = %(id)s
    """, {"id": idcab})
    rows = cur.fetchall()
    print(f"\nTotal entregas para idcab={idcab}: {len(rows)}")

    # Ver estructura completa de ventas_entregas
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'ventas_entregas'
        ORDER BY ordinal_position
    """)
    print("\n=== Columnas ventas_entregas ===")
    for r in cur.fetchall():
        print(f"  {r['column_name']}: {r['data_type']}")

    conn.close()
