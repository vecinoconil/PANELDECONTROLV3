# install_watchdog.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Registra el watchdog de SOLBA Panel V3 como tarea programada de Windows.
# Ejecuta este script UNA VEZ como Administrador:
#
#   cd C:\PANELDECONTROLV3\backend\watchdog
#   powershell -ExecutionPolicy Bypass -File install_watchdog.ps1
#
# Para desinstalarlo:
#   Unregister-ScheduledTask -TaskName "SOLBA-Watchdog" -Confirm:$false
# ─────────────────────────────────────────────────────────────────────────────

$TaskName   = "SOLBA-Watchdog"
$ScriptPath = "$PSScriptRoot\monitor.py"
$PythonExe  = "C:\PANELDECONTROLV3\backend\.venv\Scripts\python.exe"
$LogDir     = $PSScriptRoot

# Verificar que existe el intérprete Python del venv
if (-not (Test-Path $PythonExe)) {
    Write-Error "No se encontró: $PythonExe`nEjecuta start.bat primero para crear el venv."
    exit 1
}

# Eliminar tarea anterior si existe
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarea anterior '$TaskName' eliminada."
}

# Acción: ejecutar monitor.py con el Python del venv
$Action = New-ScheduledTaskAction `
    -Execute  $PythonExe `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $PSScriptRoot

# Disparador: cada 10 minutos, comenzando ya
$Trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 10) `
    -Once `
    -At (Get-Date)

# Configuración: ejecutar aunque no haya sesión iniciada, no expira
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -RestartCount 0 `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

# Principal: SYSTEM para que funcione sin usuario logado
$Principal = New-ScheduledTaskPrincipal `
    -UserId    "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel  Highest

Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $Action `
    -Trigger   $Trigger `
    -Settings  $Settings `
    -Principal $Principal `
    -Description "Vigila que SOLBA Panel V3 esté operativo y lo reinicia si cae." `
    | Out-Null

Write-Host ""
Write-Host "✅ Tarea '$TaskName' registrada correctamente." -ForegroundColor Green
Write-Host "   Se ejecutará cada 10 minutos usando: $PythonExe"
Write-Host "   Log en: $LogDir\watchdog.log"
Write-Host ""
Write-Host "Otras opciones útiles:"
Write-Host "  Ver log:      Get-Content '$LogDir\watchdog.log' -Tail 30"
Write-Host "  Ejecutar ya:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Desinstalar:  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
