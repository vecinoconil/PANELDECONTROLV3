@echo off
setlocal enabledelayedexpansion
title Panel de Gestion V3 - Servidor
cd /d %~dp0

:: 1. Instalar dependencias Python
echo.
echo [1/3] Instalando dependencias Python...
pip install -r backend\requirements.txt --quiet
if errorlevel 1 (
  echo ERROR: Fallo la instalacion de dependencias Python.
  pause
  exit /b 1
)

:: 2. Instalar dependencias Node y build frontend
echo.
echo [2/3] Construyendo frontend...
cd frontend
call npm install
call npm run build
cd ..

:: 3. Arrancar servidor
echo.
echo [3/3] Arrancando servidor en puerto 8000...
echo.
echo    http://localhost:8000
echo.
cd backend
python run.py

pause
