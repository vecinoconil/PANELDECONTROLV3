"""
Asistente IA — SOLBA Panel V3
==============================
Endpoint /api/asistente/chat — solo superadmin.
Recibe una pregunta en lenguaje natural, genera SQL con Claude,
lo ejecuta en PostgreSQL y devuelve la respuesta formateada por la IA.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

from app.auth.dependencies import get_current_user, get_empresa_from_local
from app.models.app_models import Empresa, Usuario
from app.services.pg_connection import get_pg_connection
from app.config import settings

router = APIRouter()

# ── Esquema de las tablas principales del ERP (para el contexto de GPT) ──────
DB_SCHEMA = """
Base de datos PostgreSQL del ERP de SOLBA (empresa mayorista de alimentación).
IMPORTANTE: Todas las consultas deben ser SOLO SELECT, nunca INSERT/UPDATE/DELETE.

Tablas principales:

ventas_cabeceras (alias: vc)
  - id (INT, PK), serie (TEXT), numero (INT), fecha (DATE), fechafin (DATE)
  - tipodoc: 8=Factura, 4=Albarán pendiente, 3=Albarán, 1=Presupuesto
  - cli_codigo (INT) — código cliente (NO usar 'cliente' ni 'cod_cliente')
  - cli_nombre (TEXT) — nombre cliente desnormalizado en cabecera
  - agente (INT → agentes.codigo)
  - baseimpo1, baseimpo2, baseimpo3 (NUMERIC) — bases imponibles
  - iva1, iva2, iva3 (NUMERIC) — importes de IVA
  - piva1, piva2, piva3 (NUMERIC) — porcentajes de IVA
  - rec1, rec2, rec3 (NUMERIC) — recargo de equivalencia
  - irpf (NUMERIC), total (NUMERIC) — total con IVA incluido
  - fpago (TEXT) — forma de pago
  - descripcion (TEXT), observaciones (TEXT)

ventas_lineas (alias: vl)
  - id (INT, PK), idcab (INT, FK → ventas_cabeceras.id)  ← FK es idcab
  - orden (INT)
  - referencia (TEXT → articulos.referencia)  ← NO usar 'articulo'
  - descripcion (TEXT) — descripción de la línea
  - unidades (NUMERIC)  ← NO usar 'cantidad'
  - precio (NUMERIC), pdto1, pdto2, pdto3 (NUMERIC), descuento (NUMERIC)
  - importe (NUMERIC) — importe de la línea (precio * unidades con descuento)
  - coste (NUMERIC) — coste unitario
  - piva (NUMERIC) — porcentaje IVA de la línea

articulos (alias: a)
  - referencia (TEXT, PK)  ← PK es texto, NO usar 'articulo' (INT)
  - nombre (TEXT)  ← campo nombre, NO usar 'descripcion'
  - familia (INT → familias.codigo)
  - pventa (NUMERIC) — precio de venta, coste (NUMERIC)

familias (alias: f)
  - codigo (INT, PK)  ← PK es 'codigo', NO usar 'familia' (INT)
  - nombre (TEXT)  ← campo nombre, NO usar 'descripcion'

clientes (alias: c)
  - codigo (INT, PK)  ← PK es 'codigo', NO usar 'cliente' (INT)
  - nombre (TEXT), alias (TEXT), cif (TEXT)
  - direccion (TEXT), localidad (TEXT), cpostal (TEXT)
  - telefono1 (TEXT), email (TEXT)
  - agente (INT → agentes.codigo), fpago (TEXT), observaciones (TEXT)

agentes (alias: a)
  - codigo (INT, PK)  ← PK es 'codigo', NO usar 'agente' (INT)
  - nombre (TEXT), cif (TEXT)
  - direccion (TEXT), localidad (TEXT), cpostal (TEXT)
  - telefono1 (TEXT), telefono2 (TEXT), email (TEXT), observaciones (TEXT)
  - baja (BOOL)

vencimientos (alias: v)
  - id (INT, PK), idcab (INT → ventas_cabeceras.id o compras_cabeceras.id)
  - clipro (INT) — código cliente o proveedor
  - fecha (DATE) — fecha de vencimiento
  - fechacobro (DATE) — fecha real de cobro/pago (NULL si pendiente)
  - importe (NUMERIC)
  - tipo: 0=cobro cliente, 1=pago proveedor
  - situacion: 0=pendiente, distinto de 0=cobrado/pagado
  - cajabanco (INT): 0=caja, 1=banco
  - tipocobro (INT)

compras_cabeceras (alias: cc)
  - id (INT, PK), serie (TEXT), numero (INT), fecha (DATE), tipodoc (INT)
  - pro_codigo (INT) — código proveedor
  - pro_nombre (TEXT) — nombre proveedor desnormalizado
  - baseimpo1, baseimpo2, baseimpo3, iva1, iva2, total (NUMERIC)

compras_lineas (alias: cl)
  - idcab (INT, FK → compras_cabeceras.id), orden (INT)
  - referencia (TEXT → articulos.referencia), descripcion (TEXT)
  - unidades (NUMERIC), precio (NUMERIC), importe (NUMERIC), coste (NUMERIC)

proveedores (alias: p)
  - codigo (INT, PK), nombre (TEXT), alias (TEXT), cif (TEXT)
  - direccion (TEXT), localidad (TEXT), cpostal (TEXT)
  - telefono1 (TEXT), email (TEXT), fpago (TEXT), observaciones (TEXT)

JOINS correctos (MUY IMPORTANTE):
  ventas_lineas → ventas_cabeceras:    JOIN ventas_cabeceras vc ON vl.idcab = vc.id
  ventas_lineas → articulos:           LEFT JOIN articulos a ON vl.referencia = a.referencia
  articulos → familias:                LEFT JOIN familias f ON a.familia = f.codigo
  ventas_cabeceras → clientes:         LEFT JOIN clientes c ON vc.cli_codigo = c.codigo
  ventas_cabeceras → agentes:          LEFT JOIN agentes a ON vc.agente = a.codigo
  vencimientos → ventas_cabeceras:     JOIN ventas_cabeceras vc ON v.idcab = vc.id
  compras_lineas → compras_cabeceras:  JOIN compras_cabeceras cc ON cl.idcab = cc.id

SEMÁNTICA DEL NEGOCIO (MUY IMPORTANTE — SOLBA es mayorista que VENDE a clientes y COMPRA a proveedores):
  - "lo que ha comprado/gastado un CLIENTE" → usar ventas_cabeceras (son nuestras ventas A ellos)
  - "lo que hemos comprado a un PROVEEDOR" → usar compras_cabeceras
  - "ventas" siempre = ventas_cabeceras con tipodoc = 8
  - "compras" siempre = compras_cabeceras con tipodoc = 8
  - "cobros pendientes" = vencimientos tipo=0 situacion=0 (clientes que nos deben)
  - "pagos pendientes" = vencimientos tipo=1 situacion=0 (lo que debemos a proveedores)

BÚSQUEDA DE NOMBRES:
  - Siempre usar ILIKE '%nombre%' (mayúsculas/minúsculas indiferente) — NUNCA usar = exacto
  - Ejemplo: WHERE vc.cli_nombre ILIKE '%kalima%' o WHERE c.nombre ILIKE '%kalima%'

NOTAS:
- Facturas de venta: tipodoc = 8
- Albaranes pendientes de facturar: tipodoc IN (3,4) AND fechafin IS NULL
- Cobros pendientes de clientes: tipo = 0 AND situacion = 0
- Pagos pendientes a proveedores: tipo = 1 AND situacion = 0
- Fecha de hoy: CURRENT_DATE
- Beneficio de una línea: vl.importe - (vl.coste * vl.unidades)
- Para importes totales de un documento usar ventas_cabeceras.total
- Limitar resultados con LIMIT 20 salvo que el usuario pida más

ARITMÉTICA DE FECHAS EN POSTGRESQL (MUY IMPORTANTE):
  CORRECTO:   vc.fecha >= CURRENT_DATE - INTERVAL '30 days'
  CORRECTO:   vc.fecha >= CURRENT_DATE - INTERVAL '1 year'
  CORRECTO:   vc.fecha >= DATE_TRUNC('month', CURRENT_DATE)
  CORRECTO:   vc.fecha >= DATE_TRUNC('year', CURRENT_DATE)
  CORRECTO:   vc.fecha >= MAKE_DATE(2025, 1, 1)
  INCORRECTO: CURRENT_DATE - 30  (no usar enteros con fechas)
  INCORRECTO: CURRENT_DATE - EXTRACT(...)  (EXTRACT devuelve double precision, incompatible con DATE)
  INCORRECTO: DATEADD(...)  (no existe en PostgreSQL, usar INTERVAL)
  Para el mes actual: EXTRACT(MONTH FROM vc.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
                  AND EXTRACT(YEAR FROM vc.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
"""

class ChatRequest(BaseModel):
    pregunta: str
    local_id: Optional[int] = None

class ChatResponse(BaseModel):
    respuesta: str
    sql_ejecutado: Optional[str] = None
    error: Optional[str] = None


def _get_claude_client():
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=500, detail="API key de Anthropic no configurada")
    try:
        import anthropic
        import httpx
        # Ignorar verificación SSL por el proxy corporativo
        http_client = httpx.Client(verify=False)
        return anthropic.Anthropic(api_key=settings.anthropic_api_key, http_client=http_client)
    except ImportError:
        raise HTTPException(status_code=500, detail="Librería anthropic no instalada")


def _run_sql(conn, sql: str) -> list[dict]:
    """Ejecuta una SELECT y devuelve lista de dicts. Lanza error si no es SELECT."""
    sql_clean = sql.strip().lstrip(";").strip()
    first_word = sql_clean.split()[0].upper() if sql_clean else ""
    if first_word != "SELECT":
        raise ValueError(f"Solo se permiten consultas SELECT, recibido: {first_word}")
    cur = conn.cursor()
    cur.execute(sql_clean)
    rows = cur.fetchall()
    # psycopg2 RealDictCursor devuelve RealDictRow → convertir a dict normal
    return [dict(r) for r in rows]


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    current_user: Usuario = Depends(get_current_user),
    empresa: Empresa = Depends(get_empresa_from_local),
):
    if not body.pregunta or not body.pregunta.strip():
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía")

    client = _get_claude_client()

    # ── Paso 1: Claude genera el SQL ─────────────────────────────────────────
    sql_prompt = f"""Eres un experto en SQL para PostgreSQL del ERP de SOLBA, empresa mayorista de alimentación en España.

REGLAS CRÍTICAS DE NEGOCIO:
1. SOLBA VENDE a clientes → esas ventas están en ventas_cabeceras / ventas_lineas
2. "cuánto ha comprado/gastado/pedido un CLIENTE" = cuánto le hemos VENDIDO = usar ventas_cabeceras con cli_codigo/cli_nombre
3. NUNCA uses compras_cabeceras para preguntas sobre clientes — compras_cabeceras es solo para proveedores
4. Para buscar por nombre SIEMPRE usar ILIKE '%texto%' (nunca = exacto)
5. Para fechas usar INTERVAL o DATE_TRUNC, nunca restar enteros a fechas

EJEMPLOS de preguntas frecuentes y su SQL correcto:

P: ¿Cuánto ha comprado el cliente KALIMA este año?
SQL: SELECT SUM(vc.total) AS total_comprado FROM ventas_cabeceras vc WHERE vc.cli_nombre ILIKE '%kalima%' AND EXTRACT(YEAR FROM vc.fecha) = EXTRACT(YEAR FROM CURRENT_DATE) AND vc.tipodoc = 8

P: ¿Qué clientes tienen importe pendiente de cobro?
SQL: SELECT vc.cli_nombre, SUM(v.importe) AS pendiente FROM vencimientos v JOIN ventas_cabeceras vc ON v.idcab = vc.id WHERE v.tipo = 0 AND v.situacion = 0 GROUP BY vc.cli_nombre ORDER BY pendiente DESC LIMIT 20

P: ¿Cuáles son las ventas del mes actual?
SQL: SELECT COALESCE(SUM(vc.total),0) AS total_ventas, COUNT(*) AS num_facturas FROM ventas_cabeceras vc WHERE vc.tipodoc = 8 AND DATE_TRUNC('month', vc.fecha) = DATE_TRUNC('month', CURRENT_DATE)

P: ¿Cuánto hemos comprado al proveedor LECHE PASCUAL este año?
SQL: SELECT SUM(cc.total) AS total_comprado FROM compras_cabeceras cc WHERE cc.pro_nombre ILIKE '%pascual%' AND EXTRACT(YEAR FROM cc.fecha) = EXTRACT(YEAR FROM CURRENT_DATE) AND cc.tipodoc = 8

P: ¿Cuál es el artículo más vendido este año? / dime el nombre del artículo más vendido
SQL: SELECT COALESCE(a.nombre, vl.descripcion, vl.referencia) AS nombre_articulo, vl.referencia, SUM(vl.unidades) AS total_unidades, SUM(vl.importe) AS total_importe FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != '' WHERE vc.tipodoc = 8 AND EXTRACT(YEAR FROM vc.fecha) = EXTRACT(YEAR FROM CURRENT_DATE) GROUP BY COALESCE(a.nombre, vl.descripcion, vl.referencia), vl.referencia ORDER BY total_importe DESC LIMIT 10

P: ¿Top 5 artículos más vendidos este año por importe?
SQL: SELECT COALESCE(a.nombre, vl.descripcion, vl.referencia) AS nombre_articulo, vl.referencia, SUM(vl.unidades) AS total_unidades, SUM(vl.importe) AS total_importe FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id LEFT JOIN articulos a ON vl.referencia = a.referencia AND vl.referencia != '' WHERE vc.tipodoc = 8 AND EXTRACT(YEAR FROM vc.fecha) = EXTRACT(YEAR FROM CURRENT_DATE) GROUP BY COALESCE(a.nombre, vl.descripcion, vl.referencia), vl.referencia ORDER BY total_importe DESC LIMIT 5

P: ¿Qué familia de productos vendemos más?
SQL: SELECT COALESCE(f.nombre, 'Sin familia') AS familia, SUM(vl.importe) AS total_importe FROM ventas_lineas vl JOIN ventas_cabeceras vc ON vl.idcab = vc.id LEFT JOIN articulos a ON vl.referencia = a.referencia LEFT JOIN familias f ON a.familia = f.codigo WHERE vc.tipodoc = 8 AND EXTRACT(YEAR FROM vc.fecha) = EXTRACT(YEAR FROM CURRENT_DATE) GROUP BY COALESCE(f.nombre, 'Sin familia') ORDER BY total_importe DESC LIMIT 10

REGLA CRÍTICA PARA ARTÍCULOS: Siempre usar COALESCE(a.nombre, vl.descripcion, vl.referencia) AS nombre_articulo para obtener el nombre visible. Siempre agrupar por ese campo Y por vl.referencia. Nunca devolver solo SUM sin el nombre del artículo.

Esquema de base de datos:
{DB_SCHEMA}

Genera SOLO el SQL (sin explicaciones, sin markdown, sin bloques de código) para responder a esta pregunta:
"{body.pregunta}"

Responde ÚNICAMENTE con la consulta SQL, nada más."""

    try:
        sql_resp = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            system="Eres un experto en SQL para PostgreSQL. Responde ÚNICAMENTE con la consulta SQL, sin explicaciones, sin markdown, sin bloques de código.",
            messages=[{"role": "user", "content": sql_prompt}],
        )
        sql_generado = sql_resp.content[0].text.strip()
        # Limpiar posibles bloques markdown
        if sql_generado.startswith("```"):
            lines = sql_generado.split("\n")
            sql_generado = "\n".join(
                l for l in lines if not l.startswith("```")
            ).strip()
    except Exception as e:
        return ChatResponse(
            respuesta="No pude generar la consulta. Inténtalo de nuevo.",
            error=str(e)
        )

    # ── Paso 2: Ejecutar el SQL ──────────────────────────────────────────────
    conn = None
    try:
        conn = get_pg_connection(empresa)
        resultados = _run_sql(conn, sql_generado)
    except ValueError as e:
        return ChatResponse(
            respuesta="La IA intentó ejecutar una operación no permitida.",
            sql_ejecutado=sql_generado,
            error=str(e)
        )
    except Exception as e:
        # Si el SQL falla, pedimos a GPT que lo corrija con el error concreto
        error_msg = str(e)
        fix_prompt = f"""El siguiente SQL falló en PostgreSQL con este error:
Error: {error_msg}

SQL que falló:
{sql_generado}

Esquema:
{DB_SCHEMA}

Corrige el SQL para que funcione en PostgreSQL. Responde ÚNICAMENTE con el SQL corregido, sin explicaciones ni markdown."""
        try:
            fix_resp = client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=1024,
                system="Eres un experto en SQL para PostgreSQL. Responde ÚNICAMENTE con la consulta SQL corregida, sin explicaciones ni markdown.",
                messages=[{"role": "user", "content": fix_prompt}],
            )
            sql_corregido = fix_resp.content[0].text.strip()
            if sql_corregido.startswith("```"):
                lines = sql_corregido.split("\n")
                sql_corregido = "\n".join(l for l in lines if not l.startswith("```")).strip()
            sql_generado = sql_corregido
            conn2 = get_pg_connection(empresa)
            try:
                resultados = _run_sql(conn2, sql_corregido)
            finally:
                conn2.close()
        except Exception as e2:
            return ChatResponse(
                respuesta=f"No pude obtener los datos incluso tras corregir la consulta.",
                sql_ejecutado=sql_generado,
                error=str(e2)
            )
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # ── Paso 3: GPT interpreta los resultados ────────────────────────────────
    if not resultados:
        datos_texto = "La consulta no devolvió resultados."
    else:
        # Limitar a 50 filas para no saturar el contexto
        datos_texto = json.dumps(resultados[:50], ensure_ascii=False, default=str)

    interpretacion_prompt = f"""El usuario preguntó: "{body.pregunta}"

Se ejecutó esta consulta SQL:
{sql_generado}

Y se obtuvo este resultado:
{datos_texto}

Responde al usuario de forma clara, concisa y en español. 
Si hay números monetarios, usa el símbolo €. 
Si no hay datos, explícalo brevemente.
No menciones el SQL ni detalles técnicos, habla directamente de los datos."""

    try:
        respuesta_resp = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            system="Eres un asistente de negocio para la empresa SOLBA. Responde en español de forma clara y concisa, usando € para importes. No menciones SQL ni detalles técnicos.",
            messages=[{"role": "user", "content": interpretacion_prompt}],
        )
        respuesta_final = respuesta_resp.content[0].text.strip()
    except Exception as e:
        # Si falla la interpretación, devuelve los datos en crudo
        respuesta_final = f"Datos obtenidos:\n{datos_texto}"

    return ChatResponse(
        respuesta=respuesta_final,
        sql_ejecutado=sql_generado,
    )
