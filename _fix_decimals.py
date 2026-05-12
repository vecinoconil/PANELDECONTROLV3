import re

content = open('C:/PANELDECONTROLV3/frontend/src/pages/autoventa/Autoventa.tsx', encoding='utf-8').read()

# Replace all variants of toLocaleString with only minimumFractionDigits: 2
pattern = r"toLocaleString\('es-ES',\s*\{\s*minimumFractionDigits:\s*2\s*\}\)"
replacement = "toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })"

before = len(re.findall(pattern, content))
content = re.sub(pattern, replacement, content)
after = len(re.findall(pattern, content))
print(f'Reemplazados: {before}, restantes: {after}')

open('C:/PANELDECONTROLV3/frontend/src/pages/autoventa/Autoventa.tsx', 'w', encoding='utf-8').write(content)
print('OK')
