import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_db_and_tables, create_superadmin
from app.auth.router import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.admin import router as admin_router
from app.routers.informes import router as informes_router
from app.routers.contabilidad import router as contabilidad_router
from app.routers.autoventa import router as autoventa_router
from app.routers.inventario import router as inventario_router
from app.routers.almacen import router as almacen_router, recepcion_router
from app.routers.contratos import router as contratos_router
from app.routers.seguimiento import router as seguimiento_router
from app.routers.hojas_carga import router as hojas_carga_router
from app.routers.reparto import router as reparto_router
from app.routers.asistente import router as asistente_router
from app.routers.portal import router as portal_router
from app.routers.print_ticket import router as print_ticket_router
from app.routers.print_jobs import router as print_jobs_router


def _migrate_erp_databases():
    """Run ERP-side migrations on every configured empresa."""
    from sqlmodel import Session, select
    from app.models.app_models import Empresa
    from app.services.pg_connection import get_pg_connection
    with Session(engine := __import__('app.database', fromlist=['engine']).engine) as sess:
        empresas = sess.exec(select(Empresa)).all()
    for emp in empresas:
        try:
            conn = get_pg_connection(emp)
            cur = conn.cursor()
            cur.execute(
                "ALTER TABLE ventas_cabeceras ADD COLUMN IF NOT EXISTS firma TEXT"
            )
            conn.commit()
            conn.close()
        except Exception:
            pass  # Si la empresa no es accesible no bloquear el arranque


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    create_superadmin()
    _migrate_erp_databases()
    yield


app = FastAPI(
    title="Panel de Gestión V3 API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(admin_router,     prefix="/api/admin",     tags=["Admin"])
app.include_router(informes_router,       prefix="/api/informes",      tags=["Informes"])
app.include_router(contabilidad_router,   prefix="/api/contabilidad",  tags=["Contabilidad"])
app.include_router(autoventa_router,      prefix="/api/autoventa",     tags=["Autoventa"])
app.include_router(inventario_router,     prefix="/api/inventario",    tags=["Inventario"])
app.include_router(almacen_router,        prefix="/api/almacen",       tags=["Almacen"])
app.include_router(recepcion_router,      prefix="/api/almacen",       tags=["Recepcion"])
app.include_router(contratos_router,      prefix="/api/contratos",     tags=["Contratos"])
app.include_router(seguimiento_router,    prefix="/api/seguimiento",   tags=["Seguimiento"])
app.include_router(hojas_carga_router,    prefix="/api/almacen",       tags=["HojasCarga"])
app.include_router(reparto_router,        prefix="/api/almacen",       tags=["Reparto"])
app.include_router(asistente_router,      prefix="/api/asistente",     tags=["Asistente"])
app.include_router(portal_router,         prefix="/api/portal",        tags=["Portal"])
app.include_router(print_ticket_router,   prefix="/api/print",         tags=["Print"])
app.include_router(print_jobs_router)


@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Descargas (APK Android, etc.) ─────────────────────────────────────────────
_DOWNLOADS = os.path.abspath(os.path.join(os.path.dirname(__file__), "downloads"))
os.makedirs(_DOWNLOADS, exist_ok=True)

from fastapi.responses import FileResponse

@app.get("/downloads/solba-panel.apk", include_in_schema=False)
async def download_apk():
    apk_path = os.path.join(_DOWNLOADS, "solba-panel.apk")
    return FileResponse(
        apk_path,
        media_type="application/vnd.android.package-archive",
        filename="solba-panel.apk",
    )

# ── Serve compiled React frontend (SPA fallback) ──────────────────────────────
_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    from fastapi.responses import HTMLResponse

    @app.get("/clear-cache", include_in_schema=False)
    async def clear_cache():
        """Página de limpieza de service workers y cachés del navegador."""
        html = """<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Limpiando caché...</title></head><body>
<p>Limpiando service workers y caché del navegador...</p>
<script>
async function clean() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
  }
  window.location.replace('/');
}
clean();
</script></body></html>"""
        return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            # sw.js y workbox-*.js nunca deben cachearse: el navegador debe
            # detectar inmediatamente cualquier cambio en el service worker
            if full_path in ("sw.js", "registerSW.js") or full_path.startswith("workbox-"):
                return FileResponse(candidate, headers={"Cache-Control": "no-store, no-cache, must-revalidate"})
            return FileResponse(candidate)
        # index.html nunca debe cachearse
        return FileResponse(
            os.path.join(_DIST, "index.html"),
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
