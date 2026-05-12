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

    # 1) Actualizar import de dependencies
    $content = $content.Replace(
        'from app.auth.dependencies import get_current_user, require_permiso',
        'from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso'
    )

    # 2) Eliminar la definicion completa de _get_empresa
    $old = @"
def _get_empresa(user: Usuario, session: Session) -> Empresa:
    if not user.empresa_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa asignada")
    empresa = session.get(Empresa, user.empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return empresa


"@
    $content = $content.Replace($old, '')

    # 3) Reemplazar llamadas empresa = _get_empresa(current_user, session)
    #    con empresa: Empresa = Depends(get_empresa_from_local) en el signature
    #    Patron: las 3 lineas al final del signature + primera linea del body
    $old2 = @"
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    empresa = _get_empresa(current_user, session)
"@
    $new2 = @"
    empresa: Empresa = Depends(get_empresa_from_local),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
"@
    $content = $content.Replace($old2, $new2)

    [System.IO.File]::WriteAllText($f, $content, [System.Text.Encoding]::UTF8)
    Write-Host "OK: $f"
}
Write-Host "Listo."
