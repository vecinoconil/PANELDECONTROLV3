# Panel de Control V3 — Contexto para GitHub Copilot

## ¿Qué es este proyecto?
Panel de gestión interno de la empresa **Solba**. Accede a una base de datos PostgreSQL del ERP y expone datos de ventas, cobros, artículos, agentes, contabilidad y autoventa a través de una API REST + SPA React.

## Estructura
```
PANELDECONTROLV3/
├── backend/          # FastAPI + SQLModel (Python)
│   ├── app/
│   │   ├── config.py         # Settings (lee .env)
│   │   ├── database.py       # SQLite local (auth/users)
│   │   ├── schemas.py        # Pydantic schemas compartidos
│   │   ├── auth/             # JWT login/refresh
│   │   ├── models/           # SQLModel ORM models
│   │   ├── routers/          # dashboard, admin, informes, contabilidad, autoventa
│   │   └── services/         # pg_connection (PostgreSQL ERP), email
│   └── run.py                # arranca uvicorn en puerto 4000
├── frontend/         # React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/            # Dashboard, Login, admin/, autoventa/, contabilidad/, informes/
│       ├── components/       # FichaCliente, FichaAgente, FichaArticulo, FichaProveedor, Layout, Sidebar
│       ├── api/client.ts     # axios con interceptor JWT
│       └── auth/             # AuthContext, ProtectedRoute
├── .github/
│   └── copilot-instructions.md  # este archivo
├── start.bat         # arrancar todo (crea venv, npm build, uvicorn)
└── .gitignore        # excluye .venv, node_modules, frontend/dist, .env
```

## Dos bases de datos
1. **SQLite local** (`backend/panel.db`) — usuarios de la app, configuración, empresas. Gestionado con SQLModel.
2. **PostgreSQL remoto** (`core.solba.com:5026/PANELCONTROLV3`) — datos del ERP (ventas, cobros, artículos, etc.). Solo lectura mediante consultas raw en `services/pg_connection.py`.

## Stack técnico
- **Backend:** Python 3.14, FastAPI, SQLModel, uvicorn, JWT (python-jose), psycopg2
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Axios, React Router v6
- **Auth:** JWT Bearer token + refresh token en cookie httpOnly

## Cómo arrancar (cualquier máquina)
```
git pull
start.bat         # crea venv si no existe, instala deps, compila frontend, arranca en :4000
```

## Cómo publicar cambios
```
git add .
git commit -m "descripción"
git push
# en producción: git pull + start.bat
```

## Convenciones
- Los endpoints de la API van siempre bajo `/api/...`
- El frontend se compila en `frontend/dist/` (ignorado en git, se genera con `npm run build`)
- El `.env` no está en git; cada máquina tiene el suyo (ver `app/config.py` para las variables)
- Variables de entorno requeridas: `DATABASE_URL`, `SECRET_KEY`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`
- Rutas frontend: React Router SPA, el fallback lo sirve FastAPI desde `frontend/dist/index.html`
