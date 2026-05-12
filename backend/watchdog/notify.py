"""
Módulo de notificaciones para el watchdog.
Soporta Email (SMTP IONOS) y Telegram Bot.

Configuración en watchdog_config.py (mismo directorio):
    TELEGRAM_BOT_TOKEN = "123456:ABC-..."
    TELEGRAM_CHAT_ID   = "987654321"
    ALERT_EMAIL        = "tucorreo@solba.com"
"""
import smtplib
import ssl
import urllib.request
import urllib.parse
import json
import os
import sys

# ── Configuración SMTP (reutiliza los mismos datos que services/email.py) ──────
SMTP_HOST = "smtp.ionos.es"
SMTP_PORT = 465
SMTP_USER = "solbabi@solba.com"
SMTP_PASS = "Solba2012@"

# ── Configuración overrideable desde watchdog_config.py ───────────────────────
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)

try:
    import watchdog_config as _cfg  # type: ignore
    TELEGRAM_BOT_TOKEN: str = getattr(_cfg, "TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str   = getattr(_cfg, "TELEGRAM_CHAT_ID",   "")
    ALERT_EMAIL: str        = getattr(_cfg, "ALERT_EMAIL",        "")
except ImportError:
    TELEGRAM_BOT_TOKEN = ""
    TELEGRAM_CHAT_ID   = ""
    ALERT_EMAIL        = ""


def send_email(subject: str, body: str) -> None:
    """Envía un email de alerta al administrador."""
    if not ALERT_EMAIL:
        print("[notify] ALERT_EMAIL no configurado, se omite el email.")
        return
    try:
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_USER
        msg["To"]      = ALERT_EMAIL
        html = f"""\
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#c0392b">⚠️ SOLBA Panel V3 — Alerta de sistema</h2>
  <pre style="background:#f8f8f8;padding:16px;border-radius:4px;font-size:13px">{body}</pre>
  <p style="color:#888;font-size:11px;margin-top:16px">Mensaje automático del watchdog.</p>
</body>
</html>"""
        msg.attach(MIMEText(html, "html"))
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx) as smtp:
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.send_message(msg)
        print(f"[notify] Email enviado a {ALERT_EMAIL}")
    except Exception as e:
        print(f"[notify] Error enviando email: {e}")


def send_telegram(message: str) -> None:
    """Envía un mensaje de Telegram al chat configurado."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[notify] Telegram no configurado, se omite.")
        return
    try:
        import ssl as _ssl
        _ctx = _ssl.create_default_context()
        _ctx.check_hostname = False
        _ctx.verify_mode = _ssl.CERT_NONE

        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id": TELEGRAM_CHAT_ID,
            "text":    message,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=10, context=_ctx) as resp:
            result = json.loads(resp.read())
            if result.get("ok"):
                print("[notify] Telegram enviado.")
            else:
                print(f"[notify] Telegram respuesta inesperada: {result}")
    except Exception as e:
        print(f"[notify] Error enviando telegram: {e}")


def alert(subject: str, body: str) -> None:
    """Envía la alerta por todos los canales configurados."""
    telegram_msg = f"<b>⚠️ {subject}</b>\n\n<pre>{body}</pre>"
    send_email(subject, body)
    send_telegram(telegram_msg)
