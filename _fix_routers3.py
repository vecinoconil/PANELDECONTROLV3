"""
Fix concatenated parameter lines in router files.
Splits lines like:
    empresa: Empresa = Depends(get_empresa_from_local),    current_user: ...
into properly separated lines, and removes duplicate params.
"""
import re, os

ROUTERS = [
    r'C:\PANELDECONTROLV3\backend\app\routers\contratos.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\informes.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\dashboard.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\autoventa.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\contabilidad.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\almacen.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\inventario.py',
]

# These are the expected params we inject / manage
MANAGED_PARAMS = [
    'empresa: Empresa = Depends(get_empresa_from_local),',
    'current_user: Usuario = Depends(get_current_user),',
    'session: Session = Depends(get_session),',
]

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        indent = line[:len(line) - len(stripped)]

        # Check if this line has multiple params concatenated (multi-space between params)
        # Pattern: a line that has ), followed by spaces and another param or the next closing )
        # We detect it by looking for "), " inside a line that has function params
        if ('Depends(get_empresa_from_local),' in line or
            'Depends(get_current_user),' in line or
            'Depends(get_session),' in line) and len(line) > 120:
            # This is a concatenated line - split it
            # Use regex to split on boundaries like '),    param_name:' or '),current_user:'
            # First, normalize multi-spaces between params to single newline+indent
            # Find all param assignments in the line
            parts = re.split(r'(?<=,)\s{2,}', line)
            if len(parts) > 1:
                for part in parts:
                    result.append(part.rstrip())
                i += 1
                continue

        result.append(line)
        i += 1

    content = '\n'.join(result)

    # Now remove duplicate param lines within function signatures
    # A function signature goes from "def xxx(" to "):"
    # Find and deduplicate managed params
    for param in MANAGED_PARAMS:
        param_stripped = param.strip()
        # Remove duplicate occurrences of this param
        # Keep only the first occurrence within a function call
        # We'll do this by finding all indented occurrences
        pattern = r'( {4}' + re.escape(param_stripped) + r'\n)( {4}' + re.escape(param_stripped) + r'\n)+'
        content = re.sub(pattern, r'\1', content)

    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print(f'Fixed: {path}')

for router in ROUTERS:
    fix_file(router)
print('Done.')
