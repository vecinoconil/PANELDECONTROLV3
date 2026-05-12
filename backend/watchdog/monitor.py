"""
Watchdog principal — SOLBA Panel V3
====================================
Comprueba que el sistema está operativo simulando un login real.
Si falla, intenta repararlo (restart). Si la reparación tampoco funciona,
envía alertas por email y Telegram.

Uso:
    python monitor.py

Normalmente lo ejecuta Windows Task Scheduler cada 10 minutos.
"""
import urllib.request
import urllib.parse
import json
import sys
import os
import datetime

# ── Rutas ────────────────────────────────────────────────────────────────────
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)

from notify import alert         # type: ignore
from repair import attempt_repair  # type: ignore

# ── Configuración ─────────────────────────────────────────────────────────────
BASE_URL    = "http://localhost:4000"
LOGIN_URL   = f"{BASE_URL}/api/auth/login"
TIMEOUT     = 15   # segundos por petición HTTP

# Credenciales de comprobación (superadmin — solo se usan localmente)
CHECK_EMAIL    = "admin@solba.com"
CHECK_PASSWORD = "padrino75"

# Log de estado
LOG_FILE = os.path.join(THIS_DIR, "watchdog.log")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _ts() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _log(msg: str) -> None:
    line = f"[{_ts()}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        # Rotar log si supera 500 KB
        if os.path.getsize(LOG_FILE) > 500_000:
            os.replace(LOG_FILE, LOG_FILE + ".old")
    except Exception:
        pass


def _try_login() -> tuple[bool, str]:
    """
    Intenta hacer login real.
    Devuelve (éxito: bool, mensaje: str).
    """
    try:
        payload = json.dumps({
            "email":    CHECK_EMAIL,
            "password": CHECK_PASSWORD
        }).encode()
        req = urllib.request.Request(
            LOGIN_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            if resp.status != 200:
                return False, f"HTTP {resp.status}"
            body = json.loads(resp.read())
            if "access_token" in body:
                return True, "OK"
            return False, f"Respuesta inesperada: {list(body.keys())}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return False, f"URLError: {e.reason}"
    except Exception as e:
        return False, f"Error: {e}"


# ── Flujo principal ───────────────────────────────────────────────────────────

def main() -> None:
    _log("=== Comprobación iniciada ===")

    ok, msg = _try_login()
    if ok:
        _log(f"Login OK — sistema operativo.")
        return

    # ── Primer fallo ─────────────────────────────────────────────────────────
    _log(f"Login FALLIDO ({msg}). Intentando autoreparación...")

    repaired = attempt_repair()
    if not repaired:
        _log("No se pudo lanzar start.bat. Enviando alerta.")
        alert(
            "🚨 Panel V3 CAÍDO — no se pudo reparar",
            f"Hora: {_ts()}\n"
            f"URL:  {LOGIN_URL}\n"
            f"Error original: {msg}\n\n"
            "start.bat no encontrado o no se pudo ejecutar.\n"
            "Intervención manual requerida."
        )
        sys.exit(1)

    # ── Verificación tras reparación ─────────────────────────────────────────
    ok2, msg2 = _try_login()
    if ok2:
        _log("Login OK tras reparación — sistema restaurado.")
        alert(
            "✅ Panel V3 restaurado automáticamente",
            f"Hora: {_ts()}\n"
            f"URL:  {LOGIN_URL}\n\n"
            f"El sistema estaba caído ({msg}) pero se ha reiniciado con éxito.\n"
            "No es necesaria ninguna acción."
        )
        return

    # ── Reparación fallida — alerta crítica ──────────────────────────────────
    _log(f"Reparación fallida. Login sigue sin funcionar ({msg2}). Enviando alerta crítica.")
    alert(
        "🚨 Panel V3 CAÍDO — reparación automática fallida",
        f"Hora: {_ts()}\n"
        f"URL:  {LOGIN_URL}\n\n"
        f"Error inicial:  {msg}\n"
        f"Error tras restart: {msg2}\n\n"
        "Se ejecutó start.bat pero el sistema no responde.\n"
        "Se requiere intervención manual urgente."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
