"""
print_ticket.py — endpoint temporal para entregar bytes ESC/POS a RawBT.

Flujo:
  1. Frontend genera el bitmap ESC/POS (Uint8Array) en el navegador.
  2. POST /api/print/ticket  { bytes: base64 }  → devuelve { token: "uuid" }
  3. Frontend lanza  rawbt:http://HOST:4000/api/print/raw/{token}
  4. RawBT hace GET al endpoint, recibe application/octet-stream con los bytes.
  5. El token se elimina tras la primera descarga (uso único) o tras 60 s.
"""
import base64
import threading
import time
import uuid
from typing import Dict, Tuple

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()

# Almacén en memoria: token → (bytes, timestamp)
_store: Dict[str, Tuple[bytes, float]] = {}
_lock = threading.Lock()

# Limpieza periódica de tokens expirados (> 60 s)
def _cleanup():
    while True:
        time.sleep(30)
        now = time.time()
        with _lock:
            expired = [t for t, (_, ts) in _store.items() if now - ts > 60]
            for t in expired:
                del _store[t]

threading.Thread(target=_cleanup, daemon=True).start()


class TicketRequest(BaseModel):
    # Bytes ESC/POS codificados en base64 estándar (btoa del frontend)
    data: str


@router.post("/ticket")
def store_ticket(body: TicketRequest):
    """Almacena los bytes ESC/POS y devuelve un token de un solo uso."""
    try:
        raw = base64.b64decode(body.data)
    except Exception:
        raise HTTPException(status_code=400, detail="base64 inválido")

    token = str(uuid.uuid4()).replace("-", "")
    with _lock:
        _store[token] = (raw, time.time())

    return {"token": token}


@router.get("/raw/{token}")
def get_raw(token: str):
    """Sirve los bytes ESC/POS para que RawBT los descargue directamente."""
    with _lock:
        entry = _store.pop(token, None)

    if entry is None:
        raise HTTPException(status_code=404, detail="Token no encontrado o expirado")

    raw_bytes, _ = entry
    return Response(
        content=raw_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "inline"},
    )
