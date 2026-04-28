"""
Autoventa – mobile-sales endpoints.
Allows a field agent to create Pedidos (1), Albaranes (4) or Facturas (8)
for their assigned clients, pre-loading products consumed in the last 90 days.
"""
import json
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user
from app.database import get_session
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection
from app.schemas import normalize_permisos

router = APIRouter()

TIPODOC_LABELS = {2: "Pedido", 4: "Albarán", 8: "Factura"}


def _get_empresa(user: Usuario, session: Session) -> Empresa:
    if not user.empresa_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa asignada")
    empresa = session.get(Empresa, user.empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return empresa


def _require_autoventa(user: Usuario):
    permisos = normalize_permisos(user.permisos or "{}")
    can_enter = bool(permisos.get("autoventa", {}).get("entrar", False))
    if user.rol != "superadmin" and not can_enter:
        raise HTTPException(status_code=403, detail="Sin permiso de Autoventa")


# ── Agentes ───────────────────────────────────────────────────────────────

@router.get("/agentes")
def list_agentes(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT codigo, nombre FROM agentes WHERE baja = false ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Series ────────────────────────────────────────────────────────────────

@router.get("/series")
def list_series(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute("SELECT serie FROM series WHERE obsoleta = false ORDER BY serie")
        return [{"serie": r["serie"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Clientes ──────────────────────────────────────────────────────────────

@router.get("/clientes/buscar")
def buscar_clientes(
    q: str = Query(min_length=2),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT codigo, nombre, alias, cif,
                   direccion, localidad, cpostal, provincia,
                   fpago, tarifabase, COALESCE(email, '') AS email
            FROM clientes
            WHERE obsoleto = 0
              AND activo = true
              AND (
                  LOWER(nombre) LIKE LOWER(%(q)s)
                  OR LOWER(alias) LIKE LOWER(%(q)s)
              )
            ORDER BY nombre
            LIMIT 30
            """,
            {"q": f"%{q}%"},
        )
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Consumo últimos 90 días ───────────────────────────────────────────────

@router.get("/clientes/{cli_codigo}/consumo-90dias")
def consumo_90dias(
    cli_codigo: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                vl.referencia,
                vl.descripcion,
                SUM(vl.unidades)::numeric          AS uds_total,
                MAX(vl.precio)::numeric             AS ultimo_precio,
                MAX(vc.fecha)                       AS ultima_fecha,
                COALESCE(AVG(vl.piva), 0)::numeric  AS piva
            FROM ventas_lineas vl
            JOIN ventas_cabeceras vc ON vc.id = vl.idcab
            WHERE vc.cli_codigo   = %(cli)s
              AND vc.tipodoc      IN (2, 4, 8)
              AND vc.fecha        >= CURRENT_DATE - INTERVAL '90 days'
              AND vl.referencia   IS NOT NULL
              AND vl.referencia   != ''
              AND (vl.linea_cabecera IS NULL OR vl.linea_cabecera = 0)
              AND vl.unidades     > 0
            GROUP BY vl.referencia, vl.descripcion
            ORDER BY ultima_fecha DESC, uds_total DESC
            """,
            {"cli": cli_codigo},
        )
        rows = []
        for r in cur.fetchall():
            rows.append({
                "referencia": r["referencia"],
                "descripcion": r["descripcion"],
                "uds_total": float(r["uds_total"]),
                "ultimo_precio": float(r["ultimo_precio"]),
                "ultima_fecha": r["ultima_fecha"].isoformat() if r["ultima_fecha"] else None,
                "piva": float(r["piva"]),
            })
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Buscar artículos con precio según tarifa del cliente ─────────────────

@router.get("/articulos/buscar")
def buscar_articulos(
    q: str = Query(min_length=2),
    cli_codigo: int = Query(...),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Searches articles by substring (referencia or nombre) and returns them
    with the price calculated from the client's tariff and special conditions.
    Priority: precios_clipro > tarifas_especiales_detalle (by ref > by family > global) > articulos_precios (base tariff).
    """
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Get client tariff info
        cur.execute(
            "SELECT tarifabase, tarifaespecial FROM clientes WHERE codigo = %s",
            (cli_codigo,),
        )
        cli = cur.fetchone()
        if not cli:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        tarifabase = int(cli["tarifabase"] or 1)
        tarifaespecial = int(cli["tarifaespecial"] or 0)

        # Search articles with base tariff price and IVA %
        cur.execute(
            """
            SELECT
                a.referencia,
                a.nombre,
                a.familia,
                COALESCE(ti.iva, 21.0)::float       AS piva,
                COALESCE(ap.precio, 0.0)::float      AS precio_base
            FROM articulos a
            LEFT JOIN tipos_iva ti    ON ti.codigo = a.tipoiva
            LEFT JOIN articulos_precios ap
                   ON ap.referencia = a.referencia AND ap.tarifa = %(tarifa)s
            WHERE a.obsoleto = 0
              AND (
                  LOWER(a.referencia) LIKE LOWER(%(q)s)
                  OR LOWER(a.nombre)  LIKE LOWER(%(q)s)
              )
            ORDER BY a.nombre
            LIMIT 20
            """,
            {"tarifa": tarifabase, "q": f"%{q}%"},
        )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return []

        refs = [r["referencia"] for r in rows]
        familias = list({r["familia"] for r in rows if r["familia"] and r["familia"] > 0})

        # Special tariff conditions (if client has one)
        esp_by_ref: dict = {}
        esp_by_fam: dict = {}
        esp_global = None
        if tarifaespecial > 0:
            cur.execute(
                """
                SELECT referencia, familia, descuento::float, precio::float
                FROM tarifas_especiales_detalle
                WHERE codigo_tarifa = %(cod)s
                  AND (
                    (referencia = ANY(%(refs)s) AND referencia != '')
                    OR (familia = ANY(%(fams)s) AND referencia = '')
                    OR (familia = 0 AND referencia = '')
                  )
                """,
                {"cod": tarifaespecial, "refs": refs, "fams": familias if familias else [-1]},
            )
            for ec in cur.fetchall():
                ec = dict(ec)
                if ec["referencia"]:
                    esp_by_ref.setdefault(ec["referencia"], ec)
                elif ec["familia"] == 0:
                    if esp_global is None:
                        esp_global = ec
                else:
                    esp_by_fam.setdefault(ec["familia"], ec)

        # Specific client prices (precios_clipro) — most recent per article
        clipro: dict = {}
        cur.execute(
            """
            SELECT DISTINCT ON (referencia) referencia, pvp::float
            FROM precios_clipro
            WHERE cliente = %s AND anulado = 0 AND referencia = ANY(%s)
            ORDER BY referencia, id DESC
            """,
            (cli_codigo, refs),
        )
        for cp in cur.fetchall():
            clipro[cp["referencia"]] = float(cp["pvp"])

        # Apply price priority per article
        def _apply_esp(esp, base):
            if esp["precio"] > 0:
                return float(esp["precio"])
            if esp["descuento"] > 0:
                return base * (1 - esp["descuento"] / 100)
            return base

        result = []
        for r in rows:
            ref = r["referencia"]
            familia = r["familia"] or 0
            base = r["precio_base"]

            if ref in clipro:
                precio = clipro[ref]
            elif ref in esp_by_ref:
                precio = _apply_esp(esp_by_ref[ref], base)
            elif familia in esp_by_fam:
                precio = _apply_esp(esp_by_fam[familia], base)
            elif esp_global:
                precio = _apply_esp(esp_global, base)
            else:
                precio = base

            result.append({
                "referencia": ref,
                "nombre": r["nombre"],
                "precio": round(float(precio), 6),
                "piva": r["piva"],
            })

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Crear documento ───────────────────────────────────────────────────────

class LineaDocumento(BaseModel):
    referencia: str
    descripcion: str
    unidades: float
    precio: float
    piva: float = 0.0


class CrearDocumentoRequest(BaseModel):
    tipodoc: int          # 2=Pedido, 4=Albarán, 8=Factura
    serie: str
    cli_codigo: int
    cli_nombre: str
    cli_cif: Optional[str] = ""
    cli_direccion: Optional[str] = ""
    cli_localidad: Optional[str] = ""
    cli_cpostal: Optional[str] = ""
    cli_provincia: Optional[int] = 0
    fpago: Optional[int] = 1
    tarifa: Optional[int] = 1
    observaciones: Optional[str] = ""
    lineas: list[LineaDocumento]


@router.post("/documento")
def crear_documento(
    body: CrearDocumentoRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_autoventa(current_user)

    if body.tipodoc not in TIPODOC_LABELS:
        raise HTTPException(status_code=400, detail="tipodoc debe ser 2, 4 u 8")

    lineas_validas = [l for l in body.lineas if l.unidades > 0]
    if not lineas_validas:
        raise HTTPException(status_code=400, detail="El documento debe tener al menos una línea con unidades")

    agente_codigo = current_user.agente_autoventa or 0

    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Get next numero for this serie+tipodoc
        cur.execute(
            "SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente "
            "FROM ventas_cabeceras WHERE serie = %(s)s AND tipodoc = %(t)s",
            {"s": body.serie, "t": body.tipodoc},
        )
        numero = cur.fetchone()["siguiente"]

        today = date.today()

        # Calculate totals grouped by IVA rate
        iva_groups: dict[float, dict] = {}
        for l in lineas_validas:
            importe = round(l.unidades * l.precio, 6)
            piva = l.piva
            if piva not in iva_groups:
                iva_groups[piva] = {"base": Decimal("0"), "iva_importe": Decimal("0")}
            iva_groups[piva]["base"] += Decimal(str(round(importe, 6)))
            iva_importe = Decimal(str(round(importe * piva / 100, 6)))
            iva_groups[piva]["iva_importe"] += iva_importe

        sorted_pivas = sorted(iva_groups.keys())

        def get_group(idx: int) -> tuple:
            if idx < len(sorted_pivas):
                piva = sorted_pivas[idx]
                g = iva_groups[piva]
                return float(g["base"]), piva, float(g["iva_importe"])
            return 0.0, 0.0, 0.0

        base1, piva1, iva1 = get_group(0)
        base2, piva2, iva2 = get_group(1)
        base3, piva3, iva3 = get_group(2)

        total = round(base1 + iva1 + base2 + iva2 + base3 + iva3, 2)

        # Insert cabecera
        cur.execute(
            """
            INSERT INTO ventas_cabeceras (
                tipodoc, serie, numero, fecha,
                cli_codigo, cli_nombre, cli_cif,
                cli_direccion, cli_localidad, cli_cpostal, cli_provincia,
                agente, fpago, tarifa,
                baseimpo1, piva1, iva1,
                baseimpo2, piva2, iva2,
                baseimpo3, piva3, iva3,
                total, observaciones
            ) VALUES (
                %(tipodoc)s, %(serie)s, %(numero)s, %(fecha)s,
                %(cli_codigo)s, %(cli_nombre)s, %(cli_cif)s,
                %(cli_direccion)s, %(cli_localidad)s, %(cli_cpostal)s, %(cli_provincia)s,
                %(agente)s, %(fpago)s, %(tarifa)s,
                %(base1)s, %(piva1)s, %(iva1)s,
                %(base2)s, %(piva2)s, %(iva2)s,
                %(base3)s, %(piva3)s, %(iva3)s,
                %(total)s, %(observaciones)s
            ) RETURNING id
            """,
            {
                "tipodoc": body.tipodoc, "serie": body.serie, "numero": numero, "fecha": today,
                "cli_codigo": body.cli_codigo, "cli_nombre": body.cli_nombre, "cli_cif": body.cli_cif or "",
                "cli_direccion": body.cli_direccion or "", "cli_localidad": body.cli_localidad or "",
                "cli_cpostal": body.cli_cpostal or "", "cli_provincia": body.cli_provincia or 0,
                "agente": agente_codigo, "fpago": body.fpago or 1, "tarifa": body.tarifa or 1,
                "base1": base1, "piva1": piva1, "iva1": iva1,
                "base2": base2, "piva2": piva2, "iva2": iva2,
                "base3": base3, "piva3": piva3, "iva3": iva3,
                "total": total, "observaciones": body.observaciones or "",
            },
        )
        idcab = cur.fetchone()["id"]

        # Insert lineas
        for orden, l in enumerate(lineas_validas, start=1):
            importe = round(l.unidades * l.precio, 6)
            cur.execute(
                """
                INSERT INTO ventas_lineas (
                    idcab, tipodoc, serie, numero, cli_codigo,
                    orden, fecha,
                    referencia, descripcion,
                    unidades, precio, importe, piva,
                    coste, pmp
                ) VALUES (
                    %(idcab)s, %(tipodoc)s, %(serie)s, %(numero)s, %(cli_codigo)s,
                    %(orden)s, %(fecha)s,
                    %(referencia)s, %(descripcion)s,
                    %(unidades)s, %(precio)s, %(importe)s, %(piva)s,
                    0, 0
                )
                """,
                {
                    "idcab": idcab, "tipodoc": body.tipodoc, "serie": body.serie,
                    "numero": numero, "cli_codigo": body.cli_codigo,
                    "orden": orden, "fecha": today,
                    "referencia": l.referencia, "descripcion": l.descripcion,
                    "unidades": l.unidades, "precio": l.precio,
                    "importe": importe, "piva": l.piva,
                },
            )

        conn.commit()
        return {
            "ok": True,
            "id": idcab,
            "serie": body.serie,
            "numero": numero,
            "tipodoc": body.tipodoc,
            "tipodoc_label": TIPODOC_LABELS[body.tipodoc],
            "total": total,
        }

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando documento: {e}")
    finally:
        if conn:
            conn.close()


# ── Formas de pago del usuario ────────────────────────────────────────────

@router.get("/formaspago")
def list_formaspago(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns the formas de pago the user is allowed to use in Autoventa."""
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)

    fpagos_ids = json.loads(current_user.fpagos_autoventa or "[]")

    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        if fpagos_ids:
            cur.execute(
                "SELECT codigo, nombre FROM formaspago WHERE codigo = ANY(%(ids)s) ORDER BY nombre",
                {"ids": fpagos_ids},
            )
        else:
            # superadmin / gerente can see all
            cur.execute("SELECT codigo, nombre FROM formaspago ORDER BY nombre")
        return [{"codigo": r["codigo"], "nombre": r["nombre"]} for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Documentos pendientes del cliente ─────────────────────────────────────

@router.get("/clientes/{cli_codigo}/documentos")
def documentos_cliente(
    cli_codigo: int,
    solo_pte: bool = Query(default=True),
    tipodoc: Optional[int] = Query(default=None),  # 4=albaran, 8=factura, None=todos
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Returns documents for a client that have pending amounts.
    - Albaranes (tipodoc=4): total - SUM(ventas_entregas.importe) > 0
    - Facturas  (tipodoc=8): vencimientos with situacion=0
    """
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        results = []
        include_alb = tipodoc is None or tipodoc == 4
        include_fac = tipodoc is None or tipodoc == 8

        # ── Albaranes ────────────────────────────────────────────────────
        if include_alb:
            alb_having = "HAVING (vc.total - COALESCE(SUM(e.importe),0)) > 0.01" if solo_pte else ""
            cur.execute(f"""
                SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total,
                       COALESCE(SUM(e.importe), 0)::numeric AS pagado
                FROM ventas_cabeceras vc
                LEFT JOIN ventas_entregas e ON e.idcab = vc.id
                WHERE vc.cli_codigo = %(cli)s
                  AND vc.tipodoc = 4
                GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total
                {alb_having}
                ORDER BY vc.fecha DESC
                LIMIT 50
            """, {"cli": cli_codigo})
            for r in cur.fetchall():
                total = float(r["total"])
                pagado = float(r["pagado"])
                results.append({
                    "id": r["id"],
                    "tipodoc": r["tipodoc"],
                    "tipodoc_label": "Albarán",
                    "serie": r["serie"],
                    "numero": r["numero"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "total": total,
                    "pagado": pagado,
                    "pendiente": round(total - pagado, 2),
                    "vencimientos": [],
                })

        # ── Facturas ──────────────────────────────────────────────────────
        if include_fac:
            fac_having = "HAVING COUNT(v.id) FILTER (WHERE v.situacion = 0) > 0" if solo_pte else ""
            cur.execute(f"""
                SELECT vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total,
                       json_agg(json_build_object(
                           'id', v.id,
                           'fecha_vencimiento', v.fecha_vencimiento,
                           'importe', v.importe,
                           'situacion', v.situacion,
                           'entregas_cuenta', COALESCE(
                               (SELECT SUM(e2.importe) FROM ventas_entregas e2 WHERE e2.idvencimiento = v.id), 0
                           )
                       ) ORDER BY v.fecha_vencimiento) FILTER (WHERE v.id IS NOT NULL) AS vencimientos
                FROM ventas_cabeceras vc
                LEFT JOIN vencimientos v ON v.idcab = vc.id
                WHERE vc.cli_codigo = %(cli)s
                  AND vc.tipodoc = 8
                GROUP BY vc.id, vc.tipodoc, vc.serie, vc.numero, vc.fecha, vc.total
                {fac_having}
                ORDER BY vc.fecha DESC
                LIMIT 50
            """, {"cli": cli_codigo})
            for r in cur.fetchall():
                vtos_raw = r["vencimientos"] or []
                vtos = []
                for v in vtos_raw:
                    if not solo_pte or v["situacion"] == 0:
                        fv = v["fecha_vencimiento"]
                        vtos.append({
                            "id": v["id"],
                            "fecha_vencimiento": fv.isoformat() if hasattr(fv, "isoformat") else str(fv),
                            "importe": float(v["importe"]),
                            "situacion": v["situacion"],
                            "entregas_cuenta": float(v["entregas_cuenta"]),
                        })
                total = float(r["total"])
                pendiente = sum(v["importe"] - v["entregas_cuenta"] for v in vtos if v["situacion"] == 0)
                results.append({
                    "id": r["id"],
                    "tipodoc": r["tipodoc"],
                    "tipodoc_label": "Factura",
                    "serie": r["serie"],
                    "numero": r["numero"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                    "total": total,
                "pagado": round(total - pendiente, 2),
                "pendiente": round(pendiente, 2),
                "vencimientos": vtos,
            })

        # Sort all by fecha desc
        results.sort(key=lambda x: x["fecha"] or "", reverse=True)
        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Cobrar documento ──────────────────────────────────────────────────────

class CobrarAlbaranRequest(BaseModel):
    fpago_codigo: int
    importe: float


class CobrarVencimientoRequest(BaseModel):
    vto_id: int
    fpago_codigo: int
    importe: float


@router.post("/clientes/{cli_codigo}/documentos/{idcab}/cobrar-albaran")
def cobrar_albaran(
    cli_codigo: int,
    idcab: int,
    body: CobrarAlbaranRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Register a payment for an albarán (ventas_entregas)."""
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Verify document exists and belongs to client
        cur.execute("SELECT id, total FROM ventas_cabeceras WHERE id = %(id)s AND cli_codigo = %(cli)s AND tipodoc = 4",
                    {"id": idcab, "cli": cli_codigo})
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Albarán no encontrado")

        today = date.today()

        # Insert registro_cobros
        cur.execute("""
            INSERT INTO registro_cobros(id_cab, id_vto, tipo, es_cobro, es_impago, es_anulacion,
                                        es_entrega, created_by, created_at, borrado, es_manual, importe)
            VALUES (%(idcab)s, 0, 0, false, false, false, true, 1, NOW(), false, true, %(importe)s)
            RETURNING id
        """, {"idcab": idcab, "importe": body.importe})
        reg_id = cur.fetchone()["id"]

        # Insert ventas_entregas
        cur.execute("""
            INSERT INTO ventas_entregas(idcab, idregistro, cliente, fecha, importe,
                                        usuario, cajabanco, codigo_cb, idvencimiento, terminal, turno)
            VALUES (%(idcab)s, %(reg)s, %(cli)s, %(fecha)s, %(importe)s,
                    1, 0, %(fpago)s, 0, 0, 0)
        """, {"idcab": idcab, "reg": reg_id, "cli": cli_codigo,
              "fecha": today, "importe": body.importe, "fpago": body.fpago_codigo})

        conn.commit()
        return {"ok": True, "idregistro": reg_id}

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error registrando cobro: {e}")
    finally:
        if conn:
            conn.close()


@router.post("/clientes/{cli_codigo}/documentos/{idcab}/cobrar-vencimiento")
def cobrar_vencimiento(
    cli_codigo: int,
    idcab: int,
    body: CobrarVencimientoRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Register a payment for a factura vencimiento."""
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        # Verify vencimiento
        cur.execute("""
            SELECT v.id, v.importe, v.situacion, vc.cli_codigo
            FROM vencimientos v
            JOIN ventas_cabeceras vc ON vc.id = v.idcab
            WHERE v.id = %(vto)s AND vc.id = %(idcab)s AND vc.cli_codigo = %(cli)s
        """, {"vto": body.vto_id, "idcab": idcab, "cli": cli_codigo})
        vto = cur.fetchone()
        if not vto:
            raise HTTPException(status_code=404, detail="Vencimiento no encontrado")
        if vto["situacion"] != 0:
            raise HTTPException(status_code=400, detail="El vencimiento ya está cobrado")

        today = date.today()

        # Insert registro_cobros
        cur.execute("""
            INSERT INTO registro_cobros(id_cab, id_vto, tipo, es_cobro, es_impago, es_anulacion,
                                        es_entrega, created_by, created_at, borrado, es_manual, importe)
            VALUES (%(idcab)s, %(vto)s, 0, true, false, false, false, 1, NOW(), false, true, %(importe)s)
            RETURNING id
        """, {"idcab": idcab, "vto": body.vto_id, "importe": body.importe})
        reg_id = cur.fetchone()["id"]

        # Update vencimiento
        cur.execute("""
            UPDATE vencimientos
            SET situacion = 1,
                fechacobro = %(fecha)s,
                cajabanco  = 0,
                codigo_cb  = %(fpago)s,
                idregistro = %(reg)s
            WHERE id = %(vto)s
        """, {"fecha": today, "fpago": body.fpago_codigo, "reg": reg_id, "vto": body.vto_id})

        conn.commit()
        return {"ok": True, "idregistro": reg_id}

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error registrando cobro: {e}")
    finally:
        if conn:
            conn.close()


# ── Clientes del agente (caché inicial) ──────────────────────────────────

@router.get("/clientes/agente")
def clientes_agente(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns all active clients assigned to the user's agent for local caching."""
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    agente_codigo = current_user.agente_autoventa
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()
        if agente_codigo:
            cur.execute(
                """
                SELECT codigo, nombre, alias, cif,
                       direccion, localidad, cpostal, provincia,
                       fpago, tarifabase, COALESCE(email, '') AS email
                FROM clientes
                WHERE obsoleto = 0
                  AND activo = true
                  AND agente = %(agente)s
                ORDER BY nombre
                """,
                {"agente": agente_codigo},
            )
        else:
            cur.execute(
                """
                SELECT codigo, nombre, alias, cif,
                       direccion, localidad, cpostal, provincia,
                       fpago, tarifabase, COALESCE(email, '') AS email
                FROM clientes
                WHERE obsoleto = 0
                  AND activo = true
                ORDER BY nombre
                LIMIT 200
                """
            )
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        if conn:
            conn.close()


# ── Enviar copia de documento por email ──────────────────────────────────

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


class EnviarDocumentoRequest(BaseModel):
    cli_codigo: int
    idcab: int
    tipodoc: int
    email_destino: str


@router.post("/enviar-documento")
def enviar_documento(
    body: EnviarDocumentoRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Sends a document summary email to the client."""
    _require_autoventa(current_user)
    empresa = _get_empresa(current_user, session)
    conn = None
    try:
        conn = get_pg_connection(empresa)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT vc.*, c.nombre AS cli_nombre_full
            FROM ventas_cabeceras vc
            JOIN clientes c ON c.codigo = vc.cli_codigo
            WHERE vc.id = %(id)s AND vc.cli_codigo = %(cli)s
            """,
            {"id": body.idcab, "cli": body.cli_codigo},
        )
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        cur.execute(
            "SELECT * FROM ventas_lineas WHERE idcab = %(id)s ORDER BY orden",
            {"id": body.idcab},
        )
        lineas = cur.fetchall()

        tipo_label = {2: "Pedido", 4: "Albar\u00e1n", 8: "Factura"}.get(body.tipodoc, "Documento")
        empresa_nombre = empresa.nombre

        lineas_html = "".join(
            f"<tr>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{l['descripcion']}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{float(l['unidades']):.2f}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{float(l['precio']):.2f}\u20ac</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{float(l['importe']):.2f}\u20ac</td>"
            f"</tr>"
            for l in lineas
        )

        html = (
            "<html><body style='font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto;padding:24px'>"
            f"<h2 style='color:#0056b3'>{empresa_nombre} \u2013 {tipo_label} {doc['serie']}-{doc['numero']}</h2>"
            f"<p>Estimado/a <strong>{doc['cli_nombre_full']}</strong>,</p>"
            f"<p>Le enviamos la copia de su {tipo_label.lower()} con fecha <strong>{doc['fecha']}</strong>.</p>"
            "<table style='width:100%;border-collapse:collapse;margin:16px 0;font-size:13px'>"
            "<thead><tr style='background:#f4f6f9'>"
            "<th style='padding:8px 10px;text-align:left;border-bottom:2px solid #dde3ec'>Descripci\u00f3n</th>"
            "<th style='padding:8px 10px;text-align:right;border-bottom:2px solid #dde3ec'>Uds</th>"
            "<th style='padding:8px 10px;text-align:right;border-bottom:2px solid #dde3ec'>Precio</th>"
            "<th style='padding:8px 10px;text-align:right;border-bottom:2px solid #dde3ec'>Importe</th>"
            "</tr></thead>"
            f"<tbody>{lineas_html}</tbody></table>"
            f"<p style='text-align:right;font-size:15px;font-weight:bold'>Total: {float(doc['total']):.2f}\u20ac</p>"
            f"<p style='color:#888;font-size:12px;margin-top:24px'>{empresa_nombre}</p>"
            "</body></html>"
        )

        smtp_host = empresa.smtp_host or "smtp.ionos.es"
        smtp_port = empresa.smtp_port or 465
        smtp_user = empresa.smtp_user or "solbabi@solba.com"
        smtp_pass = empresa.smtp_password or "Solba2012@"
        from_name = empresa.smtp_from_name or empresa_nombre

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{tipo_label} {doc['serie']}-{doc['numero']} \u2013 {empresa_nombre}"
        msg["From"] = f"{from_name} <{smtp_user}>"
        msg["To"] = body.email_destino
        msg.attach(MIMEText(html, "html"))

        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx) as smtp:
            smtp.login(smtp_user, smtp_pass)
            smtp.send_message(msg)

        return {"ok": True}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {e}")
    finally:
        if conn:
            conn.close()
