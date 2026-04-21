import psycopg2
from psycopg2.extras import RealDictCursor
from collections import defaultdict

conn = psycopg2.connect(
    host='core.solba.com', port=5026, dbname='CONILINFORMATICA',
    user='SOLBA', password='solba2012', connect_timeout=10, cursor_factory=RealDictCursor
)
cur = conn.cursor()

# Get a test client
cur.execute("SELECT cli_codigo, cli_nombre FROM ventas_cabeceras WHERE tipodoc=8 AND fecha >= '2026-01-01' LIMIT 1")
row = cur.fetchone()
cli = row['cli_codigo']
print(f"Testing with client: {cli} - {row['cli_nombre']}")

anio = 2026
anio_desde = anio - 2

steps = [
    ("1. Cliente maestro", 
     "SELECT codigo, nombre, cif, direccion, localidad, cpostal, telefono1, email, agente, fpago, observaciones FROM clientes WHERE codigo = %(cli)s",
     {"cli": cli}),
    ("2. Ventas mensuales",
     """SELECT EXTRACT(YEAR FROM vc.fecha)::int AS anio, EXTRACT(MONTH FROM vc.fecha)::int AS mes,
        COALESCE(SUM(vc.total), 0) AS total
        FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s GROUP BY 1, 2 ORDER BY 1, 2""",
     {"cli": cli, "desde": f"{anio_desde}-01-01", "hasta": f"{anio+1}-01-01"}),
    ("3. KPIs año",
     """SELECT COALESCE(SUM(vc.total), 0) AS ventas, COUNT(*) AS num_facturas
        FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
    ("4. Ventas año anterior",
     """SELECT COALESCE(SUM(vc.total), 0) AS ventas
        FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s""",
     {"cli": cli, "desde": f"{anio-1}-01-01", "hasta": f"{anio}-01-01"}),
    ("5. Margen",
     """SELECT COALESCE(SUM(vl.importe), 0) AS total_venta, COALESCE(SUM(vl.coste * vl.unidades), 0) AS total_coste
        FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
    ("6. Ultima compra",
     "SELECT MAX(vc.fecha) AS ultima FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8",
     {"cli": cli}),
    ("7. Plazo pago",
     """SELECT AVG(v.fechacobro - vc.fecha) AS plazo_medio
        FROM vencimientos v JOIN ventas_cabeceras vc ON v.idcab = vc.id
        WHERE v.clipro = %(cli)s AND v.tipo = 0 AND v.situacion <> 0
        AND v.fechacobro IS NOT NULL AND vc.fecha IS NOT NULL AND vc.fecha >= %(desde)s""",
     {"cli": cli, "desde": f"{anio-2}-01-01"}),
    ("8. Fechas frecuencia",
     """SELECT fecha FROM ventas_cabeceras WHERE cli_codigo = %(cli)s AND tipodoc = 8
        AND fecha >= %(desde)s AND fecha < %(hasta)s ORDER BY fecha""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
    ("9. Saldo pendiente",
     "SELECT COALESCE(SUM(v.importe), 0) AS pendiente FROM vencimientos v WHERE v.clipro = %(cli)s AND v.tipo = 0 AND v.situacion = 0",
     {"cli": cli}),
    ("10. Patron semanal",
     """SELECT EXTRACT(ISODOW FROM vc.fecha)::int AS dow, COUNT(*) AS cnt
        FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s GROUP BY 1 ORDER BY 1""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
]

for name, sql, params in steps:
    try:
        cur.execute(sql, params)
        rows = cur.fetchall()
        print(f"OK {name}: {len(rows)} rows")
    except Exception as e:
        print(f"ERROR {name}: {e}")
        conn.rollback()

# Step 11: Productos familia (the complex one)
print("\n--- Step 11: Productos familia ---")
try:
    cur.execute("""
        SELECT COALESCE(NULLIF(TRIM(a.familia), ''), 'Sin Familia') AS familia,
               vl.referencia,
               COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
               EXTRACT(YEAR FROM vc.fecha)::int AS anio,
               COALESCE(SUM(vl.importe), 0) AS total
        FROM ventas_lineas vl
        JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        LEFT JOIN articulos a ON vl.referencia = a.referencia
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
          AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        GROUP BY 1, 2, 3, 4
        ORDER BY 1, 5 DESC
    """, {"cli": cli, "desde": f"{anio_desde}-01-01", "hasta": f"{anio+1}-01-01"})
    rows = cur.fetchall()
    print(f"OK: {len(rows)} rows")

    # Test the defaultdict processing
    fam_data = defaultdict(lambda: {"productos": defaultdict(lambda: {"descripcion": "", "years": {}})})
    for r in rows:
        fam = r["familia"]
        ref = r["referencia"] or ""
        yr = int(r["anio"])
        fam_data[fam]["productos"][ref]["descripcion"] = r["descripcion"]
        fam_data[fam]["productos"][ref]["years"][yr] = float(r["total"])
    
    anios_cols = [anio - 2, anio - 1, anio]
    productos_familia = []
    for fam_name in sorted(fam_data.keys()):
        prods = []
        fam_totals = {y: 0 for y in anios_cols}
        for ref, pdata in fam_data[fam_name]["productos"].items():
            row = {"referencia": ref, "descripcion": pdata["descripcion"]}
            for y in anios_cols:
                row[str(y)] = pdata["years"].get(y, 0)
                fam_totals[y] += pdata["years"].get(y, 0)
            prods.append(row)
        prods.sort(key=lambda x: x.get(str(anio), 0), reverse=True)
        fam_row = {"familia": fam_name, "productos": prods}
        for y in anios_cols:
            fam_row[str(y)] = round(fam_totals[y], 2)
        productos_familia.append(fam_row)
    print(f"Processed: {len(productos_familia)} familias")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    conn.rollback()

# Steps 12-14
for name, sql, params in [
    ("12. TOP productos",
     """SELECT vl.referencia, COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
        SUM(vl.unidades) AS unidades, SUM(vl.importe) AS total_venta,
        SUM(vl.coste * vl.unidades) AS total_coste
        FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id
        LEFT JOIN articulos a ON vl.referencia = a.referencia
        WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 8
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        GROUP BY vl.referencia, vl.descripcion, a.nombre ORDER BY SUM(vl.importe) DESC""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
    ("13. Documentos venta",
     """SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
        vc.total, vc.totalpendiente AS pendiente,
        CASE vc.tipodoc WHEN 8 THEN 'Factura' WHEN 4 THEN 'Albarán' WHEN 3 THEN 'Albarán' ELSE 'Doc' END AS tipo_doc
        FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s AND vc.tipodoc IN (3, 4, 8)
        ORDER BY vc.fecha DESC, vc.numero DESC""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
    ("14. Presupuestos",
     """SELECT vc.id, vc.serie, vc.numero, vc.fecha::text AS fecha, vc.total, vc.descripcion
        FROM ventas_cabeceras vc WHERE vc.cli_codigo = %(cli)s AND vc.tipodoc = 1
        AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
        ORDER BY vc.fecha DESC, vc.numero DESC""",
     {"cli": cli, "desde": f"{anio}-01-01", "hasta": f"{anio+1}-01-01"}),
]:
    try:
        cur.execute(sql, params)
        rows = cur.fetchall()
        print(f"OK {name}: {len(rows)} rows")
    except Exception as e:
        print(f"ERROR {name}: {e}")
        conn.rollback()

conn.close()
print("\nDone!")
