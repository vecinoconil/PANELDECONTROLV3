import psycopg2, psycopg2.extras

conn = psycopg2.connect(host='core.solba.com', port=5026, dbname='CONILINFORMATICA', user='SOLBA', password='solba2012')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

agente_codigo = 1
anio = 2025

# Query 1
try:
    cur.execute("SELECT codigo, nombre, cif, direccion, localidad, cpostal, telefono1, telefono2, email, observaciones, baja FROM agentes WHERE codigo = %(ag)s", {"ag": agente_codigo})
    row = cur.fetchone()
    print("Q1 agente:", row)
except Exception as e:
    print("Q1 ERROR:", e)
    conn.rollback()

# Query 2
try:
    cur.execute("SELECT EXTRACT(YEAR FROM vc.fecha)::int AS anio, EXTRACT(MONTH FROM vc.fecha)::int AS mes, COALESCE(SUM(vc.total), 0) AS total FROM ventas_cabeceras vc WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s GROUP BY 1, 2 ORDER BY 1, 2", {"ag": agente_codigo, "desde": "2023-01-01", "hasta": "2026-01-01"})
    print("Q2 ventas_mensuales:", len(cur.fetchall()), "rows")
except Exception as e:
    print("Q2 ERROR:", e)
    conn.rollback()

# Query 3
try:
    cur.execute("SELECT COALESCE(SUM(vc.total), 0) AS ventas, COUNT(*) AS num_facturas, COUNT(DISTINCT vc.cli_codigo) AS num_clientes FROM ventas_cabeceras vc WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s", {"ag": agente_codigo, "desde": "2025-01-01", "hasta": "2026-01-01"})
    print("Q3 KPIs:", dict(cur.fetchone()))
except Exception as e:
    print("Q3 ERROR:", e)
    conn.rollback()

# Query 4
try:
    cur.execute("SELECT COALESCE(SUM(vc.total), 0) AS ventas, COUNT(DISTINCT vc.cli_codigo) AS num_clientes FROM ventas_cabeceras vc WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s", {"ag": agente_codigo, "desde": "2024-01-01", "hasta": "2025-01-01"})
    print("Q4 KPIs prev:", dict(cur.fetchone()))
except Exception as e:
    print("Q4 ERROR:", e)
    conn.rollback()

# Query 5
try:
    cur.execute("SELECT COALESCE(SUM(vl.importe), 0) AS total_venta, COALESCE(SUM(vl.coste * vl.unidades), 0) AS total_coste FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id WHERE vc.agente = %(ag)s AND vc.tipodoc = 8 AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s", {"ag": agente_codigo, "desde": "2025-01-01", "hasta": "2026-01-01"})
    print("Q5 Margen:", dict(cur.fetchone()))
except Exception as e:
    print("Q5 ERROR:", e)
    conn.rollback()

# Query 7
try:
    cur.execute("SELECT COALESCE(SUM(v.importe), 0) AS pendiente FROM vencimientos v JOIN ventas_cabeceras vc ON v.idcab = vc.id WHERE vc.agente = %(ag)s AND v.tipo = 0 AND v.situacion = 0", {"ag": agente_codigo})
    print("Q7 Pendiente:", dict(cur.fetchone()))
except Exception as e:
    print("Q7 ERROR:", e)
    conn.rollback()

# Query 8
try:
    cur.execute("""SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
                   vc.cli_nombre, vc.total,
                   CASE vc.tipodoc WHEN 8 THEN 'FAC' WHEN 4 THEN 'ALB' WHEN 3 THEN 'ALB' ELSE 'DOC' END AS tipo_doc,
                   COALESCE((SELECT MIN((v.fechacobro - vc.fecha)::int)
                             FROM vencimientos v WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion <> 0), -1) AS dias_pago
            FROM ventas_cabeceras vc
            WHERE vc.agente = %(ag)s AND vc.tipodoc IN (3, 4, 8)
              AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
              AND NOT EXISTS (
                  SELECT 1 FROM vencimientos v
                  WHERE v.idcab = vc.id AND v.tipo = 0 AND v.situacion = 0
              )
            ORDER BY vc.fecha DESC, vc.numero DESC""", {"ag": agente_codigo, "desde": "2025-01-01", "hasta": "2026-01-01"})
    rows = cur.fetchall()
    print("Q8 Comisiones:", len(rows), "rows")
except Exception as e:
    print("Q8 ERROR:", e)
    conn.rollback()

# Query 9
try:
    cur.execute("""SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha::text AS fecha,
                   vc.cli_nombre, v.importe, v.fecha::text AS fecha_vencimiento,
                   CASE vc.tipodoc WHEN 8 THEN 'FAC' WHEN 4 THEN 'ALB' WHEN 3 THEN 'ALB' ELSE 'DOC' END AS tipo_doc,
                   (CURRENT_DATE - vc.fecha)::int AS dias
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON v.idcab = vc.id
            WHERE vc.agente = %(ag)s AND v.tipo = 0 AND v.situacion = 0
            ORDER BY vc.fecha ASC""", {"ag": agente_codigo})
    rows = cur.fetchall()
    print("Q9 Pendientes:", len(rows), "rows")
except Exception as e:
    print("Q9 ERROR:", e)
    conn.rollback()

# Query 10
try:
    cur.execute("""SELECT COALESCE(NULLIF(vl.referencia, ''), '---') AS referencia,
                       COALESCE(vl.descripcion, a.nombre, '') AS descripcion,
                       SUM(vl.unidades) AS unidades,
                       SUM(vl.importe) AS total_venta
                FROM ventas_lineas vl
                JOIN ventas_cabeceras vc ON vl.idcab = vc.id
                LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != ''
                WHERE vc.agente = %(ag)s AND vc.tipodoc = 8
                  AND vc.fecha >= %(desde)s AND vc.fecha < %(hasta)s
                GROUP BY COALESCE(NULLIF(vl.referencia, ''), '---'), COALESCE(vl.descripcion, a.nombre, '')
                ORDER BY SUM(vl.importe) DESC""", {"ag": agente_codigo, "desde": "2025-01-01", "hasta": "2026-01-01"})
    rows = cur.fetchall()
    print("Q10 TOP productos:", len(rows), "rows")
except Exception as e:
    print("Q10 ERROR:", e)
    conn.rollback()

# Query 11
try:
    cur.execute("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'igesvisitasfinal')")
    has = cur.fetchone()['exists']
    print("Q11 has_visitas:", has)
    if has:
        cur.execute("""SELECT iv.id, iv.fecha, iv.hora, iv.codigocliente,
                           COALESCE(c.nombre, '') AS cli_nombre,
                           iv.contacto, iv.observaciones,
                           COALESCE(xm.nombre, '') AS medio,
                           COALESCE(xmo.nombre, '') AS motivo,
                           COALESCE(xr.nombre, '') AS resultado
                    FROM igesvisitasfinal iv
                    LEFT JOIN clientes c ON iv.codigocliente = c.codigo
                    LEFT JOIN xmlvisitasmedios xm ON iv.codigomevisita = xm.codigo
                    LEFT JOIN xmlvisitasmotivos xmo ON iv.codigomovisita = xmo.codigo
                    LEFT JOIN xmlvisitasresultados xr ON iv.codigorevisita = xr.codigo
                    WHERE iv.codigorepresentante = %(ag_str)s
                    ORDER BY iv.fecha DESC, iv.hora DESC
                    LIMIT 500""", {"ag_str": str(agente_codigo)})
        print("Q11 visitas:", len(cur.fetchall()), "rows")
except Exception as e:
    print("Q11 ERROR:", e)
    conn.rollback()

print("\nALL QUERIES DONE")
cur.close()
conn.close()
