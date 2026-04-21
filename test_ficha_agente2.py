import json, sys
from datetime import date, datetime
from decimal import Decimal
import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

agente_codigo = 1
anio = 2025

# Test agente dict serialization
cur.execute("SELECT codigo, nombre, cif, direccion, localidad, cpostal, telefono1, telefono2, email, observaciones, baja FROM agentes WHERE codigo = %(ag)s", {"ag": agente_codigo})
row = dict(cur.fetchone())
print("Agente types:", {k: type(v).__name__ for k, v in row.items()})

# Test full response serialization like FastAPI would
try:
    json.dumps(row)
    print("Agente JSON: OK")
except Exception as e:
    print("Agente JSON FAIL:", e)

# Now simulate the full response
anio_desde = anio - 2
anios_cols = [anio - 2, anio - 1, anio]

# Q2
cur.execute("""SELECT EXTRACT(YEAR FROM vc.fecha)::int AS anio, EXTRACT(MONTH FROM vc.fecha)::int AS mes, COALESCE(SUM(vc.total), 0) AS total FROM ventas_cabeceras vc WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s GROUP BY 1, 2 ORDER BY 1, 2""", {"ag": agente_codigo, "desde": f"{anio_desde}-01-01", "hasta": f"{anio + 1}-01-01"})
ventas_mensuales = [{"anio": int(r["anio"]), "mes": int(r["mes"]), "total": float(r["total"])} for r in cur.fetchall()]

# Q3
cur.execute("""SELECT COALESCE(SUM(vc.total), 0) AS ventas, COUNT(*) AS num_facturas, COUNT(DISTINCT vc.cli_codigo) AS num_clientes FROM ventas_cabeceras vc WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s""", {"ag": agente_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
kpi = dict(cur.fetchone())
ventas_anio = float(kpi["ventas"])
num_facturas = int(kpi["num_facturas"])
num_clientes = int(kpi["num_clientes"])
ticket_medio = ventas_anio / num_clientes if num_clientes > 0 else 0
valor_por_visita = ventas_anio / num_facturas if num_facturas > 0 else 0

# Q4
cur.execute("""SELECT COALESCE(SUM(vc.total), 0) AS ventas, COUNT(DISTINCT vc.cli_codigo) AS num_clientes FROM ventas_cabeceras vc WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s""", {"ag": agente_codigo, "desde": f"{anio - 1}-01-01", "hasta": f"{anio}-01-01"})
prev = dict(cur.fetchone())
ventas_anio_anterior = float(prev["ventas"])
clientes_anterior = int(prev["num_clientes"])

# Q5
cur.execute("""SELECT COALESCE(SUM(vl.importe), 0) AS total_venta, COALESCE(SUM(vl.coste * vl.unidades), 0) AS total_coste FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s""", {"ag": agente_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
margen_row = dict(cur.fetchone())
total_venta_lineas = float(margen_row["total_venta"])
total_coste_lineas = float(margen_row["total_coste"])
margen_anio = total_venta_lineas - total_coste_lineas
margen_pct = (margen_anio / total_venta_lineas * 100) if total_venta_lineas > 0 else 0

# Q6
crecimiento = 0
if clientes_anterior > 0:
    crecimiento = ((num_clientes - clientes_anterior) / clientes_anterior * 100)

# Q7
cur.execute("""SELECT COALESCE(SUM(v.importe), 0) AS pendiente FROM vencimientos v JOIN ventas_cabeceras vc ON v.idcab = vc.id WHERE vc.agente = %(ag)s AND v.tipo = 0 AND v.situacion = 0""", {"ag": agente_codigo})
saldo_pendiente = float(cur.fetchone()["pendiente"])

# Q8 - comisiones (LIMIT 5 for test)
cur.execute("""SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
               vc.cli_nombre, vc.total,
               CASE vc.tipodoc WHEN 8 THEN 'FAC' WHEN 4 THEN 'ALB' WHEN 3 THEN 'ALB' ELSE 'DOC' END AS tipo_doc,
               COALESCE((SELECT MIN((v.fechacobro - vc.fecha)::int) FROM vencimientos v WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion <> 0), -1) AS dias_pago
        FROM ventas_cabeceras vc
        WHERE vc.agente = %(ag)s AND vc.tipodoc IN (3, 4, 8)
          AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
          AND NOT EXISTS (SELECT 1 FROM vencimientos v WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0)
        ORDER BY vc.fecha DESC, vc.numero DESC LIMIT 5""", {"ag": agente_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
comisiones = []
for r in cur.fetchall():
    row_data = {
        "id": int(r["id"]),
        "tipo_doc": r["tipo_doc"],
        "serie": r["serie"],
        "numero": int(r["numero"]),
        "fecha": r["fecha"],
        "cli_nombre": r["cli_nombre"] or "",
        "total": float(r["total"]),
        "dias_pago": int(r["dias_pago"]) if r["dias_pago"] is not None else 0,
    }
    comisiones.append(row_data)
    
print("Comisiones[0] types:", {k: type(v).__name__ for k, v in comisiones[0].items()} if comisiones else "empty")

# Q9
cur.execute("""SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
               vc.cli_nombre, v.importe, v.fecha::text AS fecha_vencimiento,
               CASE vc.tipodoc WHEN 8 THEN 'FAC' WHEN 4 THEN 'ALB' WHEN 3 THEN 'ALB' ELSE 'DOC' END AS tipo_doc,
               (CURRENT_DATE - vc.fecha)::int AS dias
        FROM vencimientos v JOIN ventas_cabeceras vc ON v.idcab = vc.id
        WHERE vc.agente = %(ag)s AND v.tipo = 0 AND v.situacion = 0
        ORDER BY vc.fecha ASC LIMIT 5""", {"ag": agente_codigo})
pendientes = []
for r in cur.fetchall():
    pendientes.append({
        "id": int(r["id"]),
        "tipo_doc": r["tipo_doc"],
        "serie": r["serie"],
        "numero": int(r["numero"]),
        "fecha": r["fecha"],
        "cli_nombre": r["cli_nombre"] or "",
        "importe": float(r["importe"]),
        "fecha_vencimiento": r["fecha_vencimiento"],
        "dias": int(r["dias"]) if r["dias"] is not None else 0,
    })
print("Pendientes[0] types:", {k: type(v).__name__ for k, v in pendientes[0].items()} if pendientes else "empty")

# TOP prods for 1 year
cur.execute("""SELECT COALESCE(NULLIF(vl.referencia, ''), '---') AS referencia,
               COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
               SUM(vl.unidades) AS unidades, SUM(vl.importe) AS total_venta
        FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
        WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
          AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        GROUP BY 1, 2 ORDER BY SUM(vl.importe) DESC LIMIT 3""", {"ag": agente_codigo, "desde": f"{anio}-01-01", "hasta": f"{anio + 1}-01-01"})
prods = [{"referencia": r["referencia"], "descripcion": r["descripcion"], "unidades": float(r["unidades"]), "total_venta": float(r["total_venta"])} for r in cur.fetchall()]
print("Prods[0] types:", {k: type(v).__name__ for k, v in prods[0].items()} if prods else "empty")

# Build final response
response = {
    "agente": row,
    "anio": anio,
    "anios_cols": anios_cols,
    "ventas_mensuales": ventas_mensuales[:2],
    "kpis": {
        "ventas_anio": round(ventas_anio, 2),
        "ventas_anio_anterior": round(ventas_anio_anterior, 2),
        "num_clientes": num_clientes,
        "clientes_anterior": clientes_anterior,
        "ticket_medio_cliente": round(ticket_medio, 2),
        "num_visitas": num_facturas,
        "valor_por_visita": round(valor_por_visita, 2),
        "margen_anio": round(margen_anio, 2),
        "margen_pct": round(margen_pct, 1),
        "crecimiento_cartera": round(crecimiento, 2),
        "saldo_pendiente": round(saldo_pendiente, 2),
    },
    "comisiones_liquidables": comisiones[:2],
    "pendientes_cobro": pendientes[:2],
    "top_productos": {str(anio): prods[:2]},
    "has_visitas": False,
    "visitas": [],
}

try:
    j = json.dumps(response)
    print("\nFULL RESPONSE JSON: OK, len=", len(j))
except Exception as e:
    print("\nFULL RESPONSE JSON FAIL:", e)
    # Find which key fails
    for k, v in response.items():
        try:
            json.dumps(v)
        except Exception as e2:
            print(f"  Key '{k}' fails:", e2)
            if isinstance(v, dict):
                for k2, v2 in v.items():
                    try:
                        json.dumps(v2)
                    except Exception as e3:
                        print(f"    Sub-key '{k2}' ({type(v2).__name__}): {e3}")

cur.close()
conn.close()
print("\nDONE")
