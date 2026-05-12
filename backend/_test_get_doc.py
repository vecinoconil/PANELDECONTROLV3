import os, sys, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from app.config import settings
from app.services.pg_connection import get_pg_connection
from app.models.app_models import Empresa
from sqlmodel import Session, create_engine, select

TIPODOC_AJUSTE = 4096
SERIE_AJUSTE = "AJ"

engine = create_engine(settings.database_url, echo=False)
with Session(engine) as session:
    empresa = session.exec(select(Empresa)).first()

conn = get_pg_connection(empresa)
cur = conn.cursor()

# Test GET /documentos/{id} con id=8
id_doc = 8

cur.execute("""
    SELECT id, numero, TRIM(serie) AS serie, fecha, descripcion,
           almacen, importe::float AS importe, fecha_aplicacion
    FROM inventario_cabeceras
    WHERE id = %(id)s AND tipodoc = %(tipodoc)s AND TRIM(serie) = %(serie)s
""", {"id": id_doc, "tipodoc": TIPODOC_AJUSTE, "serie": SERIE_AJUSTE})
cab = cur.fetchone()
print("CABECERA:", dict(cab) if cab else "NOT FOUND")

if cab:
    try:
        cur.execute("""
            SELECT l.id, l.referencia, l.descripcion,
                   l.unidades::float AS unidades,
                   l.coste::float AS coste,
                   COALESCE(l.talla, '') AS talla,
                   COALESCE(l.color, '') AS color,
                   COALESCE(a.nombre, l.descripcion) AS art_nombre,
                   COALESCE(a.familia, 0) AS familia,
                   COALESCE(a.subfamilia, 0) AS subfamilia,
                   COALESCE(a.marca, 0) AS marca,
                   COALESCE(a.control_lotes, 0) AS control_lotes,
                   COALESCE(a.tallas_colores, 0) AS tallas_colores_flag,
                   COALESCE(a.grupo_tallas, 0) AS grupo_tallas,
                   COALESCE(a.grupo_colores, 0) AS grupo_colores,
                   COALESCE(s.actual, 0)::float AS stock_actual
            FROM inventario_lineas l
            LEFT JOIN articulos a ON a.referencia = l.referencia
            LEFT JOIN almacenes_stock s
                   ON s.referencia = l.referencia AND s.almacen = %(almacen)s
            WHERE l.idcab = %(id)s
            ORDER BY l.id
        """, {"id": id_doc, "almacen": int(cab["almacen"])})
        rows = cur.fetchall()
        print(f"LINEAS: {len(rows)} filas")
        for r in rows[:3]:
            print(" ", dict(r))
    except Exception as e:
        print("ERROR EN LINEAS:", e)

conn.close()
