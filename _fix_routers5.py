"""
Cleanly apply get_empresa_from_local to all router files.
For each file:
  1. Updates imports
  2. Removes _get_empresa definition
  3. Adds 'empresa: Empresa = Depends(get_empresa_from_local),' before
     'current_user: Usuario = Depends(get_current_user),' in each
     function signature, and removes 'empresa = _get_empresa(current_user, session)'
     from function bodies.
"""
import re

ROUTERS = [
    r'C:\PANELDECONTROLV3\backend\app\routers\contratos.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\informes.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\dashboard.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\autoventa.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\contabilidad.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\almacen.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\inventario.py',
]


def apply_changes(path):
    with open(path, 'r', encoding='utf-8-sig') as f:  # utf-8-sig removes BOM
        content = f.read()
    
    original = content
    changes = []

    # 1) Update import
    old_import = 'from app.auth.dependencies import get_current_user, require_permiso'
    new_import = 'from app.auth.dependencies import get_current_user, get_empresa_from_local, require_permiso'
    if old_import in content:
        content = content.replace(old_import, new_import)
        changes.append('import updated')
    else:
        # Already updated (e.g. remnant from previous run)
        pass

    # 2) Remove _get_empresa definition (exactly these 7 lines)
    old_def = (
        'def _get_empresa(user: Usuario, session: Session) -> Empresa:\n'
        '    if not user.empresa_id:\n'
        '        raise HTTPException(status_code=400, detail="Usuario sin empresa asignada")\n'
        '    empresa = session.get(Empresa, user.empresa_id)\n'
        '    if not empresa:\n'
        '        raise HTTPException(status_code=404, detail="Empresa no encontrada")\n'
        '    return empresa\n'
        '\n'
    )
    if old_def in content:
        content = content.replace(old_def, '')
        changes.append('_get_empresa def removed')
    # Also handle CRLF version
    old_def_crlf = old_def.replace('\n', '\r\n')
    if old_def_crlf in content:
        content = content.replace(old_def_crlf, '')
        changes.append('_get_empresa def (crlf) removed')

    # 3) Add empresa dep before current_user and remove body call
    # Process line by line to handle all cases properly
    lines = content.splitlines(keepends=True)
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.rstrip('\r\n')
        lstripped = stripped.lstrip()
        indent = stripped[:len(stripped) - len(lstripped)]

        # Case A: line is "    current_user: Usuario = Depends(get_current_user),"
        # Insert empresa before it (only if previous line is NOT already empresa dep)
        if (lstripped == 'current_user: Usuario = Depends(get_current_user),'
                and len(indent) == 4):
            # Check previous non-empty result line
            prev_lines = [l.rstrip('\r\n').strip() for l in result if l.strip()]
            prev = prev_lines[-1] if prev_lines else ''
            if 'get_empresa_from_local' not in prev:
                result.append(indent + 'empresa: Empresa = Depends(get_empresa_from_local),\n')
                changes.append(f'empresa dep added at line ~{i+1}')
        
        # Case B: line is "    empresa = _get_empresa(current_user, session)"
        # Skip this line
        if lstripped in ('empresa = _get_empresa(current_user, session)',
                         'empresa = _get_empresa(current_user, session)\n'):
            changes.append(f'_get_empresa call removed at line ~{i+1}')
            i += 1
            continue

        result.append(line)
        i += 1

    content = ''.join(result)

    if content != original:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
        print(f'  Changed ({len(changes)} ops): {", ".join(changes[:5])}{"..." if len(changes)>5 else ""}')
    else:
        print(f'  No changes needed')


for router in ROUTERS:
    print(f'\n{router}')
    apply_changes(router)

print('\nDone.')
