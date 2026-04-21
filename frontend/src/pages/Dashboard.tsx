import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'
import {
    TrendingUp, TrendingDown,
    ShoppingCart, CreditCard, Wallet, Users, Package,
    Filter, RefreshCw, ChevronDown, ChevronUp, X, Receipt, Clock
} from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts'
import type { CuadroMandosData, ProductoFamilia, VencimientosResumen, FacturaDoc, VencimientoDetalle, DocDetalle, FraPteCobro } from '../types'
import FichaCliente from '../components/FichaCliente'
import FichaProveedor from '../components/FichaProveedor'

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
        try { return JSON.parse(localStorage.getItem(`dashboard_series_${new Date().getFullYear()}`) || '[]') } catch { return [] }
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
    const [vtoSearch, setVtoSearch] = useState('')

    // IVA trimestral modal
    const [ivaModal, setIvaModal] = useState(false)
    const [ivaLoading, setIvaLoading] = useState(false)
    const [ivaTrimestral, setIvaTrimestral] = useState<{ trimestre: number; base_repercutido: number; iva_repercutido: number; base_soportado: number; iva_soportado: number; diferencia: number }[]>([])
    const [ivaSelectedSeries, setIvaSelectedSeries] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(`iva_series_${new Date().getFullYear()}`) || '[]') } catch { return [] }
    })
    const [ivaSeriesOpen, setIvaSeriesOpen] = useState(false)
    const ivaSeriesRef = useRef<HTMLDivElement>(null)

    // Vencimientos modal
    const [vtoModalOpen, setVtoModalOpen] = useState(false)

    // Pte. Cobro facturas modal
    const [pteCobro, setPteCobro] = useState<{ open: boolean; serie: string; loading: boolean; facturas: FraPteCobro[]; search: string; error: string; totalPendiente: number; totalFacturas: number }>({ open: false, serie: '', loading: false, facturas: [], search: '', error: '', totalPendiente: 0, totalFacturas: 0 })

    const openPteCobro = async (serie = '') => {
        setPteCobro(s => ({ ...s, open: true, serie, loading: true, facturas: [], search: '', error: '', totalPendiente: 0, totalFacturas: 0 }))
        try {
            const p: Record<string, unknown> = { ...commonParams() }
            if (serie) p.serie = serie
            const { data: d } = await api.get<{ facturas: FraPteCobro[]; total_pendiente: number; total_facturas: number }>('/api/dashboard/facturas-pte-cobro', {
                params: p, paramsSerializer: { indexes: null },
            })
            setPteCobro(s => ({ ...s, loading: false, facturas: d.facturas, totalPendiente: d.total_pendiente, totalFacturas: d.total_facturas }))
        } catch (e: any) {
            setPteCobro(s => ({ ...s, loading: false, error: e?.response?.data?.detail || 'Error cargando datos' }))
        }
    }

    // Document detail modal
    const [docModal, setDocModal] = useState<{ tipo: 'venta' | 'compra'; docId: number; titulo: string } | null>(null)
    const [docDetalle, setDocDetalle] = useState<DocDetalle | null>(null)
    const [docLoading, setDocLoading] = useState(false)

    // Ficha Cliente
    const [fichaCliente, setFichaCliente] = useState<{ codigo: number; nombre: string } | null>(null)

    // Ficha Proveedor
    const [fichaProveedor, setFichaProveedor] = useState<{ codigo: number; nombre: string } | null>(null)

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

    // Persist series selection (per year)
    const toggleSerie = (s: string) => {
        setSelectedSeries(prev => {
            const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
            localStorage.setItem(`dashboard_series_${anio}`, JSON.stringify(next))
            return next
        })
    }
    const clearSeries = () => { setSelectedSeries([]); localStorage.setItem(`dashboard_series_${anio}`, '[]') }

    // Load series selection when year changes
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`dashboard_series_${anio}`) || '[]')
            setSelectedSeries(saved)
        } catch { setSelectedSeries([]) }
        try {
            const savedIva = JSON.parse(localStorage.getItem(`iva_series_${anio}`) || '[]')
            setIvaSelectedSeries(savedIva)
        } catch { setIvaSelectedSeries([]) }
    }, [anio])

    // Close IVA series dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ivaSeriesRef.current && !ivaSeriesRef.current.contains(e.target as Node)) setIvaSeriesOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

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

    // Open client ficha modal
    const openCliente = (cli_codigo: number, cli_nombre: string) => {
        setFichaCliente({ codigo: cli_codigo, nombre: cli_nombre })
    }

    // Open provider ficha modal
    const openProveedor = (pro_codigo: number, pro_nombre: string) => {
        setFichaProveedor({ codigo: pro_codigo, nombre: pro_nombre })
    }

    // Open vencimientos detail modal
    const openVencimientos = async (tipo: 0 | 1) => {
        setDetailModal({ type: 'vto', title: tipo === 0 ? 'Vencimientos Clientes' : 'Facturas Pendientes de Pago' })
        setDetailLoading(true)
        setVtosDetalle([])
        setVtoSearch('')
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

    // Open IVA trimestral modal
    const openIvaTrimestral = async (seriesOverride?: string[]) => {
        setIvaModal(true)
        setIvaLoading(true)
        try {
            const p: Record<string, unknown> = { anio }
            const seriesToUse = seriesOverride ?? ivaSelectedSeries
            if (seriesToUse.length > 0) p.series = seriesToUse
            const { data: d } = await api.get<{ anio: number; trimestres: typeof ivaTrimestral }>('/api/dashboard/iva-trimestral', {
                params: p, paramsSerializer: { indexes: null },
            })
            setIvaTrimestral(d.trimestres)
        } catch { setIvaTrimestral([]) }
        finally { setIvaLoading(false) }
    }

    // IVA series toggle (per year)
    const toggleIvaSerie = (s: string) => {
        setIvaSelectedSeries(prev => {
            const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
            localStorage.setItem(`iva_series_${anio}`, JSON.stringify(next))
            openIvaTrimestral(next)
            return next
        })
    }
    const clearIvaSeries = () => {
        setIvaSelectedSeries([])
        localStorage.setItem(`iva_series_${anio}`, '[]')
        openIvaTrimestral([])
    }

    // Open document detail modal
    const openDocumento = async (docId: number, tipo: 'venta' | 'compra', titulo: string) => {
        setDocModal({ tipo, docId, titulo })
        setDocLoading(true)
        setDocDetalle(null)
        try {
            const { data: d } = await api.get<DocDetalle>('/api/dashboard/detalle-documento', {
                params: { doc_id: docId, tipo },
            })
            setDocDetalle(d)
        } catch { setDocDetalle(null) }
        finally { setDocLoading(false) }
    }

    // Sorted helpers
    function sorted<T>(arr: T[], col: string, asc: boolean): T[] {
        return [...arr].sort((a, b) => {
            const va = (a as any)[col] ?? 0
            const vb = (b as any)[col] ?? 0
            if (typeof va === 'number' && typeof vb === 'number') {
                return asc ? va - vb : vb - va
            }
            const sa = String(va), sb = String(vb)
            return asc ? sa.localeCompare(sb, 'es') : sb.localeCompare(sa, 'es')
        })
    }

    // Build chart data: clientes line chart (facturas, albaranes, pte cobro)
    const clientesChartData = MESES.map((name, i) => {
        const mes = i + 1
        const venta = data?.ventas_mensuales.find(v => v.mes === mes)
        return {
            name,
            Ventas: venta?.total_facturas || 0,
            Albaranes: venta?.total_albaranes || 0,
            'Pte. Cobro': data?.pte_cobro_mensual?.[mes] || 0,
        }
    }).filter((_, i) => i + 1 >= mesDesde && i + 1 <= mesHasta)

    // Build chart data: proveedores line chart (compras, pte pago)
    const proveedoresChartData = MESES.map((name, i) => {
        const mes = i + 1
        const compra = data?.compras_mensuales.find(c => c.mes === mes)
        return {
            name,
            Compras: compra?.total || 0,
            'Pte. Pago': data?.pte_pago_mensual?.[mes] || 0,
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
                        <div className="flex-1 flex flex-col min-h-0">
                            {detailModal.type === 'vto' && (
                                <div className="px-4 pt-3 pb-2 border-b">
                                    <input
                                        type="text"
                                        placeholder="Buscar por cliente / proveedor..."
                                        value={vtoSearch}
                                        onChange={e => setVtoSearch(e.target.value)}
                                        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand"
                                        autoFocus
                                    />
                                </div>
                            )}
                            <div className="overflow-auto flex-1 p-4">
                            {detailLoading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : detailModal.type === 'vto' ? (() => {
                                const filtered = vtoSearch
                                    ? vtosDetalle.filter(v => v.nombre.toLowerCase().includes(vtoSearch.toLowerCase()))
                                    : vtosDetalle
                                return (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-1.5 pr-2">Nombre</th>
                                            <th className="text-left py-1.5 pr-2">Serie</th>
                                            <th className="text-right py-1.5 pr-2">Número</th>
                                            <th className="text-left py-1.5 pr-2">Fecha</th>
                                            <th className="text-right py-1.5">Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((v, i) => (
                                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2 truncate max-w-[220px]" title={v.nombre}>{v.nombre}</td>
                                                <td className="py-1 pr-2">{v.serie}</td>
                                                <td className="text-right py-1 pr-2">{v.numero}</td>
                                                <td className="py-1 pr-2">{v.fecha}</td>
                                                <td className="text-right py-1 font-medium">{fmt(v.importe)} €</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {filtered.length > 0 && (
                                        <tfoot>
                                            <tr className="font-bold border-t border-slate-300">
                                                <td colSpan={4} className="py-1.5 pr-2">TOTAL ({filtered.length} vtos.)</td>
                                                <td className="text-right py-1.5 font-bold">{fmt(filtered.reduce((a, v) => a + v.importe, 0))} €</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                                )
                            })() : (
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
                                            <tr key={i} className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer"
                                                onClick={() => openDocumento(f.id, detailModal.type === 'cliente' ? 'venta' : 'compra', `${f.serie} / ${f.numero}`)}>
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
                </div>
            )}

            {/* Vencimientos Pendientes Modal */}
            {vtoModalOpen && data && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVtoModalOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">Vencimientos Pendientes</h2>
                            <button onClick={() => setVtoModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5">
                            <div className="flex gap-2 mb-4">
                                <input type="date" value={vtoDesde} onChange={e => setVtoDesde(e.target.value)}
                                    className="input !py-1.5 text-xs flex-1" placeholder="Desde" />
                                <input type="date" value={vtoHasta} onChange={e => setVtoHasta(e.target.value)}
                                    className="input !py-1.5 text-xs flex-1" placeholder="Hasta" />
                                <button onClick={fetchVencimientos} className="btn-primary !py-1.5 !px-3 text-xs">
                                    <Filter className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            {vtoData && (
                                <div className="text-[10px] text-slate-400 mb-3 italic">Filtrado por fechas</div>
                            )}
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm cursor-pointer hover:bg-slate-50 rounded px-2 -mx-2 py-1.5" onClick={() => openVencimientos(0)}>
                                    <span className="text-slate-600">Pte. Cobro (clientes){vtoData ? ` (${vtoData.clientes_count})` : ''}</span>
                                    <span className="font-semibold text-amber-600">{fmt((vtoData ?? data.vencimientos).clientes)} €</span>
                                </div>
                                <div className="flex justify-between text-sm cursor-pointer hover:bg-slate-50 rounded px-2 -mx-2 py-1.5" onClick={() => openVencimientos(1)}>
                                    <span className="text-slate-600">Pte. Pago (proveedores){vtoData ? ` (${vtoData.proveedores_count})` : ''}</span>
                                    <span className="font-semibold text-red-600">{fmt((vtoData ?? data.vencimientos).proveedores)} €</span>
                                </div>
                                <div className="border-t border-slate-200 pt-3 flex justify-between text-sm">
                                    <span className="text-slate-600 font-medium">Diferencia</span>
                                    <span className={`font-bold ${(vtoData ?? data.vencimientos).clientes - (vtoData ?? data.vencimientos).proveedores >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {fmt((vtoData ?? data.vencimientos).clientes - (vtoData ?? data.vencimientos).proveedores)} €
                                    </span>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-4 italic">
                                Haz clic en cada línea para ver el detalle de vencimientos
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Detail Modal */}
            {docModal && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setDocModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">
                                {docModal.tipo === 'venta' ? 'Factura' : 'Factura Compra'} — {docModal.titulo}
                            </h2>
                            <button onClick={() => setDocModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-4">
                            {docLoading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : docDetalle ? (
                                <>
                                    {/* Cabecera info */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
                                        <div>
                                            <span className="text-slate-400">Cliente/Proveedor</span>
                                            <p className="font-medium text-slate-700 truncate" title={docDetalle.cabecera.nombre_tercero}>
                                                {docDetalle.cabecera.codigo_tercero} — {docDetalle.cabecera.nombre_tercero}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Fecha</span>
                                            <p className="font-medium text-slate-700">{docDetalle.cabecera.fecha}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Documento</span>
                                            <p className="font-medium text-slate-700">{docDetalle.cabecera.serie} / {docDetalle.cabecera.numero}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Total</span>
                                            <p className="font-bold text-blue-700">{fmt(docDetalle.cabecera.total)} €</p>
                                        </div>
                                    </div>
                                    {docDetalle.cabecera.descripcion && (
                                        <p className="text-xs text-slate-500 mb-3 italic">{docDetalle.cabecera.descripcion}</p>
                                    )}

                                    {/* Líneas */}
                                    <table className="w-full text-xs mb-4">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-slate-500">
                                                <th className="text-left py-1.5 pr-2 w-8">#</th>
                                                <th className="text-left py-1.5 pr-2">Referencia</th>
                                                <th className="text-left py-1.5 pr-2">Descripción</th>
                                                <th className="text-right py-1.5 pr-2">Uds.</th>
                                                <th className="text-right py-1.5 pr-2">Precio</th>
                                                <th className="text-right py-1.5 pr-2">Dto%</th>
                                                <th className="text-right py-1.5 pr-2">Importe</th>
                                                <th className="text-right py-1.5">Coste</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {docDetalle.lineas.filter(l => l.unidades !== 0 || l.importe !== 0).map((l, i) => (
                                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                    <td className="py-1 pr-2 text-slate-400">{l.orden}</td>
                                                    <td className="py-1 pr-2 font-mono text-[10px]">{l.referencia || ''}</td>
                                                    <td className="py-1 pr-2 truncate max-w-[200px]" title={l.descripcion || ''}>{l.descripcion || ''}</td>
                                                    <td className="text-right py-1 pr-2">{l.unidades ? Number(l.unidades).toFixed(2) : ''}</td>
                                                    <td className="text-right py-1 pr-2">{l.precio ? fmt(l.precio) : ''}</td>
                                                    <td className="text-right py-1 pr-2 text-slate-400">{l.pdto1 ? `${Number(l.pdto1).toFixed(1)}` : ''}</td>
                                                    <td className="text-right py-1 pr-2 font-medium">{fmt(l.importe)}</td>
                                                    <td className="text-right py-1 text-slate-400">{l.coste ? fmt(l.coste) : ''}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-bold border-t-2 border-slate-300">
                                                <td colSpan={6} className="py-1.5 pr-2">TOTAL LÍNEAS</td>
                                                <td className="text-right py-1.5 pr-2">{fmt(docDetalle.lineas.reduce((a, l) => a + (l.importe || 0), 0))}</td>
                                                <td className="text-right py-1.5 text-slate-400">{fmt(docDetalle.lineas.reduce((a, l) => a + (l.coste || 0) * (l.unidades || 0), 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>

                                    {/* Bases e IVA */}
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="bg-slate-50 rounded-lg p-3 text-xs">
                                            <h4 className="font-semibold text-slate-600 mb-2">Desglose IVA</h4>
                                            {docDetalle.cabecera.baseimpo1 !== 0 && (
                                                <div className="flex justify-between"><span>Base {docDetalle.cabecera.piva1}%</span><span>{fmt(docDetalle.cabecera.baseimpo1)} → IVA {fmt(docDetalle.cabecera.iva1)}</span></div>
                                            )}
                                            {docDetalle.cabecera.baseimpo2 !== 0 && (
                                                <div className="flex justify-between"><span>Base {docDetalle.cabecera.piva2}%</span><span>{fmt(docDetalle.cabecera.baseimpo2)} → IVA {fmt(docDetalle.cabecera.iva2)}</span></div>
                                            )}
                                            {docDetalle.cabecera.baseimpo3 !== 0 && (
                                                <div className="flex justify-between"><span>Base {docDetalle.cabecera.piva3}%</span><span>{fmt(docDetalle.cabecera.baseimpo3)} → IVA {fmt(docDetalle.cabecera.iva3)}</span></div>
                                            )}
                                            {(docDetalle.cabecera.rec1 !== 0 || docDetalle.cabecera.rec2 !== 0) && (
                                                <div className="flex justify-between mt-1 text-amber-600"><span>Rec. Equiv.</span><span>{fmt(docDetalle.cabecera.rec1 + docDetalle.cabecera.rec2 + docDetalle.cabecera.rec3)}</span></div>
                                            )}
                                            {docDetalle.cabecera.irpf !== 0 && (
                                                <div className="flex justify-between mt-1 text-red-600"><span>IRPF</span><span>{fmt(docDetalle.cabecera.irpf)}</span></div>
                                            )}
                                            <div className="flex justify-between mt-2 pt-2 border-t border-slate-200 font-bold">
                                                <span>TOTAL</span><span>{fmt(docDetalle.cabecera.total)} €</span>
                                            </div>
                                        </div>

                                        {/* Vencimientos */}
                                        {docDetalle.vencimientos.length > 0 && (
                                            <div className="bg-slate-50 rounded-lg p-3 text-xs">
                                                <h4 className="font-semibold text-slate-600 mb-2">Vencimientos</h4>
                                                {docDetalle.vencimientos.map((v, i) => (
                                                    <div key={i} className="flex justify-between py-0.5">
                                                        <span>{v.fecha || '—'}</span>
                                                        <span className={v.situacion === 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>{fmt(v.importe)} € {v.situacion === 0 ? '(pte)' : '(pagado)'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-red-400 py-8">No se pudo cargar el documento</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* IVA Trimestral Modal */}
            {ivaModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setIvaModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">IVA Trimestral — {anio}</h2>
                            <button onClick={() => setIvaModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-4">
                            {/* Series selector for IVA */}
                            <div className="mb-3 relative" ref={ivaSeriesRef}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-slate-500">Series:</span>
                                    <button onClick={() => setIvaSeriesOpen(!ivaSeriesOpen)}
                                        className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-600">
                                        {ivaSelectedSeries.length === 0 ? 'Todas' : ivaSelectedSeries.join(', ')} ▾
                                    </button>
                                    {ivaSelectedSeries.length > 0 && (
                                        <button onClick={clearIvaSeries} className="text-[10px] text-red-500 hover:underline">Limpiar</button>
                                    )}
                                </div>
                                {ivaSeriesOpen && data?.filtros.series && (
                                    <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-10 max-h-48 overflow-auto min-w-[140px]">
                                        {data.filtros.series.map(s => (
                                            <label key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
                                                <input type="checkbox" checked={ivaSelectedSeries.includes(s)} onChange={() => toggleIvaSerie(s)} className="rounded" />
                                                {s}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {ivaLoading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-2 pr-2">Trimestre</th>
                                            <th className="text-right py-2 pr-2">Base Repercutido</th>
                                            <th className="text-right py-2 pr-2">IVA Repercutido</th>
                                            <th className="text-right py-2 pr-2">Base Soportado</th>
                                            <th className="text-right py-2 pr-2">IVA Soportado</th>
                                            <th className="text-right py-2">Diferencia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ivaTrimestral.map(t => (
                                            <tr key={t.trimestre} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-2 pr-2 font-medium">T{t.trimestre}</td>
                                                <td className="text-right py-2 pr-2">{fmt(t.base_repercutido)} €</td>
                                                <td className="text-right py-2 pr-2 text-blue-600 font-medium">{fmt(t.iva_repercutido)} €</td>
                                                <td className="text-right py-2 pr-2">{fmt(t.base_soportado)} €</td>
                                                <td className="text-right py-2 pr-2 text-orange-600 font-medium">{fmt(t.iva_soportado)} €</td>
                                                <td className={`text-right py-2 font-bold ${t.diferencia >= 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(t.diferencia)} €</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {ivaTrimestral.length > 0 && (
                                        <tfoot>
                                            <tr className="font-bold border-t-2 border-slate-300">
                                                <td className="py-2 pr-2">TOTAL</td>
                                                <td className="text-right py-2 pr-2">{fmt(ivaTrimestral.reduce((a, t) => a + t.base_repercutido, 0))} €</td>
                                                <td className="text-right py-2 pr-2 text-blue-600">{fmt(ivaTrimestral.reduce((a, t) => a + t.iva_repercutido, 0))} €</td>
                                                <td className="text-right py-2 pr-2">{fmt(ivaTrimestral.reduce((a, t) => a + t.base_soportado, 0))} €</td>
                                                <td className="text-right py-2 pr-2 text-orange-600">{fmt(ivaTrimestral.reduce((a, t) => a + t.iva_soportado, 0))} €</td>
                                                <td className={`text-right py-2 font-bold ${ivaTrimestral.reduce((a, t) => a + t.diferencia, 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {fmt(ivaTrimestral.reduce((a, t) => a + t.diferencia, 0))} €
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            )}
                            <p className="text-[10px] text-slate-400 mt-3 italic">
                                Diferencia positiva = IVA a ingresar a Hacienda · Diferencia negativa = IVA a compensar
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters bar */}
            <div className="bg-blue-600 px-5 py-3 flex flex-wrap items-center gap-4 sticky top-0 z-40 shadow-md">
                <Filter className="w-5 h-5 text-blue-200" />
                <div className="flex items-center gap-2">
                    <label className="text-sm text-blue-100 font-medium">Año:</label>
                    <input type="number" value={anio} onChange={e => setAnio(+e.target.value)}
                        className="input w-24 !py-1.5 text-sm !bg-white/90 !border-blue-300" />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-blue-100 font-medium">Meses:</label>
                    <select value={mesDesde} onChange={e => setMesDesde(+e.target.value)} className="input w-20 !py-1.5 text-sm !bg-white/90 !border-blue-300">
                        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <span className="text-sm text-blue-200">a</span>
                    <select value={mesHasta} onChange={e => setMesHasta(+e.target.value)} className="input w-20 !py-1.5 text-sm !bg-white/90 !border-blue-300">
                        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="relative" ref={seriesRef}>
                    <label className="text-sm text-blue-100 font-medium mr-2">Series:</label>
                    <button
                        onClick={() => setSeriesOpen(!seriesOpen)}
                        className="input inline-flex items-center gap-1 !w-auto min-w-[140px] !py-1.5 text-sm !bg-white/90 !border-blue-300"
                    >
                        {selectedSeries.length === 0 ? 'Todas' : `${selectedSeries.length} sel.`}
                        <ChevronDown className="w-3.5 h-3.5 ml-auto" />
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
                <div className="flex items-center gap-2">
                    <label className="text-sm text-blue-100 font-medium">Agente:</label>
                    <select value={agente} onChange={e => setAgente(e.target.value)} className="input w-40 !py-1.5 text-sm !bg-white/90 !border-blue-300">
                        <option value="">Todos</option>
                        {data?.filtros.agentes.map(a => <option key={a.codigo} value={a.codigo}>{a.nombre}</option>)}
                    </select>
                </div>
                <button onClick={fetchData} className="bg-white text-blue-600 font-semibold !py-1.5 !px-4 text-sm rounded-lg flex items-center gap-1.5 hover:bg-blue-50 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                    Actualizar
                </button>
                <button onClick={() => openIvaTrimestral()} className="bg-blue-500 text-white font-semibold !py-1.5 !px-4 text-sm rounded-lg flex items-center gap-1.5 hover:bg-blue-400 transition-colors border border-blue-300">
                    <Receipt className="w-4 h-4" />
                    IVA Trimestral
                </button>
                <button onClick={() => setVtoModalOpen(true)} className="bg-blue-500 text-white font-semibold !py-1.5 !px-4 text-sm rounded-lg flex items-center gap-1.5 hover:bg-blue-400 transition-colors border border-blue-300">
                    <Clock className="w-4 h-4" />
                    Vtos. Pendientes
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
                            <KPICard icon={<Wallet className="w-4 h-4" />} label="Pte. Cobro" value={fmt(data.vencimientos.clientes)} color="text-amber-600" onClick={() => openPteCobro()} />
                            <KPICard icon={<TrendingDown className="w-4 h-4" />} label="Pte. Pago" value={fmt(data.vencimientos.proveedores)} color="text-red-600" onClick={() => openVencimientos(1)} />
                        </div>

                        {/* Vencimientos Modal */}
                        {/* Two Line Charts: Clientes + Proveedores */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                            <div className="card">
                                <h3 className="text-sm font-semibold mb-3">Clientes — Ventas / Albaranes / Pte. Cobro</h3>
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={clientesChartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip formatter={(v: number) => fmt(v) + ' €'} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Line type="monotone" dataKey="Ventas" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                                        <Line type="monotone" dataKey="Pte. Cobro" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                        <Line type="monotone" dataKey="Albaranes" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="card">
                                <h3 className="text-sm font-semibold mb-3">Proveedores — Compras / Pte. Pago</h3>
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={proveedoresChartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip formatter={(v: number) => fmt(v) + ' €'} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Line type="monotone" dataKey="Compras" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                                        <Line type="monotone" dataKey="Pte. Pago" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Tablas: Consumo, Top Clientes, Proveedores */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

                            {/* Clientes */}
                            <div className="card overflow-auto max-h-[400px]">
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-slate-400" /> Clientes
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
                        </div>
                    </>
                ) : null}
            </main>

            {/* Pte. Cobro Facturas Modal */}
            {pteCobro.open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPteCobro(s => ({ ...s, open: false }))}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <div className="flex items-center gap-4">
                                <h2 className="text-sm font-bold text-slate-700">Facturas Pendientes de Cobro</h2>
                                {!pteCobro.loading && pteCobro.totalPendiente > 0 && (
                                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                        Total Pte: {fmt(pteCobro.totalPendiente)} €
                                    </span>
                                )}
                            </div>
                            <button onClick={() => setPteCobro(s => ({ ...s, open: false }))} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        {/* Filtros */}
                        <div className="flex items-center gap-3 px-5 py-3 border-b bg-slate-50">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-slate-500">Serie:</label>
                                <select
                                    value={pteCobro.serie}
                                    onChange={e => openPteCobro(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:border-brand"
                                >
                                    <option value="">Todas</option>
                                    {data?.filtros.series.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Buscar cliente..."
                                    value={pteCobro.search}
                                    onChange={e => setPteCobro(s => ({ ...s, search: e.target.value }))}
                                    className="w-full border rounded px-3 py-1 text-sm focus:outline-none focus:border-brand"
                                />
                            </div>
                            {pteCobro.facturas.length > 0 && (
                                <span className="text-xs text-slate-500 whitespace-nowrap">
                                    {pteCobro.facturas.filter(f => {
                                        if (!pteCobro.search) return true
                                        const terms = pteCobro.search.toLowerCase().split(/\s+/).filter(Boolean)
                                        const txt = f.cli_nombre.toLowerCase()
                                        return terms.every(t => txt.includes(t))
                                    }).length} facturas
                                </span>
                            )}
                        </div>
                        <div className="overflow-auto flex-1 p-4">
                            {pteCobro.error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{pteCobro.error}</div>
                            )}
                            {pteCobro.loading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : (() => {
                                const filtered = pteCobro.search
                                    ? pteCobro.facturas.filter(f => {
                                        const terms = pteCobro.search.toLowerCase().split(/\s+/).filter(Boolean)
                                        const txt = f.cli_nombre.toLowerCase()
                                        return terms.every(t => txt.includes(t))
                                    })
                                    : pteCobro.facturas
                                return (
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-slate-500">
                                                <th className="text-left py-1.5 pr-2">Doc</th>
                                                <th className="text-left py-1.5 pr-2">Fecha</th>
                                                <th className="text-left py-1.5 pr-2">Cliente</th>
                                                <th className="text-right py-1.5 pr-2">Total</th>
                                                <th className="text-right py-1.5 text-amber-600">Pendiente</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(f => (
                                                <tr key={f.id} className="border-b border-slate-50 hover:bg-amber-50 cursor-pointer"
                                                    onClick={() => openDocumento(f.id, 'venta', `${f.serie}/${String(f.numero).padStart(6, '0')}`)}>
                                                    <td className="py-1 pr-2 font-mono text-blue-600 hover:underline">{f.serie}/{String(f.numero).padStart(6, '0')}</td>
                                                    <td className="py-1 pr-2">{f.fecha}</td>
                                                    <td className="py-1 pr-2 truncate max-w-[220px]" title={f.cli_nombre}>{f.cli_nombre}</td>
                                                    <td className="text-right py-1 pr-2">{fmt(f.total)} €</td>
                                                    <td className="text-right py-1 font-semibold text-amber-600">{fmt(f.pendiente)} €</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {filtered.length > 0 && (
                                            <tfoot>
                                                <tr className="font-bold border-t border-slate-300">
                                                    <td colSpan={3} className="py-1.5 pr-2">TOTAL ({filtered.length} facturas)</td>
                                                    <td className="text-right py-1.5 pr-2">{fmt(filtered.reduce((a, f) => a + f.total, 0))} €</td>
                                                    <td className="text-right py-1.5 text-amber-600">{fmt(filtered.reduce((a, f) => a + f.pendiente, 0))} €</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Ficha Cliente Modal */}
            {fichaCliente && (
                <FichaCliente
                    cliCodigo={fichaCliente.codigo}
                    cliNombre={fichaCliente.nombre}
                    initialAnio={anio}
                    onClose={() => setFichaCliente(null)}
                />
            )}

            {fichaProveedor && (
                <FichaProveedor
                    proCodigo={fichaProveedor.codigo}
                    proNombre={fichaProveedor.nombre}
                    initialAnio={anio}
                    onClose={() => setFichaProveedor(null)}
                />
            )}
        </div>
    )
}

function KPICard({ icon, label, value, color, sub, onClick }: { icon: React.ReactNode; label: string; value: string; color: string; sub?: string; onClick?: () => void }) {
    return (
        <div className={`card flex flex-col ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick}>
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
