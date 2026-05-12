"""
Fix remaining concatenated param lines in routers.
Handles both:
  session: Session = ...),current_user: ...
  session: Session = ...),):    (closing paren)
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

PARAM_NAMES = [
    'empresa:',
    'current_user:',
    'session:',
    'anio:',
    'mes:',
    'q:',
    'tipo:',
]

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    result = []
    changes = 0

    for line in lines:
        # Check if line contains a concatenation: a param ending with ',' immediately
        # followed (no space) by another param name
        # e.g.: "    session: Session = Depends(get_session),current_user: ..."
        # or:   "    session: Session = Depends(get_session),):..."
        
        # Split on ",X" where X is a known param start or ")"
        parts_found = False
        
        # Detect concatenated params: something like "pname: Type = ...,pname2:"
        # We split on the pattern: "),identifier:" or "),"
        
        if re.search(r'Depends\([^)]+\),[a-zA-Z_]', line):
            # Split on "),identifier:" boundaries
            indent = line[:len(line) - len(line.lstrip())]
            new_lines = re.split(r'(?<=\)),(?=[a-zA-Z_])', line)
            if len(new_lines) > 1:
                # Re-add indent to all parts except first
                new_lines = [new_lines[0]] + [indent + p.lstrip() for p in new_lines[1:]]
                result.extend(new_lines)
                parts_found = True
                changes += 1
        
        if not parts_found:
            result.append(line)

    # Now deduplicate params: remove second occurrence of duplicate params
    # within function signatures
    content2 = '\n'.join(result)
    
    # Remove duplicate empresa param (4-space indented)
    for param_pattern in [
        r'    empresa: Empresa = Depends\(get_empresa_from_local\),\n    empresa: Empresa = Depends\(get_empresa_from_local\),',
        r'    current_user: Usuario = Depends\(get_current_user\),\n    current_user: Usuario = Depends\(get_current_user\),',
        r'    session: Session = Depends\(get_session\),\n    session: Session = Depends\(get_session\),',
    ]:
        while re.search(param_pattern, content2):
            content2 = re.sub(param_pattern, lambda m: m.group(0).split('\n')[0], content2)

    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content2)
    print(f'Fixed {changes} lines in: {path}')

for router in ROUTERS:
    fix_file(router)
print('Done.')
