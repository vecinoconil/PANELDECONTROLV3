"""Comparar versiones de la query de facturas."""
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

cur.execute("SELECT cli_codigo, COUNT(*) cnt FROM ventas_cabeceras WHERE tipodoc=8 GROUP BY cli_codigo ORDER BY cnt DESC LIMIT 1")
cli = cur.fetchone()['cli_codigo']
print(f"Cliente de prueba: {cli}")

# v1: subquery correlada original
t0 = time.time()
for _ in range(10):
    cur.execute("""
        SELECT vc.id FROM ventas_cabeceras vc
        LEFT JOIN vencimientos v ON v.idcab = vc.id
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        GROUP BY vc.id, vc.total
        HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0
        ORDER BY vc.fecha DESC LIMIT 50
    """, {"cli": cli})
    cur.fetchall()
print(f"v0 solo facturas sin vto-cobros (x10): {(time.time()-t0)*100:.0f}ms avg")

t0 = time.time()
for _ in range(10):
    cur.execute("""
        SELECT vc.id, json_agg(json_build_object(
            'id', v.id, 'situacion', v.situacion,
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
print(f"v1 subquery correlada original   (x10): {(time.time()-t0)*100:.0f}ms avg")

# v2: CTE acotada al cliente
t0 = time.time()
for _ in range(10):
    cur.execute("""
        WITH ve_sum AS (
            SELECT e.idvencimiento, SUM(e.importe) AS cobrado
            FROM ventas_entregas e
            WHERE e.idvencimiento IN (
                SELECT v.id FROM vencimientos v
                JOIN ventas_cabeceras vc2 ON vc2.id = v.idcab
                WHERE vc2.cli_codigo = %(cli)s AND vc2.tipodoc = 8
            ) AND e.idvencimiento > 0
            GROUP BY e.idvencimiento
        )
        SELECT vc.id, json_agg(json_build_object(
            'id', v.id, 'situacion', v.situacion,
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
print(f"v2 CTE acotada al cliente        (x10): {(time.time()-t0)*100:.0f}ms avg")

# v3: LEFT JOIN directo acotado (sin CTE)
t0 = time.time()
for _ in range(10):
    cur.execute("""
        SELECT vc.id, json_agg(json_build_object(
            'id', v.id, 'situacion', v.situacion,
            'entregas_cuenta', COALESCE(ve.cobrado, 0)
        )) FILTER (WHERE v.id IS NOT NULL) AS vencimientos
        FROM ventas_cabeceras vc
        LEFT JOIN vencimientos v ON v.idcab = vc.id
        LEFT JOIN (
            SELECT idvencimiento, SUM(importe) AS cobrado
            FROM ventas_entregas WHERE idvencimiento > 0 GROUP BY idvencimiento
        ) ve ON ve.idvencimiento = v.id
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        GROUP BY vc.id, vc.total
        HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0
        ORDER BY vc.fecha DESC LIMIT 50
    """, {"cli": cli})
    cur.fetchall()
print(f"v3 LEFT JOIN subquery            (x10): {(time.time()-t0)*100:.0f}ms avg")

conn.close()
