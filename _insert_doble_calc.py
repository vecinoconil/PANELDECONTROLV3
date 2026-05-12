"""
Inserta DobleUnidadCalculatorModal entre CalculatorModal y Main Component
"""

path = r'C:\PANELDECONTROLV3\frontend\src\pages\autoventa\Autoventa.tsx'
with open(path, 'rb') as f:
    content = f.read()

# Insertion point: right after CalculatorModal closing brace, before Main Component comment
cm_start = content.find(b'function CalculatorModal(')
insert_pos = content.find(b'\r\n}\r\n\r\n//', cm_start)
insert_pos += len(b'\r\n}\r\n')   # put it right after the closing brace of CalculatorModal

print(f'Inserting at position {insert_pos}')
print(repr(content[insert_pos:insert_pos+60]))

new_component = (
    b'\r\n'
    b'// -- Doble Unidad Calculator Modal (sin lote) --------------------------\r\n'
    b'\r\n'
    b'function DobleUnidadCalculatorModal({\r\n'
    b'    unidadNombre,\r\n'
    b'    initialUds,\r\n'
    b'    initialGramos,\r\n'
    b'    onConfirm,\r\n'
    b'    onClose,\r\n'
    b'}: {\r\n'
    b'    unidadNombre: string\r\n'
    b'    initialUds: string\r\n'
    b'    initialGramos: string\r\n'
    b'    onConfirm: (uds: string, gramos: string) => void\r\n'
    b'    onClose: () => void\r\n'
    b'}) {\r\n'
    b'    const [uds, setUds] = useState(initialUds === \'0\' ? \'\' : initialUds)\r\n'
    b'    const [gramos, setGramos] = useState(initialGramos === \'0\' ? \'\' : initialGramos)\r\n'
    b'    const udsRef = useRef<HTMLInputElement>(null)\r\n'
    b'    useEffect(() => { udsRef.current?.focus() }, [])\r\n'
    b'\r\n'
    b'    const ok = (parseFloat(uds) || 0) > 0 && (parseFloat(gramos) || 0) > 0\r\n'
    b'\r\n'
    b'    return (\r\n'
    b'        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>\r\n'
    b'            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs p-4" onClick={e => e.stopPropagation()}>\r\n'
    b'                <div className="flex items-center justify-between mb-3">\r\n'
    b'                    <span className="text-sm font-semibold text-slate-700">Doble unidad \xc2\xb7 {unidadNombre}</span>\r\n'
    b'                    <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>\r\n'
    b'                </div>\r\n'
    b'                <div className="space-y-3 mb-4">\r\n'
    b'                    <div>\r\n'
    b'                        <label className="text-xs text-slate-500 font-medium block mb-1">Unidades</label>\r\n'
    b'                        <input\r\n'
    b'                            ref={udsRef}\r\n'
    b'                            type="number" min="0" step="0.001" inputMode="decimal"\r\n'
    b'                            className="w-full text-right text-lg font-bold border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"\r\n'
    b'                            value={uds} placeholder="0"\r\n'
    b'                            onChange={e => setUds(e.target.value)}\r\n'
    b'                        />\r\n'
    b'                    </div>\r\n'
    b'                    <div>\r\n'
    b'                        <label className="text-xs text-slate-500 font-medium block mb-1">{unidadNombre}</label>\r\n'
    b'                        <input\r\n'
    b'                            type="number" min="0" step="0.01" inputMode="decimal"\r\n'
    b'                            className="w-full text-right text-lg font-bold border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"\r\n'
    b'                            value={gramos} placeholder="0.00"\r\n'
    b'                            onChange={e => setGramos(e.target.value)}\r\n'
    b'                        />\r\n'
    b'                    </div>\r\n'
    b'                </div>\r\n'
    b'                <button\r\n'
    b'                    onClick={() => { onConfirm(uds || \'0\', gramos || \'0\'); onClose() }}\r\n'
    b'                    disabled={!ok}\r\n'
    b'                    className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"\r\n'
    b'                >\r\n'
    b'                    <Check className="w-4 h-4" /> Confirmar\r\n'
    b'                </button>\r\n'
    b'            </div>\r\n'
    b'        </div>\r\n'
    b'    )\r\n'
    b'}\r\n'
)

new_content = content[:insert_pos] + new_component + content[insert_pos:]
with open(path, 'wb') as f:
    f.write(new_content)
print(f'Done. Added {len(new_component)} bytes. New total: {len(new_content)}')
