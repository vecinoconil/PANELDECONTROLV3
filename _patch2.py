"""Patch Autoventa.tsx - replace tipo buttons + add lista view + FAB"""
fp = r'C:\PANELDECONTROLV3\frontend\src\pages\autoventa\Autoventa.tsx'

with open(fp, encoding='utf-8') as f:
    src = f.read()

# Find precise anchors that don't have special chars
START_MARKER = '1. Tipo de documento</p>'
END_MARKER = '{(tipodoc || modoVisita) && (\n                <div className="card p-4">'

start_idx = src.find(START_MARKER)
if start_idx == -1:
    print("ERROR: START_MARKER not found")
    exit(1)

# go back to find the start of the card div
card_start = src.rfind('<div className="card p-4">', 0, start_idx)
if card_start == -1:
    print("ERROR: card div start not found")
    exit(1)

end_idx = src.find(END_MARKER)
if end_idx == -1:
    print("ERROR: END_MARKER not found")
    # Try alternate - the Step 2 block
    END_MARKER2 = '{(tipodoc || modoVisita) && ('
    all_matches = []
    pos = 0
    while True:
        idx = src.find(END_MARKER2, pos)
        if idx == -1:
            break
        all_matches.append(idx)
        pos = idx + 1
    print(f"Found {len(all_matches)} occurrences of END_MARKER2: {all_matches[:5]}")
    exit(1)

end_end = end_idx + len(END_MARKER)

REPLACEMENT = '''<div className="card p-3">
                <div className="grid grid-cols-4 gap-2">
                    {(typedUser?.tipodocs_autoventa?.length
                        ? TIPOS.filter(t => typedUser.tipodocs_autoventa.includes(t.id))
                        : TIPOS
                    ).map(t => (
                        <button
                            key={t.id}
                            onClick={() => {
                                setTipodoc(t.id)
                                setModoVisita(false)
                                setVista('lista')
                                setListaDocumentos([])
                                cargarLista(t.id)
                            }}
                            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                                tipodoc === t.id && !modoVisita ? t.color : 'border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                        >
                            <t.icon className="w-5 h-5" />
                            <span className="text-xs font-semibold">{t.label}</span>
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            setModoVisita(true)
                            setTipodoc(null)
                            setVista('lista')
                            setListaVisitas([])
                            cargarListaVisitas()
                        }}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                            modoVisita ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                    >
                        <MapPin className="w-5 h-5" />
                        <span className="text-xs font-semibold">Visita</span>
                    </button>
                </div>
            </div>

            {/* Vista LISTA */}
            {(tipodoc || modoVisita) && vista === 'lista' && (
                <div className="card overflow-hidden">
                    {listaLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-brand" />
                        </div>
                    ) : modoVisita ? (
                        listaVisitas.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">Sin visitas registradas</p>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {listaVisitas.map(v => (
                                    <div key={v.id} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-slate-800 leading-tight">{v.cli_nombre}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">{v.motivo}</p>
                                                {v.resultado && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{v.resultado}</p>}
                                            </div>
                                            <p className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                                                {v.fecha ? new Date(v.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '\u2014'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        listaDocumentos.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">Sin documentos en esta serie</p>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {listaDocumentos.map(doc => (
                                    <div
                                        key={doc.id}
                                        className={`flex items-center gap-3 px-4 py-3 ${tipodoc === 2 && !doc.finalizado ? 'cursor-pointer hover:bg-slate-50 active:bg-slate-100' : ''}`}
                                        onClick={() => tipodoc === 2 && !doc.finalizado ? editarPedido(doc.id) : undefined}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-xs font-mono font-semibold text-brand">{doc.serie}-{doc.numero}</span>
                                                <span className="text-[10px] text-slate-400">
                                                    {doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '\u2014'}
                                                </span>
                                                {tipodoc === 2 && doc.finalizado && (
                                                    <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Finalizado</span>
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-slate-700 truncate">{doc.cli_nombre}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-sm font-bold text-slate-800">
                                                {doc.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                            </span>
                                            {tipodoc === 2 && !doc.finalizado && (
                                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Editar</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            )}

            {/* FAB + */}
            {(tipodoc || modoVisita) && vista === 'lista' && (
                <button
                    onClick={iniciarNuevo}
                    className="fixed bottom-6 right-6 w-14 h-14 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center z-40 transition-colors"
                    title={modoVisita ? 'Nueva visita' : `Nuevo ${TIPOS.find(t => t.id === tipodoc)?.label ?? ''}`}
                >
                    <Plus className="w-7 h-7" />
                </button>
            )}

            {/* Step 2 - Cliente */}
            {(tipodoc || modoVisita) && vista === 'creando' && (
                <div className="card p-4">'''

src = src[:card_start] + REPLACEMENT + src[end_end:]

with open(fp, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"Done. Replaced from pos {card_start} to {end_end}")
print(f"File size: {len(src)} chars")
