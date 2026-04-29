@echo off
setlocal enabledelayedexpansion
title Panel de Gestion V3 - Servidor
cd /d %~dp0

:: ── Python venv ──────────────────────────────────────────────────────────────
set VENV=%~dp0backend\.venv
set PYTHON=%VENV%\Scripts\python.exe
set PIP=%VENV%\Scripts\pip.exe

if not exist "%PYTHON%" (
  echo Creando entorno virtual Python...
  py -m venv "%VENV%"
  if errorlevel 1 (
    echo ERROR: No se pudo crear el entorno virtual. Asegurate de tener Python instalado.
    pause
    exit /b 1
  )
)

:: 1. Instalar/actualizar dependencias Python
echo.
echo [1/3] Instalando dependencias Python...
"%PIP%" install -r backend\requirements.txt --quiet
if errorlevel 1 (
  echo ERROR: Fallo la instalacion de dependencias Python.
  pause
  exit /b 1
)

:: 2. Instalar dependencias Node y compilar frontend
echo.
echo [2/3] Construyendo frontend...
cd frontend
call npm install --silent
call npm run build
if errorlevel 1 (
  echo ERROR: Fallo el build del frontend.
  cd ..
  pause
  exit /b 1
)
cd ..

:: 3. Arrancar servidor
echo.
echo [3/3] Arrancando servidor en puerto 4000...
echo.
echo    http://localhost:4000
echo.
cd backend
"%PYTHON%" run.py

pause
