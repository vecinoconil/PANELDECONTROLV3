"""
Compara el total del widget 'Pte. Pago' vs el total del listado.
Muestra los 5 mayores registros que causan la diferencia.
"""
import sys
sys.path.insert(0, '.')
from app.services.pg_connection import get_pg_connection
from app.database import engine
from sqlmodel import Session, select
from app.models.app_models import Empresa

ANIO = 2026

with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()
    print(f"Empresa: {empresa.nombre}")

conn = get_pg_connection(empresa)
conn.autocommit = True
cur = conn.cursor()

anio_desde = f"{ANIO}-01-01"
anio_hasta = f"{ANIO + 1}-01-01"

# ── Query 1: Como lo hace el widget (cuadro_mandos) ─────────────────────────
cur.execute("""
    SELECT COALESCE(SUM(v.importe), 0) AS total
    FROM vencimientos v
    JOIN compras_cabeceras cc ON v.idcab = cc.id
    WHERE v.tipo = 1 AND v.situacion = 0
      AND cc.tipodoc = 8
      AND cc.fecha >= %s AND cc.fecha < %s
""", (anio_desde, anio_hasta))
total_widget = float(cur.fetchone()["total"])
print(f"\n[WIDGET]  Pte. Pago (cuadro_mandos): {total_widget:,.2f} €")

# ── Query 2: Como lo hace el listado (vencimientos_detalle) ─────────────────
cur.execute("""
    SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(v2.importe),0) FROM vencimientos v2
         WHERE v2.idcab = cc.id AND v2.tipo = 1 AND v2.situacion = 0)
    ), 0) AS total
    FROM compras_cabeceras cc
    WHERE cc.tipodoc = 8
      AND cc.fecha >= %s AND cc.fecha < %s
""", (anio_desde, anio_hasta))
total_lista_all = float(cur.fetchone()["total"])
print(f"[LISTA]   Total incluyendo pendiente<=0: {total_lista_all:,.2f} €")

cur.execute("""
    SELECT COALESCE(SUM(pendiente), 0) AS total FROM (
        SELECT COALESCE((SELECT SUM(v2.importe) FROM vencimientos v2
               WHERE v2.idcab = cc.id AND v2.tipo=1 AND v2.situacion=0), 0) AS pendiente
        FROM compras_cabeceras cc
        WHERE cc.tipodoc = 8
          AND cc.fecha >= %s AND cc.fecha < %s
    ) t WHERE t.pendiente > 0
""", (anio_desde, anio_hasta))
total_lista_solo_pend = float(cur.fetchone()["total"])
print(f"[LISTA]   Total solo_pendientes=true (pendiente>0): {total_lista_solo_pend:,.2f} €")

diferencia = total_lista_solo_pend - total_widget
print(f"\nDIFERENCIA (lista - widget): {diferencia:,.2f} €")

if abs(diferencia) > 0.01:
    print("\n── Facturas con pendiente <= 0 que el widget sí cuenta (negativas) ────")
    cur.execute("""
        SELECT cc.pro_nombre, cc.serie, cc.numero, cc.fecha::text,
               cc.total AS total_fra,
               COALESCE((SELECT SUM(v2.importe) FROM vencimientos v2
                         WHERE v2.idcab = cc.id AND v2.tipo=1 AND v2.situacion=0),0) AS pendiente
        FROM compras_cabeceras cc
        WHERE cc.tipodoc = 8
          AND cc.fecha >= %s AND cc.fecha < %s
          AND COALESCE((SELECT SUM(v2.importe) FROM vencimientos v2
                        WHERE v2.idcab = cc.id AND v2.tipo=1 AND v2.situacion=0),0) <= 0
        ORDER BY pendiente ASC
        LIMIT 10
    """, (anio_desde, anio_hasta))
    rows = cur.fetchall()
    if rows:
        print(f"  {'Proveedor':<30} {'Serie':>6} {'Nº':>8}  {'Fecha':<12} {'Total Fra':>12} {'Pendiente':>12}")
        for r in rows:
            print(f"  {(r['pro_nombre'] or '')[:30]:<30} {r['serie'] or '':>6} {r['numero']:>8}  {r['fecha']:<12} {float(r['total_fra']):>12,.2f} {float(r['pendiente']):>12,.2f}")
    else:
        print("  (ninguna)")

    print("\n── Tipodoc distintos de 8 con vencimientos tipo=1 y situacion=0 en el año ─")
    cur.execute("""
        SELECT cc.tipodoc, count(*) AS n, sum(v.importe) AS total
        FROM vencimientos v
        JOIN compras_cabeceras cc ON v.idcab = cc.id
        WHERE v.tipo = 1 AND v.situacion = 0
          AND cc.fecha >= %s AND cc.fecha < %s
          AND cc.tipodoc <> 8
        GROUP BY cc.tipodoc ORDER BY total DESC
    """, (anio_desde, anio_hasta))
    rows2 = cur.fetchall()
    if rows2:
        for r in rows2:
            print(f"  tipodoc={r['tipodoc']}  filas={r['n']}  total={float(r['total']):,.2f}")
    else:
        print("  (ninguno)")

    print("\n── Vencimientos tipo=1, situacion=0 sin coincidencia en compras_cabeceras ─")
    cur.execute("""
        SELECT count(*) AS n, sum(v.importe) AS total
        FROM vencimientos v
        LEFT JOIN compras_cabeceras cc ON cc.id = v.idcab
        WHERE v.tipo = 1 AND v.situacion = 0
          AND cc.id IS NULL
    """)
    r = cur.fetchone()
    print(f"  Huérfanos: {r['n']} vencimientos, total={float(r['total'] or 0):,.2f}")

conn.close()
print("\n=== FIN ===")
