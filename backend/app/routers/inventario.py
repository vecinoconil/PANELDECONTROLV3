"""
Inventario — endpoints para recuento y ajuste de stock.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection

router = APIRouter(dependencies=[Depends(require_permiso('inventario'))])

TIPODOC_AJUSTE = 4096
SERIE_AJUSTE = "AJ"



# ── Almacenes ─────────────────────────────────────────────────────────────

@router.get("/almacenes")
def list_almacenes(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM almacenes ORDER BY codigo")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Familias ──────────────────────────────────────────────────────────────

@router.get("/familias")
def list_familias(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM familias ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Subfamilias ───────────────────────────────────────────────────────────

@router.get("/subfamilias")
def list_subfamilias(
    familia: Optional[int] = Query(None),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        if familia is not None:
            cur.execute(
                "SELECT codigo, nombre, familia FROM subfamilias WHERE familia = %s ORDER BY nombre",
                (familia,),
            )
        else:
            cur.execute("SELECT codigo, nombre, familia FROM subfamilias ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"], "familia": r["familia"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Marcas ────────────────────────────────────────────────────────────────

@router.get("/marcas")
def list_marcas(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM articulos_marcas ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Buscar artículos ──────────────────────────────────────────────────────

@router.get("/articulos/buscar")
def buscar_articulos(
    q: Optional[str] = Query(None),
    familia: Optional[int] = Query(None),
    subfamilia: Optional[int] = Query(None),
    marca: Optional[int] = Query(None),
    almacen: int = Query(1),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        conditions = ["a.obsoleto = 0"]
        params: dict = {"almacen": almacen}

        if q:
            words = [w for w in q.strip().split() if w]
            for i, w in enumerate(words):
                key = f"w{i}"
                params[key] = f"%{w}%"
                conditions.append(
                    f"(LOWER(a.referencia) LIKE LOWER(%({key})s)"
                    f" OR LOWER(a.nombre) LIKE LOWER(%({key})s))"
                )
        if familia is not None:
            conditions.append("a.familia = %(familia)s")
            params["familia"] = familia
        if subfamilia is not None:
            conditions.append("a.subfamilia = %(subfamilia)s")
            params["subfamilia"] = subfamilia
        if marca is not None:
            conditions.append("a.marca = %(marca)s")
            params["marca"] = marca

        where = " AND ".join(conditions)
        limit_clause = "LIMIT 50" if q else ""

        cur.execute(
            f"""
            SELECT
                a.referencia,
                a.nombre,
                a.familia,
                a.subfamilia,
                a.marca,
                COALESCE(a.control_lotes, false)     AS control_lotes,
                COALESCE(a.tallas_colores, false)     AS tallas_colores,
                COALESCE(a.grupo_tallas, 0)::int      AS grupo_tallas,
                COALESCE(a.grupo_colores, 0)::int     AS grupo_colores,
                COALESCE(s.actual, 0)::float          AS stock_actual,
                EXISTS(
                    SELECT 1 FROM articulos_imagenes ai WHERE ai.referencia = a.referencia LIMIT 1
                )                                     AS tiene_imagen
            FROM articulos a
            LEFT JOIN almacenes_stock s
                   ON s.referencia = a.referencia AND s.almacen = %(almacen)s
            WHERE {where}
            ORDER BY a.nombre
            {limit_clause}
            """,
            params,
        )
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Lotes de un artículo ──────────────────────────────────────────────────

@router.get("/articulos/{referencia}/lotes")
def get_articulo_lotes(
    referencia: str,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                al.id,
                al.lote,
                al.fecha_compra,
                al.fecha_caducidad,
                COALESCE(SUM(als.unidades), 0)::float AS stock
            FROM articulos_lotes al
            LEFT JOIN articulos_lotes_stock als ON als.id_lote = al.id
            WHERE al.referencia = %s
            GROUP BY al.id, al.lote, al.fecha_compra, al.fecha_caducidad
            ORDER BY al.fecha_caducidad ASC NULLS LAST, al.fecha_compra ASC
            """,
            (referencia,),
        )
        result = []
        for r in cur.fetchall():
            result.append({
                "id": r["id"],
                "lote": r["lote"],
                "fecha_compra": r["fecha_compra"].isoformat() if r["fecha_compra"] else None,
                "fecha_caducidad": r["fecha_caducidad"].isoformat() if r["fecha_caducidad"] else None,
                "stock": float(r["stock"]),
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error lotes: {e}")
    finally:
        if conn:
            conn.close()


# ── Tallas/colores de un artículo ─────────────────────────────────────────

@router.get("/articulos/{referencia}/tallas-colores")
def get_tallas_colores(
    referencia: str,
    almacen: int = Query(1),
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            "SELECT grupo_tallas, grupo_colores FROM articulos WHERE referencia = %s",
            (referencia,),
        )
        art = cur.fetchone()
        if not art:
            raise HTTPException(status_code=404, detail="Artículo no encontrado")

        grupo_tallas = int(art["grupo_tallas"] or 0)
        grupo_colores = int(art["grupo_colores"] or 0)

        cur.execute(
            """
            SELECT r.talla, COALESCE(t.nombre, r.talla) AS nombre, r.orden
            FROM articulos_tallas_rel_grupos r
            LEFT JOIN articulos_tallas t ON t.codigo = r.talla
            WHERE r.grupo = %s
            ORDER BY r.orden
            """,
            (grupo_tallas,),
        )
        tallas = [{"codigo": row["talla"], "nombre": row["nombre"], "orden": row["orden"]} for row in cur.fetchall()]

        cur.execute(
            """
            SELECT r.color, COALESCE(c.nombre, r.color) AS nombre,
                   COALESCE(c.codigo_rgb, '') AS codigo_rgb, r.orden
            FROM articulos_colores_rel_grupos r
            LEFT JOIN articulos_colores c ON c.codigo = r.color
            WHERE r.grupo = %s
            ORDER BY r.orden
            """,
            (grupo_colores,),
        )
        colores = [
            {"codigo": row["color"], "nombre": row["nombre"], "codigo_rgb": row["codigo_rgb"], "orden": row["orden"]}
            for row in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT talla, color, COALESCE(actual, 0)::float AS actual
            FROM almacenes_stock_tallas_colores
            WHERE referencia = %s AND almacen = %s
            """,
            (referencia, almacen),
        )
        stock = [{"talla": row["talla"], "color": row["color"], "actual": float(row["actual"])} for row in cur.fetchall()]

        return {"tallas": tallas, "colores": colores, "stock": stock}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error TC: {e}")
    finally:
        if conn:
            conn.close()


# ── Imagen de un artículo ─────────────────────────────────────────────────

@router.get("/articulos/{referencia}/imagen")
def get_articulo_imagen(
    referencia: str,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            "SELECT imagen FROM articulos_imagenes WHERE referencia = %s ORDER BY orden LIMIT 1",
            (referencia,),
        )
        row = cur.fetchone()
        if not row or not row["imagen"]:
            raise HTTPException(status_code=404, detail="Sin imagen")
        return Response(content=bytes(row["imagen"]), media_type="image/jpeg")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error imagen: {e}")
    finally:
        if conn:
            conn.close()


# ── Guardar documento de inventario ───────────────────────────────────────

class LoteContado(BaseModel):
    id_lote: int
    lote: str
    unidades: float


class TCContado(BaseModel):
    talla: str
    color: str
    unidades: float


class LineaInventario(BaseModel):
    referencia: str
    descripcion: str
    unidades: float
    coste: float = 0.0
    lotes: list[LoteContado] = []
    tallas_colores: list[TCContado] = []


class DocumentoInventarioCreate(BaseModel):
    almacen: int
    descripcion: str = ""
    lineas: list[LineaInventario]


@router.post("/documento")
def crear_documento(
    body: DocumentoInventarioCreate,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Siguiente número para esta serie/tipodoc
        cur.execute(
            "SELECT COALESCE(MAX(numero), 0) + 1 AS next_num FROM inventario_cabeceras WHERE tipodoc = %s AND serie = %s",
            (TIPODOC_AJUSTE, SERIE_AJUSTE),
        )
        next_num = cur.fetchone()["next_num"]

        hoy = date.today()
        total_importe = sum(l.coste * l.unidades for l in body.lineas)
        descripcion = body.descripcion or f"Inventario {hoy.strftime('%d/%m/%Y')}"

        # Cabecera — fecha_aplicacion queda NULL (no aplicado)
        cur.execute(
            """
            INSERT INTO inventario_cabeceras
                (tipodoc, serie, numero, fecha, almacen, usuario, descripcion, importe)
            VALUES
                (%(tipodoc)s, %(serie)s, %(num)s, %(fecha)s, %(almacen)s,
                 %(usuario)s, %(desc)s, %(importe)s)
            RETURNING id
            """,
            {
                "tipodoc": TIPODOC_AJUSTE,
                "serie": SERIE_AJUSTE,
                "num": next_num,
                "fecha": hoy,
                "almacen": body.almacen,
                "usuario": 0,
                "desc": descripcion[:100],
                "importe": float(total_importe),
            },
        )
        id_cab = cur.fetchone()["id"]
        now = datetime.now()

        def _insert_linea(ref, desc, uds, coste, talla, color, stock_ud):
            imp = coste * uds
            cur.execute(
                """
                INSERT INTO inventario_lineas
                    (idcab, referencia, descripcion, unidades, gramos, coste, importe,
                     almacen, talla, color, stock_ud, stock_gr,
                     hora_creacion, hora_modificacion, fecha_aplicacion, id_caja_pale)
                VALUES
                    (%(idcab)s, %(ref)s, %(desc)s, %(uds)s, 0, %(coste)s, %(imp)s,
                     %(alm)s, %(talla)s, %(color)s, %(stock)s, 0,
                     %(hora)s, %(hora)s, %(fecha)s, 0)
                """,
                {
                    "idcab": id_cab,
                    "ref": ref,
                    "desc": desc[:100],
                    "uds": uds,
                    "coste": coste,
                    "imp": float(imp),
                    "alm": body.almacen,
                    "talla": talla,
                    "color": color,
                    "stock": stock_ud,
                    "hora": now,
                    "fecha": hoy,
                },
            )

        for linea in body.lineas:
            # Stock actual del artículo en el almacén
            cur.execute(
                "SELECT COALESCE(actual, 0)::float AS stock FROM almacenes_stock WHERE referencia = %s AND almacen = %s",
                (linea.referencia, body.almacen),
            )
            stk_row = cur.fetchone()
            stock_ud = float(stk_row["stock"]) if stk_row else 0.0

            if linea.tallas_colores:
                for tc in linea.tallas_colores:
                    if tc.unidades <= 0:
                        continue
                    _insert_linea(linea.referencia, linea.descripcion, tc.unidades,
                                  linea.coste, tc.talla, tc.color, stock_ud)
            elif linea.lotes:
                for lot in linea.lotes:
                    if lot.unidades <= 0:
                        continue
                    desc_lote = f"{linea.descripcion} [{lot.lote}]"
                    _insert_linea(linea.referencia, desc_lote, lot.unidades,
                                  linea.coste, "", "", stock_ud)
            else:
                if linea.unidades <= 0:
                    continue
                _insert_linea(linea.referencia, linea.descripcion, linea.unidades,
                              linea.coste, "", "", stock_ud)

        conn.commit()
        return {"id": id_cab, "numero": next_num, "serie": SERIE_AJUSTE}

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando inventario: {e}")
    finally:
        if conn:
            conn.close()


# ── Listar documentos de inventario ──────────────────────────────────────

@router.get("/documentos")
def list_documentos(
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.id, c.numero, TRIM(c.serie) AS serie, c.fecha,
                   c.descripcion, c.almacen, c.importe::float AS importe,
                   c.fecha_aplicacion,
                   COALESCE(a.nombre, CAST(c.almacen AS TEXT)) AS almacen_nombre,
                   COUNT(l.id) AS n_lineas
            FROM inventario_cabeceras c
            LEFT JOIN almacenes a ON a.codigo = c.almacen
            LEFT JOIN inventario_lineas l ON l.idcab = c.id
            WHERE c.tipodoc = %(tipodoc)s AND TRIM(c.serie) = %(serie)s
            GROUP BY c.id, c.numero, c.serie, c.fecha, c.descripcion,
                     c.almacen, c.importe, c.fecha_aplicacion, a.nombre
            ORDER BY c.id DESC
            LIMIT 50
            """,
            {"tipodoc": TIPODOC_AJUSTE, "serie": SERIE_AJUSTE},
        )
        rows = cur.fetchall()
        return [
            {
                "id": r["id"],
                "numero": r["numero"],
                "serie": r["serie"],
                "fecha": str(r["fecha"]),
                "descripcion": r["descripcion"] or "",
                "almacen": r["almacen"],
                "almacen_nombre": r["almacen_nombre"],
                "importe": float(r["importe"]),
                "aplicado": r["fecha_aplicacion"] is not None,
                "fecha_aplicacion": str(r["fecha_aplicacion"]) if r["fecha_aplicacion"] else None,
                "n_lineas": int(r["n_lineas"]),
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Obtener documento completo para edición ───────────────────────────────

@router.get("/documentos/{id_doc}")
def get_documento(
    id_doc: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    import re

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, numero, TRIM(serie) AS serie, fecha, descripcion,
                   almacen, importe::float AS importe, fecha_aplicacion
            FROM inventario_cabeceras
            WHERE id = %(id)s AND tipodoc = %(tipodoc)s AND TRIM(serie) = %(serie)s
            """,
            {"id": id_doc, "tipodoc": TIPODOC_AJUSTE, "serie": SERIE_AJUSTE},
        )
        cab = cur.fetchone()
        if not cab:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        cur.execute(
            """
            SELECT l.id, l.referencia, l.descripcion,
                   l.unidades::float AS unidades,
                   l.coste::float AS coste,
                   COALESCE(l.talla, '') AS talla,
                   COALESCE(l.color, '') AS color,
                   COALESCE(a.nombre, l.descripcion) AS art_nombre,
                   COALESCE(a.familia, 0) AS familia,
                   COALESCE(a.subfamilia, 0) AS subfamilia,
                   COALESCE(a.marca, 0) AS marca,
                   COALESCE(a.control_lotes, FALSE) AS control_lotes,
                   COALESCE(a.tallas_colores, FALSE) AS tallas_colores_flag,
                   COALESCE(a.grupo_tallas, 0) AS grupo_tallas,
                   COALESCE(a.grupo_colores, 0) AS grupo_colores,
                   COALESCE(s.actual, 0)::float AS stock_actual
            FROM inventario_lineas l
            LEFT JOIN articulos a ON a.referencia = l.referencia
            LEFT JOIN almacenes_stock s
                   ON s.referencia = l.referencia AND s.almacen = %(almacen)s
            WHERE l.idcab = %(id)s
            ORDER BY l.id
            """,
            {"id": id_doc, "almacen": int(cab["almacen"])},
        )
        lines_raw = cur.fetchall()

        articulos_dict: dict = {}
        lines_dict: dict = {}

        for raw in lines_raw:
            ref = raw["referencia"]
            talla = (raw["talla"] or "").strip()
            color = (raw["color"] or "").strip()
            ctrl_lotes = bool(raw["control_lotes"])

            if ref not in articulos_dict:
                articulos_dict[ref] = {
                    "referencia": ref,
                    "nombre": raw["art_nombre"],
                    "familia": int(raw["familia"]) if raw["familia"] else None,
                    "subfamilia": int(raw["subfamilia"]) if raw["subfamilia"] else None,
                    "marca": int(raw["marca"]) if raw["marca"] else None,
                    "control_lotes": ctrl_lotes,
                    "tallas_colores": bool(raw["tallas_colores_flag"]),
                    "grupo_tallas": int(raw["grupo_tallas"] or 0),
                    "grupo_colores": int(raw["grupo_colores"] or 0),
                    "stock_actual": float(raw["stock_actual"]),
                    "tiene_imagen": False,
                }
                lines_dict[ref] = {
                    "referencia": ref,
                    "descripcion": raw["art_nombre"],
                    "coste": float(raw["coste"]),
                    "unidades": 0.0,
                    "lotes": [],
                    "tallas_colores": [],
                }

            if talla or color:
                lines_dict[ref]["tallas_colores"].append(
                    {"talla": talla, "color": color, "unidades": float(raw["unidades"])}
                )
            elif ctrl_lotes:
                desc = raw["descripcion"] or ""
                m = re.search(r"\[(.+?)\]$", desc)
                if m:
                    lote_str = m.group(1)
                    cur2 = conn.cursor()
                    cur2.execute(
                        "SELECT id FROM articulos_lotes WHERE referencia = %s AND lote = %s LIMIT 1",
                        (ref, lote_str),
                    )
                    lote_row = cur2.fetchone()
                    id_lote = int(lote_row["id"]) if lote_row else -1
                    lines_dict[ref]["lotes"].append(
                        {"id_lote": id_lote, "lote": lote_str, "unidades": float(raw["unidades"])}
                    )
                else:
                    lines_dict[ref]["unidades"] += float(raw["unidades"])
            else:
                lines_dict[ref]["unidades"] += float(raw["unidades"])

        return {
            "id": cab["id"],
            "numero": int(cab["numero"]),
            "serie": str(cab["serie"]).strip(),
            "fecha": str(cab["fecha"]),
            "descripcion": str(cab["descripcion"] or ""),
            "almacen": int(cab["almacen"]),
            "aplicado": cab["fecha_aplicacion"] is not None,
            "articulos": list(articulos_dict.values()),
            "lines": lines_dict,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Actualizar documento (solo si no está aplicado) ───────────────────────

@router.put("/documentos/{id_doc}")
def update_documento(
    id_doc: int,
    body: DocumentoInventarioCreate,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Verificar que existe y no está aplicado
        cur.execute(
            "SELECT id, fecha_aplicacion FROM inventario_cabeceras WHERE id = %s AND tipodoc = %s AND TRIM(serie) = %s",
            (id_doc, TIPODOC_AJUSTE, SERIE_AJUSTE),
        )
        cab = cur.fetchone()
        if not cab:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        if cab["fecha_aplicacion"] is not None:
            raise HTTPException(status_code=409, detail="El inventario ya está aplicado y no se puede editar")

        hoy = date.today()
        now = datetime.now()
        total_importe = sum(l.coste * l.unidades for l in body.lineas)
        descripcion = body.descripcion or f"Inventario {hoy.strftime('%d/%m/%Y')}"

        # Borrar líneas antiguas
        cur.execute("DELETE FROM inventario_lineas WHERE idcab = %s", (id_doc,))

        # Actualizar cabecera
        cur.execute(
            """
            UPDATE inventario_cabeceras
               SET descripcion = %(desc)s, importe = %(importe)s,
                   almacen = %(almacen)s, horamodi = %(hora)s
             WHERE id = %(id)s
            """,
            {
                "desc": descripcion[:100],
                "importe": float(total_importe),
                "almacen": body.almacen,
                "hora": now,
                "id": id_doc,
            },
        )

        def _insert_linea_upd(ref, desc, uds, coste, talla, color, stock_ud):
            imp = coste * uds
            cur.execute(
                """
                INSERT INTO inventario_lineas
                    (idcab, referencia, descripcion, unidades, gramos, coste, importe,
                     almacen, talla, color, stock_ud, stock_gr,
                     hora_creacion, hora_modificacion, id_caja_pale)
                VALUES
                    (%(idcab)s, %(ref)s, %(desc)s, %(uds)s, 0, %(coste)s, %(imp)s,
                     %(alm)s, %(talla)s, %(color)s, %(stock)s, 0,
                     %(hora)s, %(hora)s, 0)
                """,
                {
                    "idcab": id_doc,
                    "ref": ref,
                    "desc": desc[:100],
                    "uds": uds,
                    "coste": coste,
                    "imp": float(imp),
                    "alm": body.almacen,
                    "talla": talla,
                    "color": color,
                    "stock": stock_ud,
                    "hora": now,
                },
            )

        for linea in body.lineas:
            cur.execute(
                "SELECT COALESCE(actual, 0)::float AS stock FROM almacenes_stock WHERE referencia = %s AND almacen = %s",
                (linea.referencia, body.almacen),
            )
            stk_row = cur.fetchone()
            stock_ud = float(stk_row["stock"]) if stk_row else 0.0

            if linea.tallas_colores:
                for tc in linea.tallas_colores:
                    if tc.unidades <= 0:
                        continue
                    _insert_linea_upd(linea.referencia, linea.descripcion, tc.unidades,
                                      linea.coste, tc.talla, tc.color, stock_ud)
            elif linea.lotes:
                for lot in linea.lotes:
                    if lot.unidades <= 0:
                        continue
                    desc_lote = f"{linea.descripcion} [{lot.lote}]"
                    _insert_linea_upd(linea.referencia, desc_lote, lot.unidades,
                                      linea.coste, "", "", stock_ud)
            else:
                if linea.unidades <= 0:
                    continue
                _insert_linea_upd(linea.referencia, linea.descripcion, linea.unidades,
                                  linea.coste, "", "", stock_ud)

        conn.commit()
        return {"ok": True, "id": id_doc}

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error actualizando inventario: {e}")
    finally:
        if conn:
            conn.close()


# ── Eliminar documento (solo si no está aplicado) ─────────────────────────

@router.delete("/documentos/{id_doc}")
def delete_documento(
    id_doc: int,
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            "SELECT id, fecha_aplicacion FROM inventario_cabeceras WHERE id = %s AND tipodoc = %s AND TRIM(serie) = %s",
            (id_doc, TIPODOC_AJUSTE, SERIE_AJUSTE),
        )
        cab = cur.fetchone()
        if not cab:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        if cab["fecha_aplicacion"] is not None:
            raise HTTPException(status_code=409, detail="El inventario ya está aplicado y no se puede eliminar")

        cur.execute("DELETE FROM inventario_lineas WHERE idcab = %s", (id_doc,))
        cur.execute("DELETE FROM inventario_cabeceras WHERE id = %s", (id_doc,))
        conn.commit()
        return {"ok": True}

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error eliminando inventario: {e}")
    finally:
        if conn:
            conn.close()
