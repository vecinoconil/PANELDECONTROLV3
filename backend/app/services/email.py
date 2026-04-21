import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = "smtp.ionos.es"
SMTP_PORT = 465
SMTP_USER = "solbabi@solba.com"
SMTP_PASS = "Solba2012@"
APP_URL = "https://panelv3.solba.com"


def _send(to: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_USER
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx) as smtp:
        smtp.login(SMTP_USER, SMTP_PASS)
        smtp.send_message(msg)


def send_credentials(to: str, nombre: str, password: str) -> None:
    subject = "Tus credenciales de acceso - SOLBA Panel V3"
    html = f"""\
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:520px;margin:auto;padding:24px">
  <h2 style="color:#0056b3;margin-bottom:8px">SOLBA Panel V3</h2>
  <p>Hola <strong>{nombre}</strong>,</p>
  <p>Aquí tienes tus credenciales para acceder a la plataforma:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
    <tr>
      <td style="padding:10px 12px;font-weight:bold;background:#f4f6f9;border:1px solid #dde3ec;width:38%">Enlace de acceso</td>
      <td style="padding:10px 12px;border:1px solid #dde3ec">
        <a href="{APP_URL}" style="color:#0056b3">{APP_URL}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 12px;font-weight:bold;background:#f4f6f9;border:1px solid #dde3ec">Usuario</td>
      <td style="padding:10px 12px;border:1px solid #dde3ec">{to}</td>
    </tr>
    <tr>
      <td style="padding:10px 12px;font-weight:bold;background:#f4f6f9;border:1px solid #dde3ec">Contraseña</td>
      <td style="padding:10px 12px;border:1px solid #dde3ec;font-family:monospace">{password}</td>
    </tr>
  </table>
  <p style="color:#888;font-size:12px;margin-top:16px">Si no solicitaste este acceso, ignora este mensaje.</p>
</body>
</html>"""
    _send(to, subject, html)


def send_password_recovery(to: str, nombre: str, password: str) -> None:
    subject = "Recuperación de contraseña - SOLBA Panel V3"
    html = f"""\
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:520px;margin:auto;padding:24px">
  <h2 style="color:#0056b3;margin-bottom:8px">Recuperación de contraseña</h2>
  <p>Hola <strong>{nombre}</strong>,</p>
  <p>Has solicitado recuperar tu contraseña de acceso:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
    <tr>
      <td style="padding:10px 12px;font-weight:bold;background:#f4f6f9;border:1px solid #dde3ec;width:38%">Enlace de acceso</td>
      <td style="padding:10px 12px;border:1px solid #dde3ec">
        <a href="{APP_URL}" style="color:#0056b3">{APP_URL}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 12px;font-weight:bold;background:#f4f6f9;border:1px solid #dde3ec">Usuario</td>
      <td style="padding:10px 12px;border:1px solid #dde3ec">{to}</td>
    </tr>
    <tr>
      <td style="padding:10px 12px;font-weight:bold;background:#f4f6f9;border:1px solid #dde3ec">Contraseña</td>
      <td style="padding:10px 12px;border:1px solid #dde3ec;font-family:monospace">{password}</td>
    </tr>
  </table>
  <p style="color:#888;font-size:12px;margin-top:16px">Si no solicitaste este correo, ignóralo.</p>
</body>
</html>"""
    _send(to, subject, html)
