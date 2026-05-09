import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { X, ChevronRight, ChevronDown, Package, FileText } from 'lucide-react'
import type { DocDetalle } from '../types'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const LINE_COLORS = ['#2563eb', '#16a34a', '#dc2626']

function fmt(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtInt(n: number) { return n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) }

interface VentaDetalle {
    doc_id: number; fecha: string; doc: string; cli_codigo: number; cli_nombre: string
    uds: number; precio_uni: number; importe: number; coste: number; beneficio: number
    pdto1: number; pdto2: number; pdto3: number
}
interface CompraDetalle {
    doc_id: number; fecha: string; doc: string; pro_codigo: number; pro_nombre: string
    uds: number; precio_uni: number; importe: number
}
interface DescuentoCliente {
    cli_codigo: number; cli_nombre: string; veces: number; uds: number; importe: number
}
interface Descuento {
    dto_efectivo: number; pdto1: number; pdto2: number; pdto3: number
    total_veces: number; total_uds: number; total_importe: number
    clientes: DescuentoCliente[]
}
interface FichaArticuloData {
    articulo: {
        referencia: string; nombre: string; descripcion: string
        familia: string; subfamilia: string; marca: string
        pvp1: number; coste: number; stock: number
    }
    anio: number
    ventas_mensuales: { anio: number; mes: number; total: number; uds: number; coste: number }[]
    kpis: {
        ventas: number; beneficio: number; margen_pct: number; uds_vendidas: number
        precio_medio: number; compras: number; uds_compradas: number; coste_medio: number; rotacion: number
    }
    ventas_detalle: VentaDetalle[]
    compras_detalle: CompraDetalle[]
    descuentos: Descuento[]
}

interface Props {
    referencia: string
    descripcion: string
    initialAnio: number
    onClose: () => void
}

type Tab = 'ventas' | 'compras' | 'descuentos'

export default function FichaArticulo({ referencia, descripcion, initialAnio, onClose }: Props) {
    const [anio, setAnio] = useState(initialAnio)
    const [data, setData] = useState<FichaArticuloData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [tab, setTab] = useState<Tab>('ventas')
    const [expandedDto, setExpandedDto] = useState<Set<string>>(new Set())
    const [docModal, setDocModal] = useState<{ docId: number; titulo: string; tipo: 'venta' | 'compra' } | null>(null)
    const [docDetalle, setDocDetalle] = useState<DocDetalle | null>(null)
    const [docLoading, setDocLoading] = useState(false)

    const openDocumento = async (docId: number, titulo: string, tipo: 'venta' | 'compra') => {
        setDocModal({ docId, titulo, tipo })
        setDocLoading(true)
        try {
            const { data: d } = await api.get<DocDetalle>('/api/dashboard/detalle-documento', {
                params: { doc_id: docId, tipo },
            })
            setDocDetalle(d)
        } catch { setDocDetalle(null) }
        finally { setDocLoading(false) }
    }

    const fetchData = useCallback(async (yr: number) => {
        setLoading(true)
        setError('')
        try {
            const { data: d } = await api.get<FichaArticuloData>('/api/informes/ficha-articulo', {
                params: { referencia, anio: yr }
            })
            setData(d)
        } catch {
            setError('Error cargando ficha del artículo')
        } finally {
            setLoading(false)
        }
    }, [referencia])

    useEffect(() => { fetchData(anio) }, [anio, fetchData])

    // Build chart data: one entry per month with anio-2, anio-1, anio columns
    const buildChartData = () => {
        if (!data) return []
        const years = [anio - 2, anio - 1, anio]
        return MESES.map((label, i) => {
            const mes = i + 1
            const entry: Record<string, number | string> = { mes: label }
            for (const yr of years) {
                const row = data.ventas_mensuales.find(v => v.anio === yr && v.mes === mes)
                entry[String(yr)] = row ? row.total : 0
            }
            return entry
        })
    }

    const toggleDto = (key: string) => setExpandedDto(prev => {
        const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
    })

    const isRectificativa = (doc: string) => doc.startsWith('RC') || doc.startsWith('R ')

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[96vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 rounded-t-xl flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-sm">
                            <Package className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">{referencia}</p>
                            <h2 className="text-sm font-bold text-slate-800 leading-tight max-w-lg truncate">{descripcion || referencia}</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 px-2 py-1">
                            <span className="text-[10px] text-slate-400">Año</span>
                            <select value={anio} onChange={e => setAnio(+e.target.value)}
                                className="text-xs font-semibold bg-transparent border-none outline-none text-slate-700 pr-1">
                                {[anio - 2, anio - 1, anio, anio + 1].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
                ) : error ? (
                    <div className="flex-1 flex items-center justify-center text-red-500 text-sm">{error}</div>
                ) : data && (
                    <div className="flex-1 overflow-y-auto">
                        {/* Top section: chart + KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 md:p-4 border-b border-slate-100">
                            {/* Chart */}
                            <div className="border border-slate-200 rounded-lg p-3">
                                <ResponsiveContainer width="100%" height={190}>
                                    <LineChart data={buildChartData()} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                                        <Tooltip formatter={(v: number) => `${fmt(v)} €`} />
                                        <Legend wrapperStyle={{ fontSize: 10 }} />
                                        {[anio - 2, anio - 1, anio].map((yr, i) => (
                                            <Line key={yr} type="monotone" dataKey={String(yr)}
                                                stroke={LINE_COLORS[i]} dot={false} strokeWidth={1.5} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* KPIs grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <KpiCard label="Ventas" value={`${fmt(data.kpis.ventas)} €`} color="text-blue-600" />
                                <KpiCard label="Beneficio"
                                    value={`${fmt(data.kpis.beneficio)} €`}
                                    sub={`(${data.kpis.margen_pct.toFixed(1)}%)`}
                                    color={data.kpis.beneficio >= 0 ? 'text-green-600' : 'text-red-500'} />
                                <KpiCard label="Unidades" value={`${fmtInt(data.kpis.uds_vendidas)} ud`} color="text-purple-600" />
                                <KpiCard label="P. medio venta" value={`${fmt(data.kpis.precio_medio)} €`} color="text-cyan-600" />
                                <KpiCard label="Compras" value={`${fmt(data.kpis.compras)} €`} color="text-amber-600" />
                                <KpiCard label="Uds compradas" value={`${fmtInt(data.kpis.uds_compradas)} ud`} color="text-slate-500" />
                                <KpiCard label="Coste medio" value={`${fmt(data.kpis.coste_medio)} €`} color="text-slate-500" />
                                <KpiCard label="Rotación (V/C)" value={fmt(data.kpis.rotacion)} color="text-indigo-600" />
                            </div>
                        </div>

                        {/* Article meta */}
                        {(data.articulo.familia || data.articulo.marca) && (
                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex gap-4 text-[11px] text-slate-500">
                                {data.articulo.familia && <span>Familia: <strong className="text-slate-700">{data.articulo.familia}</strong></span>}
                                {data.articulo.subfamilia && <span>Subfamilia: <strong className="text-slate-700">{data.articulo.subfamilia}</strong></span>}
                                {data.articulo.marca && <span>Marca: <strong className="text-slate-700">{data.articulo.marca}</strong></span>}
                                <span>Stock: <strong className={data.articulo.stock === 0 ? 'text-amber-500' : 'text-slate-700'}>{data.articulo.stock}</strong></span>
                                {data.articulo.pvp1 > 0 && <span>PVP1: <strong className="text-slate-700">{fmt(data.articulo.pvp1)} €</strong></span>}
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex gap-0 border-b border-slate-200 px-2 sm:px-4 pt-2 bg-white sticky top-0 z-10 overflow-x-auto">
                            {([
                                { key: 'ventas', label: `Ventas (detalle) ${data.ventas_detalle.length}` },
                                { key: 'compras', label: `Compras (detalle) ${data.compras_detalle.length}` },
                                { key: 'descuentos', label: `Descuentos ${data.descuentos.length}` },
                            ] as { key: Tab; label: string }[]).map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)}
                                    className={`px-3 sm:px-4 py-1.5 text-xs font-medium border-b-2 transition-colors mr-1 whitespace-nowrap shrink-0
                                        ${tab === t.key ? 'border-purple-500 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="text-xs pb-4">
                            {tab === 'ventas' && (
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                            <th className="px-3 py-2 text-left">Fecha</th>
                                            <th className="px-3 py-2 text-left">Doc</th>
                                            <th className="px-3 py-2 text-left">Cliente</th>
                                            <th className="px-3 py-2 text-right">Uds</th>
                                            <th className="px-3 py-2 text-right">P.Uni</th>
                                            <th className="px-3 py-2 text-right">Importe</th>
                                            <th className="px-3 py-2 text-right">Coste</th>
                                            <th className="px-3 py-2 text-right">Bº</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.ventas_detalle.map((v, i) => {
                                            const isRect = isRectificativa(v.doc)
                                            const cls = isRect ? 'text-red-500' : ''
                                            return (
                                                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${cls}`}>
                                                    <td className="px-3 py-1.5">{v.fecha}</td>
                                                    <td className="px-3 py-1.5 font-mono">
                                                        <button onClick={() => openDocumento(v.doc_id, v.doc, 'venta')}
                                                            className="flex items-center gap-1 hover:text-blue-600 hover:underline">
                                                            <FileText className="w-3 h-3 opacity-50" />{v.doc}
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-1.5 max-w-[180px] truncate">{v.cli_nombre}</td>
                                                    <td className="px-3 py-1.5 text-right">{fmt(v.uds)}</td>
                                                    <td className="px-3 py-1.5 text-right">{fmt(v.precio_uni)} €</td>
                                                    <td className="px-3 py-1.5 text-right font-medium">{fmt(v.importe)} €</td>
                                                    <td className="px-3 py-1.5 text-right text-slate-400">{fmt(v.coste)} €</td>
                                                    <td className={`px-3 py-1.5 text-right font-medium ${v.beneficio >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                        {fmt(v.beneficio)} €
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {data.ventas_detalle.length === 0 && (
                                            <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Sin ventas registradas</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {tab === 'compras' && (
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                            <th className="px-3 py-2 text-left">Fecha</th>
                                            <th className="px-3 py-2 text-left">Doc</th>
                                            <th className="px-3 py-2 text-left">Proveedor</th>
                                            <th className="px-3 py-2 text-right">Uds</th>
                                            <th className="px-3 py-2 text-right">P.Uni</th>
                                            <th className="px-3 py-2 text-right">Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.compras_detalle.map((c, i) => (
                                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="px-3 py-1.5">{c.fecha}</td>
                                                <td className="px-3 py-1.5 font-mono">
                                                    <button onClick={() => openDocumento(c.doc_id, c.doc, 'compra')}
                                                        className="flex items-center gap-1 hover:text-blue-600 hover:underline">
                                                        <FileText className="w-3 h-3 opacity-50" />{c.doc}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-1.5 max-w-[200px] truncate">{c.pro_nombre}</td>
                                                <td className="px-3 py-1.5 text-right">{fmt(c.uds)}</td>
                                                <td className="px-3 py-1.5 text-right">{fmt(c.precio_uni)} €</td>
                                                <td className="px-3 py-1.5 text-right font-medium">{fmt(c.importe)} €</td>
                                            </tr>
                                        ))}
                                        {data.compras_detalle.length === 0 && (
                                            <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Sin compras registradas</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {tab === 'descuentos' && (
                                <div>
                                    {data.descuentos.length === 0 ? (
                                        <div className="px-3 py-8 text-center text-slate-400">No se han aplicado descuentos en este artículo</div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-[1fr_80px_80px_90px_100px] gap-1 px-3 py-2 bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                                <div>Descuento</div>
                                                <div className="text-right">Veces</div>
                                                <div className="text-right">Uds</div>
                                                <div className="text-right">Importe</div>
                                                <div className="text-right">Clientes</div>
                                            </div>
                                            {data.descuentos.map((d) => {
                                                const key = `dto_${d.dto_efectivo}`
                                                const isOpen = expandedDto.has(key)
                                                const dtoParts = [
                                                    d.pdto1 > 0 ? `${d.pdto1}%` : null,
                                                    d.pdto2 > 0 ? `${d.pdto2}%` : null,
                                                    d.pdto3 > 0 ? `${d.pdto3}%` : null,
                                                ].filter(Boolean).join(' + ')
                                                return (
                                                    <div key={key}>
                                                        <div
                                                            className="grid grid-cols-[1fr_80px_80px_90px_100px] gap-1 px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-slate-100 font-semibold text-slate-700"
                                                            onClick={() => toggleDto(key)}>
                                                            <div className="flex items-center gap-1.5">
                                                                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                                                <span className="text-purple-700 font-bold">{d.dto_efectivo.toFixed(2)}% dto efectivo</span>
                                                                {dtoParts && <span className="text-slate-400 font-normal text-[10px]">({dtoParts})</span>}
                                                            </div>
                                                            <div className="text-right">{d.total_veces}</div>
                                                            <div className="text-right">{fmtInt(d.total_uds)}</div>
                                                            <div className="text-right">{fmt(d.total_importe)} €</div>
                                                            <div className="text-right text-slate-500">{d.clientes.length} cliente{d.clientes.length !== 1 ? 's' : ''}</div>
                                                        </div>
                                                        {isOpen && d.clientes.map((c, ci) => (
                                                            <div key={ci}
                                                                className="grid grid-cols-[1fr_80px_80px_90px_100px] gap-1 px-3 py-1 pl-10 border-b border-slate-50 hover:bg-slate-50 text-slate-500">
                                                                <div className="truncate">{c.cli_nombre}</div>
                                                                <div className="text-right">{c.veces}</div>
                                                                <div className="text-right">{fmtInt(c.uds)}</div>
                                                                <div className="text-right">{fmt(c.importe)} €</div>
                                                                <div></div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            })}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {/* Document detail modal */}
            {docModal && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => { setDocModal(null); setDocDetalle(null) }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50 rounded-t-xl shrink-0">
                            <h3 className="font-bold text-slate-700 text-sm">{docModal.titulo}</h3>
                            <button onClick={() => { setDocModal(null); setDocDetalle(null) }} className="p-1 hover:bg-slate-200 rounded-full"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {docLoading && <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full" /></div>}
                            {!docLoading && docDetalle && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div><span className="text-slate-400">Serie/Núm:</span> <span className="font-semibold">{docDetalle.cabecera.serie}-{docDetalle.cabecera.numero}</span></div>
                                        <div><span className="text-slate-400">Fecha:</span> <span className="font-semibold">{docDetalle.cabecera.fecha}</span></div>
                                        <div><span className="text-slate-400">{docModal.tipo === 'venta' ? 'Cliente' : 'Proveedor'}:</span> <span className="font-semibold truncate">{docDetalle.cabecera.nombre_tercero}</span></div>
                                        <div><span className="text-slate-400">Total:</span> <span className="font-bold text-blue-700">{docDetalle.cabecera.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>
                                    </div>
                                    {docDetalle.cabecera.descripcion && <p className="text-xs text-slate-600 bg-slate-50 rounded p-2">{docDetalle.cabecera.descripcion}</p>}
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-600">
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
                                                    <td className="py-0.5 px-2">{l.referencia}</td>
                                                    <td className="py-0.5 px-2 truncate max-w-[250px]">{l.descripcion}</td>
                                                    <td className="text-right py-0.5 px-2">{l.unidades}</td>
                                                    <td className="text-right py-0.5 px-2">{l.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                                                    <td className="text-right py-0.5 px-2">{l.descuento > 0 ? l.descuento.toFixed(1) : ''}</td>
                                                    <td className="text-right py-0.5 px-2 font-semibold">{l.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 font-bold bg-slate-50">
                                                <td colSpan={5} className="text-right py-1 px-2">Total:</td>
                                                <td className="text-right py-1 px-2">{docDetalle.lineas.reduce((s, l) => s + l.importe, 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                    {docDetalle.vencimientos.length > 0 && (
                                        <div className="bg-amber-50 rounded-lg p-3">
                                            <h4 className="text-xs font-bold text-amber-700 mb-2">Vencimientos</h4>
                                            {docDetalle.vencimientos.map((v, i) => (
                                                <div key={i} className="flex justify-between text-xs font-mono">
                                                    <span>{v.fecha}</span>
                                                    <span>{v.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                                    <span className={v.situacion === 0 ? 'text-red-600' : 'text-green-600'}>{v.situacion === 0 ? 'Pendiente' : 'Cobrado'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {!docLoading && !docDetalle && <p className="text-center text-slate-400 py-8 text-sm">No se pudo cargar el documento</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    return (
        <div className="border border-slate-200 rounded-lg p-2.5 flex flex-col items-center justify-center text-center">
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-base font-bold leading-tight ${color}`}>{value}</div>
            {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
        </div>
    )
}
