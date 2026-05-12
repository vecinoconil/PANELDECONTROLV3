"""Medir tiempo de las queries optimizadas vs originales."""
import sys, time
sys.path.insert(0, r'c:\PANELDECONTROLV3\backend')
from app.database import get_session
from app.models.app_models import Empresa
from app.services.pg_connection import get_pg_connection
from sqlmodel import select

with next(get_session()) as s:
    emp = s.exec(select(Empresa).where(Empresa.activo==True)).first()

conn = get_pg_connection(emp)
cur = conn.cursor()

# Buscar un cliente con bastantes albaranes/facturas
cur.execute("""
    SELECT cli_codigo, COUNT(*) as cnt
    FROM ventas_cabeceras
    WHERE tipodoc IN (4, 8)
    GROUP BY cli_codigo ORDER BY cnt DESC LIMIT 1
""")
cli = cur.fetchone()['cli_codigo']
print(f"Cliente de prueba: {cli}")

# ── QUERY ALBARANES ORIGINAL (NOT EXISTS + JOIN) ──
t0 = time.time()
for _ in range(5):
    cur.execute("""
        SELECT vc.id FROM ventas_cabeceras vc
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 4
        AND NOT EXISTS (
          SELECT 1 FROM ventas_lineas vl
          JOIN ventas_cabeceras vc2 ON vc2.id = vl.idcab AND vc2.tipodoc = 8
          WHERE vl.idalbaran = vc.id
        )
        ORDER BY vc.fecha DESC LIMIT 50
    """, {"cli": cli})
    cur.fetchall()
t1 = time.time()
print(f"Albaranes ORIGINAL (x5): {(t1-t0)*1000:.0f}ms  avg={(t1-t0)*200:.0f}ms")

# ── QUERY ALBARANES NUEVA (LEFT JOIN subquery) ──
t0 = time.time()
for _ in range(5):
    cur.execute("""
        SELECT vc.id FROM ventas_cabeceras vc
        LEFT JOIN (
            SELECT DISTINCT vl.idalbaran
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc2 ON vc2.id = vl.idcab AND vc2.tipodoc = 8
            WHERE vl.idalbaran > 0
        ) facturado ON facturado.idalbaran = vc.id
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 4
          AND facturado.idalbaran IS NULL
        ORDER BY vc.fecha DESC LIMIT 50
    """, {"cli": cli})
    cur.fetchall()
t1 = time.time()
print(f"Albaranes NUEVA   (x5): {(t1-t0)*1000:.0f}ms  avg={(t1-t0)*200:.0f}ms")

# ── QUERY FACTURAS ORIGINAL (subquery correlada en json_agg) ──
t0 = time.time()
for _ in range(5):
    cur.execute("""
        SELECT vc.id, vc.total,
               json_agg(json_build_object(
                   'id', v.id,
                   'importe', v.importe,
                   'situacion', v.situacion,
                   'entregas_cuenta', COALESCE(
                       (SELECT SUM(e2.importe) FROM ventas_entregas e2 WHERE e2.idvencimiento = v.id), 0
                   )
               )) FILTER (WHERE v.id IS NOT NULL) AS vencimientos
        FROM ventas_cabeceras vc
        LEFT JOIN vencimientos v ON v.idcab = vc.id
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        GROUP BY vc.id, vc.total
        HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0
        ORDER BY vc.fecha DESC LIMIT 50
    """, {"cli": cli})
    cur.fetchall()
t1 = time.time()
print(f"Facturas ORIGINAL (x5): {(t1-t0)*1000:.0f}ms  avg={(t1-t0)*200:.0f}ms")

# ── QUERY FACTURAS NUEVA (CTE pre-agregado) ──
t0 = time.time()
for _ in range(5):
    cur.execute("""
        WITH ve_sum AS (
            SELECT e.idvencimiento, SUM(e.importe) AS cobrado
            FROM ventas_entregas e WHERE e.idvencimiento > 0
            GROUP BY e.idvencimiento
        )
        SELECT vc.id, vc.total,
               json_agg(json_build_object(
                   'id', v.id,
                   'importe', v.importe,
                   'situacion', v.situacion,
                   'entregas_cuenta', COALESCE(ve.cobrado, 0)
               )) FILTER (WHERE v.id IS NOT NULL) AS vencimientos
        FROM ventas_cabeceras vc
        LEFT JOIN vencimientos v ON v.idcab = vc.id
        LEFT JOIN ve_sum ve ON ve.idvencimiento = v.id
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        GROUP BY vc.id, vc.total
        HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0
        ORDER BY vc.fecha DESC LIMIT 50
    """, {"cli": cli})
    cur.fetchall()
t1 = time.time()
print(f"Facturas NUEVA    (x5): {(t1-t0)*1000:.0f}ms  avg={(t1-t0)*200:.0f}ms")

conn.close()
