import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { X, FileText, Clock, MapPin } from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts'
import type { FichaAgenteData, FichaAgentePendiente, DocDetalle } from '../types'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const LINE_COLORS = ['#2563eb', '#16a34a', '#dc2626']

function fmt(n: number): string {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n: number): string {
    return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

interface Props {
    agenteCodigo: number
    agenteNombre: string
    initialAnio: number
    onClose: () => void
}

export default function FichaAgente({ agenteCodigo, agenteNombre, initialAnio, onClose }: Props) {
    const { user } = useAuth()
    const esGerente = user?.rol === 'superadmin' || user?.rol === 'gerente'
    const hoyDate = new Date()

    const [anio, setAnio] = useState(initialAnio)
    const [data, setData] = useState<FichaAgenteData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [tab, setTab] = useState<'comisiones' | 'pendientes' | 'visitas'>('comisiones')

    // TOP productos año selector
    const [topAnio, setTopAnio] = useState(initialAnio)

    // Document detail modal
    const [docModal, setDocModal] = useState<{ tipo: string; docId: number; titulo: string } | null>(null)
    const [docDetalle, setDocDetalle] = useState<DocDetalle | null>(null)
    const [docLoading, setDocLoading] = useState(false)

    // Pendientes filter
    const [diasVencido, setDiasVencido] = useState(0)

    // Visitas date filter — default to full selected year
    const _pad = (n: number) => String(n).padStart(2, '0')
    const [visitaDesde, setVisitaDesde] = useState(`${initialAnio}-01-01`)
    const [visitaHasta, setVisitaHasta] = useState(`${initialAnio}-12-31`)

    // Comisiones: filtros de mes/año y días comisionables
    const [comisionAnio, setComisionAnio] = useState(initialAnio)
    const [comisionMes, setComisionMes] = useState(hoyDate.getMonth() + 1)
    const [comisionDiasMax, setComisionDiasMax] = useState(90)
    const [comisionesData, setComisionesData] = useState<FichaAgenteData['comisiones_liquidables'] | null>(null)
    const [comisionesLoading, setComisionesLoading] = useState(false)

    // Pendientes: fecha análisis y tipo días
    const hoy = new Date().toISOString().slice(0, 10)
    const [fechaAnalisis, setFechaAnalisis] = useState(hoy)
    const [diasDesde, setDiasDesde] = useState<'vto' | 'doc'>('vto')
    const [pendientesData, setPendientesData] = useState<FichaAgentePendiente[] | null>(null)
    const [pendientesLoading, setPendientesLoading] = useState(false)

    const fetchData = useCallback(async (yr: number) => {
        setLoading(true)
        setError('')
        try {
            const { data: d } = await api.get<FichaAgenteData>('/api/dashboard/ficha-agente', {
                params: {
                    agente_codigo: agenteCodigo,
                    anio: yr,
                    fecha_analisis: fechaAnalisis,
                    dias_desde: diasDesde,
                    comision_anio: comisionAnio,
                    comision_mes: comisionMes,
                    comision_dias_max: comisionDiasMax,
                },
            })
            setData(d)
            setPendientesData(d.pendientes_cobro)
            setComisionesData(d.comisiones_liquidables)
        } catch {
            setError('Error cargando ficha del agente')
        } finally {
            setLoading(false)
        }
    }, [agenteCodigo, fechaAnalisis, diasDesde, comisionAnio, comisionMes, comisionDiasMax])

    useEffect(() => { fetchData(anio) }, [anio, fetchData])

    // Recargar solo pendientes cuando cambia fecha/diasDesde
    const fetchPendientes = useCallback(async () => {
        if (!data) return
        setPendientesLoading(true)
        try {
            const { data: d } = await api.get<FichaAgenteData>('/api/dashboard/ficha-agente', {
                params: {
                    agente_codigo: agenteCodigo,
                    anio,
                    fecha_analisis: fechaAnalisis,
                    dias_desde: diasDesde,
                    comision_anio: comisionAnio,
                    comision_mes: comisionMes,
                    comision_dias_max: comisionDiasMax,
                },
            })
            setPendientesData(d.pendientes_cobro)
        } catch { /* keep current */ }
        finally { setPendientesLoading(false) }
    }, [agenteCodigo, anio, fechaAnalisis, diasDesde, comisionAnio, comisionMes, comisionDiasMax, data])

    // Recargar solo comisiones cuando cambia año/mes/días de pago
    const fetchComisiones = useCallback(async () => {
        if (!data) return
        setComisionesLoading(true)
        try {
            const { data: d } = await api.get<FichaAgenteData>('/api/dashboard/ficha-agente', {
                params: {
                    agente_codigo: agenteCodigo,
                    anio,
                    fecha_analisis: fechaAnalisis,
                    dias_desde: diasDesde,
                    comision_anio: comisionAnio,
                    comision_mes: comisionMes,
                    comision_dias_max: comisionDiasMax,
                },
            })
            setComisionesData(d.comisiones_liquidables)
        } catch { /* keep current */ }
        finally { setComisionesLoading(false) }
    }, [agenteCodigo, anio, fechaAnalisis, diasDesde, comisionAnio, comisionMes, comisionDiasMax, data])

    useEffect(() => {
        if (data) fetchPendientes()
    }, [fechaAnalisis, diasDesde])

    useEffect(() => {
        if (data) fetchComisiones()
    }, [comisionAnio, comisionMes, comisionDiasMax])

    const openDocumento = async (docId: number, titulo: string) => {
        setDocModal({ tipo: 'venta', docId, titulo })
        setDocLoading(true)
        try {
            const { data: d } = await api.get<DocDetalle>('/api/dashboard/detalle-documento', {
                params: { doc_id: docId, tipo: 'venta' },
            })
            setDocDetalle(d)
        } catch { setDocDetalle(null) }
        finally { setDocLoading(false) }
    }

    // Prepare chart data
    const chartData = (() => {
        if (!data) return []
        const map: Record<number, Record<number, number>> = {}
        for (const v of data.ventas_mensuales) {
            if (!map[v.mes]) map[v.mes] = {}
            map[v.mes][v.anio] = v.total
        }
        return Array.from({ length: 12 }, (_, i) => {
            const row: Record<string, number | string> = { mes: MESES[i] }
            for (const y of data.anios_cols) {
                row[String(y)] = map[i + 1]?.[y] || 0
            }
            return row
        })
    })()

    // TOP productos
    const topProductos = (() => {
        if (!data) return { productos: [], total: 0, uds: 0, count: 0 }
        const prods = data.top_productos[String(topAnio)] || []
        const total = prods.reduce((s, p) => s + p.total_venta, 0)
        const uds = prods.reduce((s, p) => s + p.unidades, 0)
        return { productos: prods, total, uds, count: prods.length }
    })()

    const comisionesSource = comisionesData ?? data?.comisiones_liquidables ?? []
    const totalComisiones = comisionesSource.reduce((s, c) => s + c.total, 0)

    // Filtered pendientes
    const pendientesFiltrados = (() => {
        const source = pendientesData ?? data?.pendientes_cobro ?? []
        if (diasVencido <= 0) return source
        return source.filter(p => p.dias >= diasVencido)
    })()

    const totalPendientesFiltrados = pendientesFiltrados.reduce((s, p) => s + p.importe, 0)

    if (loading && !data) {
        return (
            <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
                <div className="bg-white rounded-xl p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Cargando ficha de {agenteNombre}...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
                <div className="bg-white rounded-xl p-8 text-center max-w-md">
                    <p className="text-red-500 mb-4">{error}</p>
                    <button onClick={onClose} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300 text-sm">Cerrar</button>
                </div>
            </div>
        )
    }

    if (!data) return null

    const { kpis, anios_cols } = data
    const variacion = kpis.ventas_anio_anterior > 0
        ? ((kpis.ventas_anio - kpis.ventas_anio_anterior) / kpis.ventas_anio_anterior * 100)
        : 0

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1600px] h-[95vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b bg-slate-50 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 truncate">
                        Análisis Ventas de Agentes y Comisiones – {data.agente.nombre}
                    </h2>
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-500">Año</label>
                        <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
                            {[anio + 1, anio, anio - 1, anio - 2, anio - 3].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full" title="Cerrar"><X size={18} /></button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto md:overflow-hidden p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:h-full">
                        {/* ═══ LEFT COLUMN: Chart + Tabs ═══ */}
                        <div className="md:col-span-7 flex flex-col gap-4 md:h-full md:min-h-0">
                            {/* Line Chart */}
                            <div className="bg-white border rounded-lg p-3 shrink-0" style={{ height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtInt(v)} />
                                        <Tooltip formatter={(v: number) => fmt(v) + ' €'} />
                                        <Legend />
                                        {anios_cols.map((y, i) => (
                                            <Line key={y} type="monotone" dataKey={String(y)} name={String(y)}
                                                stroke={LINE_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Tabs */}
                            <div className="bg-white border rounded-lg flex flex-col min-h-[320px] md:flex-1 md:min-h-0">
                                <div className="flex border-b shrink-0 overflow-x-auto">
                                    <button
                                        className={`px-3 sm:px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 shrink-0 whitespace-nowrap ${tab === 'comisiones' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setTab('comisiones')}
                                    ><FileText size={14} /> <span className="hidden sm:inline">Comisiones </span>Liquid.</button>
                                    <button
                                        className={`px-3 sm:px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 shrink-0 whitespace-nowrap ${tab === 'pendientes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setTab('pendientes')}
                                    ><Clock size={14} /> Pendientes</button>
                                    {data.has_visitas && (
                                        <button
                                            className={`px-3 sm:px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 shrink-0 whitespace-nowrap ${tab === 'visitas' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                            onClick={() => setTab('visitas')}
                                        ><MapPin size={14} /> Visitas</button>
                                    )}
                                </div>

                                <div className="flex-1 overflow-auto p-2">
                                    {/* TAB: Comisiones Liquidables */}
                                    {tab === 'comisiones' && (
                                        <>
                                            <div className="flex flex-wrap items-center gap-3 px-2 py-1.5 mb-1 bg-slate-50 rounded border">
                                                <div className="flex items-center gap-1.5 text-[11px]">
                                                    <label className="text-slate-500 font-medium">Año</label>
                                                    <select
                                                        value={comisionAnio}
                                                        onChange={e => setComisionAnio(Number(e.target.value))}
                                                        className="border rounded px-1.5 py-0.5 text-[11px]"
                                                    >
                                                        {[anio + 1, anio, anio - 1, anio - 2, anio - 3].map(y => (
                                                            <option key={y} value={y}>{y}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px]">
                                                    <label className="text-slate-500 font-medium">Mes</label>
                                                    <select
                                                        value={comisionMes}
                                                        onChange={e => setComisionMes(Number(e.target.value))}
                                                        className="border rounded px-1.5 py-0.5 text-[11px]"
                                                    >
                                                        {MESES.map((m, idx) => (
                                                            <option key={m} value={idx + 1}>{m}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px]">
                                                    <label className="text-slate-500 font-medium">Días pago ≤</label>
                                                    <select
                                                        value={comisionDiasMax}
                                                        onChange={e => setComisionDiasMax(Number(e.target.value))}
                                                        className="border rounded px-1.5 py-0.5 text-[11px]"
                                                    >
                                                        {[30, 60, 90, 120].map(v => (
                                                            <option key={v} value={v}>{v}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {comisionesLoading && <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent rounded-full" />}
                                            </div>

                                            <div className="px-2 py-1 mb-1 bg-green-50 border border-green-200 rounded text-[11px] font-semibold text-green-800">
                                                TOTAL: {comisionesSource.length} documentos cobrados — Importe Total: {fmt(totalComisiones)} €
                                                <span className="ml-2 text-slate-600">({MESES[comisionMes - 1]} {comisionAnio}, pago ≤ {comisionDiasMax} días)</span>
                                            </div>
                                            <table className="w-full text-xs">
                                                <thead className="sticky top-0 bg-white">
                                                    <tr className="text-slate-500 border-b">
                                                        <th className="text-left py-1 px-2 font-medium">Documento</th>
                                                        <th className="text-left py-1 px-2 font-medium">Fecha</th>
                                                        <th className="text-left py-1 px-2 font-medium">Cliente</th>
                                                        <th className="text-right py-1 px-2 font-medium">Importe</th>
                                                        <th className="text-right py-1 px-2 font-medium">Días pago</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="font-mono">
                                                    {comisionesSource.map(c => (
                                                        <tr key={`${c.serie}-${c.numero}`}
                                                            className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer"
                                                            onClick={() => openDocumento(c.id, `${c.tipo_doc} ${c.serie}/${String(c.numero).padStart(6, '0')}`)}>
                                                            <td className="py-1 px-2">{c.tipo_doc} {c.serie}/{String(c.numero).padStart(6, '0')}</td>
                                                            <td className="py-1 px-2">{c.fecha}</td>
                                                            <td className="py-1 px-2 truncate max-w-[200px]">{c.cli_nombre}</td>
                                                            <td className="text-right py-1 px-2">{fmt(c.total)} €</td>
                                                            <td className="text-right py-1 px-2">{c.dias_pago >= 0 ? c.dias_pago : ''}</td>
                                                        </tr>
                                                    ))}
                                                    {comisionesSource.length === 0 && (
                                                        <tr><td colSpan={5} className="text-center py-4 text-slate-400">Sin comisiones liquidables</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </>
                                    )}

                                    {/* TAB: Pendientes de Cobro */}
                                    {tab === 'pendientes' && (
                                        <>
                                            {/* Controles: fecha análisis + días desde (gerente) + filtro días */}
                                            <div className="flex flex-wrap items-center gap-3 px-2 py-1.5 mb-1 bg-slate-50 rounded border">
                                                <div className="flex items-center gap-1.5 text-[11px]">
                                                    <label className="text-slate-500 font-medium">Fecha análisis</label>
                                                    <input type="date" value={fechaAnalisis}
                                                        onChange={e => setFechaAnalisis(e.target.value)}
                                                        className="border rounded px-1.5 py-0.5 text-[11px]" />
                                                </div>
                                                {esGerente && (
                                                    <div className="flex items-center gap-1.5 text-[11px]">
                                                        <label className="text-slate-500 font-medium">Días desde</label>
                                                        <select value={diasDesde} onChange={e => setDiasDesde(e.target.value as 'vto' | 'doc')}
                                                            className="border rounded px-1.5 py-0.5 text-[11px]">
                                                            <option value="vto">Fecha vencimiento</option>
                                                            <option value="doc">Fecha documento</option>
                                                        </select>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1.5 text-[11px]">
                                                    <label className="text-slate-500 font-medium">Días ≥</label>
                                                    <select value={diasVencido} onChange={e => setDiasVencido(Number(e.target.value))}
                                                        className="border rounded px-1.5 py-0.5 text-[11px]">
                                                        <option value={0}>Todos</option>
                                                        <option value={30}>30</option>
                                                        <option value={60}>60</option>
                                                        <option value={90}>90</option>
                                                        <option value={120}>120</option>
                                                        <option value={180}>180</option>
                                                    </select>
                                                </div>
                                                {pendientesLoading && <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent rounded-full" />}
                                            </div>
                                            <div className="px-2 py-1 mb-1">
                                                <div className="bg-red-50 border border-red-200 rounded px-2 py-1 text-[11px] font-semibold text-red-800">
                                                    RESUMEN: {pendientesFiltrados.length} docs — Pendiente: {fmt(totalPendientesFiltrados)} €
                                                    {fechaAnalisis !== hoy && <span className="ml-2 text-slate-500">(a fecha {fechaAnalisis})</span>}
                                                </div>
                                            </div>
                                            <table className="w-full text-xs">
                                                <thead className="sticky top-0 bg-white">
                                                    <tr className="text-slate-500 border-b">
                                                        <th className="text-left py-1 px-2 font-medium">Documento</th>
                                                        <th className="text-left py-1 px-2 font-medium">Fecha</th>
                                                        <th className="text-left py-1 px-2 font-medium">Cliente</th>
                                                        <th className="text-right py-1 px-2 font-medium">Importe</th>
                                                        <th className="text-right py-1 px-2 font-medium">Días</th>
                                                        <th className="text-left py-1 px-2 font-medium">Vencimiento</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="font-mono">
                                                    {pendientesFiltrados.map((p, i) => (
                                                        <tr key={i}
                                                            className={`border-b border-slate-50 hover:bg-red-50 cursor-pointer ${p.dias >= 90 ? 'text-red-600' : p.dias >= 60 ? 'text-orange-600' : ''}`}
                                                            onClick={() => openDocumento(p.id, `${p.tipo_doc} ${p.serie}/${String(p.numero).padStart(6, '0')}`)}>
                                                            <td className="py-1 px-2">{p.tipo_doc} {p.serie}/{String(p.numero).padStart(6, '0')}</td>
                                                            <td className="py-1 px-2">{p.fecha}</td>
                                                            <td className="py-1 px-2 truncate max-w-[200px]">{p.cli_nombre}</td>
                                                            <td className="text-right py-1 px-2">{fmt(p.importe)} €</td>
                                                            <td className="text-right py-1 px-2 font-semibold">
                                                                {p.dias >= 90 && <span className="text-red-600">⚠ </span>}
                                                                {p.dias}
                                                            </td>
                                                            <td className="py-1 px-2">{p.fecha_vencimiento}</td>
                                                        </tr>
                                                    ))}
                                                    {pendientesFiltrados.length === 0 && (
                                                        <tr><td colSpan={6} className="text-center py-4 text-slate-400">Sin pendientes de cobro</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </>
                                    )}

                                    {/* TAB: Visitas */}
                                    {tab === 'visitas' && data.has_visitas && (() => {
                                        const visitasFiltradas = data.visitas.filter(v =>
                                            (!visitaDesde || v.fecha >= visitaDesde) &&
                                            (!visitaHasta || v.fecha <= visitaHasta)
                                        )
                                        return (
                                            <>
                                                <div className="flex items-center gap-2 mb-2 px-1 shrink-0">
                                                    <span className="text-[11px] text-slate-500 font-medium">Desde:</span>
                                                    <input type="date" value={visitaDesde} onChange={e => setVisitaDesde(e.target.value)}
                                                        className="text-[11px] border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400" />
                                                    <span className="text-[11px] text-slate-500 font-medium">Hasta:</span>
                                                    <input type="date" value={visitaHasta} onChange={e => setVisitaHasta(e.target.value)}
                                                        className="text-[11px] border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400" />
                                                    <div className="ml-auto px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[11px] font-semibold text-blue-800">
                                                        {visitasFiltradas.length} visita{visitasFiltradas.length !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                                <table className="w-full text-xs">
                                                    <thead className="sticky top-0 bg-white">
                                                        <tr className="text-slate-500 border-b">
                                                            <th className="text-left py-1 px-2 font-medium">Fecha</th>
                                                            <th className="text-left py-1 px-2 font-medium">Hora</th>
                                                            <th className="text-left py-1 px-2 font-medium">Cliente</th>
                                                            <th className="text-left py-1 px-2 font-medium">Contacto</th>
                                                            <th className="text-left py-1 px-2 font-medium">Medio</th>
                                                            <th className="text-left py-1 px-2 font-medium">Motivo</th>
                                                            <th className="text-left py-1 px-2 font-medium">Resultado</th>
                                                            <th className="text-left py-1 px-2 font-medium">Observaciones</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="font-mono">
                                                        {visitasFiltradas.map(v => (
                                                            <tr key={v.id} className="border-b border-slate-50 hover:bg-blue-50">
                                                                <td className="py-1 px-2 whitespace-nowrap">{v.fecha}</td>
                                                                <td className="py-1 px-2 whitespace-nowrap">{v.hora}</td>
                                                                <td className="py-1 px-2 truncate max-w-[150px]">{v.cli_nombre}</td>
                                                                <td className="py-1 px-2 truncate max-w-[100px]">{v.contacto}</td>
                                                                <td className="py-1 px-2">{v.medio}</td>
                                                                <td className="py-1 px-2">{v.motivo}</td>
                                                                <td className="py-1 px-2">{v.resultado}</td>
                                                                <td className="py-1 px-2 truncate max-w-[200px]">{v.observaciones}</td>
                                                            </tr>
                                                        ))}
                                                        {visitasFiltradas.length === 0 && (
                                                            <tr><td colSpan={8} className="text-center py-4 text-slate-400">Sin visitas en el período seleccionado</td></tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* ═══ RIGHT COLUMN: KPIs + TOP ═══ */}
                        <div className="md:col-span-5 flex flex-col gap-3 md:h-full md:min-h-0 md:overflow-hidden">
                            {/* KPI Row 1 */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
                                <KpiCard label="Volumen Ventas" icon="💰"
                                    value={`${fmt(kpis.ventas_anio)} €`}
                                    sub={kpis.ventas_anio_anterior > 0
                                        ? `(${variacion >= 0 ? '+' : ''}${variacion.toFixed(1)}%)`
                                        : undefined}
                                    subColor={variacion >= 0 ? 'text-green-600' : 'text-red-600'} />
                                <KpiCard label="Nº Clientes" icon="👥" value={String(kpis.num_clientes)} />
                                <KpiCard label="Ticket Medio/Cli" icon="🎫" value={`${fmt(kpis.ticket_medio_cliente)} €`} />
                                <KpiCard label="Nº Visitas (Docs)" icon="📋" value={String(kpis.num_visitas)} />
                            </div>

                            {/* KPI Row 2 */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
                                <KpiCard label="Valor/Visita" icon="📊" value={`${fmt(kpis.valor_por_visita)} €`} />
                                <KpiCard label="Margen Generado" icon="🎯"
                                    value={`${fmt(kpis.margen_anio)} €`}
                                    sub={`(${kpis.margen_pct.toFixed(1)}%)`}
                                    subColor={kpis.margen_pct >= 30 ? 'text-green-600' : 'text-orange-500'} />
                                <KpiCard label="Crec. Cartera" icon="📈"
                                    value={`${kpis.crecimiento_cartera >= 0 ? '+' : ''}${kpis.crecimiento_cartera.toFixed(1)}%`}
                                    highlight={kpis.crecimiento_cartera < 0} />
                                <KpiCard label="Pte. Cobro" icon="💳"
                                    value={`${fmt(kpis.saldo_pendiente)} €`}
                                    highlight={kpis.saldo_pendiente > 0} />
                            </div>

                            {/* TOP Productos */}
                            <div className="border rounded-lg flex flex-col min-h-[280px] md:flex-1 md:min-h-0">
                                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                                    <h3 className="text-xs font-semibold text-slate-700">TOP Ventas por año</h3>
                                    <select value={topAnio} onChange={e => setTopAnio(Number(e.target.value))} className="border rounded px-2 py-0.5 text-xs">
                                        {anios_cols.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="px-3 py-1.5 bg-slate-50 border-b text-[10px] font-semibold text-slate-600">
                                    ═══ {topAnio} ═══ Total: {fmt(topProductos.total)} € — Uds: {fmtInt(topProductos.uds)} — ({topProductos.count} productos)
                                </div>
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full text-[10px]">
                                        <thead className="sticky top-0 bg-white">
                                            <tr className="text-slate-500 border-b">
                                                <th className="text-left py-0.5 px-2 font-medium">Producto</th>
                                                <th className="text-right py-0.5 px-1 font-medium">Uds</th>
                                                <th className="text-right py-0.5 px-1 font-medium">Importe</th>
                                            </tr>
                                        </thead>
                                        <tbody className="font-mono">
                                            {topProductos.productos.map((p, i) => (
                                                <tr key={i} className="border-b border-slate-50">
                                                    <td className="py-0.5 px-2 truncate max-w-[250px]" title={`${p.referencia} - ${p.descripcion}`}>
                                                        {p.descripcion || p.referencia}
                                                    </td>
                                                    <td className="text-right py-0.5 px-1 whitespace-nowrap">{p.unidades > 0 ? fmtInt(p.unidades) : ''}</td>
                                                    <td className="text-right py-0.5 px-1 whitespace-nowrap">{fmt(p.total_venta)} €</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══ Document Detail Modal ═══ */}
                {docModal && (
                    <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                            <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50 rounded-t-xl">
                                <h3 className="font-bold text-slate-700 text-sm">{docModal.titulo}</h3>
                                <button onClick={() => { setDocModal(null); setDocDetalle(null) }} className="p-1 hover:bg-slate-200 rounded-full"><X size={16} /></button>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {docLoading && (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full" />
                                    </div>
                                )}
                                {!docLoading && docDetalle && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                            <div><span className="text-slate-400">Tipo:</span> <span className="font-semibold">{docDetalle.cabecera.tipodoc === 8 ? 'Factura' : docDetalle.cabecera.tipodoc === 4 ? 'Albarán' : `Doc ${docDetalle.cabecera.tipodoc}`}</span></div>
                                            <div><span className="text-slate-400">Serie/Num:</span> <span className="font-semibold">{docDetalle.cabecera.serie}-{docDetalle.cabecera.numero}</span></div>
                                            <div><span className="text-slate-400">Fecha:</span> <span className="font-semibold">{docDetalle.cabecera.fecha}</span></div>
                                            <div><span className="text-slate-400">Total:</span> <span className="font-bold text-blue-700">{fmt(docDetalle.cabecera.total)} €</span></div>
                                        </div>
                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-600">
                                                    <th className="text-left py-1 px-2">#</th>
                                                    <th className="text-left py-1 px-2">Ref</th>
                                                    <th className="text-left py-1 px-2">Descripción</th>
                                                    <th className="text-right py-1 px-2">Uds</th>
                                                    <th className="text-right py-1 px-2">Precio</th>
                                                    <th className="text-right py-1 px-2">Dto%</th>
                                                    <th className="text-right py-1 px-2">Importe</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono">
                                                {docDetalle.lineas.map((l, i) => (
                                                    <tr key={i} className="border-b border-slate-50">
                                                        <td className="py-0.5 px-2">{l.orden}</td>
                                                        <td className="py-0.5 px-2">{l.referencia}</td>
                                                        <td className="py-0.5 px-2 truncate max-w-[250px]">{l.descripcion}</td>
                                                        <td className="text-right py-0.5 px-2">{l.unidades}</td>
                                                        <td className="text-right py-0.5 px-2">{fmt(l.precio)}</td>
                                                        <td className="text-right py-0.5 px-2">{l.descuento > 0 ? l.descuento.toFixed(1) : ''}</td>
                                                        <td className="text-right py-0.5 px-2 font-semibold">{fmt(l.importe)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t-2 font-bold bg-slate-50">
                                                    <td colSpan={6} className="text-right py-1 px-2">Total líneas:</td>
                                                    <td className="text-right py-1 px-2">{fmt(docDetalle.lineas.reduce((s, l) => s + l.importe, 0))} €</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-blue-50 rounded-lg p-3">
                                                <h4 className="text-xs font-bold text-blue-700 mb-2">Desglose IVA</h4>
                                                <div className="space-y-1 text-xs font-mono">
                                                    {[1, 2, 3].map(n => {
                                                        const base = docDetalle.cabecera[`baseimpo${n}` as keyof typeof docDetalle.cabecera] as number
                                                        const piva = docDetalle.cabecera[`piva${n}` as keyof typeof docDetalle.cabecera] as number
                                                        const iva = docDetalle.cabecera[`iva${n}` as keyof typeof docDetalle.cabecera] as number
                                                        if (!base) return null
                                                        return (
                                                            <div key={n} className="flex justify-between">
                                                                <span>Base {piva}%:</span>
                                                                <span>{fmt(base)} € → IVA: {fmt(iva)} €</span>
                                                            </div>
                                                        )
                                                    })}
                                                    <div className="border-t pt-1 font-bold flex justify-between">
                                                        <span>TOTAL:</span><span>{fmt(docDetalle.cabecera.total)} €</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {docDetalle.vencimientos.length > 0 && (
                                                <div className="bg-amber-50 rounded-lg p-3">
                                                    <h4 className="text-xs font-bold text-amber-700 mb-2">Vencimientos</h4>
                                                    {docDetalle.vencimientos.map((v, i) => (
                                                        <div key={i} className="flex justify-between text-xs font-mono">
                                                            <span>{v.fecha}</span>
                                                            <span>{fmt(v.importe)} €</span>
                                                            <span className={v.situacion === 0 ? 'text-red-600' : 'text-green-600'}>
                                                                {v.situacion === 0 ? 'Pendiente' : 'Cobrado'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

/* ─── Sub-components ─── */

function KpiCard({ label, icon, value, sub, subColor, highlight }: {
    label: string; icon: string; value: string; sub?: string; subColor?: string; highlight?: boolean
}) {
    return (
        <div className={`rounded-lg border p-2.5 text-center ${highlight ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
            <p className="text-[10px] text-slate-400 mb-0.5">{icon} {label}</p>
            <p className={`text-sm font-bold ${highlight ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
            {sub && <p className={`text-[10px] font-semibold ${subColor || 'text-slate-500'}`}>{sub}</p>}
        </div>
    )
}
