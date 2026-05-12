$routers = @(
    "C:\PANELDECONTROLV3\backend\app\routers\contratos.py",
    "C:\PANELDECONTROLV3\backend\app\routers\informes.py",
    "C:\PANELDECONTROLV3\backend\app\routers\dashboard.py",
    "C:\PANELDECONTROLV3\backend\app\routers\autoventa.py",
    "C:\PANELDECONTROLV3\backend\app\routers\contabilidad.py",
    "C:\PANELDECONTROLV3\backend\app\routers\almacen.py",
    "C:\PANELDECONTROLV3\backend\app\routers\inventario.py"
)

foreach ($f in $routers) {
    $content = [System.IO.File]::ReadAllText($f)

    # Paso 1: Insertar empresa: Empresa = Depends(get_empresa_from_local),
    # justo ANTES de cada linea que empieza con "    current_user: Usuario = Depends(get_current_user),"
    # Solo si NO esta ya insertado (evitar duplicados)
    $lines = $content -split "`n"
    $result = [System.Collections.Generic.List[string]]::new()
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        # Si la linea es la param current_user y la linea anterior NO es ya get_empresa_from_local
        if ($line -match '^\s{4}current_user: Usuario = Depends\(get_current_user\),' -and
            ($result.Count -eq 0 -or -not ($result[$result.Count-1] -match 'get_empresa_from_local'))) {
            $indent = '    '
            $result.Add($indent + 'empresa: Empresa = Depends(get_empresa_from_local),')
        }
        $result.Add($line)
    }
    
    $content = $result -join "`n"

    # Paso 2: Eliminar la linea "    empresa = _get_empresa(current_user, session)"
    $content = [System.Text.RegularExpressions.Regex]::Replace(
        $content,
        '\n    empresa = _get_empresa\(current_user, session\)',
        ''
    )

    [System.IO.File]::WriteAllText($f, $content, [System.Text.Encoding]::UTF8)
    Write-Host "OK: $f"
}
Write-Host "Listo."
