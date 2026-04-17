import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'
import {
    TrendingUp, TrendingDown,
    ShoppingCart, CreditCard, Wallet, Users, Package,
    Filter, RefreshCw, ChevronDown, ChevronUp, X
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts'
import type { CuadroMandosData, ProductoFamilia, VencimientosResumen, FacturaDoc, VencimientoDetalle } from '../types'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmt(n: number): string {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n: number): string {
    return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

export default function Dashboard() {
    const { user } = useAuth()
    const [data, setData] = useState<CuadroMandosData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Filters
    const [anio, setAnio] = useState(new Date().getFullYear())
    const [mesDesde, setMesDesde] = useState(1)
    const [mesHasta, setMesHasta] = useState(12)
    const [selectedSeries, setSelectedSeries] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('dashboard_series') || '[]') } catch { return [] }
    })
    const [agente, setAgente] = useState('')
    const [seriesOpen, setSeriesOpen] = useState(false)
    const seriesRef = useRef<HTMLDivElement>(null)

    // Familia modal state
    const [familiaModal, setFamiliaModal] = useState<string | null>(null)
    const [familiaProductos, setFamiliaProductos] = useState<ProductoFamilia[]>([])
    const [familiaLoading, setFamiliaLoading] = useState(false)

    // Sort state for tables
    const [sortClientes, setSortClientes] = useState<{ col: string; asc: boolean }>({ col: 'total', asc: false })
    const [sortProveedores, setSortProveedores] = useState<{ col: string; asc: boolean }>({ col: 'total_compras', asc: false })

    // Vencimientos date filter
    const [vtoDesde, setVtoDesde] = useState('')
    const [vtoHasta, setVtoHasta] = useState('')
    const [vtoData, setVtoData] = useState<VencimientosResumen | null>(null)

    // Detail modals
    const [detailModal, setDetailModal] = useState<{ type: 'cliente' | 'proveedor' | 'vto'; title: string } | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [facturasDetalle, setFacturasDetalle] = useState<FacturaDoc[]>([])
    const [vtosDetalle, setVtosDetalle] = useState<VencimientoDetalle[]>([])

    // Common params helper
    const commonParams = useCallback(() => {
        const p: Record<string, unknown> = { anio, mes_desde: mesDesde, mes_hasta: mesHasta }
        if (selectedSeries.length > 0) p.series = selectedSeries
        if (agente) p.agente = parseInt(agente)
        return p
    }, [anio, mesDesde, mesHasta, selectedSeries, agente])

    // Close series dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (seriesRef.current && !seriesRef.current.contains(e.target as Node)) setSeriesOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Persist series selection
    const toggleSerie = (s: string) => {
        setSelectedSeries(prev => {
            const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
            localStorage.setItem('dashboard_series', JSON.stringify(next))
            return next
        })
    }
    const clearSeries = () => { setSelectedSeries([]); localStorage.setItem('dashboard_series', '[]') }

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const params: Record<string, unknown> = { anio, mes_desde: mesDesde, mes_hasta: mesHasta }
            if (selectedSeries.length > 0) params.series = selectedSeries
            if (agente) params.agente = parseInt(agente)
            const { data: d } = await api.get<CuadroMandosData>('/api/dashboard/cuadro-mandos', {
                params,
                paramsSerializer: { indexes: null },
            })
            setData(d)
            setVtoData(null)
            setVtoDesde('')
            setVtoHasta('')
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando datos')
        } finally {
            setLoading(false)
        }
    }, [anio, mesDesde, mesHasta, selectedSeries, agente])

    useEffect(() => { fetchData() }, [fetchData])

    // Fetch productos by familia
    const openFamilia = async (familia: string) => {
        setFamiliaModal(familia)
        setFamiliaLoading(true)
        try {
            const params: Record<string, unknown> = { familia, anio, mes_desde: mesDesde, mes_hasta: mesHasta }
            if (selectedSeries.length > 0) params.series = selectedSeries
            if (agente) params.agente = parseInt(agente)
            const { data: d } = await api.get<{ productos: ProductoFamilia[] }>('/api/dashboard/productos-familia', {
                params,
                paramsSerializer: { indexes: null },
            })
            setFamiliaProductos(d.productos)
        } catch { setFamiliaProductos([]) }
        finally { setFamiliaLoading(false) }
    }

    // Fetch vencimientos with date filter
    const fetchVencimientos = async () => {
        try {
            const params: Record<string, unknown> = {}
            if (vtoDesde) params.fecha_desde = vtoDesde
            if (vtoHasta) params.fecha_hasta = vtoHasta
            if (selectedSeries.length > 0) params.series = selectedSeries
            const { data: d } = await api.get<VencimientosResumen>('/api/dashboard/vencimientos-resumen', {
                params,
                paramsSerializer: { indexes: null },
            })
            setVtoData(d)
        } catch { /* ignore */ }
    }

    // Open client detail modal
    const openCliente = async (cli_codigo: number, cli_nombre: string) => {
        setDetailModal({ type: 'cliente', title: cli_nombre })
        setDetailLoading(true)
        setFacturasDetalle([])
        try {
            const p = { ...commonParams(), cli_codigo }
            const { data: d } = await api.get<{ facturas: FacturaDoc[] }>('/api/dashboard/facturas-cliente', {
                params: p, paramsSerializer: { indexes: null },
            })
            setFacturasDetalle(d.facturas)
        } catch { setFacturasDetalle([]) }
        finally { setDetailLoading(false) }
    }

    // Open provider detail modal
    const openProveedor = async (pro_codigo: number, pro_nombre: string) => {
        setDetailModal({ type: 'proveedor', title: pro_nombre })
        setDetailLoading(true)
        setFacturasDetalle([])
        try {
            const p: Record<string, unknown> = { pro_codigo, anio, mes_desde: mesDesde, mes_hasta: mesHasta }
            const { data: d } = await api.get<{ facturas: FacturaDoc[] }>('/api/dashboard/facturas-proveedor', {
                params: p, paramsSerializer: { indexes: null },
            })
            setFacturasDetalle(d.facturas)
        } catch { setFacturasDetalle([]) }
        finally { setDetailLoading(false) }
    }

    // Open vencimientos detail modal
    const openVencimientos = async (tipo: 0 | 1) => {
        setDetailModal({ type: 'vto', title: tipo === 0 ? 'Vencimientos Clientes' : 'Vencimientos Proveedores' })
        setDetailLoading(true)
        setVtosDetalle([])
        try {
            const p: Record<string, unknown> = { tipo }
            if (vtoDesde) p.fecha_desde = vtoDesde
            if (vtoHasta) p.fecha_hasta = vtoHasta
            if (selectedSeries.length > 0) p.series = selectedSeries
            const { data: d } = await api.get<{ vencimientos: VencimientoDetalle[] }>('/api/dashboard/vencimientos-detalle', {
                params: p, paramsSerializer: { indexes: null },
            })
            setVtosDetalle(d.vencimientos)
        } catch { setVtosDetalle([]) }
        finally { setDetailLoading(false) }
    }

    // Sorted helpers
    function sorted<T>(arr: T[], col: string, asc: boolean): T[] {
        return [...arr].sort((a, b) => {
            const va = (a as any)[col] ?? 0
            const vb = (b as any)[col] ?? 0
            return asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
        })
    }

    // Build chart data: merge ventas and compras by month
    const chartData = MESES.map((name, i) => {
        const mes = i + 1
        const venta = data?.ventas_mensuales.find(v => v.mes === mes)
        const compra = data?.compras_mensuales.find(c => c.mes === mes)
        return {
            name,
            Ventas: venta?.total || 0,
            Compras: compra?.total || 0,
        }
    }).filter((_, i) => i + 1 >= mesDesde && i + 1 <= mesHasta)

    return (
        <div>
            {/* Familia Modal */}
            {familiaModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFamiliaModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">Productos — {familiaModal}</h2>
                            <button onClick={() => setFamiliaModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-4">
                            {familiaLoading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-1.5 pr-2">Referencia</th>
                                            <th className="text-left py-1.5 pr-2">Descripción</th>
                                            <th className="text-right py-1.5 pr-2">Uds</th>
                                            <th className="text-right py-1.5 pr-2">Venta</th>
                                            <th className="text-right py-1.5 pr-2">Coste</th>
                                            <th className="text-right py-1.5">Beneficio</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {familiaProductos.map(p => (
                                            <tr key={p.referencia} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2 font-mono">{p.referencia}</td>
                                                <td className="py-1 pr-2 truncate max-w-[200px]" title={p.descripcion}>{p.descripcion}</td>
                                                <td className="text-right py-1 pr-2">{fmtInt(p.unidades)}</td>
                                                <td className="text-right py-1 pr-2">{fmt(p.total_venta)}</td>
                                                <td className="text-right py-1 pr-2">{fmt(p.total_coste)}</td>
                                                <td className={`text-right py-1 font-medium ${p.beneficio >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(p.beneficio)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {familiaProductos.length > 0 && (
                                        <tfoot>
                                            <tr className="font-bold border-t border-slate-300">
                                                <td colSpan={2} className="py-1.5 pr-2">TOTAL</td>
                                                <td className="text-right py-1.5 pr-2">{fmtInt(familiaProductos.reduce((a, p) => a + p.unidades, 0))}</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(familiaProductos.reduce((a, p) => a + p.total_venta, 0))}</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(familiaProductos.reduce((a, p) => a + p.total_coste, 0))}</td>
                                                <td className="text-right py-1.5 font-bold text-green-600">{fmt(familiaProductos.reduce((a, p) => a + p.beneficio, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal (Clientes/Proveedores/Vencimientos) */}
            {detailModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">
                                {detailModal.type === 'cliente' ? 'Facturas — ' : detailModal.type === 'proveedor' ? 'Facturas — ' : ''}
                                {detailModal.title}
                            </h2>
                            <button onClick={() => setDetailModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-4">
                            {detailLoading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : detailModal.type === 'vto' ? (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-1.5 pr-2">Código</th>
                                            <th className="text-left py-1.5 pr-2">Nombre</th>
                                            <th className="text-left py-1.5 pr-2">Serie</th>
                                            <th className="text-right py-1.5 pr-2">Número</th>
                                            <th className="text-left py-1.5 pr-2">Fecha</th>
                                            <th className="text-right py-1.5">Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vtosDetalle.map((v, i) => (
                                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2">{v.codigo}</td>
                                                <td className="py-1 pr-2 truncate max-w-[180px]" title={v.nombre}>{v.nombre}</td>
                                                <td className="py-1 pr-2">{v.serie}</td>
                                                <td className="text-right py-1 pr-2">{v.numero}</td>
                                                <td className="py-1 pr-2">{v.fecha}</td>
                                                <td className="text-right py-1 font-medium">{fmt(v.importe)} €</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {vtosDetalle.length > 0 && (
                                        <tfoot>
                                            <tr className="font-bold border-t border-slate-300">
                                                <td colSpan={5} className="py-1.5 pr-2">TOTAL ({vtosDetalle.length} vtos.)</td>
                                                <td className="text-right py-1.5 font-bold">{fmt(vtosDetalle.reduce((a, v) => a + v.importe, 0))} €</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-1.5 pr-2">Serie</th>
                                            <th className="text-right py-1.5 pr-2">Número</th>
                                            <th className="text-left py-1.5 pr-2">Fecha</th>
                                            {detailModal.type === 'cliente' && <th className="text-left py-1.5 pr-2">Tipo</th>}
                                            <th className="text-right py-1.5 pr-2">Base</th>
                                            <th className="text-right py-1.5 pr-2">IVA</th>
                                            <th className="text-right py-1.5 pr-2">Total</th>
                                            <th className="text-center py-1.5">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {facturasDetalle.map((f, i) => (
                                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2">{f.serie}</td>
                                                <td className="text-right py-1 pr-2">{f.numero}</td>
                                                <td className="py-1 pr-2">{f.fecha}</td>
                                                {detailModal.type === 'cliente' && <td className="py-1 pr-2">{f.tipo_doc}</td>}
                                                <td className="text-right py-1 pr-2">{fmt(f.base)}</td>
                                                <td className="text-right py-1 pr-2">{fmt(f.iva)}</td>
                                                <td className="text-right py-1 pr-2 font-medium">{fmt(f.total)}</td>
                                                <td className="text-center py-1">
                                                    {f.pendiente > 0
                                                        ? <span className="inline-block bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">Pendiente</span>
                                                        : <span className="inline-block bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">Pagada</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {facturasDetalle.length > 0 && (
                                        <tfoot>
                                            <tr className="font-bold border-t border-slate-300">
                                                <td colSpan={detailModal.type === 'cliente' ? 4 : 3} className="py-1.5 pr-2">TOTAL ({facturasDetalle.length} docs.)</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(facturasDetalle.reduce((a, f) => a + f.base, 0))}</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(facturasDetalle.reduce((a, f) => a + f.iva, 0))}</td>
                                                <td className="text-right py-1.5 pr-2 font-bold">{fmt(facturasDetalle.reduce((a, f) => a + f.total, 0))}</td>
                                                <td className="text-center py-1.5">
                                                    <span className="text-[10px] text-amber-600 font-semibold">
                                                        {fmt(facturasDetalle.reduce((a, f) => a + f.pendiente, 0))} pte.
                                                    </span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Filters bar */}
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-3 sticky top-0 z-40">
                <Filter className="w-4 h-4 text-slate-400" />
                <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500">Año:</label>
                    <input type="number" value={anio} onChange={e => setAnio(+e.target.value)}
                        className="input w-20 !py-1 text-xs" />
                </div>
                <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500">Meses:</label>
                    <select value={mesDesde} onChange={e => setMesDesde(+e.target.value)} className="input w-16 !py-1 text-xs">
                        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <span className="text-xs text-slate-400">a</span>
                    <select value={mesHasta} onChange={e => setMesHasta(+e.target.value)} className="input w-16 !py-1 text-xs">
                        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="relative" ref={seriesRef}>
                    <label className="text-xs text-slate-500 mr-1.5">Series:</label>
                    <button
                        onClick={() => setSeriesOpen(!seriesOpen)}
                        className="input inline-flex items-center gap-1 !w-auto min-w-[120px] !py-1 text-xs"
                    >
                        {selectedSeries.length === 0 ? 'Todas' : `${selectedSeries.length} sel.`}
                        <ChevronDown className="w-3 h-3 ml-auto" />
                    </button>
                    {seriesOpen && data?.filtros.series && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[180px] max-h-60 overflow-y-auto">
                            <div className="px-3 py-1.5 border-b border-slate-100">
                                <button onClick={clearSeries} className="text-[11px] text-brand hover:underline">Limpiar selección</button>
                            </div>
                            {data.filtros.series.map(s => (
                                <label key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
                                    <input
                                        type="checkbox"
                                        checked={selectedSeries.includes(s)}
                                        onChange={() => toggleSerie(s)}
                                        className="rounded border-slate-300 text-brand focus:ring-brand"
                                    />
                                    {s}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500">Agente:</label>
                    <select value={agente} onChange={e => setAgente(e.target.value)} className="input w-36 !py-1 text-xs">
                        <option value="">Todos</option>
                        {data?.filtros.agentes.map(a => <option key={a.codigo} value={a.codigo}>{a.nombre}</option>)}
                    </select>
                </div>
                <button onClick={fetchData} className="btn-primary !py-1 !px-3 text-xs flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Actualizar
                </button>
            </div>

            {/* Content */}
            <main className="p-4 max-w-[1600px] mx-auto">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
                        {error}
                    </div>
                )}

                {loading && !data ? (
                    <div className="card text-center text-slate-400 py-12">Cargando...</div>
                ) : data ? (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                            {/* Ventas desglosado */}
                            <div className="card flex flex-col">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-blue-600"><TrendingUp className="w-4 h-4" /></span>
                                    <span className="text-xs text-slate-500">Total Ventas</span>
                                </div>
                                <span className="text-lg font-bold text-blue-600">{fmt(data.totales.ventas)} €</span>
                                <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Facturas ({data.totales.num_facturas})</span>
                                        <span className="font-medium text-blue-700">{fmt(data.totales.total_facturas)} €</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Alb. pte fact. ({data.totales.num_albaranes_pte})</span>
                                        <span className="font-medium text-amber-600">{fmt(data.totales.total_albaranes_pte)} €</span>
                                    </div>
                                </div>
                            </div>
                            <KPICard icon={<ShoppingCart className="w-4 h-4" />} label="Total Compras" value={fmt(data.totales.compras)} color="text-orange-600" />
                            <KPICard icon={<TrendingUp className="w-4 h-4" />} label="Beneficio" value={fmt(data.beneficio.beneficio)} color="text-green-600" sub={`${((data.beneficio.beneficio / (data.beneficio.ventas || 1)) * 100).toFixed(1)}% margen`} />
                            <KPICard icon={<CreditCard className="w-4 h-4" />} label="Cobros" value={fmt(data.totales.cobros)} color="text-emerald-600" />
                            <KPICard icon={<Wallet className="w-4 h-4" />} label="Pte. Cobro" value={fmt(data.vencimientos.clientes)} color="text-amber-600" />
                            <KPICard icon={<TrendingDown className="w-4 h-4" />} label="Pte. Pago" value={fmt(data.vencimientos.proveedores)} color="text-red-600" />
                        </div>

                        {/* Chart + Series IVA */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                            <div className="card lg:col-span-2">
                                <h3 className="text-sm font-semibold mb-3">Ventas vs Compras Mensuales</h3>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={chartData} barGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip formatter={(v: number) => fmt(v) + ' €'} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="Ventas" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="Compras" fill="#f97316" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Series / IVA */}
                            <div className="card overflow-auto">
                                <h3 className="text-sm font-semibold mb-2">Series / IVA</h3>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-1.5 pr-2">Serie</th>
                                            <th className="text-right py-1.5 pr-2">Base</th>
                                            <th className="text-right py-1.5 pr-2">IVA</th>
                                            <th className="text-right py-1.5">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.series_iva.map(s => (
                                            <tr key={s.serie} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1.5 pr-2 font-medium">{s.serie}</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(s.base1)}</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(s.iva1)}</td>
                                                <td className="text-right py-1.5 font-semibold">{fmt(s.total)}</td>
                                            </tr>
                                        ))}
                                        {data.series_iva.length > 0 && (
                                            <tr className="font-bold border-t border-slate-300">
                                                <td className="py-1.5 pr-2">TOTAL</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(data.series_iva.reduce((a, s) => a + s.base1, 0))}</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(data.series_iva.reduce((a, s) => a + s.iva1, 0))}</td>
                                                <td className="text-right py-1.5">{fmt(data.series_iva.reduce((a, s) => a + s.total, 0))}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Bottom row: Consumo, Top Clientes, Proveedores, Vencimientos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Consumo por Familia */}
                            <div className="card overflow-auto max-h-[400px]">
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                    <Package className="w-4 h-4 text-slate-400" /> Consumo por Familia
                                </h3>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-1.5 pr-2">Familia</th>
                                            <th className="text-right py-1.5 pr-2">Uds</th>
                                            <th className="text-right py-1.5">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.consumo_familias.map(f => (
                                            <tr key={f.familia} className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer" onClick={() => openFamilia(f.familia)}>
                                                <td className="py-1 pr-2 truncate max-w-[120px] text-blue-600 hover:underline" title={f.familia}>{f.familia}</td>
                                                <td className="text-right py-1 pr-2">{fmtInt(f.unidades)}</td>
                                                <td className="text-right py-1 font-medium">{fmt(f.total_venta)}</td>
                                            </tr>
                                        ))}
                                        {data.consumo_familias.length > 0 && (
                                            <tr className="font-bold border-t border-slate-300">
                                                <td className="py-1.5 pr-2">TOTAL</td>
                                                <td className="text-right py-1.5 pr-2">{fmtInt(data.consumo_familias.reduce((a, f) => a + f.unidades, 0))}</td>
                                                <td className="text-right py-1.5">{fmt(data.consumo_familias.reduce((a, f) => a + f.total_venta, 0))}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Top Clientes */}
                            <div className="card overflow-auto max-h-[400px]">
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-slate-400" /> Top Clientes
                                </h3>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <SortTh label="Cliente" col="cli_nombre" sort={sortClientes} onSort={setSortClientes} align="left" />
                                            <SortTh label="Total" col="total" sort={sortClientes} onSort={setSortClientes} />
                                            <SortTh label="Benef." col="beneficio" sort={sortClientes} onSort={setSortClientes} />
                                            <SortTh label="Pte." col="pendiente" sort={sortClientes} onSort={setSortClientes} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted(data.top_clientes, sortClientes.col, sortClientes.asc).map(c => (
                                            <tr key={c.cli_codigo} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => openCliente(c.cli_codigo, c.cli_nombre)}>
                                                <td className="py-1 pr-2 truncate max-w-[110px]" title={c.cli_nombre}>{c.cli_nombre}</td>
                                                <td className="text-right py-1 pr-1 font-medium">{fmt(c.total)}</td>
                                                <td className={`text-right py-1 pr-1 ${c.beneficio >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(c.beneficio)}</td>
                                                <td className={`text-right py-1 ${c.pendiente > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>{fmt(c.pendiente)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Proveedores */}
                            <div className="card overflow-auto max-h-[400px]">
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                    <ShoppingCart className="w-4 h-4 text-slate-400" /> Proveedores
                                </h3>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <SortTh label="Proveedor" col="pro_nombre" sort={sortProveedores} onSort={setSortProveedores} align="left" />
                                            <SortTh label="Total" col="total_compras" sort={sortProveedores} onSort={setSortProveedores} />
                                            <SortTh label="Pte." col="pendiente" sort={sortProveedores} onSort={setSortProveedores} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted(data.proveedores, sortProveedores.col, sortProveedores.asc).map(p => (
                                            <tr key={p.pro_codigo} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => openProveedor(p.pro_codigo, p.pro_nombre)}>
                                                <td className="py-1 pr-2 truncate max-w-[130px]" title={p.pro_nombre}>{p.pro_nombre}</td>
                                                <td className="text-right py-1 pr-1 font-medium">{fmt(p.total_compras)}</td>
                                                <td className={`text-right py-1 ${p.pendiente > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}`}>{fmt(p.pendiente)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Vencimientos + Resumen */}
                            <div className="space-y-4">
                                <div className="card">
                                    <h3 className="text-sm font-semibold mb-3">Vencimientos Pte.</h3>
                                    <div className="flex gap-2 mb-3">
                                        <input type="date" value={vtoDesde} onChange={e => setVtoDesde(e.target.value)}
                                            className="input !py-1 text-[11px] flex-1" placeholder="Desde" />
                                        <input type="date" value={vtoHasta} onChange={e => setVtoHasta(e.target.value)}
                                            className="input !py-1 text-[11px] flex-1" placeholder="Hasta" />
                                        <button onClick={fetchVencimientos} className="btn-primary !py-1 !px-2 text-[11px]">
                                            <Filter className="w-3 h-3" />
                                        </button>
                                    </div>
                                    {vtoData && (
                                        <div className="text-[10px] text-slate-400 mb-2 italic">Filtrado por fechas</div>
                                    )}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1 py-0.5" onClick={() => openVencimientos(0)}>
                                            <span className="text-slate-500">Pte. Cobro (clientes){vtoData ? ` (${vtoData.clientes_count})` : ''}</span>
                                            <span className="font-semibold text-amber-600">{fmt((vtoData ?? data.vencimientos).clientes)} €</span>
                                        </div>
                                        <div className="flex justify-between text-xs cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1 py-0.5" onClick={() => openVencimientos(1)}>
                                            <span className="text-slate-500">Pte. Pago (proveedores){vtoData ? ` (${vtoData.proveedores_count})` : ''}</span>
                                            <span className="font-semibold text-red-600">{fmt((vtoData ?? data.vencimientos).proveedores)} €</span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-xs">
                                            <span className="text-slate-500 font-medium">Diferencia</span>
                                            <span className={`font-bold ${(vtoData ?? data.vencimientos).clientes - (vtoData ?? data.vencimientos).proveedores >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {fmt((vtoData ?? data.vencimientos).clientes - (vtoData ?? data.vencimientos).proveedores)} €
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="card">
                                    <h3 className="text-sm font-semibold mb-3">Resumen Beneficio</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Total Venta</span>
                                            <span className="font-medium">{fmt(data.beneficio.ventas)} €</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Total Coste</span>
                                            <span className="font-medium text-red-600">- {fmt(data.beneficio.coste)} €</span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-xs">
                                            <span className="text-slate-500 font-medium">Beneficio</span>
                                            <span className="font-bold text-green-600">{fmt(data.beneficio.beneficio)} €</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Margen</span>
                                            <span className="font-bold text-blue-600">{((data.beneficio.beneficio / (data.beneficio.ventas || 1)) * 100).toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </main>
        </div>
    )
}

function KPICard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string; color: string; sub?: string }) {
    return (
        <div className="card flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
                <span className={color}>{icon}</span>
                <span className="text-xs text-slate-500">{label}</span>
            </div>
            <span className={`text-lg font-bold ${color}`}>{value} €</span>
            {sub && <span className="text-[10px] text-slate-400 mt-0.5">{sub}</span>}
        </div>
    )
}

function SortTh({ label, col, sort, onSort, align = 'right' }: {
    label: string; col: string;
    sort: { col: string; asc: boolean };
    onSort: (s: { col: string; asc: boolean }) => void;
    align?: 'left' | 'right'
}) {
    const active = sort.col === col
    return (
        <th
            className={`py-1.5 pr-1 cursor-pointer select-none hover:text-slate-700 ${align === 'left' ? 'text-left' : 'text-right'}`}
            onClick={() => onSort({ col, asc: active ? !sort.asc : false })}
        >
            <span className="inline-flex items-center gap-0.5">
                {label}
                {active ? (sort.asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
            </span>
        </th>
    )
}
