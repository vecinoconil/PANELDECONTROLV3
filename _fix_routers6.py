"""
Fix duplicated/unindented params in almacen.py and inventario.py.
Strategy: within each function signature (between 'def xxx(' and '):'),
deduplicate managed params and fix indentation.
"""
import re

ROUTERS = [
    r'C:\PANELDECONTROLV3\backend\app\routers\almacen.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\inventario.py',
    r'C:\PANELDECONTROLV3\backend\app\routers\contratos.py',
]

# Param signatures to manage (exact content, no indent)
CLEANUP_PARAMS = {
    'current_user: Usuario = Depends(get_current_user),',
    'session: Session = Depends(get_session),',
    'session: Session = Depends(get_session)',   # missing trailing comma
}

def fix_file(path):
    with open(path, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()
    
    result = []
    changes = 0
    seen_params = {}  # per-function tracking
    in_signature = False
    sig_start = -1
    
    i = 0
    while i < len(lines):
        line = lines[i]
        raw = line.rstrip('\r\n')
        stripped = raw.lstrip()
        indent_len = len(raw) - len(stripped)
        indent = ' ' * indent_len

        # Detect start of function signature
        if re.match(r'\s*def \w+\(', raw) and not raw.rstrip().endswith('):'):
            in_signature = True
            seen_params = {}
            result.append(line)
            i += 1
            continue

        # Detect end of function signature
        if in_signature and raw.rstrip() in ('):', '    ):'):
            in_signature = False
            result.append(line)
            i += 1
            continue

        if in_signature:
            param_content = stripped.rstrip(',')
            param_content_comma = stripped if stripped.endswith(',') else stripped + ','
            
            # Normalize session without comma
            if stripped == 'session: Session = Depends(get_session)':
                stripped = 'session: Session = Depends(get_session),'
                param_content = 'session: Session = Depends(get_session)'
                param_content_comma = 'session: Session = Depends(get_session),'
            
            if param_content_comma in CLEANUP_PARAMS or param_content in CLEANUP_PARAMS:
                # Check if we've already added this param (dedup)
                key = param_content_comma.rstrip(',')
                if key in seen_params:
                    changes += 1
                    i += 1
                    continue
                seen_params[key] = True
                # Ensure 4-space indent
                newline_end = line[len(line.rstrip('\r\n')):]
                result.append('    ' + param_content_comma + newline_end)
                i += 1
                continue
            else:
                seen_params[stripped.rstrip(',')] = True
        
        result.append(line)
        i += 1
    
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.writelines(result)
    print(f'Fixed {changes} duplicate/invalid param lines in: {path}')


for router in ROUTERS:
    fix_file(router)
print('Done.')
