"""
Módulo de autoreparación del watchdog.
Mata el proceso uvicorn y relanza start.bat.
"""
import subprocess
import time
import os

# Raíz del proyecto (dos niveles arriba de backend/watchdog/)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
START_BAT = os.path.join(PROJECT_ROOT, "start.bat")

# Tiempo de espera (segundos) tras lanzar start.bat antes de verificar
BOOT_WAIT = 90


def _kill_uvicorn() -> None:
    """Termina todos los procesos uvicorn/python que usen el puerto 4000."""
    print("[repair] Buscando y terminando proceso en puerto 4000...")
    try:
        # Busca el PID que esté usando el puerto 4000
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.splitlines():
            if ":4000" in line and "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid.isdigit():
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True, timeout=5
                    )
                    print(f"[repair] Proceso PID {pid} terminado.")
    except Exception as e:
        print(f"[repair] Error al matar proceso: {e}")

    # También busca por nombre por si hay varios workers
    try:
        subprocess.run(
            ["taskkill", "/F", "/IM", "uvicorn.exe"],
            capture_output=True, timeout=5
        )
    except Exception:
        pass


def attempt_repair() -> bool:
    """
    Intenta reparar el servidor:
    1. Mata uvicorn
    2. Relanza start.bat en background
    3. Espera BOOT_WAIT segundos
    Devuelve True si consiguió lanzar el proceso.
    """
    print(f"[repair] Iniciando reparación automática...")
    _kill_uvicorn()
    time.sleep(3)

    if not os.path.isfile(START_BAT):
        print(f"[repair] ERROR: No se encuentra {START_BAT}")
        return False

    try:
        # Lanza start.bat en una nueva ventana (no bloqueante)
        subprocess.Popen(
            ["cmd", "/c", START_BAT],
            cwd=PROJECT_ROOT,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
        print(f"[repair] start.bat lanzado. Esperando {BOOT_WAIT}s para que arranque...")
        time.sleep(BOOT_WAIT)
        return True
    except Exception as e:
        print(f"[repair] Error al lanzar start.bat: {e}")
        return False
