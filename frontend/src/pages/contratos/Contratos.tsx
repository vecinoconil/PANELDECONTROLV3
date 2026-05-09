import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api/client'
import FichaCliente from '../../components/FichaCliente'
import {
    FileText, Search, X, Clock, Calendar, BarChart3,
    AlertCircle, AlertTriangle, CheckCircle, Loader2, RefreshCw,
    ChevronDown, ChevronUp, ChevronRight, TrendingUp
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
    (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtInt = (n: number | null | undefined) =>
    (n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })

const fmtDate = (s: string | null | undefined) => {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('es-ES')
}

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const PERIOD_LABEL: Record<number, string> = {
    0: 'Sin periodo', 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual'
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Kpis {
    total_contratos: number
    activos: number
    bajas: number
    con_impago: number
    cuota_total_mensual: number
    clientes_activos: number
    proximos_vencimientos: number
}

interface PorTipo {
    codigo: number
    tipo_nombre: string
    total: number
    activos: number
    bajas: number
    cuota_mensual: number
}

interface Contrato {
    id: number
    numero_contrato: number
    cli_codigo: number
    cli_nombre: string
    cli_alias?: string
    tipo_nombre: string
    tipo_contrato: number
    cuota_recibo: number
    periodicidad: number
    meses_activos: string
    fecha_formalizacion: string | null
    fecha_entrada_en_vigor: string | null
    fecha_fin: string | null
    fecha_baja: string | null
    indefinido: boolean
    desactivado: boolean
    impago: boolean
    concepto_contrato: string
}

interface VencimientoRow {
    id: number
    id_contrato: number
    fecha: string
    importe: number
    cli_codigo: number
    cli_nombre: string
    cli_alias?: string
    tipo_nombre: string
    tipo_contrato: number
    cuota_recibo: number
    numero_contrato: number
    concepto_contrato: string
    facturado_anio_anterior: boolean
}

interface SinVencRow {
    id_contrato: number
    numero_contrato: number
    cli_codigo: number
    cli_nombre: string
    cli_alias?: string
    tipo_nombre: string
    cuota_recibo: number
    concepto_contrato: string
    importe: number
    facturado_anio_anterior: boolean
}

interface MensualRow {
    mes: number
    cobrado: number
    facturado: number
    pendiente: number
    venc_cobrados: number
    venc_facturados: number
    venc_pendientes: number
}

interface VencRow {
    venc_id: number
    id_contrato: number
    fecha: string
    importe: number
    id_factura: number | null
    id_albaran: number | null
    numero_contrato: number
    cli_codigo: number
    cli_nombre: string
    cli_alias?: string
    tipo_nombre: string
    tipo_contrato: number
    cuota_recibo: number
    impago: boolean
    concepto_contrato: string
    fra_serie: string | null
    fra_numero: number | null
    fra_fecha: string | null
    vto_situacion: number | null
    vto_fechacobro: string | null
    estado: 'pendiente' | 'facturado' | 'cobrado'
}

type Tab = 'resumen' | 'contratos' | 'vencimientos' | 'mensual' | 'sin_facturar'

// ── Loader ────────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
    )
}

// ── Tab: RESUMEN ──────────────────────────────────────────────────────────────

type FichaRef = { codigo: number; nombre: string }

function TabResumen({ data, loading, onReload, onAbrirCliente }: {
    data: { kpis: Kpis; por_tipo: PorTipo[] } | null
    loading: boolean
    onReload: () => void
    onAbrirCliente: (ref: FichaRef) => void
}) {
    const [expanded, setExpanded] = useState<number | null>(null)
    const [detalle, setDetalle] = useState<Record<number, Contrato[]>>({})
    const [detalleLoading, setDetalleLoading] = useState<number | null>(null)

    const toggleTipo = async (codigo: number) => {
        if (expanded === codigo) { setExpanded(null); return }
        setExpanded(codigo)
        if (detalle[codigo]) return
        setDetalleLoading(codigo)
        try {
            const { data: res } = await api.get('/api/contratos/lista', {
                params: { tipo_contrato: codigo, solo_activos: true }
            })
            setDetalle(prev => ({ ...prev, [codigo]: res.contratos }))
        } catch { } finally { setDetalleLoading(null) }
    }

    if (loading) return <Spinner />
    if (!data) return (
        <div className="flex items-center justify-center py-16 text-slate-400">
            <button onClick={onReload} className="flex items-center gap-2 text-indigo-500 hover:text-indigo-700">
                <RefreshCw className="w-4 h-4" /> Cargar resumen
            </button>
        </div>
    )

    const { kpis, por_tipo } = data

    const cards = [
        { label: 'Contratos activos', value: fmtInt(kpis.activos), color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Clientes activos', value: fmtInt(kpis.clientes_activos), color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Cuota mensual total', value: `${fmt(kpis.cuota_total_mensual)} €`, color: 'text-violet-600', bg: 'bg-violet-50' },
        { label: 'Contratos de baja', value: fmtInt(kpis.bajas), color: 'text-slate-500', bg: 'bg-slate-50' },
        { label: 'Con impago', value: fmtInt(kpis.con_impago), color: 'text-red-600', bg: 'bg-red-50' },
        { label: 'Próx. vencimientos (90d)', value: fmtInt(kpis.proximos_vencimientos), color: 'text-amber-600', bg: 'bg-amber-50' },
    ]

    return (
        <div className="overflow-auto h-full p-3 sm:p-5 space-y-5">
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {cards.map(c => (
                    <div key={c.label} className={`${c.bg} rounded-xl p-3 sm:p-4 flex flex-col gap-1`}>
                        <p className="text-[10px] sm:text-xs text-slate-500 font-medium leading-tight">{c.label}</p>
                        <p className={`text-lg sm:text-2xl font-bold ${c.color} leading-none`}>{c.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabla por tipo */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Desglose por tipo de contrato</h3>
                    <button onClick={onReload} className="text-slate-400 hover:text-indigo-500 transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-left">
                                <th className="px-3 py-2 font-medium w-6"></th>
                                <th className="px-3 py-2 font-medium">Tipo</th>
                                <th className="px-3 py-2 font-medium text-right">Activos</th>
                                <th className="px-3 py-2 font-medium text-right">Bajas</th>
                                <th className="px-3 py-2 font-medium text-right">Cuota/mes (€)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {por_tipo.map(t => (
                                <>
                                    <tr
                                        key={t.codigo}
                                        onClick={() => toggleTipo(t.codigo)}
                                        className="hover:bg-indigo-50 cursor-pointer select-none transition-colors"
                                    >
                                        <td className="pl-3 py-2 text-slate-400">
                                            {detalleLoading === t.codigo
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                                                : expanded === t.codigo
                                                    ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                                                    : <ChevronRight className="w-3.5 h-3.5" />
                                            }
                                        </td>
                                        <td className="px-3 py-2 text-slate-700 font-medium">{t.tipo_nombre}</td>
                                        <td className="px-3 py-2 text-right font-medium text-emerald-600">{fmtInt(t.activos)}</td>
                                        <td className="px-3 py-2 text-right text-slate-400">{fmtInt(t.bajas)}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-indigo-600">{fmt(t.cuota_mensual)}</td>
                                    </tr>
                                    {expanded === t.codigo && (
                                        <tr key={`det-${t.codigo}`}>
                                            <td colSpan={5} className="p-0 bg-indigo-50/40">
                                                {detalleLoading === t.codigo ? (
                                                    <div className="py-4 flex justify-center">
                                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                                    </div>
                                                ) : (detalle[t.codigo] ?? []).length === 0 ? (
                                                    <p className="text-xs text-slate-400 px-8 py-3">Sin contratos activos</p>
                                                ) : (
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-slate-400 border-b border-indigo-100">
                                                                <th className="pl-8 pr-3 py-1.5 text-left font-medium">Cliente</th>
                                                                <th className="px-3 py-1.5 text-left font-medium hidden sm:table-cell">Meses cobro</th>
                                                                <th className="px-3 py-1.5 text-left font-medium hidden md:table-cell">Periodo</th>
                                                                <th className="px-3 py-1.5 text-right font-medium">Cuota/mes (€)</th>
                                                                <th className="px-3 py-1.5 text-center font-medium hidden sm:table-cell">Estado</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-indigo-100/60">
                                                            {(detalle[t.codigo] ?? []).map(c => {
                                                                const mesesStr = (c.meses_activos || '').trim()
                                                                const mesesLabel = mesesStr
                                                                    ? mesesStr.split(',').map(m => MESES_SHORT[parseInt(m.trim(), 10) - 1] ?? m.trim()).join(', ')
                                                                    : 'Todos'
                                                                return (
                                                                <tr key={c.id} className="hover:bg-indigo-100/30">
                                                                    <td className="pl-8 pr-3 py-1.5 font-medium text-indigo-700 underline cursor-pointer hover:text-indigo-900"
                                                                        onClick={() => onAbrirCliente({ codigo: c.cli_codigo, nombre: c.cli_nombre })}>
                                                                        {c.cli_nombre}{c.cli_alias ? ` (${c.cli_alias})` : ''}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">
                                                                        {mesesLabel}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-slate-400 hidden md:table-cell">
                                                                        {PERIOD_LABEL[c.periodicidad] ?? c.periodicidad}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right font-semibold text-indigo-600">
                                                                        {fmt(c.cuota_recibo)}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-center hidden sm:table-cell">
                                                                        {c.impago
                                                                            ? <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 text-[10px]"><AlertTriangle className="w-2.5 h-2.5" />Impago</span>
                                                                            : <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 text-[10px]"><CheckCircle className="w-2.5 h-2.5" />Activo</span>
                                                                        }
                                                                    </td>
                                                                </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                        <tfoot>
                                                            <tr className="border-t border-indigo-200 bg-indigo-50 font-semibold text-indigo-700">
                                                                <td className="pl-8 pr-3 py-1.5">{(detalle[t.codigo] ?? []).length} contrato{(detalle[t.codigo] ?? []).length !== 1 ? 's' : ''}</td>
                                                                <td className="hidden sm:table-cell" />
                                                                <td className="hidden md:table-cell" />
                                                                <td className="px-3 py-1.5 text-right">{fmt((detalle[t.codigo] ?? []).reduce((s, c) => s + (c.cuota_recibo ?? 0), 0))}</td>
                                                                <td className="hidden sm:table-cell" />
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-indigo-50 font-semibold text-indigo-700">
                                <td className="pl-3 py-2"></td>
                                <td className="px-3 py-2">Total</td>
                                <td className="px-3 py-2 text-right">{fmtInt(por_tipo.reduce((a, t) => a + (t.activos ?? 0), 0))}</td>
                                <td className="px-3 py-2 text-right text-slate-500">{fmtInt(por_tipo.reduce((a, t) => a + (t.bajas ?? 0), 0))}</td>
                                <td className="px-3 py-2 text-right">{fmt(por_tipo.reduce((a, t) => a + (t.cuota_mensual ?? 0), 0))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    )
}

// ── Tab: CONTRATOS ────────────────────────────────────────────────────────────

function TabContratos({ contratos, loading, soloActivos, setSoloActivos, busqueda, setBusqueda,
    filtroTipo, setFiltroTipo, tipos, onSearch }: {
    contratos: Contrato[]
    loading: boolean
    soloActivos: boolean
    setSoloActivos: (v: boolean) => void
    busqueda: string
    setBusqueda: (v: string) => void
    filtroTipo: number | ''
    setFiltroTipo: (v: number | '') => void
    tipos: { codigo: number; concepto: string }[]
    onSearch: () => void
}) {
    const [expanded, setExpanded] = useState<Record<number, boolean>>({})

    const toggle = (id: number) => setExpanded(p => ({ ...p, [id]: !p[id] }))

    // Group by client for a nicer view
    const grouped = contratos.reduce<Record<string, Contrato[]>>((acc, c) => {
        const key = `${c.cli_codigo}__${c.cli_nombre}`
        if (!acc[key]) acc[key] = []
        acc[key].push(c)
        return acc
    }, {})

    return (
        <div className="flex flex-col h-full">
            {/* Filters */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-100 bg-slate-50 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && onSearch()}
                            placeholder="Cliente, concepto o nº…"
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        />
                        {busqueda && (
                            <button onClick={() => { setBusqueda(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {/* Tipo selector */}
                    <select
                        value={filtroTipo}
                        onChange={e => setFiltroTipo(e.target.value === '' ? '' : Number(e.target.value))}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-slate-700"
                    >
                        <option value="">Todos los tipos</option>
                        {tipos.map(t => (
                            <option key={t.codigo} value={t.codigo}>{t.concepto}</option>
                        ))}
                    </select>

                    <button
                        onClick={onSearch}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Search className="w-3.5 h-3.5" />
                        Buscar
                    </button>
                </div>
                {contratos.length > 0 && (
                    <p className="text-xs text-slate-400">{contratos.length} contrato{contratos.length !== 1 ? 's' : ''} encontrado{contratos.length !== 1 ? 's' : ''}</p>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto">
                {loading ? <Spinner /> : (
                    <div className="divide-y divide-slate-100">
                        {Object.entries(grouped).map(([key, items]) => {
                            const [cliCodigo, cliNombre] = key.split('__')
                            const open = !!expanded[Number(cliCodigo)]
                            const cuotaTotal = items.reduce((s, c) => s + (c.cuota_recibo ?? 0), 0)
                            return (
                                <div key={key}>
                                    <button
                                        onClick={() => toggle(Number(cliCodigo))}
                                        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 hover:bg-slate-50 text-left"
                                    >
                                        {open ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                                        <span className="flex-1 text-sm font-medium text-slate-700 truncate">{cliNombre}</span>
                                        <span className="text-xs text-slate-400">{items.length} contrato{items.length !== 1 ? 's' : ''}</span>
                                        <span className="text-xs font-semibold text-indigo-600 ml-2 hidden sm:block">{fmt(cuotaTotal)} €/mes</span>
                                    </button>
                                    {open && (
                                        <div className="bg-slate-50 divide-y divide-slate-100 border-t border-slate-100">
                                            {items.map(c => (
                                                <div key={c.id} className="px-4 sm:px-8 py-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1 sm:gap-2 text-xs">
                                                    <div>
                                                        <p className="font-medium text-slate-700">{c.tipo_nombre}</p>
                                                        {c.concepto_contrato && <p className="text-slate-400 truncate">{c.concepto_contrato}</p>}
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                                                        <span>Periodicidad: <strong>{PERIOD_LABEL[c.periodicidad] ?? c.periodicidad}</strong></span>
                                                        <span>Cuota: <strong className="text-indigo-600">{fmt(c.cuota_recibo)} €</strong></span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                                                        <span>Inicio: {fmtDate(c.fecha_entrada_en_vigor)}</span>
                                                        {c.indefinido
                                                            ? <span className="text-emerald-600 font-medium">Indefinido</span>
                                                            : <span>Fin: {fmtDate(c.fecha_fin)}</span>
                                                        }
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {c.impago && (
                                                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-2 py-0.5 text-[10px] font-medium">
                                                                <AlertTriangle className="w-3 h-3" /> Impago
                                                            </span>
                                                        )}
                                                        {(c.desactivado || c.fecha_baja) ? (
                                                            <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-[10px] font-medium">
                                                                Baja
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-medium">
                                                                <CheckCircle className="w-3 h-3" /> Activo
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {contratos.length === 0 && !loading && (
                            <div className="py-16 text-center text-slate-400 text-sm">
                                No hay contratos con los filtros aplicados
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Tab: VENCIMIENTOS ─────────────────────────────────────────────────────────

type VencSortCol = 'cli_nombre' | 'tipo_nombre' | 'fra' | 'importe' | 'facturado' | 'pagado'

function TabVencimientos({ data, loading, mes, setMes, anio, setAnio }: {
    data: {
        vencimientos: VencRow[];
        total: number;
        total_pendiente: number;
        total_facturado: number;
        total_cobrado: number;
    } | null
    loading: boolean
    mes: number[]
    setMes: (v: number[]) => void
    anio: number
    setAnio: (v: number) => void
}) {
    const anioActual = new Date().getFullYear()
    const [sortCol, setSortCol] = useState<VencSortCol>('cli_nombre')
    const [sortAsc, setSortAsc] = useState(true)

    const toggleMes = (m: number) => {
        if (mes.includes(m)) {
            if (mes.length === 1) return
            setMes(mes.filter(x => x !== m))
        } else {
            setMes([...mes, m].sort((a, b) => a - b))
        }
    }

    const handleSort = (col: VencSortCol) => {
        if (sortCol === col) setSortAsc(a => !a)
        else { setSortCol(col); setSortAsc(true) }
    }

    const sorted = (data?.vencimientos ?? []).slice().sort((a, b) => {
        const facA = (a.id_factura ?? 0) > 0
        const facB = (b.id_factura ?? 0) > 0
        const pagA = facA && a.vto_situacion === 1
        const pagB = facB && b.vto_situacion === 1
        let cmp = 0
        if (sortCol === 'cli_nombre')  cmp = (a.cli_nombre ?? '').localeCompare(b.cli_nombre ?? '', 'es')
        else if (sortCol === 'tipo_nombre') cmp = (a.tipo_nombre ?? '').localeCompare(b.tipo_nombre ?? '', 'es')
        else if (sortCol === 'fra')    cmp = ((a.fra_serie ?? '') + String(a.fra_numero ?? 0)).localeCompare((b.fra_serie ?? '') + String(b.fra_numero ?? 0), 'es')
        else if (sortCol === 'importe') cmp = (a.importe ?? 0) - (b.importe ?? 0)
        else if (sortCol === 'facturado') cmp = Number(facA) - Number(facB)
        else if (sortCol === 'pagado')    cmp = Number(pagA) - Number(pagB)
        return sortAsc ? cmp : -cmp
    })

    const SortIcon = ({ col }: { col: VencSortCol }) => {
        if (sortCol !== col) return <ChevronDown size={11} className="opacity-20 ml-0.5" />
        return sortAsc
            ? <ChevronUp size={11} className="text-indigo-500 ml-0.5" />
            : <ChevronDown size={11} className="text-indigo-500 ml-0.5" />
    }

    const Th = ({ col, children, className = '' }: { col: VencSortCol; children: React.ReactNode; className?: string }) => (
        <th
            className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-indigo-600 whitespace-nowrap ${className}`}
            onClick={() => handleSort(col)}
        >
            <span className="inline-flex items-center gap-0.5">{children}<SortIcon col={col} /></span>
        </th>
    )

    return (
        <div className="flex flex-col h-full">
            {/* Picker */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-100 bg-slate-50 space-y-2">
                <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500 font-medium">Año:</label>
                    <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                        {Array.from({ length: 5 }, (_, i) => anioActual + i - 1).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <button onClick={() => setMes([1,2,3,4,5,6,7,8,9,10,11,12])}
                        className="text-xs text-slate-400 hover:text-indigo-600 underline underline-offset-2">Todos</button>
                    <button onClick={() => setMes([new Date().getMonth() + 1])}
                        className="text-xs text-slate-400 hover:text-indigo-600 underline underline-offset-2">Este mes</button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {MESES_SHORT.map((m, i) => {
                        const num = i + 1
                        const sel = mes.includes(num)
                        return (
                            <button key={num} onClick={() => toggleMes(num)}
                                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors border ${
                                    sel
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                                }`}>
                                {m}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* KPI cards */}
            {data && (() => {
                const totalImporte = data.total_cobrado + data.total_facturado + data.total_pendiente
                return (
                    <div className="flex-shrink-0 px-3 sm:px-4 py-3 border-b border-slate-100 grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Total</span>
                            <span className="text-xl font-bold text-slate-700 leading-none">{fmt(totalImporte)} €</span>
                            <span className="text-[10px] text-slate-400">{data.total} vencimientos</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide">Cobrado</span>
                            <span className="text-xl font-bold text-emerald-700 leading-none">{fmt(data.total_cobrado)} €</span>
                            {data.total_facturado > 0 && (
                                <span className="text-[10px] text-indigo-400">Pdte. cobro: {fmt(data.total_facturado)} €</span>
                            )}
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">Sin factura</span>
                            <span className="text-xl font-bold text-amber-700 leading-none">{fmt(data.total_pendiente)} €</span>
                            <span className="text-[10px] text-slate-400">Pendiente de facturar</span>
                        </div>
                    </div>
                )
            })()}

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? <Spinner /> : data && sorted.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left sticky top-0">
                                    <Th col="cli_nombre">Cliente</Th>
                                    <Th col="tipo_nombre" className="hidden sm:table-cell">Tipo</Th>
                                    <Th col="fra" className="hidden md:table-cell">Factura</Th>
                                    <Th col="importe" className="text-right">Importe</Th>
                                    <Th col="facturado" className="text-center">Facturado</Th>
                                    <Th col="pagado" className="text-center">Pagado</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sorted.map(v => {
                                    const facturado = (v.id_factura ?? 0) > 0
                                    const pagado = facturado && v.vto_situacion === 1
                                    return (
                                        <tr key={v.venc_id} className={`hover:bg-slate-50 ${v.impago ? 'bg-red-50/40' : ''}`}>
                                            <td className="px-3 py-2 font-medium text-slate-700">{v.cli_nombre}{v.cli_alias ? ` (${v.cli_alias})` : ''}</td>
                                            <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{v.tipo_nombre}</td>
                                            <td className="px-3 py-2 text-slate-500 hidden md:table-cell">
                                                {facturado && v.fra_serie && v.fra_numero
                                                    ? <span className="font-mono">{v.fra_serie}{v.fra_numero}</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-indigo-600">{fmt(v.importe)} €</td>
                                            <td className="px-3 py-2 text-center">
                                                {facturado
                                                    ? <span className="inline-flex items-center gap-0.5 text-indigo-600 font-medium text-xs">
                                                        <CheckCircle size={13} /> Sí
                                                      </span>
                                                    : <span className="inline-flex items-center gap-0.5 text-red-500 text-xs">
                                                        <AlertCircle size={13} /> No
                                                      </span>}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {!facturado
                                                    ? <span className="text-slate-300 text-xs">—</span>
                                                    : pagado
                                                        ? <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium text-xs">
                                                            <CheckCircle size={13} /> Sí
                                                          </span>
                                                        : <span className="inline-flex items-center gap-0.5 text-amber-500 text-xs">
                                                            <AlertCircle size={13} /> No
                                                          </span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : !loading ? (
                    <div className="py-16 text-center text-slate-400 text-sm">
                        {mes.length === 0 ? 'Selecciona al menos un mes' : `No hay vencimientos para los meses seleccionados en ${anio}`}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

// ── Tab: POR MES ──────────────────────────────────────────────────────────────

function TabMensual({ data, loading, anio, setAnio }: {
    data: { meses: MensualRow[]; anio: number; total_cobrado: number; total_facturado: number; total_pendiente: number } | null
    loading: boolean
    anio: number
    setAnio: (v: number) => void
}) {
    const anioActual = new Date().getFullYear()

    const chartData = (data?.meses ?? []).map(r => ({
        name: MESES_SHORT[r.mes - 1],
        Cobrado: parseFloat(String(r.cobrado ?? 0)),
        'Pdte. cobro': parseFloat(String(r.facturado ?? 0)),
        'Sin factura': parseFloat(String(r.pendiente ?? 0)),
    }))

    return (
        <div className="flex flex-col h-full">
            {/* Picker + totals */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Año:</label>
                    <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                        {Array.from({ length: 5 }, (_, i) => anioActual + 1 - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
                {data && (
                    <div className="flex flex-wrap gap-3 ml-auto text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                            Cobrado: <strong className="text-emerald-600">{fmt(data.total_cobrado)} €</strong>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                            Pdte. cobro: <strong className="text-indigo-600">{fmt(data.total_facturado)} €</strong>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
                            Sin factura: <strong className="text-amber-600">{fmt(data.total_pendiente)} €</strong>
                        </span>
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-5 space-y-5">
                {loading ? <Spinner /> : data ? (
                    <>
                        {/* Chart */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-slate-700 mb-4">Vencimientos de contratos {anio}</h3>
                            <div className="h-56 sm:h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip formatter={(v: number) => [`${fmt(v)} €`, '']} />
                                        <Legend />
                                        <Bar dataKey="Cobrado" fill="#10b981" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="Pdte. cobro" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="Sin factura" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs sm:text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-left">
                                            <th className="px-3 py-2 font-medium">Mes</th>
                                            <th className="px-3 py-2 font-medium text-right">Cobrado (€)</th>
                                            <th className="px-3 py-2 font-medium text-right">Pdte. cobro (€)</th>
                                            <th className="px-3 py-2 font-medium text-right">Sin factura (€)</th>
                                            <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Total (€)</th>
                                            <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Nº cobr.</th>
                                            <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Nº pdte.</th>
                                            <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Nº s/fra.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.meses.map(r => (
                                            <tr key={r.mes} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 font-medium text-slate-700">{MESES_FULL[r.mes - 1]}</td>
                                                <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{fmt(r.cobrado)}</td>
                                                <td className="px-3 py-2 text-right text-indigo-600 font-semibold">{fmt(r.facturado)}</td>
                                                <td className="px-3 py-2 text-right text-amber-600 font-semibold">{fmt(r.pendiente)}</td>
                                                <td className="px-3 py-2 text-right text-slate-600 font-semibold hidden sm:table-cell">
                                                    {fmt((r.cobrado ?? 0) + (r.facturado ?? 0) + (r.pendiente ?? 0))}
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-400 hidden md:table-cell">{fmtInt(r.venc_cobrados)}</td>
                                                <td className="px-3 py-2 text-right text-slate-400 hidden md:table-cell">{fmtInt(r.venc_facturados)}</td>
                                                <td className="px-3 py-2 text-right text-slate-400 hidden md:table-cell">{fmtInt(r.venc_pendientes)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-indigo-50 font-semibold text-indigo-700">
                                            <td className="px-3 py-2">Total {anio}</td>
                                            <td className="px-3 py-2 text-right text-emerald-700">{fmt(data.total_cobrado)}</td>
                                            <td className="px-3 py-2 text-right">{fmt(data.total_facturado)}</td>
                                            <td className="px-3 py-2 text-right text-amber-600">{fmt(data.total_pendiente)}</td>
                                            <td className="px-3 py-2 text-right hidden sm:table-cell">
                                                {fmt(data.total_cobrado + data.total_facturado + data.total_pendiente)}
                                            </td>
                                            <td className="hidden md:table-cell" />
                                            <td className="hidden md:table-cell" />
                                            <td className="hidden md:table-cell" />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    )
}

// ── Tab: SIN FACTURAR ─────────────────────────────────────────────────────────

function TabSinFacturar({ data, loading, mes, setMes, anio, setAnio, busqueda, setBusqueda }: {
    data: {
        vencimientos_pendientes: VencimientoRow[]
        sin_vencimiento: SinVencRow[]
        total_importe: number
        total_vencimientos: number
    } | null
    loading: boolean
    mes: number
    setMes: (v: number) => void
    anio: number
    setAnio: (v: number) => void
    busqueda: string
    setBusqueda: (v: string) => void
}) {
    const anioActual = new Date().getFullYear()

    const filterText = busqueda.toLowerCase()

    const vencFilt = (data?.vencimientos_pendientes ?? []).filter(r =>
        !filterText || r.cli_nombre?.toLowerCase().includes(filterText) || r.tipo_nombre?.toLowerCase().includes(filterText)
    )
    const sinVencFilt = (data?.sin_vencimiento ?? []).filter(r =>
        !filterText || r.cli_nombre?.toLowerCase().includes(filterText) || r.tipo_nombre?.toLowerCase().includes(filterText)
    )

    const totalPendiente = vencFilt.reduce((s, r) => s + (r.importe ?? 0), 0)

    return (
        <div className="flex flex-col h-full">
            {/* Controls */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-100 bg-slate-50 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 font-medium">Mes:</label>
                        <select value={mes} onChange={e => setMes(Number(e.target.value))}
                            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                            {MESES_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 font-medium">Año:</label>
                        <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                            {Array.from({ length: 4 }, (_, i) => anioActual - i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    {/* Search filter */}
                    <div className="relative flex-1 min-w-[140px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            placeholder="Filtrar cliente…"
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        />
                        {busqueda && (
                            <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
                {data && (
                    <div className="flex flex-wrap gap-3 text-xs">
                        <span className="text-slate-500">
                            Vencimientos pendientes: <strong className="text-red-600">{vencFilt.length}</strong>
                            {' '}— Importe: <strong className="text-red-600">{fmt(totalPendiente)} €</strong>
                        </span>
                        {sinVencFilt.length > 0 && (
                            <span className="text-amber-600">
                                Sin vencimiento registrado: <strong>{sinVencFilt.length}</strong>
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto p-3 sm:p-5 space-y-5">
                {loading ? <Spinner /> : data ? (
                    <>
                        {/* Vencimientos pendientes */}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <h3 className="text-sm font-semibold text-red-700">
                                    Vencimientos pendientes de facturar — {MESES_FULL[mes - 1]} {anio}
                                </h3>
                            </div>
                            {vencFilt.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs sm:text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-left">
                                                <th className="px-3 py-2 font-medium">Cliente</th>
                                                <th className="px-3 py-2 font-medium hidden sm:table-cell">Tipo</th>
                                                <th className="px-3 py-2 font-medium text-right">Importe (€)</th>
                                                <th className="px-3 py-2 font-medium text-center">Año ant.</th>
                                                <th className="px-3 py-2 font-medium hidden lg:table-cell">Concepto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {vencFilt.map(r => (
                                                <tr key={r.id}
                                                    className={`hover:bg-slate-50 ${r.facturado_anio_anterior ? 'bg-orange-50/60' : ''}`}>
                                                    <td className="px-3 py-2 font-medium text-slate-700">{r.cli_nombre}{r.cli_alias ? ` (${r.cli_alias})` : ''}</td>
                                                    <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{r.tipo_nombre}</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-red-600">{fmt(r.importe)}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        {r.facturado_anio_anterior ? (
                                                            <span title={`Facturado en ${MESES_FULL[mes - 1]} ${anio - 1}`}
                                                                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-200 text-orange-700">
                                                                <AlertTriangle className="w-3 h-3" />
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-400 hidden lg:table-cell truncate max-w-[200px]">{r.concepto_contrato}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="px-4 py-6 text-sm text-slate-400 text-center">
                                    No hay vencimientos pendientes en {MESES_FULL[mes - 1]} {anio}
                                </p>
                            )}
                        </div>

                        {/* Sin vencimiento registrado */}
                        {sinVencFilt.length > 0 && (
                            <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
                                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                    <h3 className="text-sm font-semibold text-amber-700">
                                        Contratos mensuales sin vencimiento registrado en {MESES_FULL[mes - 1]} {anio}
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs sm:text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-left">
                                                <th className="px-3 py-2 font-medium">Cliente</th>
                                                <th className="px-3 py-2 font-medium hidden sm:table-cell">Tipo</th>
                                                <th className="px-3 py-2 font-medium text-right">Cuota (€)</th>
                                                <th className="px-3 py-2 font-medium text-center">Año ant.</th>
                                                <th className="px-3 py-2 font-medium hidden lg:table-cell">Concepto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {sinVencFilt.map(r => (
                                                <tr key={r.id_contrato}
                                                    className={`hover:bg-slate-50 ${r.facturado_anio_anterior ? 'bg-orange-50/60' : ''}`}>
                                                    <td className="px-3 py-2 font-medium text-slate-700">{r.cli_nombre}{r.cli_alias ? ` (${r.cli_alias})` : ''}</td>
                                                    <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{r.tipo_nombre}</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-amber-600">{fmt(r.cuota_recibo)}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        {r.facturado_anio_anterior ? (
                                                            <span title={`Facturado en ${MESES_FULL[mes - 1]} ${anio - 1}`}
                                                                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-200 text-orange-700">
                                                                <AlertTriangle className="w-3 h-3" />
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-400 hidden lg:table-cell truncate max-w-[200px]">{r.concepto_contrato}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                                    <p className="text-xs text-amber-600">
                                        <TrendingUp className="w-3 h-3 inline mr-1" />
                                        Contratos activos mensuales que no tienen ningún registro de vencimiento en este mes.
                                        El icono <AlertTriangle className="w-3 h-3 inline text-orange-500 mx-0.5" /> indica que sí se facturó en {MESES_FULL[mes - 1]} {anio - 1}.
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

type TabDef = { key: Tab; label: string; icon: React.ElementType }

export default function Contratos() {
    const thisYear = new Date().getFullYear()
    const thisMonth = new Date().getMonth() + 1

    const [tab, setTab] = useState<Tab>('resumen')

    // Resumen
    const [resumen, setResumen] = useState<{ kpis: Kpis; por_tipo: PorTipo[] } | null>(null)
    const [resumenLoading, setResumenLoading] = useState(false)

    // Contratos list
    const [contratos, setContratos] = useState<Contrato[]>([])
    const [contratosLoading, setContratosLoading] = useState(false)
    const soloActivos = true
    const setSoloActivos = (_v: boolean) => { /* forzado: solo activos */ }
    const [busqContrato, setBusqContrato] = useState('')
    const [filtroTipo, setFiltroTipo] = useState<number | ''>('')
    const [tipos, setTipos] = useState<{ codigo: number; concepto: string }[]>([])

    // Vencimientos
    const [vencMes, setVencMes] = useState<number[]>([thisMonth])
    const [vencAnio, setVencAnio] = useState(thisYear)
    const [vencData, setVencData] = useState<{
        vencimientos: VencRow[];
        total: number;
        total_pendiente: number;
        total_facturado: number;
        total_cobrado: number;
    } | null>(null)
    const [vencLoading, setVencLoading] = useState(false)

    // Por mes
    const [mensualAnio, setMensualAnio] = useState(thisYear)
    const [mensualData, setMensualData] = useState<{
        meses: MensualRow[]; anio: number; total_cobrado: number; total_facturado: number; total_pendiente: number
    } | null>(null)
    const [mensualLoading, setMensualLoading] = useState(false)

    // Sin facturar
    const [sfMes, setSfMes] = useState(thisMonth)
    const [sfAnio, setSfAnio] = useState(thisYear)
    const [sfData, setSfData] = useState<{
        vencimientos_pendientes: VencimientoRow[]
        sin_vencimiento: SinVencRow[]
        total_importe: number
        total_vencimientos: number
    } | null>(null)
    const [sfLoading, setSfLoading] = useState(false)
    const [sfBusq, setSfBusq] = useState('')

    // Ficha cliente modal
    const [fichaCliente, setFichaCliente] = useState<{ codigo: number; nombre: string } | null>(null)

    // Load types once
    useEffect(() => {
        api.get('/api/contratos/tipos').then(r => setTipos(r.data)).catch(() => { })
    }, [])

    const loadResumen = useCallback(async () => {
        setResumenLoading(true)
        try {
            const { data } = await api.get('/api/contratos/resumen')
            setResumen(data)
        } catch { } finally { setResumenLoading(false) }
    }, [])

    const loadContratos = useCallback(async () => {
        setContratosLoading(true)
        try {
            const params: Record<string, unknown> = { solo_activos: soloActivos }
            if (filtroTipo !== '') params.tipo_contrato = filtroTipo
            if (busqContrato) params.busqueda = busqContrato
            const { data } = await api.get('/api/contratos/lista', { params })
            setContratos(data.contratos)
        } catch { } finally { setContratosLoading(false) }
    }, [soloActivos, filtroTipo, busqContrato])

    const loadVencimientos = useCallback(async () => {
        if (vencMes.length === 0) { setVencData(null); return }
        setVencLoading(true)
        try {
            const sp = new URLSearchParams()
            vencMes.forEach(m => sp.append('mes', String(m)))
            sp.append('anio', String(vencAnio))
            const { data } = await api.get(`/api/contratos/vencimientos-mes?${sp.toString()}`)
            setVencData(data)
        } catch { } finally { setVencLoading(false) }
    }, [vencMes, vencAnio])

    const loadMensual = useCallback(async () => {
        setMensualLoading(true)
        try {
            const { data } = await api.get('/api/contratos/importe-mensual', { params: { anio: mensualAnio } })
            setMensualData(data)
        } catch { } finally { setMensualLoading(false) }
    }, [mensualAnio])

    const loadSinFacturar = useCallback(async () => {
        setSfLoading(true)
        try {
            const { data } = await api.get('/api/contratos/sin-facturar', { params: { mes: sfMes, anio: sfAnio } })
            setSfData(data)
        } catch { } finally { setSfLoading(false) }
    }, [sfMes, sfAnio])

    // Load on tab change
    useEffect(() => {
        if (tab === 'resumen' && !resumen) loadResumen()
        if (tab === 'contratos') loadContratos()
        if (tab === 'vencimientos') loadVencimientos()
        if (tab === 'mensual') loadMensual()
        if (tab === 'sin_facturar') loadSinFacturar()
    }, [tab])

    // Reload on filter/date changes
    useEffect(() => { if (tab === 'contratos') loadContratos() }, [soloActivos, filtroTipo])
    useEffect(() => { if (tab === 'vencimientos') loadVencimientos() }, [vencMes, vencAnio])
    useEffect(() => { if (tab === 'mensual') loadMensual() }, [mensualAnio])
    useEffect(() => { if (tab === 'sin_facturar') loadSinFacturar() }, [sfMes, sfAnio])

    const TABS: TabDef[] = [
        { key: 'resumen', label: 'Resumen', icon: BarChart3 },
        { key: 'contratos', label: 'Contratos', icon: FileText },
        { key: 'vencimientos', label: 'Vencimientos', icon: Clock },
        { key: 'mensual', label: 'Por Mes', icon: Calendar },
        { key: 'sin_facturar', label: 'Sin Facturar', icon: AlertCircle },
    ]

    return (
        <div className="flex flex-col h-screen max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="bg-white shadow-sm flex-shrink-0">
                <div className="px-3 sm:px-5 pt-4 pb-2 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-sm">
                        <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-800 leading-tight">Gestión de Contratos</h1>
                        <p className="text-[10px] text-slate-400">Contratos activos, vencimientos y facturación</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-2 sm:px-5 overflow-x-auto border-b border-slate-200">
                    <div className="flex items-center gap-0.5 bg-indigo-50 rounded-t-lg px-1 pt-0.5 min-w-max">
                        {TABS.map(t => (
                            <button key={t.key} onClick={() => setTab(t.key)}
                                className={`px-2 sm:px-3.5 py-2 text-xs font-medium transition-all rounded-t-md whitespace-nowrap flex items-center gap-1.5
                                    ${tab === t.key
                                        ? 'bg-white text-indigo-700 shadow-sm border border-b-0 border-slate-200'
                                        : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-100/50'}`}>
                                <t.icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{t.label}</span>
                                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden bg-white">
                {tab === 'resumen' && (
                    <TabResumen data={resumen} loading={resumenLoading} onReload={loadResumen}
                        onAbrirCliente={ref => setFichaCliente(ref)} />
                )}
                {tab === 'contratos' && (
                    <TabContratos
                        contratos={contratos}
                        loading={contratosLoading}
                        soloActivos={soloActivos}
                        setSoloActivos={setSoloActivos}
                        busqueda={busqContrato}
                        setBusqueda={setBusqContrato}
                        filtroTipo={filtroTipo}
                        setFiltroTipo={setFiltroTipo}
                        tipos={tipos}
                        onSearch={loadContratos}
                    />
                )}
                {tab === 'vencimientos' && (
                    <TabVencimientos
                        data={vencData}
                        loading={vencLoading}
                        mes={vencMes} setMes={setVencMes}
                        anio={vencAnio} setAnio={setVencAnio}
                    />
                )}
                {tab === 'mensual' && (
                    <TabMensual
                        data={mensualData}
                        loading={mensualLoading}
                        anio={mensualAnio} setAnio={setMensualAnio}
                    />
                )}
                {tab === 'sin_facturar' && (
                    <TabSinFacturar
                        data={sfData}
                        loading={sfLoading}
                        mes={sfMes} setMes={setSfMes}
                        anio={sfAnio} setAnio={setSfAnio}
                        busqueda={sfBusq}
                        setBusqueda={setSfBusq}
                    />
                )}
            </div>

            {/* Ficha cliente modal */}
            {fichaCliente && (
                <FichaCliente
                    cliCodigo={fichaCliente.codigo}
                    cliNombre={fichaCliente.nombre}
                    initialAnio={new Date().getFullYear()}
                    onClose={() => setFichaCliente(null)}
                />
            )}
        </div>
    )
}
