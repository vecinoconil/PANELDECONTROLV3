import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { UserMe } from '../../types'
import {
    ShoppingCart, FileText, Truck, Search, Calculator,
    X, Check, Loader2, AlertCircle, CreditCard, ChevronDown, ChevronUp, Plus,
    Image, List, Package,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface AgenteOption { codigo: number; nombre: string }
interface SerieOption { serie: string }
interface FpagoOption { codigo: number; nombre: string }
interface ClienteResult {
    codigo: number
    nombre: string
    alias: string
    cif: string
    direccion: string
    localidad: string
    cpostal: string
    provincia: number
    fpago: number
    tarifabase: number
    email: string
}
interface ProductoConsumo {
    referencia: string
    descripcion: string
    uds_total: number
    ultimo_precio: number
    ultima_fecha: string
    piva: number
    control_lotes?: boolean
    tiene_imagen?: boolean
}
interface ArticuloBusqueda {
    referencia: string
    nombre: string
    precio: number
    piva: number
    control_lotes?: boolean
    tiene_imagen?: boolean
}
interface LineaDoc {
    referencia: string
    descripcion: string
    unidades: string   // string to allow partial input
    precio: number
    piva: number
    precioEditado: boolean
    control_lotes?: boolean
    tiene_imagen?: boolean
}
interface Lote {
    id: number
    lote: string
    fecha_compra: string | null
    fecha_caducidad: string | null
    stock: number
}
interface AsignacionLote {
    id: number
    lote: string
    fecha_caducidad: string | null
    stock: number
    asignar: number
}
interface Vencimiento {
    id: number
    fecha_vencimiento: string
    importe: number
    situacion: number
    entregas_cuenta: number
}
interface DocCliente {
    id: number
    tipodoc: number
    tipodoc_label: string
    serie: string
    numero: number
    fecha: string
    total: number
    pagado: number
    pendiente: number
    vencimientos: Vencimiento[]
}

type TipoDoc = 2 | 4 | 8
const TIPOS: { id: TipoDoc; label: string; icon: React.ElementType; color: string }[] = [
    { id: 2, label: 'Pedido',   icon: ShoppingCart, color: 'bg-blue-50 border-blue-300 text-blue-700' },
    { id: 4, label: 'Albarán',  icon: Truck,        color: 'bg-amber-50 border-amber-300 text-amber-700' },
    { id: 8, label: 'Factura',  icon: FileText,     color: 'bg-green-50 border-green-300 text-green-700' },
]

// ── Lot Assignment Modal ──────────────────────────────────────────────────

function distribuirLotesFEFO(lotes: Lote[], total: number): AsignacionLote[] {
    let remaining = total
    return lotes.map(l => {
        const asignar = Math.min(Math.floor(l.stock), Math.max(0, remaining))
        remaining -= asignar
        return { id: l.id, lote: l.lote, fecha_caducidad: l.fecha_caducidad, stock: l.stock, asignar }
    })
}

function LoteModal({
    nombre,
    referencia,
    lotes,
    onConfirm,
    onClose,
}: {
    nombre: string
    referencia: string
    lotes: Lote[]
    onConfirm: (asignaciones: AsignacionLote[]) => void
    onClose: () => void
}) {
    const [cantidad, setCantidad] = useState('1')
    const [asignaciones, setAsignaciones] = useState<AsignacionLote[]>(() =>
        distribuirLotesFEFO(lotes, 1)
    )

    const totalAsignado = asignaciones.reduce((s, a) => s + a.asignar, 0)
    const totalRequerido = parseInt(cantidad) || 0
    const stockTotal = lotes.reduce((s, l) => s + l.stock, 0)

    const handleCantidadChange = (val: string) => {
        setCantidad(val)
        const n = parseInt(val) || 0
        setAsignaciones(distribuirLotesFEFO(lotes, n))
    }

    const updateAsignacion = (idx: number, val: string) => {
        const n = Math.max(0, parseInt(val) || 0)
        setAsignaciones(prev => prev.map((a, i) => i === idx ? { ...a, asignar: n } : a))
    }

    const fmtDate = (d: string | null) => d
        ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '—'

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center px-3"
             onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{referencia}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                {/* Cantidad total */}
                <div className="px-4 py-3 border-b border-slate-100">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Unidades totales</label>
                    <input
                        type="number"
                        min="1"
                        max={stockTotal}
                        className="input text-center text-lg font-bold w-full"
                        value={cantidad}
                        onChange={e => handleCantidadChange(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 text-center mt-1">
                        Stock disponible: {stockTotal} uds
                    </p>
                </div>

                {/* Lotes */}
                <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                    {lotes.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">Sin lotes con stock</p>
                    ) : asignaciones.map((a, idx) => (
                        <div key={a.id} className="px-4 py-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                                <div>
                                    <span className="text-sm font-semibold text-slate-800 font-mono">{a.lote}</span>
                                    {a.fecha_caducidad && (
                                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                            new Date(a.fecha_caducidad) < new Date()
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-amber-50 text-amber-700'
                                        }`}>
                                            Cad. {fmtDate(a.fecha_caducidad)}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-slate-400">Stock: {a.stock}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500 w-16">Asignar:</label>
                                <input
                                    type="number"
                                    min="0"
                                    max={a.stock}
                                    className="input text-right text-sm flex-1"
                                    value={a.asignar}
                                    onChange={e => updateAsignacion(idx, e.target.value)}
                                />
                                <span className="text-xs text-slate-400">/ {a.stock}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-200 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total asignado:</span>
                        <span className={`font-bold ${totalAsignado !== totalRequerido ? 'text-red-600' : 'text-green-600'}`}>
                            {totalAsignado} / {totalRequerido} uds
                        </span>
                    </div>
                    {totalAsignado !== totalRequerido && (
                        <p className="text-xs text-red-500 text-center">
                            {totalAsignado < totalRequerido ? 'Stock insuficiente para cubrir la demanda' : 'Has asignado más unidades de las solicitadas'}
                        </p>
                    )}
                    <button
                        onClick={() => onConfirm(asignaciones.filter(a => a.asignar > 0))}
                        disabled={totalAsignado === 0}
                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        <Check className="w-4 h-4" /> Confirmar lotes
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Calculator Modal ───────────────────────────────────────────────────────

function CalculatorModal({
    initial,
    onConfirm,
    onClose,
}: {
    initial: string
    onConfirm: (val: string) => void
    onClose: () => void
}) {
    const [val, setVal] = useState(initial === '0' ? '' : initial)

    const press = (ch: string) => {
        if (ch === 'C') { setVal(''); return }
        if (ch === '⌫') { setVal(v => v.slice(0, -1)); return }
        if (ch === '.' && val.includes('.')) return
        setVal(v => v + ch)
    }

    const keys = ['7','8','9','4','5','6','1','2','3','C','0','.','⌫']

    return (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60]"
             onClick={onClose}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs p-4"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">Introducir cantidad</span>
                    <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="bg-slate-100 rounded-lg px-3 py-2 text-right text-xl font-mono mb-3 min-h-[2.5rem]">
                    {val || '0'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {keys.map(k => (
                        <button key={k} onClick={() => press(k)}
                            className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                                k === 'C' ? 'bg-red-100 text-red-600 hover:bg-red-200' :
                                k === '⌫' ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' :
                                'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}>
                            {k}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => { onConfirm(val || '0'); onClose() }}
                    className="mt-3 w-full btn-primary flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Confirmar
                </button>
            </div>
        </div>
    )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Autoventa() {
    const { user } = useAuth()
    const typedUser = user as UserMe | null
    const canEditPrice = typedUser?.rol === 'superadmin' || typedUser?.rol === 'gerente' || typedUser?.autoventa_modifica_precio === true

    // Step state
    const [tipodoc, setTipodoc] = useState<TipoDoc | null>(null)
    const serie = typedUser?.serie_autoventa ?? ''
    const [agenteNombre, setAgenteNombre] = useState<string>('')

    // Client search
    const [clienteQuery, setClienteQuery] = useState('')
    const [clienteResults, setClienteResults] = useState<ClienteResult[]>([])
    const [searchingCliente, setSearchingCliente] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteResult | null>(null)
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchSeq = useRef(0)

    // Products
    const [lineas, setLineas] = useState<LineaDoc[]>([])
    const [loadingProductos, setLoadingProductos] = useState(false)

    // Calculator modals
    const [calcIdx, setCalcIdx] = useState<number | null>(null)
    const [calcPrecioIdx, setCalcPrecioIdx] = useState<number | null>(null)

    // Documentos cliente modal
    const [showDocsModal, setShowDocsModal] = useState(false)
    const [docsCliente, setDocsCliente] = useState<DocCliente[]>([])
    const [loadingDocs, setLoadingDocs] = useState(false)
    const [soloPte, setSoloPte] = useState(true)
    const [expandedDoc, setExpandedDoc] = useState<number | null>(null)
    const [docsClienteTarget, setDocsClienteTarget] = useState<ClienteResult | null>(null)

    // Cobrar modal
    const [cobrarTarget, setCobrarTarget] = useState<{
        tipo: 'albaran' | 'vencimiento'
        idcab: number
        vtoId?: number
        maxImporte: number
        label: string
    } | null>(null)
    const [fpagosDisponibles, setFpagosDisponibles] = useState<FpagoOption[]>([])
    const [cobrarFpago, setCobrarFpago] = useState<number | null>(null)
    const [cobrarImporte, setCobrarImporte] = useState('')
    const [cobrarLoading, setCobrarLoading] = useState(false)
    const [cobrarError, setCobrarError] = useState('')

    // Cache clientes del agente
    const [clientesCache, setClientesCache] = useState<ClienteResult[]>([])

    // Filtro tipodoc en modal docs
    const [docsFiltraTipo, setDocsFiltraTipo] = useState<'todos' | '4' | '8'>('todos')

    // Consultar standalone (sin venta)
    const [showConsultarModal, setShowConsultarModal] = useState(false)
    const [consultarQuery, setConsultarQuery] = useState('')
    const [consultarCliente, setConsultarCliente] = useState<ClienteResult | null>(null)

    // Añadir artículo manualmente
    const [showAddArticuloModal, setShowAddArticuloModal] = useState(false)
    const [articuloQuery, setArticuloQuery] = useState('')
    const [articuloResults, setArticuloResults] = useState<ArticuloBusqueda[]>([])
    const [searchingArticulo, setSearchingArticulo] = useState(false)
    const articuloSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Vista imágenes / líneas
    const [vistaImagenes, setVistaImagenes] = useState(false)

    // Lote modal
    const [loteModal, setLoteModal] = useState<{
        articulo: ArticuloBusqueda
        lotes: Lote[]
    } | null>(null)

    // Submit
    const [submitting, setSubmitting] = useState(false)
    const [resultado, setResultado] = useState<{
        serie: string; numero: number; tipodoc_label: string; total: number
        idcab: number; cli_codigo: number; cli_email: string; tipodoc: number
    } | null>(null)
    const [error, setError] = useState('')

    // Post-venta: cobrar + email
    const [postVentaEmail, setPostVentaEmail] = useState('')
    const [postVentaEnviando, setPostVentaEnviando] = useState(false)
    const [postVentaEmailEnviado, setPostVentaEmailEnviado] = useState(false)
    const [postVentaEmailError, setPostVentaEmailError] = useState('')

    const hasClienteContext = !!(clienteSeleccionado || consultarCliente || docsClienteTarget)

    // Load agente info + cache clientes on mount
    useEffect(() => {
        api.get<AgenteOption[]>('/api/autoventa/agentes').then(r => {
            const agenteCode = typedUser?.agente_autoventa
            if (agenteCode) {
                const found = r.data.find(a => a.codigo === agenteCode)
                if (found) setAgenteNombre(found.nombre)
            }
        }).catch(() => {})

        api.get<ClienteResult[]>('/api/autoventa/clientes/agente').then(r => {
            setClientesCache(r.data)
        }).catch(() => {})
    }, [typedUser])

    // Client autocomplete – filter from cache first, fallback to API
    const handleClienteInput = (q: string) => {
        searchSeq.current += 1
        const mySeq = searchSeq.current
        setClienteQuery(q)
        setClienteSeleccionado(null)
        setLineas([])
        if (searchTimer.current) clearTimeout(searchTimer.current)
        if (q.length < 2) { setClienteResults([]); return }

        // Instant filter from cache — multi-word, case-insensitive
        const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
        const cached = clientesCache.filter(c => {
            const haystack = (c.nombre + ' ' + (c.alias || '')).toLowerCase()
            return words.every(w => haystack.includes(w))
        }).slice(0, 30)
        if (cached.length > 0) {
            setClienteResults(cached)
        }

        // Also search server for non-cached clients
        searchTimer.current = setTimeout(async () => {
            setSearchingCliente(true)
            try {
                const r = await api.get<ClienteResult[]>(`/api/autoventa/clientes/buscar?q=${encodeURIComponent(q)}`)
                if (mySeq !== searchSeq.current) return
                setClienteResults(r.data)
            } catch { /* keep cached results */ }
            finally { setSearchingCliente(false) }
        }, 300)
    }

    const selectCliente = async (c: ClienteResult) => {
        // Invalidate any pending/in-flight search to avoid stale results reappearing.
        searchSeq.current += 1
        if (searchTimer.current) clearTimeout(searchTimer.current)
        setSearchingCliente(false)
        setClienteSeleccionado(c)
        setClienteResults([])
        setClienteQuery('')
        setLoadingProductos(true)
        setLineas([])
        try {
            const r = await api.get<ProductoConsumo[]>(`/api/autoventa/clientes/${c.codigo}/consumo-90dias`)
            setLineas(r.data.map(p => ({
                referencia: p.referencia,
                descripcion: p.descripcion,
                unidades: '0',
                precio: p.ultimo_precio,
                piva: p.piva,
                precioEditado: false,
                control_lotes: p.control_lotes,
                tiene_imagen: p.tiene_imagen,
            })))
        } catch { setLineas([]) }
        finally { setLoadingProductos(false) }
    }

    const updateUnidades = (idx: number, val: string) => {
        setLineas(prev => prev.map((l, i) => i === idx ? { ...l, unidades: val } : l))
    }

    const abrirLotesParaLinea = async (idx: number) => {
        const linea = lineas[idx]
        if (!linea) return
        try {
            const r = await api.get<Lote[]>(`/api/autoventa/articulos/${encodeURIComponent(linea.referencia)}/lotes`)
            setLoteModal({
                articulo: { referencia: linea.referencia, nombre: linea.descripcion, precio: linea.precio, piva: linea.piva, control_lotes: true, tiene_imagen: linea.tiene_imagen },
                lotes: r.data,
            })
        } catch { /* ignore */ }
    }

    const updatePrecio = (idx: number, val: string) => {
        const n = parseFloat(val)
        if (!isNaN(n)) {
            setLineas(prev => prev.map((l, i) => i === idx ? { ...l, precio: n, precioEditado: true } : l))
        }
    }

    const lineasConUds = lineas.filter(l => parseFloat(l.unidades) > 0)

    const total = lineasConUds.reduce((acc, l) => {
        const imp = parseFloat(l.unidades) * l.precio
        return acc + imp + imp * l.piva / 100
    }, 0)

    // Load formas de pago on mount
    useEffect(() => {
        api.get<FpagoOption[]>('/api/autoventa/formaspago').then(r => setFpagosDisponibles(r.data)).catch(() => {})
    }, [])

    const openDocsModal = async (cli?: ClienteResult, setAsCurrent = true) => {
        const c = cli || clienteSeleccionado
        if (!c) return
        if (cli && setAsCurrent) setClienteSeleccionado(cli)
        setDocsClienteTarget(c)
        setShowDocsModal(true)
        setExpandedDoc(null)
        setDocsFiltraTipo('todos')
        setLoadingDocs(true)
        try {
            const r = await api.get<DocCliente[]>(`/api/autoventa/clientes/${c.codigo}/documentos?solo_pte=true`)
            setDocsCliente(r.data)
        } catch { setDocsCliente([]) }
        finally { setLoadingDocs(false) }
    }

    const reloadDocs = async (pte: boolean, tipoFiltro?: 'todos' | '4' | '8') => {
        const c = docsClienteTarget || clienteSeleccionado
        if (!c) return
        setLoadingDocs(true)
        try {
            const tipo = tipoFiltro ?? docsFiltraTipo
            const tipoParam = tipo !== 'todos' ? `&tipodoc=${tipo}` : ''
            const r = await api.get<DocCliente[]>(`/api/autoventa/clientes/${c.codigo}/documentos?solo_pte=${pte}${tipoParam}`)
            setDocsCliente(r.data)
        } catch { setDocsCliente([]) }
        finally { setLoadingDocs(false) }
    }

    const totalPteCobro = docsCliente.reduce((acc, doc) => acc + (doc.pendiente || 0), 0)

    const openCobrar = (target: typeof cobrarTarget) => {
        setCobrarTarget(target)
        setCobrarFpago(fpagosDisponibles[0]?.codigo ?? null)
        setCobrarImporte(target ? target.maxImporte.toFixed(2) : '')
        setCobrarError('')
    }

    const handleCobrar = async () => {
        const clienteCobro = docsClienteTarget || clienteSeleccionado
        if (!cobrarTarget || !cobrarFpago || !clienteCobro) return
        const imp = parseFloat(cobrarImporte)
        if (isNaN(imp) || imp <= 0) { setCobrarError('Importe inválido'); return }
        if (imp > cobrarTarget.maxImporte + 0.01) { setCobrarError(`Máximo permitido: ${cobrarTarget.maxImporte.toFixed(2)}€`); return }
        setCobrarLoading(true)
        setCobrarError('')
        try {
            if (cobrarTarget.tipo === 'albaran') {
                await api.post(`/api/autoventa/clientes/${clienteCobro.codigo}/documentos/${cobrarTarget.idcab}/cobrar-albaran`, {
                    fpago_codigo: cobrarFpago,
                    importe: imp,
                })
            } else {
                await api.post(`/api/autoventa/clientes/${clienteCobro.codigo}/documentos/${cobrarTarget.idcab}/cobrar-vencimiento`, {
                    vto_id: cobrarTarget.vtoId,
                    fpago_codigo: cobrarFpago,
                    importe: imp,
                })
            }
            setCobrarTarget(null)
            reloadDocs(soloPte, docsFiltraTipo)
        } catch (e: any) {
            setCobrarError(e.response?.data?.detail || 'Error registrando cobro')
        } finally {
            setCobrarLoading(false)
        }
    }

    const handleArticuloInput = (q: string) => {
        setArticuloQuery(q)
        setArticuloResults([])
        if (articuloSearchTimer.current) clearTimeout(articuloSearchTimer.current)
        if (q.length < 2 || !clienteSeleccionado) return
        articuloSearchTimer.current = setTimeout(async () => {
            setSearchingArticulo(true)
            try {
                const r = await api.get<ArticuloBusqueda[]>(
                    `/api/autoventa/articulos/buscar?q=${encodeURIComponent(q)}&cli_codigo=${clienteSeleccionado.codigo}`
                )
                setArticuloResults(r.data)
            } catch { setArticuloResults([]) }
            finally { setSearchingArticulo(false) }
        }, 300)
    }

    const addArticuloToLineas = async (a: ArticuloBusqueda) => {
        setShowAddArticuloModal(false)
        setArticuloQuery('')
        setArticuloResults([])

        // For albarán/factura with lot control, open lot modal
        if (a.control_lotes && (tipodoc === 4 || tipodoc === 8)) {
            try {
                const r = await api.get<Lote[]>(`/api/autoventa/articulos/${encodeURIComponent(a.referencia)}/lotes`)
                setLoteModal({ articulo: a, lotes: r.data })
            } catch {
                // fallback: add without lot control
                _addLineaSinLote(a, '1')
            }
            return
        }
        _addLineaSinLote(a, '1')
    }

    const _addLineaSinLote = (a: ArticuloBusqueda, uds: string) => {
        const existing = lineas.findIndex(l => l.referencia === a.referencia)
        if (existing < 0) {
            setLineas(prev => [...prev, {
                referencia: a.referencia,
                descripcion: a.nombre,
                unidades: uds,
                precio: a.precio,
                piva: a.piva,
                precioEditado: false,
                control_lotes: a.control_lotes,
                tiene_imagen: a.tiene_imagen,
            }])
        }
    }

    const handleConfirmarLotes = (asignaciones: AsignacionLote[]) => {
        if (!loteModal) return
        const { articulo } = loteModal
        // Create one linea per lot assignment
        const nuevas = asignaciones.filter(a => a.asignar > 0).map(a => ({
            referencia: articulo.referencia,
            descripcion: `${articulo.nombre} [L:${a.lote}]`,
            unidades: String(a.asignar),
            precio: articulo.precio,
            piva: articulo.piva,
            precioEditado: false,
            control_lotes: true,
            tiene_imagen: articulo.tiene_imagen,
        }))
        setLineas(prev => [...prev, ...nuevas])
        setLoteModal(null)
    }

    const handleSubmit = async () => {
        if (!tipodoc || !clienteSeleccionado) return
        if (lineasConUds.length === 0) { setError('Añade al menos una línea con unidades'); return }
        setError('')
        setSubmitting(true)
        try {
            const r = await api.post('/api/autoventa/documento', {
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
                    piva: l.piva,
                })),
            })
            setResultado({
                ...r.data,
                idcab: r.data.id,
                cli_codigo: clienteSeleccionado.codigo,
                cli_email: clienteSeleccionado.email || '',
                tipodoc,
            })
            setPostVentaEmail(clienteSeleccionado.email || '')
            setPostVentaEmailEnviado(false)
            setPostVentaEmailError('')
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error creando documento')
        } finally {
            setSubmitting(false)
        }
    }

    const handleEnviarEmail = async () => {
        if (!resultado || !postVentaEmail) return
        setPostVentaEnviando(true)
        setPostVentaEmailError('')
        try {
            await api.post('/api/autoventa/enviar-documento', {
                cli_codigo: resultado.cli_codigo,
                idcab: resultado.idcab,
                tipodoc: resultado.tipodoc,
                email_destino: postVentaEmail,
            })
            setPostVentaEmailEnviado(true)
        } catch (e: any) {
            setPostVentaEmailError(e.response?.data?.detail || 'Error enviando email')
        } finally {
            setPostVentaEnviando(false)
        }
    }

    const handleNuevo = () => {
        setResultado(null)
        setTipodoc(null)
        setClienteQuery('')
        setClienteResults([])
        setClienteSeleccionado(null)
        setLineas([])
        setShowDocsModal(false)
        setDocsCliente([])
        setDocsClienteTarget(null)
        setExpandedDoc(null)
        setShowConsultarModal(false)
        setConsultarCliente(null)
        setConsultarQuery('')
        setShowAddArticuloModal(false)
        setArticuloQuery('')
        setArticuloResults([])
        setError('')
    }

    // ── Pantalla post-venta ───────────────────────────────────────────────
    if (resultado) {
        const esCobrable = resultado.tipodoc === 4 || resultado.tipodoc === 8
        return (
            <div className="p-4 max-w-md mx-auto space-y-4">
                {/* Resultado */}
                <div className="card p-6 text-center">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Check className="w-7 h-7 text-green-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">{resultado.tipodoc_label} creado</h2>
                    <p className="text-slate-500 text-sm mb-2">
                        Serie <span className="font-semibold">{resultado.serie}</span> · Nº <span className="font-semibold">{resultado.numero}</span>
                    </p>
                    <p className="text-2xl font-bold text-brand">
                        {resultado.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </p>
                </div>

                {/* Cobrar */}
                {esCobrable && (
                    <div className="card p-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-green-600" /> ¿Cobrar ahora?
                        </p>
                        <button
                            onClick={() => {
                                // Open cobrar for this document
                                if (resultado.tipodoc === 4) {
                                    openCobrar({ tipo: 'albaran', idcab: resultado.idcab, maxImporte: resultado.total, label: `${resultado.tipodoc_label} ${resultado.serie}-${resultado.numero}` })
                                }
                            }}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                                resultado.tipodoc === 4
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            disabled={resultado.tipodoc !== 4}
                        >
                            <CreditCard className="w-4 h-4" />
                            {resultado.tipodoc === 4 ? 'Cobrar albarán' : 'Cobro por vencimientos (ver documentos)'}
                        </button>
                        {resultado.tipodoc === 8 && (
                            <button
                                onClick={() => openDocsModal()}
                                className="w-full mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-xl py-2.5 hover:bg-amber-100 transition-colors"
                            >
                                Ver vencimientos del cliente
                            </button>
                        )}
                    </div>
                )}

                {/* Enviar email */}
                <div className="card p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> Enviar copia al cliente
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="email"
                            className="input flex-1 text-sm"
                            placeholder="email@cliente.com"
                            value={postVentaEmail}
                            onChange={e => { setPostVentaEmail(e.target.value); setPostVentaEmailEnviado(false); setPostVentaEmailError('') }}
                        />
                        <button
                            onClick={handleEnviarEmail}
                            disabled={postVentaEnviando || postVentaEmailEnviado || !postVentaEmail}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${
                                postVentaEmailEnviado
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                            }`}
                        >
                            {postVentaEnviando
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : postVentaEmailEnviado
                                    ? <><Check className="w-4 h-4 inline mr-1" />Enviado</>
                                    : 'Enviar'}
                        </button>
                    </div>
                    {postVentaEmailError && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />{postVentaEmailError}
                        </p>
                    )}
                </div>

                <button onClick={handleNuevo} className="btn-primary w-full">Nuevo documento</button>

                {/* Cobrar modal (para albarán post-venta) */}
                {cobrarTarget && (
                    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-base font-bold text-slate-800">Cobrar – {cobrarTarget.label}</h2>
                                <button onClick={() => setCobrarTarget(null)} className="p-1 rounded hover:bg-slate-100">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Forma de pago</label>
                                    {fpagosDisponibles.length === 0 ? (
                                        <p className="text-xs text-slate-400">No hay formas de pago configuradas</p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {fpagosDisponibles.map(fp => (
                                                <button key={fp.codigo} onClick={() => setCobrarFpago(fp.codigo)}
                                                    className={`text-xs px-3 py-2 rounded-lg border-2 transition-colors ${cobrarFpago === fp.codigo ? 'border-brand bg-brand/10 text-brand font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                                    {fp.nombre}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Importe (máx. {cobrarTarget.maxImporte.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€)
                                    </label>
                                    <input type="number" step="0.01" min="0.01" max={cobrarTarget.maxImporte}
                                        className="input text-right text-lg font-bold"
                                        value={cobrarImporte} onChange={e => setCobrarImporte(e.target.value)} />
                                </div>
                                {cobrarError && <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4 flex-shrink-0" />{cobrarError}</p>}
                                <button onClick={handleCobrar} disabled={cobrarLoading || !cobrarFpago}
                                    className="btn-primary w-full flex items-center justify-center gap-2">
                                    {cobrarLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Registrando...</> : <><Check className="w-4 h-4" />Confirmar cobro</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="p-4 w-full" style={{ maxWidth: '75%', margin: '0 auto' }}>
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <ShoppingCart className="w-5 h-5 text-brand" />
                <h1 className="text-xl font-bold">Autoventa</h1>
                {agenteNombre && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {agenteNombre}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => { setConsultarCliente(null); setConsultarQuery(''); setShowConsultarModal(true) }}
                        className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors"
                    >
                        <Search className="w-4 h-4" /> Consultar
                    </button>
                    <button
                        onClick={handleNuevo}
                        disabled={!hasClienteContext}
                        className="inline-flex items-center justify-center w-9 h-9 text-slate-700 bg-slate-100 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Cancelar"
                        aria-label="Cancelar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Step 1 – Tipo de documento */}
            <div className="card p-4">
                <p className="text-sm font-semibold text-slate-600 mb-3">1. Tipo de documento</p>
                <div className="grid grid-cols-3 gap-2">
                    {TIPOS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTipodoc(t.id)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                                tipodoc === t.id ? t.color + ' border-2' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                        >
                            <t.icon className="w-5 h-5" />
                            <span className="text-xs font-semibold">{t.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Step 2 – Cliente */}
            {tipodoc && (
                <div className="card p-4">
                    <p className="text-sm font-semibold text-slate-600 mb-3">2. Cliente</p>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            className="input pl-8"
                            placeholder="Buscar por nombre o alias..."
                            value={clienteQuery}
                            onChange={e => handleClienteInput(e.target.value)}
                        />
                        {searchingCliente && (
                            <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 animate-spin" />
                        )}
                    </div>
                    {clienteResults.length > 0 && (
                        <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                            {clienteResults.map(c => (
                                <button
                                    key={c.codigo}
                                    onClick={() => selectCliente(c)}
                                    className="w-full text-left px-3 py-2 hover:bg-brand/5 border-b border-slate-100 last:border-0"
                                >
                                    <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                                    {c.alias && <p className="text-xs text-slate-500">{c.alias}</p>}
                                    <p className="text-xs text-slate-400">{c.localidad} · {c.cif}</p>
                                </button>
                            ))}
                        </div>
                    )}
                    {clienteSeleccionado && (
                        <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-lg px-3 py-2">
                                <Check className="w-4 h-4 text-brand flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{clienteSeleccionado.nombre}</p>
                                    <p className="text-xs text-slate-500">{clienteSeleccionado.localidad} · {clienteSeleccionado.cif}</p>
                                </div>
                                <button
                                    className="ml-auto p-1 rounded hover:bg-slate-200"
                                    onClick={() => { setClienteSeleccionado(null); setClienteQuery(''); setLineas([]) }}
                                >
                                    <X className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                            </div>
                            <button
                                onClick={() => openDocsModal()}
                                className="w-full flex items-center justify-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg py-2 hover:bg-amber-100 transition-colors"
                            >
                                <CreditCard className="w-4 h-4" />
                                Consultar Doc. Cliente
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Step 4 – Productos */}
            {clienteSeleccionado && (
                <div className="card p-4">
                    <p className="text-sm font-semibold text-slate-600 mb-3 flex items-center justify-between">
                        <span>
                            3. Productos consumidos (últimos 90 días)
                            {lineas.length > 0 && (
                                <span className="ml-2 text-xs font-normal text-slate-400">{lineas.length} artículos</span>
                            )}
                        </span>
                        <span className="flex items-center gap-1.5">
                            {/* Toggle vista */}
                            <button
                                onClick={() => setVistaImagenes(v => !v)}
                                title={vistaImagenes ? 'Vista líneas' : 'Vista imágenes'}
                                className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                                {vistaImagenes ? <List className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
                                {vistaImagenes ? 'Vista Líneas' : 'Vista Imágenes'}
                            </button>
                            {clienteSeleccionado && !loadingProductos && (
                                <button
                                    onClick={() => { setShowAddArticuloModal(true); setArticuloQuery(''); setArticuloResults([]) }}
                                    className="flex items-center gap-1 text-xs font-medium text-brand bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg hover:bg-brand/20 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Añadir
                                </button>
                            )}
                        </span>
                    </p>

                    {loadingProductos ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Cargando productos...</span>
                        </div>
                    ) : lineas.length === 0 ? (
                        <div className="flex flex-col items-center py-6 gap-3">
                            <p className="text-sm text-slate-400 text-center">
                                Este cliente no tiene compras en los últimos 90 días.
                            </p>
                            <button
                                onClick={() => { setShowAddArticuloModal(true); setArticuloQuery(''); setArticuloResults([]) }}
                                className="flex items-center gap-2 text-sm font-medium text-brand bg-brand/10 border border-brand/30 px-4 py-2 rounded-xl hover:bg-brand/20 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Añadir artículo
                            </button>
                        </div>
                    ) : vistaImagenes ? (
                        /* ── Vista Imágenes ── */
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {lineas.map((l, idx) => {
                                const uds = parseFloat(l.unidades)
                                const tieneUds = !isNaN(uds) && uds > 0
                                const importe = tieneUds ? uds * l.precio * (1 + l.piva / 100) : null
                                const necesitaLotes = l.control_lotes && (tipodoc === 4 || tipodoc === 8)
                                return (
                                    <div
                                        key={l.referencia + idx}
                                        className={`rounded-xl border overflow-hidden flex flex-col transition-all ${tieneUds ? 'border-brand shadow-sm' : 'border-slate-200'}`}
                                    >
                                        {/* Imagen */}
                                        {l.tiene_imagen ? (
                                            <div className="bg-slate-50 flex items-center justify-center overflow-hidden" style={{ height: 90 }}>
                                                <img
                                                    src={`/api/autoventa/articulos/${encodeURIComponent(l.referencia)}/imagen`}
                                                    alt={l.descripcion}
                                                    className="object-contain w-full h-full"
                                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="bg-slate-100 flex items-center justify-center" style={{ height: 90 }}>
                                                <Package className="w-8 h-8 text-slate-300" />
                                            </div>
                                        )}
                                        {/* Info */}
                                        <div className="p-2 flex-1 flex flex-col">
                                            <p className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2 flex-1">{l.descripcion}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-slate-400 font-mono">{l.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                                {necesitaLotes && <Package className="w-3 h-3 text-amber-500" />}
                                            </div>
                                            {importe !== null && (
                                                <p className="text-xs font-bold text-brand mt-0.5">
                                                    Total: {importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                                </p>
                                            )}
                                        </div>
                                        {/* Controles */}
                                        <div className="px-2 pb-2 flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                className={`flex-1 text-sm text-right border rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand ${tieneUds ? 'border-brand' : 'border-slate-200'}`}
                                                placeholder="Uds"
                                                value={l.unidades === '0' ? '' : l.unidades}
                                                onChange={e => updateUnidades(idx, e.target.value)}
                                                onKeyDown={async e => { if (e.key === 'Enter' && necesitaLotes) { e.preventDefault(); await abrirLotesParaLinea(idx) } }}
                                            />
                                            <button onClick={async () => { if (necesitaLotes) { await abrirLotesParaLinea(idx) } else { setCalcIdx(idx) } }} className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500">
                                                <Calculator className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => setLineas(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        /* ── Vista Líneas ── */
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            {/* Header */}
                            <div className="grid bg-slate-50 border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500" style={{ gridTemplateColumns: 'auto 1fr auto auto auto' }}>
                                <span className="w-24 text-center">Unidades</span>
                                <span className="px-2">Descripción</span>
                                <span className="w-32 text-right">P. Unitario</span>
                                <span className="w-24 text-right">Total</span>
                                <span className="w-8"></span>
                            </div>
                            {lineas.map((l, idx) => {
                                const uds = parseFloat(l.unidades)
                                const tieneUds = !isNaN(uds) && uds > 0
                                const importe = tieneUds ? uds * l.precio * (1 + l.piva / 100) : null
                                const necesitaLotes = l.control_lotes && (tipodoc === 4 || tipodoc === 8)
                                return (
                                    <div
                                        key={l.referencia + idx}
                                        className={`grid items-center px-3 py-1.5 border-b border-slate-100 last:border-0 transition-colors ${tieneUds ? 'bg-brand/5' : 'bg-white'}`}
                                        style={{ gridTemplateColumns: 'auto 1fr auto auto auto' }}
                                    >
                                        {/* Unidades + calc / Lotes */}
                                        <div className="flex items-center gap-1 w-24">
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                className={`w-14 text-sm text-right border rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand ${tieneUds ? 'border-brand bg-white' : 'border-slate-200 bg-white'}`}
                                                placeholder="Uds"
                                                value={l.unidades === '0' ? '' : l.unidades}
                                                onChange={e => updateUnidades(idx, e.target.value)}
                                                onKeyDown={async e => { if (e.key === 'Enter' && necesitaLotes) { e.preventDefault(); await abrirLotesParaLinea(idx) } }}
                                            />
                                            <button
                                                title="Calculadora unidades"
                                                onClick={async () => { if (necesitaLotes) { await abrirLotesParaLinea(idx) } else { setCalcIdx(idx) } }}
                                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 flex-shrink-0"
                                            >
                                                <Calculator className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        {/* Descripción */}
                                        <div className="px-2 min-w-0">
                                            <p className="text-xs font-medium text-slate-800 leading-tight truncate">{l.descripcion}</p>
                                            <p className="text-[10px] text-slate-400 font-mono">{l.referencia} · IVA {l.piva}%</p>
                                        </div>
                                        {/* Precio unitario + calc */}
                                        <div className="flex items-center gap-1 w-32 justify-end">
                                            {canEditPrice ? (
                                                <>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-20 text-sm text-right border border-slate-300 rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                                                        value={l.precio}
                                                        onChange={e => updatePrecio(idx, e.target.value)}
                                                    />
                                                    <button
                                                        title="Calculadora precio"
                                                        onClick={() => setCalcPrecioIdx(idx)}
                                                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 flex-shrink-0"
                                                    >
                                                        <Calculator className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="text-sm text-slate-700 font-mono">{l.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                            )}
                                        </div>
                                        {/* Total */}
                                        <div className="w-24 text-right">
                                            {importe !== null ? (
                                                <span className="text-sm font-semibold text-brand">{importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                            ) : (
                                                <span className="text-xs text-slate-300">—</span>
                                            )}
                                        </div>
                                        {/* Eliminar */}
                                        <div className="w-8 flex justify-center">
                                            <button
                                                title="Eliminar línea"
                                                onClick={() => setLineas(prev => prev.filter((_, i) => i !== idx))}
                                                className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Resumen y enviar */}
            {lineasConUds.length > 0 && (
                <div className="card p-4 sticky bottom-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs text-slate-500">{lineasConUds.length} línea{lineasConUds.length !== 1 ? 's' : ''}</p>
                            <p className="text-lg font-bold text-slate-800">
                                {total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            <p>{TIPOS.find(t => t.id === tipodoc)?.label}</p>
                            <p className="font-semibold">{serie}</p>
                        </div>
                    </div>
                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm mb-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {submitting
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</>
                            : <><Check className="w-4 h-4" /> Crear {TIPOS.find(t => t.id === tipodoc)?.label}</>
                        }
                    </button>
                </div>
            )}

            {/* Calculator modal */}
            {calcIdx !== null && (
                <CalculatorModal
                    initial={lineas[calcIdx]?.unidades ?? '0'}
                    onConfirm={async val => {
                        updateUnidades(calcIdx, val)
                        setCalcIdx(null)
                        const linea = lineas[calcIdx]
                        if (linea?.control_lotes && (tipodoc === 4 || tipodoc === 8)) {
                            await abrirLotesParaLinea(calcIdx)
                        }
                    }}
                    onClose={() => setCalcIdx(null)}
                />
            )}
            {calcPrecioIdx !== null && (
                <CalculatorModal
                    initial={String(lineas[calcPrecioIdx]?.precio ?? '0')}
                    onConfirm={val => updatePrecio(calcPrecioIdx, val)}
                    onClose={() => setCalcPrecioIdx(null)}
                />
            )}

            {/* Lote modal */}
            {loteModal && (
                <LoteModal
                    nombre={loteModal.articulo.nombre}
                    referencia={loteModal.articulo.referencia}
                    lotes={loteModal.lotes}
                    onConfirm={handleConfirmarLotes}
                    onClose={() => setLoteModal(null)}
                />
            )}

            {/* ── Modal Documentos Cliente ── */}
            {showDocsModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-800">
                                Documentos – {docsClienteTarget?.nombre}
                            </h2>
                            <button onClick={() => { setShowDocsModal(false); setDocsClienteTarget(null) }} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        {!loadingDocs && docsCliente.length > 0 && (
                            <div className="px-4 py-2 border-b border-slate-100 bg-amber-50/70">
                                <p className="text-xs font-medium text-amber-800">
                                    Total pendiente de cobro: {totalPteCobro.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                                </p>
                            </div>
                        )}
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-brand"
                                    checked={soloPte}
                                    onChange={e => { setSoloPte(e.target.checked); reloadDocs(e.target.checked, docsFiltraTipo) }}
                                />
                                Solo pendientes
                            </label>
                            <select
                                className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                                value={docsFiltraTipo}
                                onChange={e => {
                                    const v = e.target.value as 'todos' | '4' | '8'
                                    setDocsFiltraTipo(v)
                                    reloadDocs(soloPte, v)
                                }}
                            >
                                <option value="todos">Todos</option>
                                <option value="4">Albaranes</option>
                                <option value="8">Facturas</option>
                            </select>
                        </div>
                        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                            {loadingDocs ? (
                                <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                                </div>
                            ) : docsCliente.length === 0 ? (
                                <p className="text-center text-slate-400 py-8 text-sm">No hay documentos{soloPte ? ' pendientes' : ''}</p>
                            ) : docsCliente.map(doc => (
                                <div key={doc.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <button
                                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                                    >
                                        {doc.tipodoc === 4 ? <Truck className="w-4 h-4 text-amber-600" /> : <FileText className="w-4 h-4 text-green-600" />}
                                        <div className="flex-1 text-left">
                                            <p className="text-sm font-semibold text-slate-800">
                                                {doc.tipodoc_label} {doc.serie}-{doc.numero}
                                                <span className="ml-2 text-xs text-slate-400 font-normal">{doc.fecha}</span>
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Total: {doc.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                                                {doc.pendiente > 0 && (
                                                    <span className="ml-2 text-red-600 font-medium">Pte: {doc.pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                                                )}
                                            </p>
                                        </div>
                                        {expandedDoc === doc.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                    </button>

                                    {expandedDoc === doc.id && (
                                        <div className="px-3 pb-3 pt-2 space-y-2">
                                            {doc.tipodoc === 4 ? (
                                                /* Albarán */
                                                <div className="flex items-center justify-between">
                                                    <div className="text-xs text-slate-600 space-y-0.5">
                                                        <p>Pagado: <span className="font-medium">{doc.pagado.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span></p>
                                                        <p>Pendiente: <span className="font-medium text-red-600">{doc.pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span></p>
                                                    </div>
                                                    {doc.pendiente > 0 && (
                                                        <button
                                                            onClick={() => openCobrar({ tipo: 'albaran', idcab: doc.id, maxImporte: doc.pendiente, label: `Alb. ${doc.serie}-${doc.numero}` })}
                                                            className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg"
                                                        >
                                                            <CreditCard className="w-3.5 h-3.5" /> Cobrar
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                /* Factura – list de vencimientos */
                                                doc.vencimientos.length === 0 ? (
                                                    <p className="text-xs text-slate-400">Sin vencimientos</p>
                                                ) : doc.vencimientos.map(vto => (
                                                    <div key={vto.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-2 py-1.5 bg-white">
                                                        <div className="text-xs text-slate-600 space-y-0.5">
                                                            <p className="font-medium">{vto.fecha_vencimiento}</p>
                                                            <p>
                                                                {vto.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                                                                {vto.entregas_cuenta > 0 && (
                                                                    <span className="ml-1 text-slate-400">(a cta: {vto.entregas_cuenta.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€)</span>
                                                                )}
                                                                {vto.situacion === 0 ? (
                                                                    <span className="ml-2 text-red-500 font-medium">Pte</span>
                                                                ) : (
                                                                    <span className="ml-2 text-green-600 font-medium">Cobrado</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        {vto.situacion === 0 && (
                                                            <button
                                                                onClick={() => openCobrar({
                                                                    tipo: 'vencimiento',
                                                                    idcab: doc.id,
                                                                    vtoId: vto.id,
                                                                    maxImporte: Math.max(0, vto.importe - vto.entregas_cuenta),
                                                                    label: `Vto. ${vto.fecha_vencimiento}`,
                                                                })}
                                                                className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg"
                                                            >
                                                                <CreditCard className="w-3.5 h-3.5" /> Cobrar
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Cobrar ── */}
            {cobrarTarget && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-bold text-slate-800">Cobrar – {cobrarTarget.label}</h2>
                            <button onClick={() => setCobrarTarget(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Forma de pago</label>
                                {fpagosDisponibles.length === 0 ? (
                                    <p className="text-xs text-slate-400">No hay formas de pago configuradas</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {fpagosDisponibles.map(fp => (
                                            <button
                                                key={fp.codigo}
                                                onClick={() => setCobrarFpago(fp.codigo)}
                                                className={`text-xs px-3 py-2 rounded-lg border-2 transition-colors ${cobrarFpago === fp.codigo ? 'border-brand bg-brand/10 text-brand font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                            >
                                                {fp.nombre}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Importe (máx. {cobrarTarget.maxImporte.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={cobrarTarget.maxImporte}
                                    className="input text-right text-lg font-bold"
                                    value={cobrarImporte}
                                    onChange={e => setCobrarImporte(e.target.value)}
                                />
                            </div>
                            {cobrarError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {cobrarError}
                                </div>
                            )}
                            <button
                                onClick={handleCobrar}
                                disabled={cobrarLoading || !cobrarFpago}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {cobrarLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</> : <><Check className="w-4 h-4" /> Confirmar cobro</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Consultar (standalone) ── */}
            {showConsultarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-800">Consultar documentos</h2>
                            <button onClick={() => setShowConsultarModal(false)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-4">
                            {!consultarCliente ? (
                                <>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                        <input
                                            className="input pl-8"
                                            placeholder="Buscar cliente..."
                                            value={consultarQuery}
                                            onChange={e => setConsultarQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    {consultarQuery.length >= 2 && (
                                        <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                                            {clientesCache
                                                .filter(c =>
                                                    c.nombre.toLowerCase().includes(consultarQuery.toLowerCase()) ||
                                                    c.alias?.toLowerCase().includes(consultarQuery.toLowerCase())
                                                )
                                                .slice(0, 30)
                                                .map(c => (
                                                    <button key={c.codigo} onClick={() => {
                                                        setConsultarCliente(c)
                                                        setShowConsultarModal(false)
                                                        openDocsModal(c, false)
                                                    }} className="w-full text-left px-3 py-2 hover:bg-brand/5 border-b border-slate-100 last:border-0">
                                                        <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                                                        <p className="text-xs text-slate-400">{c.localidad} · {c.cif}</p>
                                                    </button>
                                                ))}
                                            {clientesCache.filter(c =>
                                                c.nombre.toLowerCase().includes(consultarQuery.toLowerCase()) ||
                                                c.alias?.toLowerCase().includes(consultarQuery.toLowerCase())
                                            ).length === 0 && (
                                                <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-lg px-3 py-2">
                                    <Check className="w-4 h-4 text-brand" />
                                    <p className="text-sm font-semibold">{consultarCliente.nombre}</p>
                                    <button onClick={() => setConsultarCliente(null)} className="ml-auto p-1 rounded hover:bg-slate-200">
                                        <X className="w-3.5 h-3.5 text-slate-400" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Añadir Artículo ── */}
            {showAddArticuloModal && clienteSeleccionado && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-800">Añadir artículo</h2>
                            <button onClick={() => { setShowAddArticuloModal(false); setArticuloQuery(''); setArticuloResults([]) }} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="relative mb-3">
                                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    className="input pl-8 pr-8"
                                    placeholder="Buscar por referencia o nombre..."
                                    value={articuloQuery}
                                    onChange={e => handleArticuloInput(e.target.value)}
                                    autoFocus
                                />
                                {searchingArticulo && (
                                    <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 animate-spin" />
                                )}
                            </div>
                            {articuloResults.length > 0 ? (
                                vistaImagenes ? (
                                    <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                                        {articuloResults.map(a => (
                                            <button
                                                key={a.referencia}
                                                onClick={() => addArticuloToLineas(a)}
                                                className="text-left rounded-xl border border-slate-200 overflow-hidden hover:border-brand transition-colors flex flex-col"
                                            >
                                                {a.tiene_imagen ? (
                                                    <div className="bg-slate-50 flex items-center justify-center overflow-hidden" style={{ height: 70 }}>
                                                        <img
                                                            src={`/api/autoventa/articulos/${encodeURIComponent(a.referencia)}/imagen`}
                                                            alt={a.nombre}
                                                            className="object-contain w-full h-full"
                                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="bg-slate-100 flex items-center justify-center" style={{ height: 70 }}>
                                                        <Package className="w-6 h-6 text-slate-300" />
                                                    </div>
                                                )}
                                                <div className="p-1.5">
                                                    <p className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2">{a.nombre}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                        {a.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                                        {a.control_lotes && <Package className="inline w-2.5 h-2.5 ml-1 text-amber-500" />}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100">
                                        {articuloResults.map(a => (
                                            <button
                                                key={a.referencia}
                                                onClick={() => addArticuloToLineas(a)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-brand/5 transition-colors"
                                            >
                                                <p className="text-sm font-medium text-slate-800 leading-tight flex items-center gap-1.5">
                                                    {a.nombre}
                                                    {a.control_lotes && <Package className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                                                </p>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5">
                                                    {a.referencia}
                                                    <span className="ml-2 text-slate-600 font-sans">{a.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                                                    <span className="ml-1 text-slate-300">IVA {a.piva}%</span>
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )
                            ) : articuloQuery.length >= 2 && !searchingArticulo ? (
                                <p className="text-sm text-slate-400 text-center py-6">Sin resultados para &ldquo;{articuloQuery}&rdquo;</p>
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-4">Escribe al menos 2 caracteres para buscar</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </div>
    )
}
