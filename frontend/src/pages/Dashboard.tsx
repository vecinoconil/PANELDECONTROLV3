import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'
import {
    LayoutDashboard, LogOut, TrendingUp, TrendingDown,
    ShoppingCart, Receipt, CreditCard, Wallet, Users, Package,
    Filter, RefreshCw
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, Cell
} from 'recharts'
import type { CuadroMandosData } from '../types'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmt(n: number): string {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n: number): string {
    return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

export default function Dashboard() {
    const { user, logout } = useAuth()
    const [data, setData] = useState<CuadroMandosData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Filters
    const [anio, setAnio] = useState(new Date().getFullYear())
    const [mesDesde, setMesDesde] = useState(1)
    const [mesHasta, setMesHasta] = useState(12)
    const [serie, setSerie] = useState('')
    const [agente, setAgente] = useState('')

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const params: Record<string, string | number> = { anio, mes_desde: mesDesde, mes_hasta: mesHasta }
            if (serie) params.serie = serie
            if (agente) params.agente = parseInt(agente)
            const { data: d } = await api.get<CuadroMandosData>('/api/dashboard/cuadro-mandos', { params })
            setData(d)
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando datos')
        } finally {
            setLoading(false)
        }
    }, [anio, mesDesde, mesHasta, serie, agente])

    useEffect(() => { fetchData() }, [fetchData])

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
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-brand" />
                    <h1 className="text-base font-semibold">Cuadro de Mandos</h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{user?.nombre}</span>
                    <button onClick={logout} className="btn-ghost flex items-center gap-1 text-xs">
                        <LogOut className="w-3.5 h-3.5" />
                        Salir
                    </button>
                </div>
            </header>

            {/* Filters bar */}
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-3">
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
                <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500">Serie:</label>
                    <select value={serie} onChange={e => setSerie(e.target.value)} className="input w-28 !py-1 text-xs">
                        <option value="">Todas</option>
                        {data?.filtros.series.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
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
                            <KPICard icon={<TrendingUp className="w-4 h-4" />} label="Total Ventas" value={fmt(data.totales.ventas)} color="text-blue-600" sub={`${data.totales.num_facturas} facturas`} />
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
                                            <tr key={f.familia} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2 truncate max-w-[120px]" title={f.familia}>{f.familia}</td>
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
                                            <th className="text-left py-1.5 pr-2">Cliente</th>
                                            <th className="text-right py-1.5">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.top_clientes.map(c => (
                                            <tr key={c.cli_codigo} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2 truncate max-w-[150px]" title={c.cli_nombre}>{c.cli_nombre}</td>
                                                <td className="text-right py-1 font-medium">{fmt(c.total)}</td>
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
                                            <th className="text-left py-1.5 pr-2">Proveedor</th>
                                            <th className="text-right py-1.5">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.proveedores.map(p => (
                                            <tr key={p.pro_codigo} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1 pr-2 truncate max-w-[150px]" title={p.pro_nombre}>{p.pro_nombre}</td>
                                                <td className="text-right py-1 font-medium">{fmt(p.total_compras)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Vencimientos + Resumen */}
                            <div className="space-y-4">
                                <div className="card">
                                    <h3 className="text-sm font-semibold mb-3">Vencimientos Pte.</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Pte. Cobro (clientes)</span>
                                            <span className="font-semibold text-amber-600">{fmt(data.vencimientos.clientes)} €</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Pte. Pago (proveedores)</span>
                                            <span className="font-semibold text-red-600">{fmt(data.vencimientos.proveedores)} €</span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-xs">
                                            <span className="text-slate-500 font-medium">Diferencia</span>
                                            <span className={`font-bold ${data.vencimientos.clientes - data.vencimientos.proveedores >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {fmt(data.vencimientos.clientes - data.vencimientos.proveedores)} €
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
