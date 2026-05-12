"""
Patch Autoventa.tsx to add lista-first navigation with FAB "+" button.
Changes:
  1. Add new types: DocListaItem, VisitaListaItem
  2. Add new states: vista, listaDocumentos, listaVisitas, listaLoading, editandoId
  3. Add helper functions: cargarLista, cargarListaVisitas, iniciarNuevo, editarPedido
  4. Modify handleSubmit to support PUT (editing)
  5. Modify handleNuevo to return to lista
  6. Replace the main render section (tipo buttons + step 2) with new lista/crear flow
  7. Add FAB button
"""
import re

fp = r'c:/PANELDECONTROLV3/frontend/src/pages/autoventa/Autoventa.tsx'
with open(fp, encoding='utf-8') as f:
    src = f.read()

# ──────────────────────────────────────────────────────────────────────────────
# 1. Add DocListaItem + VisitaListaItem types after TallaColorModal interface
# ──────────────────────────────────────────────────────────────────────────────
NEW_TYPES = '''interface DocListaItem {
    id: number
    serie: string
    numero: number
    fecha: string | null
    cli_codigo: number
    cli_nombre: string
    total: number
    finalizado: boolean
}
interface VisitaListaItem {
    id: number
    fecha: string | null
    cli_codigo: number
    cli_nombre: string
    motivo: string
    resultado: string
}

'''

ANCHOR_TYPES = 'interface TallaCodigo { codigo: string; nombre: string; orden: number }'
assert ANCHOR_TYPES in src, "ANCHOR_TYPES not found"
src = src.replace(ANCHOR_TYPES, NEW_TYPES + ANCHOR_TYPES, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 2. Add new state variables after the firma block
# ──────────────────────────────────────────────────────────────────────────────
NEW_STATES = '''
    // Lista de documentos
    const [vista, setVista] = useState<'lista' | 'creando'>('lista')
    const [listaDocumentos, setListaDocumentos] = useState<DocListaItem[]>([])
    const [listaVisitas, setListaVisitas] = useState<VisitaListaItem[]>([])
    const [listaLoading, setListaLoading] = useState(false)
    const [editandoId, setEditandoId] = useState<number | null>(null)
'''

ANCHOR_STATES = "    const hasClienteContext = !!(clienteSeleccionado || consultarCliente || docsClienteTarget)"
assert ANCHOR_STATES in src, "ANCHOR_STATES not found"
src = src.replace(ANCHOR_STATES, NEW_STATES + '\n' + ANCHOR_STATES, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 3. Add helper functions before handleSubmit
# ──────────────────────────────────────────────────────────────────────────────
NEW_HELPERS = '''    const cargarLista = async (td: TipoDoc) => {
        setListaLoading(true)
        try {
            const r = await api.get<DocListaItem[]>(`/api/autoventa/mis-documentos?tipodoc=${td}`)
            setListaDocumentos(r.data)
        } catch { setListaDocumentos([]) }
        finally { setListaLoading(false) }
    }

    const cargarListaVisitas = async () => {
        setListaLoading(true)
        try {
            const r = await api.get<VisitaListaItem[]>('/api/autoventa/mis-visitas')
            setListaVisitas(r.data)
        } catch { setListaVisitas([]) }
        finally { setListaLoading(false) }
    }

    const iniciarNuevo = () => {
        setClienteSeleccionado(null)
        setClienteQuery('')
        setClienteResults([])
        setLineas([])
        setError('')
        setEditandoId(null)
        setVisitaOk(false)
        setVisitaMotivo('Visita comercial')
        setVisitaResultado('')
        setVisitaError('')
        setVista('creando')
    }

    const editarPedido = async (id: number) => {
        setError('')
        try {
            const r = await api.get<{
                id: number; tipodoc: number; serie: string; numero: number; fecha: string | null
                cli_codigo: number; cli_nombre: string; cli_cif: string; cli_direccion: string
                cli_localidad: string; cli_cpostal: string; cli_provincia: number
                fpago: number; tarifa: number; observaciones: string; total: number
                lineas: { referencia: string; descripcion: string; unidades: number; precio: number; dto: number; piva: number; talla: string; color: string }[]
            }>(`/api/autoventa/documentos/${id}/detalle`)
            const doc = r.data
            const cli: ClienteResult = {
                codigo: doc.cli_codigo, nombre: doc.cli_nombre,
                cif: doc.cli_cif, alias: '',
                direccion: doc.cli_direccion, localidad: doc.cli_localidad,
                cpostal: doc.cli_cpostal, provincia: doc.cli_provincia,
                fpago: doc.fpago, tarifabase: doc.tarifa, email: '',
            }
            setClienteSeleccionado(cli)
            setLineas(doc.lineas.map(l => ({
                referencia: l.referencia,
                descripcion: l.descripcion,
                unidades: String(l.unidades),
                precio: l.precio,
                dto: l.dto,
                piva: l.piva,
                precioEditado: false,
                control_lotes: false,
                talla: l.talla || undefined,
                color: l.color || undefined,
            })))
            setEditandoId(id)
            setVista('creando')
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando pedido')
        }
    }

'''

ANCHOR_SUBMIT = '    const handleSubmit = async () => {'
assert ANCHOR_SUBMIT in src, "ANCHOR_SUBMIT not found"
src = src.replace(ANCHOR_SUBMIT, NEW_HELPERS + ANCHOR_SUBMIT, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 4. Patch handleSubmit to use PUT when editandoId is set
# ──────────────────────────────────────────────────────────────────────────────
OLD_POST = "            const r = await api.post('/api/autoventa/documento', {"
NEW_POST = """            const r = editandoId
                ? await api.put(`/api/autoventa/documentos/${editandoId}`, {
                    tipodoc,
                    serie,
                    cli_codigo: clienteSeleccionado.codigo,
                    cli_nombre: clienteSeleccionado.nombre,
                    cli_cif: clienteSeleccionado.cif,
                    cli_direccion: clienteSeleccionado.direccion,
                    cli_localidad: clienteSeleccionado.localidad,
                    cli_cpostal: clienteSeleccionado.cpostal,
                    cli_provincia: clienteSeleccionado.provincia,
                    fpago: clienteSeleccionado.fpago,
                    tarifa: clienteSeleccionado.tarifabase,
                    lineas: lineasConUds.map(l => ({
                        referencia: l.referencia,
                        descripcion: l.descripcion,
                        unidades: parseFloat(l.unidades),
                        precio: l.precio,
                        dto: l.dto,
                        piva: l.piva,
                        lotes_asignados: l.lotes_asignados?.map(a => ({ lote: a.lote, asignar: a.asignar })) ?? [],
                        talla: l.talla ?? '',
                        color: l.color ?? '',
                    })),
                })
                : await api.post('/api/autoventa/documento', {"""
assert OLD_POST in src, "OLD_POST not found"
src = src.replace(OLD_POST, NEW_POST, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 5. Patch handleNuevo to return to lista view
# ──────────────────────────────────────────────────────────────────────────────
OLD_NUEVO_END = """        setShowFirmaModal(false)
    }

    // """
NEW_NUEVO_END = """        setShowFirmaModal(false)
        setEditandoId(null)
        setVista('lista')
        if (tipodoc) cargarLista(tipodoc)
        else if (modoVisita) cargarListaVisitas()
    }

    // """
assert OLD_NUEVO_END in src, "OLD_NUEVO_END not found"
src = src.replace(OLD_NUEVO_END, NEW_NUEVO_END, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 6. Replace tipo buttons to use seleccionarTipo logic + new lista/crear rendering
# ──────────────────────────────────────────────────────────────────────────────
OLD_TIPO_STEP = """            {/* Step 1 \u2013 Tipo de documento */}
            <div className="card p-4">
                <p className="text-sm font-semibold text-slate-600 mb-3">1. Tipo de documento</p>
                <div className="grid grid-cols-4 gap-2">
                    {(typedUser?.tipodocs_autoventa?.length
                        ? TIPOS.filter(t => typedUser.tipodocs_autoventa.includes(t.id))
                        : TIPOS
                    ).map(t => (
                        <button
                            key={t.id}
                            onClick={() => { setTipodoc(t.id); setModoVisita(false) }}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                                tipodoc === t.id && !modoVisita ? t.color + ' border-2' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                        >
                            <t.icon className="w-5 h-5" />
                            <span className="text-xs font-semibold">{t.label}</span>
                        </button>
                    ))}
                    {/* Visita */}
                    <button
                        onClick={() => { setModoVisita(true); setTipodoc(null); setVisitaOk(false); setVisitaMotivo('Visita comercial'); setVisitaResultado(''); setVisitaError('') }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                            modoVisita ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                    >
                        <MapPin className="w-5 h-5" />
                        <span className="text-xs font-semibold">Visita</span>
                    </button>
                </div>
            </div>"""

assert OLD_TIPO_STEP in src, "OLD_TIPO_STEP not found"

TIPOSTABS = """            {/* Tabs tipo */}
            <div className="card p-3">
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

            {/* ── Vista LISTA ── */}
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
                                                {v.fecha ? new Date(v.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
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
                                                    {doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
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

            {/* ── Vista CREANDO ── */}"""

src = src.replace(OLD_TIPO_STEP, TIPOSTABS, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 7. Fix the old "{/* Step 2 — Cliente */}" wrapper to only show when creando
# ──────────────────────────────────────────────────────────────────────────────
OLD_STEP2_OPEN = """            {/* Step 2 \u2013 Cliente */}
            {(tipodoc || modoVisita) && ("""
NEW_STEP2_OPEN = """            {/* Step 2 — Cliente */}
            {(tipodoc || modoVisita) && vista === 'creando' && ("""
assert OLD_STEP2_OPEN in src, "OLD_STEP2_OPEN not found"
src = src.replace(OLD_STEP2_OPEN, NEW_STEP2_OPEN, 1)

# ──────────────────────────────────────────────────────────────────────────────
# 8. Add FAB "+" button just before the closing  </div></div>  of the main return
# ──────────────────────────────────────────────────────────────────────────────
FAB = """
            {/* FAB + button */}
            {(tipodoc || modoVisita) && vista === 'lista' && (
                <button
                    onClick={iniciarNuevo}
                    className="fixed bottom-6 right-6 w-14 h-14 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center z-40 transition-colors"
                    title={modoVisita ? 'Nueva visita' : `Nuevo ${TIPOS.find(t => t.id === tipodoc)?.label ?? ''}`}
                >
                    <Plus className="w-7 h-7" />
                </button>
            )}
"""

OLD_MAIN_END = """        </div>
        </div>
    )
}
"""
assert OLD_MAIN_END in src, "OLD_MAIN_END not found"
src = src.replace(OLD_MAIN_END, FAB + OLD_MAIN_END, 1)

# ──────────────────────────────────────────────────────────────────────────────
# Write result
# ──────────────────────────────────────────────────────────────────────────────
with open(fp, 'w', encoding='utf-8') as f:
    f.write(src)

print("Patch applied OK")
