import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import {
    ClipboardList, Search, ArrowLeft, Barcode, Check, X, AlertCircle,
    Loader2, ChevronRight, Package, BadgeCheck, Clock, Layers,
    Filter, ChevronDown, Building2
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface PedidoCompra {
    id: number
    serie: string
    numero: number
    pro_codigo: number
    pro_nombre: string
    fecha: string
    fechaentrega: string | null
    pro_referencia: string
    lineas_pendientes: number
    lineas_total: number
    total_uds_pedidas: number
    total_uds_servidas: number
    estado: 'pendiente' | 'parcial'
}

interface LineaCompra {
    id: number
    orden: number
    referencia: string
    descripcion: string
    articulo_nombre: string
    unidades: number
    udservidas: number
    ud_pendiente: number
    precio: number
    importe: number
    piva: number
    pdto1: number
    talla: string
    color: string
    almacen: number
    control_lotes: boolean
    tallas_colores: boolean
}

interface PedidoCompraDetalle {
    id: number
    serie: string
    numero: number
    fecha: string
    fechaentrega: string | null
    pro_codigo: number
    pro_nombre: string
    pro_cif: string
    pro_referencia: string
    observaciones: string
    lineas: LineaCompra[]
    codbarras: PreloadCodbarras[]
    lotes_data: Record<string, LoteDisponible[]>
}

interface PreloadCodbarras {
    referencia: string
    codbarras: string
    talla: string
    color: string
}

interface LoteDisponible {
    id: number
    lote: string
    fecha_caducidad: string | null
    stock: number
}

interface LoteRecepcion {
    id_lote: number
    lote: string
    unidades: number
}

interface ScanLineaResult {
    id: number
    referencia: string
    descripcion: string
    articulo_nombre: string
    unidades: number
    udservidas: number
    ud_pendiente: number
    talla: string
    color: string
    control_lotes: boolean
    tallas_colores: boolean
    lotes?: LoteDisponible[]
    stock_total?: number
    lotes_auto?: LoteRecepcion[]
}

interface LineaConfirmada {
    id_linea_pedido: number
    referencia: string
    descripcion: string
    unidades: number
    lotes?: LoteRecepcion[]
    talla?: string
    color?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
    if (!s) return '—'
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

function distribuirFefo(lotes: LoteDisponible[], udsNecesarias: number): LoteRecepcion[] {
    const dist: LoteRecepcion[] = []
    let remaining = udsNecesarias
    for (const lote of lotes) {
        if (remaining <= 0) break
        const take = Math.min(lote.stock, remaining)
        if (take > 0) {
            dist.push({ id_lote: lote.id, lote: lote.lote, unidades: Math.round(take * 10000) / 10000 })
            remaining -= take
        }
    }
    return dist
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RecepcionPedidos() {
    // ── Lista de pedidos ──────────────────────────────────────────────────
    const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
    const [loadingLista, setLoadingLista] = useState(false)
    const [busqueda, setBusqueda] = useState('')
    const [errorLista, setErrorLista] = useState('')

    // ── Series disponibles + filtro multiselect ───────────────────────────
    const [seriesDisponibles, setSeriesDisponibles] = useState<string[]>([])
    const [seriesFiltro, setSeriesFiltro] = useState<string[]>([])
    const [showFiltroPanel, setShowFiltroPanel] = useState(false)
    const filtroRef = useRef<HTMLDivElement>(null)

    // ── Detalle pedido ────────────────────────────────────────────────────
    const [pedidoDetalle, setPedidoDetalle] = useState<PedidoCompraDetalle | null>(null)
    const [loadingDetalle, setLoadingDetalle] = useState(false)
    const [errorDetalle, setErrorDetalle] = useState('')

    // ── Escáner ───────────────────────────────────────────────────────────
    const [scanInput, setScanInput] = useState('')
    const [scanError, setScanError] = useState('')
    const scanRef = useRef<HTMLInputElement>(null)

    // ── Modal confirmación línea ──────────────────────────────────────────
    const [scanLineas, setScanLineas] = useState<ScanLineaResult[]>([])
    const [showScanModal, setShowScanModal] = useState(false)
    const [modalLinea, setModalLinea] = useState<ScanLineaResult | null>(null)
    const [modalUds, setModalUds] = useState('')
    const [modalLotes, setModalLotes] = useState<LoteRecepcion[]>([])
    const [sinStockWarn, setSinStockWarn] = useState(false)

    // ── Líneas confirmadas ────────────────────────────────────────────────
    const [confirmadas, setConfirmadas] = useState<LineaConfirmada[]>([])

    // ── Generar recepción ─────────────────────────────────────────────────
    const [showGenModal, setShowGenModal] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [resultado, setResultado] = useState<{ id: number; serie: string; numero: number; total: number; finalizado: boolean } | null>(null)
    const [errorGen, setErrorGen] = useState('')

    // ── Datos precargados ─────────────────────────────────────────────────
    const [preloadCodbarras, setPreloadCodbarras] = useState<PreloadCodbarras[]>([])
    const [preloadLotes, setPreloadLotes] = useState<Record<string, LoteDisponible[]>>({})

    // ── Cargar series disponibles ─────────────────────────────────────────
    useEffect(() => {
        api.get<string[]>('/api/almacen/recepcion/series')
            .then(r => setSeriesDisponibles(r.data))
            .catch(() => {/* silent */})
    }, [])

    // ── Cerrar panel de filtro al hacer click fuera ───────────────────────
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (filtroRef.current && !filtroRef.current.contains(e.target as Node)) {
                setShowFiltroPanel(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // ── Cargar lista de pedidos ───────────────────────────────────────────
    const cargarPedidos = async (q?: string, series?: string[]) => {
        setLoadingLista(true)
        setErrorLista('')
        try {
            const params = new URLSearchParams()
            if (q) params.set('q', q)
            if (series && series.length > 0) params.set('series', series.join(','))
            const r = await api.get<PedidoCompra[]>(`/api/almacen/recepcion/pedidos?${params}`)
            setPedidos(r.data)
        } catch (e: any) {
            setErrorLista(e.response?.data?.detail || 'Error cargando pedidos')
        } finally {
            setLoadingLista(false)
        }
    }

    useEffect(() => { cargarPedidos('', []) }, [])

    // ── Abrir pedido ──────────────────────────────────────────────────────
    const abrirPedido = async (id: number) => {
        setLoadingDetalle(true)
        setErrorDetalle('')
        setConfirmadas([])
        setScanInput('')
        setScanError('')
        try {
            const rDet = await api.get<PedidoCompraDetalle>(`/api/almacen/recepcion/pedidos/${id}`)
            setPedidoDetalle(rDet.data)
            setPreloadCodbarras(rDet.data.codbarras || [])
            setPreloadLotes(rDet.data.lotes_data || {})
        } catch (e: any) {
            setErrorDetalle(e.response?.data?.detail || 'Error cargando pedido')
        } finally {
            setLoadingDetalle(false)
        }
    }

    useEffect(() => {
        if (pedidoDetalle && scanRef.current) scanRef.current.focus()
    }, [pedidoDetalle])

    // ── Escáner local ─────────────────────────────────────────────────────
    const handleScan = () => {
        const codigo = scanInput.trim()
        if (!codigo || !pedidoDetalle) return
        setScanError('')

        const lineasPendientes = pedidoDetalle.lineas
        let encontradas = lineasPendientes.filter(
            l => l.referencia.trim().toLowerCase() === codigo.toLowerCase()
        )
        let tallaBc = ''
        let colorBc = ''

        if (encontradas.length === 0) {
            const bc = preloadCodbarras.find(c => c.codbarras === codigo)
            if (bc) {
                tallaBc = bc.talla || ''
                colorBc = bc.color || ''
                encontradas = lineasPendientes.filter(l => {
                    if (l.referencia !== bc.referencia) return false
                    if (tallaBc && l.talla && l.talla !== tallaBc) return false
                    if (colorBc && l.color && l.color !== colorBc) return false
                    return true
                })
            }
        }

        if (encontradas.length === 0) {
            setScanError(`No encontrado en este pedido: "${codigo}"`)
            setScanInput('')
            return
        }

        const resultLineas: ScanLineaResult[] = encontradas.map(l => {
            const talla = tallaBc || l.talla
            const color = colorBc || l.color
            const lineResult: ScanLineaResult = {
                id: l.id, referencia: l.referencia, descripcion: l.descripcion,
                articulo_nombre: l.articulo_nombre, unidades: l.unidades,
                udservidas: l.udservidas, ud_pendiente: l.ud_pendiente,
                talla, color, control_lotes: l.control_lotes, tallas_colores: l.tallas_colores,
            }
            if (l.control_lotes) {
                const lotes = preloadLotes[l.referencia] || []
                lineResult.lotes = lotes
                lineResult.stock_total = lotes.reduce((acc, lt) => acc + lt.stock, 0)
                lineResult.lotes_auto = distribuirFefo(lotes, l.ud_pendiente)
            }
            return lineResult
        })

        setScanInput('')
        setScanLineas(resultLineas)
        if (resultLineas.length === 1) abrirModalLinea(resultLineas[0])
        else setShowScanModal(true)
    }

    const handleScanKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleScan()
    }

    // ── Modal confirmar línea ─────────────────────────────────────────────
    const abrirModalLinea = (linea: ScanLineaResult) => {
        setModalLinea(linea)
        setModalUds(linea.ud_pendiente.toFixed(2).replace(/\.00$/, ''))
        if (linea.control_lotes && linea.lotes_auto) {
            setModalLotes(linea.lotes_auto.map(l => ({ ...l })))
        } else {
            setModalLotes([])
        }
        setSinStockWarn(false)
        setShowScanModal(false)
    }

    const totalLotes = modalLotes.reduce((acc, l) => acc + l.unidades, 0)

    useEffect(() => {
        if (!sinStockWarn || !modalLinea) return
        const stockTotal = modalLinea.stock_total ?? 0
        if (stockTotal <= 0) return
        const udsActuales = parseFloat(modalUds) || 0
        if (udsActuales <= stockTotal + 0.001) setSinStockWarn(false)
    }, [modalUds, totalLotes, modalLinea, sinStockWarn])

    const confirmarLinea = () => {
        if (!modalLinea) return
        const uds = parseFloat(modalUds)
        if (isNaN(uds) || uds <= 0) return

        if (modalLinea.control_lotes) {
            const stockTotal = modalLinea.stock_total ?? 0
            if (uds > stockTotal + 0.001 && !sinStockWarn) { setSinStockWarn(true); return }
            if (!sinStockWarn) {
                const totalLotesUds = modalLotes.filter(l => l.unidades > 0).reduce((a, l) => a + l.unidades, 0)
                if (Math.abs(totalLotesUds - uds) > 0.001) return
            }
        }

        const nueva: LineaConfirmada = {
            id_linea_pedido: modalLinea.id, referencia: modalLinea.referencia,
            descripcion: modalLinea.descripcion, unidades: uds,
            talla: modalLinea.talla || undefined, color: modalLinea.color || undefined,
        }
        if (modalLinea.control_lotes && modalLotes.length > 0) {
            nueva.lotes = modalLotes.filter(l => l.unidades > 0)
        }

        setConfirmadas(prev => {
            const exists = prev.findIndex(c => c.id_linea_pedido === modalLinea.id)
            if (exists >= 0) { const next = [...prev]; next[exists] = nueva; return next }
            return [...prev, nueva]
        })
        setModalLinea(null)
        setTimeout(() => scanRef.current?.focus(), 50)
    }

    const eliminarConfirmada = (id: number) => {
        setConfirmadas(prev => prev.filter(c => c.id_linea_pedido !== id))
    }

    // ── Generar recepción ─────────────────────────────────────────────────
    const generarRecepcion = async () => {
        if (!pedidoDetalle || confirmadas.length === 0) return
        setGenerando(true)
        setErrorGen('')
        try {
            const r = await api.post<{ id: number; serie: string; numero: number; total: number; finalizado: boolean }>(
                `/api/almacen/recepcion/pedidos/${pedidoDetalle.id}/crear-albaran`,
                { lineas: confirmadas }
            )
            setResultado(r.data)
            setShowGenModal(false)
        } catch (e: any) {
            setErrorGen(e.response?.data?.detail || 'Error generando recepción')
        } finally {
            setGenerando(false)
        }
    }

    const resetearDetalle = () => {
        setPedidoDetalle(null); setConfirmadas([]); setResultado(null); setErrorGen('')
        cargarPedidos(busqueda, seriesFiltro)
    }

    // ── Aplicar filtro de series ──────────────────────────────────────────
    const toggleSerie = (serie: string) => {
        setSeriesFiltro(prev => prev.includes(serie) ? prev.filter(s => s !== serie) : [...prev, serie])
    }

    const aplicarFiltroSeries = () => {
        setShowFiltroPanel(false)
        cargarPedidos(busqueda, seriesFiltro)
    }

    // ══════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════

    if (!pedidoDetalle) {
        return (
            <div className="p-4 max-w-4xl mx-auto space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardList className="w-5 h-5 text-brand" />
                    <h1 className="text-xl font-bold">Recepción de Pedidos</h1>
                    <span className="text-xs text-slate-500 ml-1">Pedidos de compra pendientes de recibir</span>
                </div>

                {/* Filtro series */}
                <div className="flex gap-2 flex-wrap items-center">
                    <div className="relative" ref={filtroRef}>
                        <button
                            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand transition-colors bg-white"
                            onClick={() => setShowFiltroPanel(v => !v)}
                        >
                            <Filter className="w-4 h-4" />
                            {seriesFiltro.length === 0
                                ? 'Todas las series'
                                : `${seriesFiltro.length} serie${seriesFiltro.length !== 1 ? 's' : ''}`}
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        </button>

                        {showFiltroPanel && seriesDisponibles.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] p-3 space-y-1">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Series</p>
                                {seriesDisponibles.map(s => (
                                    <label key={s} className="flex items-center gap-2 cursor-pointer hover:text-brand py-0.5">
                                        <input
                                            type="checkbox"
                                            checked={seriesFiltro.includes(s)}
                                            onChange={() => toggleSerie(s)}
                                            className="rounded"
                                        />
                                        <span className="text-sm font-mono">{s}</span>
                                    </label>
                                ))}
                                <div className="pt-2 border-t border-slate-100 flex gap-2">
                                    <button
                                        className="flex-1 text-xs text-slate-500 hover:text-slate-700 py-1"
                                        onClick={() => {
                                            setSeriesFiltro([])
                                            setShowFiltroPanel(false)
                                            cargarPedidos(busqueda, [])
                                        }}
                                    >
                                        Limpiar
                                    </button>
                                    <button className="flex-1 btn-primary text-xs py-1" onClick={aplicarFiltroSeries}>
                                        Aplicar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {seriesFiltro.map(s => (
                        <span key={s} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                            {s}
                            <button onClick={() => {
                                const next = seriesFiltro.filter(x => x !== s)
                                setSeriesFiltro(next)
                                cargarPedidos(busqueda, next)
                            }}>
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>

                {/* Búsqueda */}
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        className="input pl-9 w-full"
                        placeholder="Buscar por proveedor, serie o número..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && cargarPedidos(busqueda, seriesFiltro)}
                    />
                    <button
                        className="absolute right-2 top-1.5 btn-primary text-xs px-3 py-1"
                        onClick={() => cargarPedidos(busqueda, seriesFiltro)}
                    >
                        Buscar
                    </button>
                </div>

                {errorLista && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle className="w-4 h-4" /> {errorLista}
                    </div>
                )}

                {loadingLista ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-brand" />
                    </div>
                ) : pedidos.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay pedidos de compra pendientes de recibir</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {pedidos.map(p => (
                            <button
                                key={p.id}
                                onClick={() => abrirPedido(p.id)}
                                className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-brand hover:shadow-sm transition-all flex items-center gap-3"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-slate-800 text-sm">{p.serie} / {p.numero}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                            p.estado === 'parcial' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {p.estado === 'parcial' ? 'Parcial' : 'Pendiente'}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 truncate flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                        {p.pro_nombre}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                        <span>{fmtDate(p.fecha)}</span>
                                        <span>·</span>
                                        <span>{p.lineas_pendientes} línea{p.lineas_pendientes !== 1 ? 's' : ''} pendiente{p.lineas_pendientes !== 1 ? 's' : ''}</span>
                                        {p.pro_referencia && (
                                            <><span>·</span><span className="font-mono text-slate-400">{p.pro_referencia}</span></>
                                        )}
                                    </div>
                                    {p.fechaentrega && (
                                        <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Entrega esperada: {fmtDate(p.fechaentrega)}
                                        </p>
                                    )}
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // ── Vista Detalle ──────────────────────────────────────────────────────

    if (loadingDetalle) {
        return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
    }

    if (resultado) {
        return (
            <div className="p-4 max-w-lg mx-auto">
                <div className="bg-white rounded-2xl border border-green-200 p-6 text-center space-y-3">
                    <BadgeCheck className="w-12 h-12 text-green-500 mx-auto" />
                    <h2 className="text-lg font-bold text-slate-800">Recepción registrada</h2>
                    <p className="text-slate-600">
                        Albarán <span className="font-semibold text-brand">{resultado.serie} / {resultado.numero}</span> creado correctamente.
                    </p>
                    {resultado.finalizado && (
                        <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700 text-sm font-medium">
                            <Check className="w-4 h-4" /> Pedido marcado como finalizado
                        </div>
                    )}
                    <button className="btn-primary w-full" onClick={resetearDetalle}>Nueva recepción</button>
                </div>
            </div>
        )
    }

    const ped = pedidoDetalle

    return (
        <div className="p-4 max-w-4xl mx-auto space-y-3">

            {/* Header detalle */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => { setPedidoDetalle(null); setConfirmadas([]) }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-lg font-bold text-slate-800">Pedido {ped.serie} / {ped.numero}</h1>
                    <p className="text-sm text-slate-600 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" /> {ped.pro_nombre}
                    </p>
                </div>
                <div className="ml-auto text-right text-xs text-slate-500">
                    <p>{fmtDate(ped.fecha)}</p>
                    {ped.pro_referencia && <p className="font-mono text-slate-400">{ped.pro_referencia}</p>}
                    {ped.fechaentrega && <p className="text-amber-600">Entrega: {fmtDate(ped.fechaentrega)}</p>}
                </div>
            </div>

            {errorDetalle && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" /> {errorDetalle}
                </div>
            )}

            {/* Escáner */}
            <div className="bg-white border border-slate-200 rounded-xl p-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <Barcode className="w-3.5 h-3.5" /> Escanear código de barras o referencia
                </label>
                <div className="flex gap-2">
                    <input
                        ref={scanRef}
                        className="input flex-1 font-mono"
                        placeholder="Escanear o escribir y pulsar Enter..."
                        value={scanInput}
                        onChange={e => { setScanInput(e.target.value); setScanError('') }}
                        onKeyDown={handleScanKey}
                    />
                    <button
                        className="btn-primary px-4 flex items-center gap-1.5"
                        onClick={handleScan}
                        disabled={!scanInput.trim()}
                    >
                        <Search className="w-4 h-4" /> Buscar
                    </button>
                </div>
                {scanError && (
                    <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {scanError}
                    </p>
                )}
            </div>

            {/* Líneas del pedido */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Líneas pendientes ({ped.lineas.length})
                    </span>
                    {confirmadas.length > 0 && (
                        <span className="text-xs text-green-600 font-semibold">
                            {confirmadas.length} confirmada{confirmadas.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="divide-y divide-slate-100">
                    {ped.lineas.map(linea => {
                        const conf = confirmadas.find(c => c.id_linea_pedido === linea.id)
                        return (
                            <div
                                key={linea.id}
                                className={`px-4 py-3 ${conf ? 'bg-green-50' : 'hover:bg-slate-50'} transition-colors`}
                            >
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400 font-mono">{linea.referencia}</span>
                                            {linea.control_lotes && (
                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                                    <Layers className="w-3 h-3" />Lotes
                                                </span>
                                            )}
                                            {linea.talla && (
                                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                                                    {linea.talla}{linea.color ? '/' + linea.color : ''}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-slate-800 truncate mt-0.5">{linea.descripcion}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span>Pedidas: <b className="text-slate-700">{linea.unidades}</b></span>
                                            {linea.udservidas > 0 && (
                                                <span>Recibidas: <b className="text-green-600">{linea.udservidas}</b></span>
                                            )}
                                            <span>Pendiente: <b className="text-brand">{linea.ud_pendiente}</b></span>
                                            <span className="ml-auto font-medium text-slate-600">{linea.precio.toFixed(4)} €/u</span>
                                        </div>
                                    </div>
                                    {conf ? (
                                        <div className="flex items-center gap-1.5">
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-green-600">{conf.unidades} uds</p>
                                                <p className="text-[10px] text-green-500">Confirmado</p>
                                            </div>
                                            <button
                                                onClick={() => eliminarConfirmada(linea.id)}
                                                className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:border-brand hover:text-brand transition-colors text-slate-500"
                                            onClick={() => {
                                                abrirModalLinea({
                                                    id: linea.id, referencia: linea.referencia,
                                                    descripcion: linea.descripcion, articulo_nombre: linea.articulo_nombre,
                                                    unidades: linea.unidades, udservidas: linea.udservidas,
                                                    ud_pendiente: linea.ud_pendiente, talla: linea.talla,
                                                    color: linea.color, control_lotes: linea.control_lotes,
                                                    tallas_colores: linea.tallas_colores,
                                                })
                                            }}
                                        >
                                            Confirmar
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Barra inferior */}
            {confirmadas.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto bg-white border-t lg:border border-slate-200 lg:rounded-xl px-4 py-3 flex items-center gap-3 z-30 lg:z-auto shadow-lg lg:shadow-none">
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                            {confirmadas.length} línea{confirmadas.length !== 1 ? 's' : ''} confirmada{confirmadas.length !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                            Albarán en serie <span className="font-mono font-semibold text-brand">{ped.serie}</span>
                        </p>
                    </div>
                    <button
                        className="btn-primary flex items-center gap-2"
                        onClick={() => { setShowGenModal(true); setErrorGen('') }}
                    >
                        <ClipboardList className="w-4 h-4" /> Registrar recepción
                    </button>
                </div>
            )}

            {/* Modal: múltiples líneas */}
            {showScanModal && scanLineas.length > 1 && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-800">Seleccionar línea</h2>
                            <button onClick={() => setShowScanModal(false)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {scanLineas.map(sl => (
                                <button
                                    key={sl.id}
                                    onClick={() => abrirModalLinea(sl)}
                                    className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-brand hover:bg-brand/5 transition-all"
                                >
                                    <p className="text-sm font-medium text-slate-800">{sl.descripcion}</p>
                                    <div className="flex gap-2 mt-1 text-xs text-slate-500">
                                        {sl.talla && <span>T: {sl.talla}</span>}
                                        {sl.color && <span>C: {sl.color}</span>}
                                        <span className="ml-auto">Pte: <b className="text-brand">{sl.ud_pendiente}</b></span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: confirmar línea */}
            {modalLinea && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-800">Confirmar recepción</h2>
                            <button onClick={() => setModalLinea(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-xs text-slate-500 font-mono">{modalLinea.referencia}</p>
                            <p className="font-medium text-slate-800 text-sm mt-0.5">{modalLinea.descripcion}</p>
                            {(modalLinea.talla || modalLinea.color) && (
                                <p className="text-xs text-blue-600 mt-0.5">
                                    {modalLinea.talla && `Talla: ${modalLinea.talla}`}
                                    {modalLinea.talla && modalLinea.color && ' · '}
                                    {modalLinea.color && `Color: ${modalLinea.color}`}
                                </p>
                            )}
                            <p className="text-xs text-slate-400 mt-1">Pendiente: <b className="text-brand">{modalLinea.ud_pendiente}</b> uds</p>
                        </div>

                        {!modalLinea.control_lotes && (
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Unidades recibidas</label>
                                <input
                                    type="number" min="0.001" step="1"
                                    className="input text-right text-xl font-bold"
                                    value={modalUds}
                                    onChange={e => setModalUds(e.target.value)}
                                    autoFocus
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => e.key === 'Enter' && confirmarLinea()}
                                />
                                {modalLinea.ud_pendiente > 0 && (
                                    <button
                                        className="text-xs text-brand mt-1 hover:underline"
                                        onClick={() => setModalUds(String(modalLinea.ud_pendiente))}
                                    >
                                        Usar todas ({modalLinea.ud_pendiente})
                                    </button>
                                )}
                            </div>
                        )}

                        {modalLinea.control_lotes && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-medium text-slate-600">Distribución por lotes</label>
                                    <span className={`text-xs font-bold ${Math.abs(totalLotes - parseFloat(modalUds || '0')) < 0.001 ? 'text-green-600' : 'text-red-500'}`}>
                                        Total: {totalLotes.toFixed(2)} / {modalUds}
                                    </span>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Uds. totales</label>
                                    <input
                                        type="number" min="0.001" step="1"
                                        className="input text-right font-bold mb-2"
                                        value={modalUds}
                                        onChange={e => setModalUds(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {modalLotes.map((lote, idx) => (
                                        <div key={lote.id_lote} className="flex items-center gap-2 bg-slate-50 rounded p-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-mono font-medium truncate">{lote.lote}</p>
                                                {modalLinea.lotes && (
                                                    <p className="text-[10px] text-slate-400">
                                                        Stock: {modalLinea.lotes.find(l => l.id === lote.id_lote)?.stock || 0} ·{' '}
                                                        {modalLinea.lotes.find(l => l.id === lote.id_lote)?.fecha_caducidad
                                                            ? `Cad: ${fmtDate(modalLinea.lotes.find(l => l.id === lote.id_lote)!.fecha_caducidad)}`
                                                            : 'Sin caducidad'}
                                                    </p>
                                                )}
                                            </div>
                                            <input
                                                type="number" min="0" step="1"
                                                className="w-20 input text-right text-sm"
                                                value={lote.unidades}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0
                                                    setModalLotes(prev => prev.map((l, i) => i === idx ? { ...l, unidades: val } : l))
                                                }}
                                            />
                                        </div>
                                    ))}
                                    {modalLinea.lotes && modalLinea.lotes
                                        .filter(l => !modalLotes.find(ml => ml.id_lote === l.id))
                                        .map(l => (
                                            <button
                                                key={l.id}
                                                className="w-full text-left text-xs text-brand border border-dashed border-brand/30 rounded p-1.5 hover:bg-brand/5"
                                                onClick={() => setModalLotes(prev => [...prev, { id_lote: l.id, lote: l.lote, unidades: 0 }])}
                                            >
                                                + {l.lote} (stock: {l.stock})
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        {sinStockWarn && modalLinea.control_lotes && (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                                <div>
                                    <p className="text-sm font-semibold">Stock insuficiente</p>
                                    <p className="text-xs mt-0.5">
                                        Stock disponible: <b>{modalLinea.stock_total ?? 0}</b> uds.
                                        Pulsa de nuevo para confirmar sin stock suficiente.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 font-medium transition-colors ${sinStockWarn ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'btn-primary'}`}
                            onClick={confirmarLinea}
                            disabled={
                                !parseFloat(modalUds) ||
                                (!sinStockWarn && modalLinea.control_lotes && (modalLinea.stock_total ?? 0) > 0 &&
                                    Math.abs(totalLotes - parseFloat(modalUds || '0')) > 0.001)
                            }
                        >
                            {sinStockWarn
                                ? <><AlertCircle className="w-4 h-4" /> Registrar sin stock suficiente</>
                                : <><Check className="w-4 h-4" /> Confirmar recepción</>
                            }
                        </button>
                    </div>
                </div>
            )}

            {/* Modal: confirmar generación */}
            {showGenModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-800">Registrar recepción</h2>
                            <button onClick={() => setShowGenModal(false)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                            <p className="text-slate-600">Proveedor: <b>{ped.pro_nombre}</b></p>
                            <p className="text-slate-600">Pedido: <b>{ped.serie} / {ped.numero}</b></p>
                            <p className="text-slate-600">Líneas a recibir: <b>{confirmadas.length}</b></p>
                            <p className="text-slate-500 text-xs mt-1">
                                Se generará un albarán en la serie{' '}
                                <span className="font-mono font-semibold text-brand">{ped.serie}</span>
                            </p>
                            {confirmadas.length === ped.lineas.length && (
                                <div className="flex items-center gap-1.5 mt-1 text-green-700 text-xs font-medium">
                                    <Check className="w-3.5 h-3.5" /> El pedido se marcará como finalizado
                                </div>
                            )}
                        </div>

                        {errorGen && (
                            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-2 rounded-lg">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorGen}
                            </div>
                        )}

                        <button
                            className="btn-primary w-full flex items-center justify-center gap-2"
                            onClick={generarRecepcion}
                            disabled={generando}
                        >
                            {generando
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                                : <><ClipboardList className="w-4 h-4" /> Confirmar y registrar</>
                            }
                        </button>
                    </div>
                </div>
            )}

            {confirmadas.length > 0 && <div className="h-20 lg:hidden" />}
        </div>
    )
}

