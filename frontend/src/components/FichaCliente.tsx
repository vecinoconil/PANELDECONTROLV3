import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { X, ChevronRight, ChevronDown, AlertTriangle, FileText, ShoppingBag, ClipboardList } from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts'
import type { FichaClienteData, FichaClienteFamilia, DocDetalle } from '../types'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const LINE_COLORS = ['#2563eb', '#16a34a', '#dc2626']

function fmt(n: number): string {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n: number): string {
    return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

interface Props {
    cliCodigo: number
    cliNombre: string
    initialAnio: number
    onClose: () => void
}

export default function FichaCliente({ cliCodigo, cliNombre, initialAnio, onClose }: Props) {
    const [anio, setAnio] = useState(initialAnio)
    const [data, setData] = useState<FichaClienteData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [tab, setTab] = useState<'productos' | 'documentos' | 'presupuestos'>('documentos')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    // Document detail modal (reuse pattern)
    const [docModal, setDocModal] = useState<{ tipo: string; docId: number; titulo: string } | null>(null)
    const [docDetalle, setDocDetalle] = useState<DocDetalle | null>(null)
    const [docLoading, setDocLoading] = useState(false)

    // TOP productos año selector
    const [topAnio, setTopAnio] = useState(initialAnio)

    const fetchData = useCallback(async (yr: number) => {
        setLoading(true)
        setError('')
        try {
            const { data: d } = await api.get<FichaClienteData>('/api/dashboard/ficha-cliente', {
                params: { cli_codigo: cliCodigo, anio: yr },
            })
            setData(d)
        } catch {
            setError('Error cargando ficha del cliente')
        } finally {
            setLoading(false)
        }
    }, [cliCodigo])

    useEffect(() => { fetchData(anio) }, [anio, fetchData])

    const toggleExpand = (familia: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(familia)) next.delete(familia)
            else next.add(familia)
            return next
        })
    }

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

    // Compute TOP productos for topAnio
    const topProductos = (() => {
        if (!data) return { productos: [], total: 0, beneficio: 0, margen: 0, count: 0 }
        const prods = data.top_productos[String(topAnio)] || []
        const total = prods.reduce((s, p) => s + p.total_venta, 0)
        const benef = prods.reduce((s, p) => s + p.beneficio, 0)
        return {
            productos: prods,
            total,
            beneficio: benef,
            margen: total > 0 ? (benef / total * 100) : 0,
            count: prods.length,
        }
    })()

    if (loading && !data) {
        return (
            <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
                <div className="bg-white rounded-xl p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Cargando ficha de {cliNombre}...</p>
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

    const { kpis, patron_semanal, productos_familia, documentos_venta, presupuestos, anios_cols } = data
    const variacion = kpis.ventas_anio_anterior > 0
        ? ((kpis.ventas_anio - kpis.ventas_anio_anterior) / kpis.ventas_anio_anterior * 100)
        : 0

    // Compute total ventas per year for Productos Consumidos footer
    const totalPorAnio: Record<string, number> = {}
    for (const y of anios_cols) {
        totalPorAnio[String(y)] = productos_familia.reduce((s, f) => s + Number(f[String(y)] || 0), 0)
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1600px] h-[95vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 truncate">
                        {data.cliente.nombre}
                        {data.cliente.alias && <span className="ml-2 text-sm font-normal text-slate-500">({data.cliente.alias})</span>}
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
                <div className="flex-1 overflow-hidden p-4">
                    <div className="grid grid-cols-12 gap-4 h-full">
                        {/* ═══ LEFT COLUMN: Chart + Tabs ═══ */}
                        <div className="col-span-6 flex flex-col gap-4 h-full min-h-0">
                            {/* Line Chart */}
                            <div className="bg-white border rounded-lg p-3 shrink-0" style={{ height: 260 }}>
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
                            <div className="bg-white border rounded-lg flex-1 flex flex-col min-h-0">
                                <div className="flex border-b shrink-0">
                                    <button
                                        className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 ${tab === 'documentos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setTab('documentos')}
                                    ><FileText size={14} /> Documentos Venta</button>
                                    <button
                                        className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 ${tab === 'productos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setTab('productos')}
                                    ><ShoppingBag size={14} /> Productos consumidos</button>
                                    <button
                                        className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 ${tab === 'presupuestos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setTab('presupuestos')}
                                    ><ClipboardList size={14} /> Pedidos Cliente</button>
                                </div>

                                <div className="flex-1 overflow-auto p-2">
                                    {/* TAB: Productos consumidos */}
                                    {tab === 'productos' && (
                                        <table className="w-full text-xs">
                                            <thead className="sticky top-0 bg-white">
                                                <tr className="text-slate-500 border-b">
                                                    <th className="text-left py-1 px-2 font-medium">Familia / Producto</th>
                                                    {anios_cols.map(y => (
                                                        <th key={y} className="text-right py-1 px-2 font-medium w-28">{y}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono">
                                                {productos_familia.map(fam => (
                                                    <FamiliaRow key={fam.familia} fam={fam} anios={anios_cols}
                                                        expanded={expanded.has(fam.familia)}
                                                        onToggle={() => toggleExpand(fam.familia)} />
                                                ))}
                                                <tr className="border-t-2 border-slate-300 font-bold text-green-700 bg-slate-50">
                                                    <td className="py-1 px-2">TOTAL VENTAS</td>
                                                    {anios_cols.map(y => (
                                                        <td key={y} className="text-right py-1 px-2">{fmt(totalPorAnio[String(y)])} €</td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>
                                    )}

                                    {/* TAB: Documentos Venta */}
                                    {tab === 'documentos' && (
                                        <table className="w-full text-xs">
                                            <thead className="sticky top-0 bg-white">
                                                <tr className="text-slate-500 border-b">
                                                    <th className="text-left py-1 px-2 font-medium">Tipo</th>
                                                    <th className="text-left py-1 px-2 font-medium">Serie</th>
                                                    <th className="text-right py-1 px-2 font-medium">Número</th>
                                                    <th className="text-left py-1 px-2 font-medium">Fecha</th>
                                                    <th className="text-right py-1 px-2 font-medium">Total</th>
                                                    <th className="text-center py-1 px-2 font-medium">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono">
                                                {documentos_venta.map(d => (
                                                    <tr key={d.id}
                                                        className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer"
                                                        onClick={() => openDocumento(d.id, `${d.tipo_doc} ${d.serie}-${d.numero}`)}
                                                    >
                                                        <td className="py-1 px-2">{d.tipo_doc}</td>
                                                        <td className="py-1 px-2">{d.serie}</td>
                                                        <td className="text-right py-1 px-2">{d.numero}</td>
                                                        <td className="py-1 px-2">{d.fecha}</td>
                                                        <td className="text-right py-1 px-2">{fmt(d.total)} €</td>
                                                        <td className="text-center py-1 px-2">
                                                            {d.pendiente <= 0
                                                                ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">Pagado</span>
                                                                : d.pendiente < d.total
                                                                    ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">A Cuenta</span>
                                                                    : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Pendiente</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {documentos_venta.length === 0 && (
                                                    <tr><td colSpan={6} className="text-center py-4 text-slate-400">Sin documentos</td></tr>
                                                )}
                                            </tbody>
                                            {documentos_venta.length > 0 && (
                                                <tfoot>
                                                    <tr className="border-t-2 font-bold bg-slate-50">
                                                        <td colSpan={4} className="py-1 px-2">{documentos_venta.length} documentos</td>
                                                        <td className="text-right py-1 px-2">{fmt(documentos_venta.reduce((s, d) => s + d.total, 0))} €</td>
                                                        <td className="text-center py-1 px-2 text-red-600">{fmt(documentos_venta.reduce((s, d) => s + d.pendiente, 0))} €</td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    )}

                                    {/* TAB: Presupuestos */}
                                    {tab === 'presupuestos' && (
                                        <table className="w-full text-xs">
                                            <thead className="sticky top-0 bg-white">
                                                <tr className="text-slate-500 border-b">
                                                    <th className="text-left py-1 px-2 font-medium">Serie</th>
                                                    <th className="text-right py-1 px-2 font-medium">Número</th>
                                                    <th className="text-left py-1 px-2 font-medium">Fecha</th>
                                                    <th className="text-right py-1 px-2 font-medium">Total</th>
                                                    <th className="text-left py-1 px-2 font-medium">Descripción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono">
                                                {presupuestos.map(p => (
                                                    <tr key={p.id}
                                                        className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer"
                                                        onClick={() => openDocumento(p.id, `Presupuesto ${p.serie}-${p.numero}`)}
                                                    >
                                                        <td className="py-1 px-2">{p.serie}</td>
                                                        <td className="text-right py-1 px-2">{p.numero}</td>
                                                        <td className="py-1 px-2">{p.fecha}</td>
                                                        <td className="text-right py-1 px-2">{fmt(p.total)} €</td>
                                                        <td className="py-1 px-2 truncate max-w-[200px]">{p.descripcion}</td>
                                                    </tr>
                                                ))}
                                                {presupuestos.length === 0 && (
                                                    <tr><td colSpan={5} className="text-center py-4 text-slate-400">Sin presupuestos</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ═══ RIGHT COLUMN: KPIs + Patrón + TOP ═══ */}
                        <div className="col-span-6 flex flex-col gap-3 h-full min-h-0 overflow-hidden">
                            {/* KPI Row 1 */}
                            <div className="grid grid-cols-4 gap-2 shrink-0">
                                <KpiCard label="Ticket Medio" icon="🎫" value={`${fmtInt(kpis.ticket_medio)} €`} />
                                <KpiCard label="Ventas Año" icon="💰"
                                    value={`${fmt(kpis.ventas_anio)} €`}
                                    sub={kpis.ventas_anio_anterior > 0
                                        ? `(${variacion >= 0 ? '+' : ''}${variacion.toFixed(1)}% vs ${anio - 1})`
                                        : undefined}
                                    subColor={variacion >= 0 ? 'text-green-600' : 'text-red-600'} />
                                <KpiCard label="Margen Año" icon="🎯"
                                    value={`${fmt(kpis.margen_anio)} €`}
                                    sub={`(${kpis.margen_pct.toFixed(1)}%)`}
                                    subColor={kpis.margen_pct >= 30 ? 'text-green-600' : 'text-orange-500'} />
                                <KpiCard label="Última Compra" icon="📅"
                                    value={kpis.ultima_compra ? new Date(kpis.ultima_compra).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'} />
                            </div>

                            {/* KPI Row 2 */}
                            <div className="grid grid-cols-4 gap-2 shrink-0">
                                <KpiCard label="Plazo Pago" icon="📦" value={`${kpis.plazo_pago} d`} />
                                <KpiCard label="Frecuencia" icon="📊" value={`${kpis.frecuencia} días`} />
                                <KpiCard label="Saldo Pendiente" icon="💳" value={`${fmt(kpis.saldo_pendiente)} €`}
                                    highlight={kpis.saldo_pendiente > 0} />
                                {kpis.saldo_pendiente > 0 && (
                                    <div className="bg-yellow-100 border border-yellow-300 rounded-lg flex flex-col items-center justify-center p-2">
                                        <AlertTriangle size={24} className="text-yellow-600 mb-1" />
                                        <span className="text-xs font-bold text-yellow-700">ATENCIÓN</span>
                                    </div>
                                )}
                                {kpis.saldo_pendiente <= 0 && <div />}
                            </div>

                            {/* Patrón Semanal */}
                            <div className="border rounded-lg p-3 shrink-0">
                                <p className="text-xs text-slate-500 font-medium mb-2">📊 Patrón Semanal (Días con pedidos L-D)</p>
                                <div className="grid grid-cols-7 gap-1.5">
                                    {patron_semanal.map((cnt, i) => (
                                        <div key={i} className={`rounded-lg p-2 text-center ${cnt > 0 ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                            <div className="text-[10px] font-medium mb-0.5">{DIAS[i]}</div>
                                            <div className="text-lg font-bold">{cnt}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* TOP Productos */}
                            <div className="border rounded-lg flex-1 flex flex-col min-h-0">
                                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                                    <h3 className="text-xs font-semibold text-slate-700">TOP Ventas por año</h3>
                                    <select value={topAnio} onChange={e => setTopAnio(Number(e.target.value))} className="border rounded px-2 py-0.5 text-xs">
                                        {anios_cols.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="px-3 py-1.5 bg-slate-50 border-b text-[10px] font-semibold text-slate-600">
                                    TOTAL {topAnio} ({topProductos.count} productos): {fmt(topProductos.total)} €
                                    {topProductos.beneficio !== 0 && <> | Beneficio: {fmt(topProductos.beneficio)} € | Margen: {topProductos.margen.toFixed(2)}%</>}
                                </div>
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full text-[10px]">
                                        <thead className="sticky top-0 bg-white">
                                            <tr className="text-slate-500 border-b">
                                                <th className="text-left py-0.5 px-2 font-medium">Producto</th>
                                                <th className="text-right py-0.5 px-1 font-medium">Uds</th>
                                                <th className="text-right py-0.5 px-1 font-medium">Venta</th>
                                                <th className="text-right py-0.5 px-1 font-medium">Beneficio</th>
                                                <th className="text-right py-0.5 px-1 font-medium">Margen</th>
                                            </tr>
                                        </thead>
                                        <tbody className="font-mono">
                                            {topProductos.productos.map((p, i) => {
                                                const isNeg = p.margen_pct < 0
                                                return (
                                                    <tr key={i} className={`border-b border-slate-50 ${isNeg ? 'bg-red-50 text-red-700' : ''}`}>
                                                        <td className="py-0.5 px-2 truncate max-w-[220px]" title={p.descripcion}>
                                                            {p.descripcion || p.referencia}
                                                        </td>
                                                        <td className="text-right py-0.5 px-1 whitespace-nowrap">{p.unidades > 0 ? `${p.unidades} uds` : ''}</td>
                                                        <td className="text-right py-0.5 px-1 whitespace-nowrap">{fmt(p.total_venta)} €</td>
                                                        <td className="text-right py-0.5 px-1 whitespace-nowrap">B: {fmt(p.beneficio)} €</td>
                                                        <td className={`text-right py-0.5 px-1 whitespace-nowrap font-semibold ${isNeg ? 'text-red-600' : p.margen_pct > 40 ? 'text-green-600' : ''}`}>
                                                            {p.margen_pct.toFixed(1)}%
                                                        </td>
                                                    </tr>
                                                )
                                            })}
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
                                        {/* Cabecera */}
                                        <div className="grid grid-cols-4 gap-3 text-xs">
                                            <div><span className="text-slate-400">Tipo:</span> <span className="font-semibold">{docDetalle.cabecera.tipodoc === 8 ? 'Factura' : docDetalle.cabecera.tipodoc === 4 ? 'Albarán' : docDetalle.cabecera.tipodoc === 1 ? 'Presupuesto' : `Doc ${docDetalle.cabecera.tipodoc}`}</span></div>
                                            <div><span className="text-slate-400">Serie/Num:</span> <span className="font-semibold">{docDetalle.cabecera.serie}-{docDetalle.cabecera.numero}</span></div>
                                            <div><span className="text-slate-400">Fecha:</span> <span className="font-semibold">{docDetalle.cabecera.fecha}</span></div>
                                            <div><span className="text-slate-400">Total:</span> <span className="font-bold text-blue-700">{fmt(docDetalle.cabecera.total)} €</span></div>
                                        </div>
                                        {docDetalle.cabecera.descripcion && <p className="text-xs text-slate-600 bg-slate-50 rounded p-2">{docDetalle.cabecera.descripcion}</p>}

                                        {/* Líneas */}
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

                                        {/* IVA + Vencimientos */}
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

function FamiliaRow({ fam, anios, expanded, onToggle }: {
    fam: FichaClienteFamilia; anios: number[]; expanded: boolean; onToggle: () => void
}) {
    return (
        <>
            <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer font-semibold" onClick={onToggle}>
                <td className="py-1 px-2 flex items-center gap-1">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {fam.familia}
                </td>
                {anios.map(y => (
                    <td key={y} className="text-right py-1 px-2">{fmt(Number(fam[String(y)] || 0))} €</td>
                ))}
            </tr>
            {expanded && fam.productos.map((p, i) => (
                <tr key={i} className="border-b border-slate-50 text-slate-600">
                    <td className="py-0.5 px-2 pl-7 truncate max-w-[250px]" title={`${p.referencia} - ${p.descripcion}`}>
                        {p.descripcion || p.referencia}
                    </td>
                    {anios.map(y => (
                        <td key={y} className="text-right py-0.5 px-2">{fmt(Number(p[String(y)] || 0))} €</td>
                    ))}
                </tr>
            ))}
        </>
    )
}
