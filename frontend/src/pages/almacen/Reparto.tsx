import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import {
    Package, Settings, ArrowLeft, Check, CreditCard, AlertCircle,
    Loader2, MapPin, ChevronRight, X, BarChart3, Truck, Circle, Lock
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface HojaResumen {
    id: number
    fecha: string | null
    repartidor_nombre: string
    usuario_nombre: string
    observaciones: string
    estado: string
    num_lineas: number
    servidos: number
    pagados: number
    total: number
    cobrado: number
}

interface LineaHoja {
    id: number
    orden: number
    tipodoc: number
    tipo_label: string
    serie: string
    numero: number
    cli_codigo: number
    cli_nombre: string
    cli_localidad: string
    fecha_doc: string | null
    total: number
    observaciones: string
    servido: boolean
    pagado: boolean
    importe_cobrado: number
}

interface HojaDetalle {
    id: number
    fecha: string | null
    repartidor_nombre: string
    usuario_nombre: string
    observaciones: string
    estado: string
    lineas: LineaHoja[]
}

interface CajaOption {
    codigo: number
    nombre: string
}

interface ConfigData {
    caja_reparto: number | null
    cajas: CajaOption[]
}

interface ArqueoData {
    total_docs: number
    total_servidos: number
    total_no_servidos: number
    total_pagados: number
    total_cobrado: number
    total_pendiente: number
    caja_reparto: number | null
    lineas: LineaHoja[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtFecha(iso: string | null) {
    if (!iso) return '—'
    const d = iso.slice(0, 10).split('-')
    return `${d[2]}/${d[1]}/${d[0]}`
}

function fmtEur(n: number) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Reparto() {
    const { selectedLocal } = useAuth()
    const localId = selectedLocal?.id

    // Vista: 'list' | 'detail' | 'arqueo'
    const [vista, setVista] = useState<'list' | 'detail' | 'arqueo'>('list')
    const [hojas, setHojas] = useState<HojaResumen[]>([])
    const [hojaDetalle, setHojaDetalle] = useState<HojaDetalle | null>(null)
    const [arqueo, setArqueo] = useState<ArqueoData | null>(null)

    // Config modal
    const [configOpen, setConfigOpen] = useState(false)
    const [configData, setConfigData] = useState<ConfigData | null>(null)
    const [cajaSel, setCajaSel] = useState<number | null>(null)
    const [savingConfig, setSavingConfig] = useState(false)

    // UI
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [updatingLinea, setUpdatingLinea] = useState<number | null>(null)

    useEffect(() => {
        if (!localId) return
        fetchHojas()
    }, [localId])

    async function fetchHojas() {
        setLoading(true)
        setError('')
        try {
            const { data } = await api.get<HojaResumen[]>('/api/almacen/reparto/mis-hojas', {
                params: { local_id: localId },
            })
            setHojas(data)
        } catch {
            setError('Error al cargar hojas de carga')
        } finally {
            setLoading(false)
        }
    }

    async function openDetalle(id: number) {
        setLoading(true)
        setError('')
        try {
            const { data } = await api.get<HojaDetalle>(`/api/almacen/reparto/mis-hojas/${id}`, {
                params: { local_id: localId },
            })
            setHojaDetalle(data)
            setVista('detail')
        } catch {
            setError('Error al cargar la hoja')
        } finally {
            setLoading(false)
        }
    }

    async function openArqueo() {
        setLoading(true)
        setError('')
        try {
            const { data } = await api.get<ArqueoData>('/api/almacen/reparto/arqueo', {
                params: { local_id: localId },
            })
            setArqueo(data)
            setVista('arqueo')
        } catch {
            setError('Error al cargar arqueo')
        } finally {
            setLoading(false)
        }
    }

    async function openConfig() {
        try {
            const { data } = await api.get<ConfigData>('/api/almacen/reparto/config', {
                params: { local_id: localId },
            })
            setConfigData(data)
            setCajaSel(data.caja_reparto)
            setConfigOpen(true)
        } catch {
            setError('Error al cargar configuración')
        }
    }

    async function saveConfig() {
        setSavingConfig(true)
        try {
            await api.put('/api/almacen/reparto/config', { caja_reparto: cajaSel }, {
                params: { local_id: localId },
            })
            setConfigOpen(false)
        } catch {
            setError('Error al guardar configuración')
        } finally {
            setSavingConfig(false)
        }
    }

    async function updateLinea(
        hojaId: number,
        lineaId: number,
        changes: Partial<{ servido: boolean; pagado: boolean; importe_cobrado: number }>
    ) {
        setUpdatingLinea(lineaId)
        try {
            await api.patch(
                `/api/almacen/reparto/mis-hojas/${hojaId}/lineas/${lineaId}`,
                changes,
                { params: { local_id: localId } }
            )
            // Actualizar estado local
            setHojaDetalle(prev => {
                if (!prev) return prev
                return {
                    ...prev,
                    lineas: prev.lineas.map(l =>
                        l.id === lineaId ? { ...l, ...changes } : l
                    ),
                }
            })
        } catch {
            setError('Error al actualizar')
        } finally {
            setUpdatingLinea(null)
        }
    }

    async function cerrarHoja(id: number) {
        if (!confirm('¿Cerrar esta hoja de reparto? No se podrá reabrir.')) return
        setLoading(true)
        setError('')
        try {
            await api.patch(`/api/almacen/reparto/mis-hojas/${id}/cerrar`, {}, {
                params: { local_id: localId },
            })
            setVista('list')
            fetchHojas()
        } catch {
            setError('Error al cerrar la hoja')
        } finally {
            setLoading(false)
        }
    }

    // ── LISTA ────────────────────────────────────────────────────────────

    if (vista === 'list') {
        return (
            <div className="p-4 space-y-4 max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-green-600 rounded-lg flex items-center justify-center">
                            <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Mis Repartos</h1>
                            <p className="text-xs text-slate-500">Hojas de carga asignadas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openArqueo}
                            className="flex items-center gap-1.5 border border-green-300 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
                        >
                            <BarChart3 className="w-4 h-4" />
                            Arqueo
                        </button>
                        <button
                            onClick={openConfig}
                            className="flex items-center gap-1.5 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50 transition-colors"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                        <button onClick={() => setError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                    </div>
                ) : hojas.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No tienes hojas de carga asignadas</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {hojas.map(h => {
                            const progServido = h.num_lineas > 0 ? Math.round((h.servidos / h.num_lineas) * 100) : 0
                            return (
                                <button
                                    key={h.id}
                                    onClick={() => openDetalle(h.id)}
                                    className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-green-300 hover:shadow-sm transition-all"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-slate-800">Hoja #{h.id}</span>
                                                <span className="text-xs text-slate-400">{fmtFecha(h.fecha)}</span>
                                                {h.observaciones && (
                                                    <span className="text-xs text-slate-500 italic truncate">{h.observaciones}</span>
                                                )}
                                            </div>

                                            {/* Progress */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500 rounded-full transition-all"
                                                        style={{ width: `${progServido}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-slate-500 flex-shrink-0">
                                                    {h.servidos}/{h.num_lineas} servidos
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-3 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Check className="w-3 h-3 text-green-500" />
                                                    {h.pagados} cobrados
                                                </span>
                                                <span className="font-semibold text-slate-700">{fmtEur(h.cobrado)} cobrado</span>
                                                <span className="text-slate-400">/ {fmtEur(h.total)} total</span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Modal config */}
                {configOpen && configData && (
                    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setConfigOpen(false)}>
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                                <Settings className="w-4 h-4 text-slate-500" />
                                Configuración Reparto
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Caja de cobros
                                    </label>
                                    {configData.cajas.length === 0 ? (
                                        <p className="text-xs text-slate-400">No hay cajas disponibles</p>
                                    ) : (
                                        <select
                                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-400"
                                            value={cajaSel ?? ''}
                                            onChange={e => setCajaSel(e.target.value ? +e.target.value : null)}
                                        >
                                            <option value="">— Sin caja —</option>
                                            {configData.cajas.map(c => (
                                                <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                                            ))}
                                        </select>
                                    )}
                                    <p className="text-xs text-slate-400 mt-1">
                                        Los cobros del reparto se registrarán en esta caja
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setConfigOpen(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                                <button
                                    onClick={saveConfig}
                                    disabled={savingConfig}
                                    className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // ── ARQUEO ────────────────────────────────────────────────────────────

    if (vista === 'arqueo' && arqueo) {
        return (
            <div className="p-4 space-y-4 max-w-2xl mx-auto">
                <div className="flex items-center gap-3">
                    <button onClick={() => setVista('list')} className="text-slate-500 hover:text-slate-800">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-green-600" />
                        <h2 className="text-xl font-bold text-slate-800">Arqueo</h2>
                    </div>
                </div>

                {/* Cards resumen */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="text-xs text-slate-500 mb-1">Documentos</p>
                        <p className="text-2xl font-bold text-slate-800">{arqueo.total_docs}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{arqueo.total_servidos} servidos · {arqueo.total_no_servidos} pendientes</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <p className="text-xs text-green-600 mb-1">Total cobrado</p>
                        <p className="text-2xl font-bold text-green-700">{fmtEur(arqueo.total_cobrado)}</p>
                        <p className="text-xs text-green-500 mt-0.5">{arqueo.total_pagados} clientes</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 col-span-2">
                        <p className="text-xs text-amber-600 mb-1">Pendiente de servir</p>
                        <p className="text-xl font-bold text-amber-700">{fmtEur(arqueo.total_pendiente)}</p>
                    </div>
                </div>

                {/* Lista líneas */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detalle por documento</p>
                    </div>
                    {arqueo.lineas.length === 0 ? (
                        <p className="text-center py-8 text-slate-400 text-sm">Sin documentos</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {arqueo.lineas.map(l => (
                                <div key={l.id} className="px-4 py-3 flex items-center gap-3">
                                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${l.servido ? 'bg-blue-500' : 'bg-slate-200'}`}>
                                            {l.servido && <Check className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${l.pagado ? 'bg-green-500' : 'bg-slate-200'}`}>
                                            {l.pagado && <Check className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{l.cli_nombre}</p>
                                        <p className="text-xs text-slate-400 flex items-center gap-1">
                                            <span className={`px-1 rounded text-[10px] font-medium ${l.tipodoc === 2 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>{l.tipo_label}</span>
                                            {l.serie} {l.numero}
                                            {l.cli_localidad && <><MapPin className="w-2.5 h-2.5" />{l.cli_localidad}</>}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        {l.pagado ? (
                                            <p className="text-sm font-bold text-green-700">{fmtEur(l.importe_cobrado)}</p>
                                        ) : (
                                            <p className="text-sm font-semibold text-slate-600">{fmtEur(l.total)}</p>
                                        )}
                                        <p className="text-[10px] text-slate-400">{l.pagado ? 'cobrado' : 'pendiente'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ── DETALLE HOJA ──────────────────────────────────────────────────────

    if (vista === 'detail' && hojaDetalle) {
        const servidos = hojaDetalle.lineas.filter(l => l.servido).length
        const pagados = hojaDetalle.lineas.filter(l => l.pagado).length
        const total = hojaDetalle.lineas.length

        return (
            <div className="p-4 space-y-4 max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setVista('list'); fetchHojas() }}
                        className="text-slate-500 hover:text-slate-800"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-slate-800">Hoja #{hojaDetalle.id}</h2>
                        <p className="text-xs text-slate-500">{fmtFecha(hojaDetalle.fecha)} · {servidos}/{total} servidos · {pagados} cobrados</p>
                    </div>
                    <button
                        onClick={openArqueo}
                        className="flex items-center gap-1 border border-green-300 bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-green-100"
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Arqueo
                    </button>
                    {hojaDetalle.estado === 'activa' && (
                        <button
                            onClick={() => cerrarHoja(hojaDetalle.id)}
                            className="flex items-center gap-1 border border-slate-300 text-slate-600 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-50"
                        >
                            <Lock className="w-3.5 h-3.5" />
                            Cerrar
                        </button>
                    )}
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4" />{error}
                        <button onClick={() => setError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
                    </div>
                )}

                {/* Líneas */}
                <div className="space-y-3">
                    {hojaDetalle.lineas.map(linea => (
                        <LineaCard
                            key={linea.id}
                            linea={linea}
                            updating={updatingLinea === linea.id}
                            onUpdate={(changes) => updateLinea(hojaDetalle.id, linea.id, changes)}
                        />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
    )
}

// ── LineaCard ──────────────────────────────────────────────────────────────

interface LineaCardProps {
    linea: LineaHoja
    updating: boolean
    onUpdate: (changes: Partial<{ servido: boolean; pagado: boolean; importe_cobrado: number }>) => void
}

function LineaCard({ linea, updating, onUpdate }: LineaCardProps) {
    const [showImporte, setShowImporte] = useState(linea.pagado)
    const [importeLocal, setImporteLocal] = useState(
        linea.importe_cobrado > 0 ? String(linea.importe_cobrado) : String(linea.total)
    )

    function fmtEur(n: number) {
        return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    }

    function handleServido() {
        onUpdate({ servido: !linea.servido })
    }

    function handlePagado() {
        const newPagado = !linea.pagado
        setShowImporte(newPagado)
        const importe = parseFloat(importeLocal.replace(',', '.')) || linea.total
        onUpdate({
            pagado: newPagado,
            importe_cobrado: newPagado ? importe : 0,
        })
    }

    function handleImporteBlur() {
        if (linea.pagado) {
            const importe = parseFloat(importeLocal.replace(',', '.')) || linea.total
            onUpdate({ importe_cobrado: importe })
        }
    }

    const cardBg = linea.servido && linea.pagado
        ? 'border-green-200 bg-green-50'
        : linea.servido
        ? 'border-blue-200 bg-blue-50'
        : 'border-slate-200 bg-white'

    return (
        <div className={`border rounded-xl p-4 transition-all ${cardBg}`}>
            {/* Info cliente */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 leading-tight">{linea.cli_nombre}</p>
                    {linea.cli_localidad && (
                        <p className="text-xs text-slate-500 flex items-center gap-0.5 mt-0.5">
                            <MapPin className="w-3 h-3" />{linea.cli_localidad}
                        </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1 ${linea.tipodoc === 2 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                            {linea.tipo_label}
                        </span>
                        {linea.serie} {linea.numero}
                    </p>
                </div>
                <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-slate-800">{fmtEur(linea.total)}</p>
                </div>
            </div>

            {/* Botones acción */}
            <div className="flex items-center gap-2">
                {/* Servido */}
                <button
                    onClick={handleServido}
                    disabled={updating}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all border ${
                        linea.servido
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                    }`}
                >
                    {updating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : linea.servido ? (
                        <Check className="w-4 h-4" />
                    ) : (
                        <Circle className="w-4 h-4" />
                    )}
                    Servido
                </button>

                {/* Cobrado */}
                <button
                    onClick={handlePagado}
                    disabled={updating}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all border ${
                        linea.pagado
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white border-slate-300 text-slate-600 hover:border-green-400 hover:text-green-600'
                    }`}
                >
                    {linea.pagado ? (
                        <Check className="w-4 h-4" />
                    ) : (
                        <CreditCard className="w-4 h-4" />
                    )}
                    Cobrado
                </button>
            </div>

            {/* Importe cobrado */}
            {(linea.pagado || showImporte) && (
                <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-slate-600 flex-shrink-0">Importe cobrado:</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="flex-1 border border-green-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        value={importeLocal}
                        onChange={e => setImporteLocal(e.target.value)}
                        onBlur={handleImporteBlur}
                    />
                </div>
            )}
        </div>
    )
}
