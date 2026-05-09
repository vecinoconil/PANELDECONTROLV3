import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api/client'
import {
    Search, Download, ChevronDown, ChevronRight, Users, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownRight, UserPlus, UserMinus, X, Filter, Loader2
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────── */

interface FilterOption { codigo: number; nombre: string }
interface SubfamiliaOption { codigo: number; nombre: string; familia: number }

interface Filtros {
    familias: FilterOption[]
    subfamilias: SubfamiliaOption[]
    agentes: FilterOption[]
    tipos_cliente: FilterOption[]
    tipos_articulo: FilterOption[]
    marcas: FilterOption[]
    poblaciones: string[]
    codigos_postales: string[]
}

interface ClienteRow {
    cli_codigo: number
    cli_nombre: string
    ventas_anio1: number
    ventas_anio2: number
    uds_anio1: number | null
    uds_anio2: number | null
}

interface Resumen {
    total_clientes: number
    clientes_anio1: number
    clientes_anio2: number
    ventas_anio1: number
    ventas_anio2: number
    cli_subida: number
    cli_bajada: number
    cli_nuevos: number
    cli_perdidos: number
    uds_bajada: number
    uds_subida: number
}

interface DetalleItem {
    familia: string
    subfamilia: string
    referencia: string
    descripcion: string
    importe_anio1: number
    uds_anio1: number
    importe_anio2: number
    uds_anio2: number
}

/* ── Helpers ───────────────────────────────────────────────── */

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 })

function Sel({ value, onChange, options, placeholder, className = '' }: {
    value: string | number
    onChange: (v: string) => void
    options: { v: string | number; l: string }[]
    placeholder: string
    className?: string
}) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            className={`input !py-1 text-[11px] ${className}`}>
            <option value="">{placeholder}</option>
            {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
    )
}

const MESES = [
    { v: 1, l: 'Ene' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Abr' },
    { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Ago' },
    { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dic' },
]

/* ── Component ─────────────────────────────────────────────── */

export default function ComparativaClientes() {
    const thisYear = new Date().getFullYear()

    // Filters
    const [anio1, setAnio1] = useState(thisYear - 1)
    const [anio2, setAnio2] = useState(thisYear)
    const [mesesSel, setMesesSel] = useState<number[]>([])
    const [familia, setFamilia] = useState<number | ''>('')
    const [subfamilia, setSubfamilia] = useState<number | ''>('')
    const [articulo, setArticulo] = useState('')
    const [marca, setMarca] = useState<number | ''>('')
    const [tipoArticulo, setTipoArticulo] = useState<number | ''>('')
    const [tipoCliente, setTipoCliente] = useState<number | ''>('')
    const [agente, setAgente] = useState<number | ''>('')
    const [poblacion, setPoblacion] = useState('')
    const [cpostal, setCpostal] = useState('')
    const [ocultarObsoletos, setOcultarObsoletos] = useState(false)
    const [busqueda, setBusqueda] = useState('')

    // Data
    const [filtros, setFiltros] = useState<Filtros | null>(null)
    const [clientes, setClientes] = useState<ClienteRow[]>([])
    const [resumen, setResumen] = useState<Resumen | null>(null)
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Detalle modal
    const [detalleModal, setDetalleModal] = useState<{ codigo: number; nombre: string } | null>(null)
    const [detalle, setDetalle] = useState<DetalleItem[]>([])
    const [detalleLoading, setDetalleLoading] = useState(false)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [filtersOpen, setFiltersOpen] = useState(false)

    // Load filters
    useEffect(() => {
        api.get<Filtros>('/api/informes/filtros-comparativa').then(r => setFiltros(r.data))
    }, [])

    // Subfamilias filtered by familia
    const subfamiliasFiltradas = filtros?.subfamilias.filter(
        sf => familia === '' || sf.familia === familia
    ) ?? []

    const cargar = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, string> = {
                anio1: String(anio1),
                anio2: String(anio2),
            }
            if (mesesSel.length > 0) params.meses = mesesSel.join(',')
            if (familia !== '') params.familia = String(familia)
            if (subfamilia !== '') params.subfamilia = String(subfamilia)
            if (articulo) params.articulo = articulo
            if (marca !== '') params.marca = String(marca)
            if (tipoArticulo !== '') params.tipo_articulo = String(tipoArticulo)
            if (tipoCliente !== '') params.tipo_cliente = String(tipoCliente)
            if (agente !== '') params.agente = String(agente)
            if (poblacion) params.poblacion = poblacion
            if (cpostal) params.cpostal = cpostal
            if (ocultarObsoletos) params.ocultar_obsoletos = 'true'

            const { data } = await api.get('/api/informes/comparativa-ventas-clientes', { params })
            setClientes(data.clientes)
            setResumen(data.resumen)
            setLoaded(true)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [anio1, anio2, mesesSel, familia, subfamilia, articulo, marca, tipoArticulo, tipoCliente, agente, poblacion, cpostal, ocultarObsoletos])

    const openDetalle = async (c: ClienteRow) => {
        setDetalleModal({ codigo: c.cli_codigo, nombre: c.cli_nombre })
        setDetalleLoading(true)
        setExpanded(new Set())
        try {
            const params: Record<string, string> = {
                cli_codigo: String(c.cli_codigo),
                anio1: String(anio1),
                anio2: String(anio2),
            }
            if (mesesSel.length > 0) params.meses = mesesSel.join(',')
            const { data } = await api.get('/api/informes/comparativa-cliente-detalle', { params })
            setDetalle(data.detalle)
        } catch (e) {
            console.error(e)
        } finally {
            setDetalleLoading(false)
        }
    }

    // Filter by search
    const clientesFiltrados = busqueda
        ? clientes.filter(c => c.cli_nombre?.toLowerCase().includes(busqueda.toLowerCase()))
        : clientes

    // Toggle month
    const toggleMes = (m: number) => {
        setMesesSel(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
    }

    // Export CSV
    const exportarCSV = () => {
        if (!clientesFiltrados.length) return
        const BOM = '\uFEFF'
        const header = `Cliente;Ventas ${anio1};Ventas ${anio2}`
        const rows = clientesFiltrados.map(c =>
            `"${c.cli_nombre}";${c.ventas_anio1.toFixed(2)};${c.ventas_anio2.toFixed(2)}`
        )
        const csv = BOM + [header, ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `comparativa_clientes_${anio1}_${anio2}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // Build tree for detalle modal
    const buildTree = () => {
        const tree: Record<string, {
            items: Record<string, {
                arts: DetalleItem[]
                imp1: number; imp2: number; uds1: number; uds2: number
            }>
            imp1: number; imp2: number; uds1: number; uds2: number
        }> = {}

        for (const d of detalle) {
            const fk = d.familia
            const sfk = d.subfamilia || '(sin subfamilia)'
            if (!tree[fk]) tree[fk] = { items: {}, imp1: 0, imp2: 0, uds1: 0, uds2: 0 }
            if (!tree[fk].items[sfk]) tree[fk].items[sfk] = { arts: [], imp1: 0, imp2: 0, uds1: 0, uds2: 0 }
            tree[fk].items[sfk].arts.push(d)
            tree[fk].items[sfk].imp1 += d.importe_anio1
            tree[fk].items[sfk].imp2 += d.importe_anio2
            tree[fk].items[sfk].uds1 += d.uds_anio1
            tree[fk].items[sfk].uds2 += d.uds_anio2
            tree[fk].imp1 += d.importe_anio1
            tree[fk].imp2 += d.importe_anio2
            tree[fk].uds1 += d.uds_anio1
            tree[fk].uds2 += d.uds_anio2
        }
        return tree
    }

    const toggle = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    return (
        <div className="flex flex-col h-screen max-w-7xl mx-auto">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-bold text-slate-700 mr-auto md:mr-0">Comparativa Clientes</h1>

                {/* Años + botones */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-[11px] text-slate-500">Año 1</label>
                    <input type="number" value={anio1} onChange={e => setAnio1(+e.target.value)}
                        className="input !py-1 !w-16 text-[11px]" />
                    <label className="text-[11px] text-slate-500">Año 2</label>
                    <input type="number" value={anio2} onChange={e => setAnio2(+e.target.value)}
                        className="input !py-1 !w-16 text-[11px]" />
                    <button onClick={cargar} disabled={loading}
                        className="btn-primary !py-1 !px-3 text-[11px] flex items-center gap-1">
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Filter className="w-3 h-3" />}
                        Cargar
                    </button>
                    <button onClick={exportarCSV} disabled={!loaded}
                        className="btn-primary !py-1 !px-3 text-[11px] flex items-center gap-1 !bg-green-600 hover:!bg-green-700">
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline">Exportar CSV</span>
                        <span className="sm:hidden">CSV</span>
                    </button>
                    {/* Mobile: toggle filtros */}
                    <button onClick={() => setFiltersOpen(o => !o)}
                        className="md:hidden btn-primary !py-1 !px-2 text-[11px] flex items-center gap-1 !bg-slate-600 hover:!bg-slate-700">
                        <Filter className="w-3 h-3" />
                        Filtros
                        {(familia !== '' || subfamilia !== '' || articulo || marca !== '' || tipoArticulo !== '' || tipoCliente !== '' || agente !== '' || poblacion || cpostal || mesesSel.length > 0) && (
                            <span className="bg-blue-500 text-white rounded-full text-[9px] px-1 leading-tight">✓</span>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Mobile filtros overlay ──────────────────────────────── */}
            {filtersOpen && (
                <div className="fixed inset-0 z-50 md:hidden" onClick={() => setFiltersOpen(false)}>
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">Filtros</h2>
                            <button onClick={() => setFiltersOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-4 space-y-3 text-[11px]">
                            <FiltersContent
                                filtros={filtros}
                                familia={familia} setFamilia={v => { setFamilia(v ? +v : ''); setSubfamilia('') }}
                                subfamilia={subfamilia} setSubfamilia={v => setSubfamilia(v ? +v : '')}
                                subfamiliasFiltradas={subfamiliasFiltradas}
                                articulo={articulo} setArticulo={setArticulo}
                                marca={marca} setMarca={v => setMarca(v ? +v : '')}
                                tipoArticulo={tipoArticulo} setTipoArticulo={v => setTipoArticulo(v ? +v : '')}
                                tipoCliente={tipoCliente} setTipoCliente={v => setTipoCliente(v ? +v : '')}
                                agente={agente} setAgente={v => setAgente(v ? +v : '')}
                                poblacion={poblacion} setPoblacion={setPoblacion}
                                cpostal={cpostal} setCpostal={setCpostal}
                                ocultarObsoletos={ocultarObsoletos} setOcultarObsoletos={setOcultarObsoletos}
                                mesesSel={mesesSel} toggleMes={toggleMes} clearMeses={() => setMesesSel([])}
                            />
                        </div>
                        <div className="p-4 border-t border-slate-200">
                            <button onClick={() => { cargar(); setFiltersOpen(false) }}
                                className="btn-primary w-full !py-2 text-sm flex items-center justify-center gap-2">
                                <Filter className="w-4 h-4" /> Aplicar y Cargar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* ── Desktop left sidebar ────────────────────────────── */}
                <div className="hidden md:flex w-56 flex-shrink-0 flex-col bg-white border-r border-slate-200 overflow-y-auto p-3 space-y-3 text-[11px]">
                    <FiltersContent
                        filtros={filtros}
                        familia={familia} setFamilia={v => { setFamilia(v ? +v : ''); setSubfamilia('') }}
                        subfamilia={subfamilia} setSubfamilia={v => setSubfamilia(v ? +v : '')}
                        subfamiliasFiltradas={subfamiliasFiltradas}
                        articulo={articulo} setArticulo={setArticulo}
                        marca={marca} setMarca={v => setMarca(v ? +v : '')}
                        tipoArticulo={tipoArticulo} setTipoArticulo={v => setTipoArticulo(v ? +v : '')}
                        tipoCliente={tipoCliente} setTipoCliente={v => setTipoCliente(v ? +v : '')}
                        agente={agente} setAgente={v => setAgente(v ? +v : '')}
                        poblacion={poblacion} setPoblacion={setPoblacion}
                        cpostal={cpostal} setCpostal={setCpostal}
                        ocultarObsoletos={ocultarObsoletos} setOcultarObsoletos={setOcultarObsoletos}
                        mesesSel={mesesSel} toggleMes={toggleMes} clearMeses={() => setMesesSel([])}
                    />
                </div>

                {/* ── Main content ─────────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Mobile: resumen tarjetas horizontales */}
                    {loaded && resumen && (
                        <div className="md:hidden bg-slate-50 border-b border-slate-200 px-3 py-2 grid grid-cols-4 gap-2 text-center">
                            <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wide">Clientes</div>
                                <div className="text-sm font-bold text-blue-700">{resumen.total_clientes}</div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wide">{anio1}</div>
                                <div className="text-xs font-bold text-slate-700">{(resumen.ventas_anio1 / 1000).toFixed(0)}k€</div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wide">{anio2}</div>
                                <div className="text-xs font-bold text-slate-700">{(resumen.ventas_anio2 / 1000).toFixed(0)}k€</div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wide">Nuevos/Perd.</div>
                                <div className="text-xs font-bold">
                                    <span className="text-green-600">+{resumen.cli_nuevos}</span>
                                    <span className="text-slate-300 mx-0.5">/</span>
                                    <span className="text-red-500">-{resumen.cli_perdidos}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Search bar */}
                    <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            className="flex-1 text-xs bg-transparent outline-none" placeholder="Buscar cliente..." />
                        <span className="text-[10px] text-slate-400 shrink-0">
                            {clientesFiltrados.length} clientes
                        </span>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        {/* Table */}
                        <div className="flex-1 overflow-auto">
                            {!loaded ? (
                                <div className="flex items-center justify-center h-full text-slate-400 text-sm px-4 text-center">
                                    Selecciona los filtros y pulsa "Cargar"
                                </div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-50 z-10">
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            <th className="text-left py-2 px-3 font-medium">Cliente</th>
                                            <th className="text-right py-2 px-2 font-medium">{anio1}</th>
                                            <th className="text-right py-2 px-2 font-medium">{anio2}</th>
                                            {/* Columnas de unidades: solo desktop */}
                                            {clientes.some(c => c.uds_anio1 !== null) && (
                                                <>
                                                    <th className="hidden md:table-cell text-right py-2 px-2 font-medium">Uds {anio1}</th>
                                                    <th className="hidden md:table-cell text-right py-2 px-2 font-medium">Uds {anio2}</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clientesFiltrados.map(c => {
                                            const hasUds = c.uds_anio1 !== null
                                            const color1 = c.ventas_anio1 > 0 && c.ventas_anio2 === 0 ? 'text-red-500'
                                                : c.ventas_anio1 === 0 && c.ventas_anio2 > 0 ? 'text-green-600'
                                                    : c.ventas_anio2 > c.ventas_anio1 ? 'text-green-600'
                                                        : c.ventas_anio2 < c.ventas_anio1 ? 'text-red-500' : ''
                                            return (
                                                <tr key={c.cli_codigo}
                                                    className={`border-b border-slate-50 hover:bg-blue-50 active:bg-blue-100 cursor-pointer ${color1}`}
                                                    onClick={() => openDetalle(c)}>
                                                    <td className="py-1.5 px-3 truncate max-w-[160px] md:max-w-[250px]" title={c.cli_nombre}>
                                                        {c.cli_nombre}
                                                    </td>
                                                    <td className="text-right py-1.5 px-2 font-medium whitespace-nowrap">
                                                        {c.ventas_anio1 > 0 ? `${fmt(c.ventas_anio1)} €` : ''}
                                                    </td>
                                                    <td className="text-right py-1.5 px-2 font-medium whitespace-nowrap">
                                                        {c.ventas_anio2 > 0 ? `${fmt(c.ventas_anio2)} €` : ''}
                                                    </td>
                                                    {hasUds && (
                                                        <>
                                                            <td className="hidden md:table-cell text-right py-1.5 px-2">
                                                                {(c.uds_anio1 ?? 0) > 0 ? fmtInt(c.uds_anio1!) : ''}
                                                            </td>
                                                            <td className="hidden md:table-cell text-right py-1.5 px-2">
                                                                {(c.uds_anio2 ?? 0) > 0 ? fmtInt(c.uds_anio2!) : ''}
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    {clientesFiltrados.length > 0 && (
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-300 font-bold bg-slate-50 sticky bottom-0">
                                                <td className="py-2 px-3">TOTAL</td>
                                                <td className="text-right py-2 px-2 whitespace-nowrap">
                                                    {fmt(clientesFiltrados.reduce((a, c) => a + c.ventas_anio1, 0))} €
                                                </td>
                                                <td className="text-right py-2 px-2 whitespace-nowrap">
                                                    {fmt(clientesFiltrados.reduce((a, c) => a + c.ventas_anio2, 0))} €
                                                </td>
                                                {clientes.some(c => c.uds_anio1 !== null) && (
                                                    <>
                                                        <td className="hidden md:table-cell text-right py-2 px-2">
                                                            {fmtInt(clientesFiltrados.reduce((a, c) => a + (c.uds_anio1 ?? 0), 0))}
                                                        </td>
                                                        <td className="hidden md:table-cell text-right py-2 px-2">
                                                            {fmtInt(clientesFiltrados.reduce((a, c) => a + (c.uds_anio2 ?? 0), 0))}
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            )}
                        </div>

                        {/* Desktop right sidebar: Summary */}
                        {loaded && resumen && (
                            <div className="hidden md:flex w-56 flex-shrink-0 flex-col bg-white border-l border-slate-200 overflow-y-auto p-3 space-y-3 text-[11px]">
                                <div className="bg-blue-50 rounded-lg p-3 text-center">
                                    <div className="flex items-center justify-center gap-1 text-blue-600 font-bold text-xs mb-1">
                                        <Users className="w-3.5 h-3.5" /> TOTAL CLIENTES
                                    </div>
                                    <div className="text-2xl font-bold text-blue-700">{resumen.total_clientes}</div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Clientes {anio1}:</span>
                                        <span className="font-semibold">{resumen.clientes_anio1}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Clientes {anio2}:</span>
                                        <span className="font-semibold">{resumen.clientes_anio2}</span>
                                    </div>
                                </div>

                                <hr className="border-slate-200" />
                                <div className="flex items-center gap-1 text-slate-600 font-semibold text-xs">
                                    <TrendingUp className="w-3.5 h-3.5" /> VENTAS
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">{anio1}:</span>
                                        <span className="font-semibold">{fmt(resumen.ventas_anio1)} €</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">{anio2}:</span>
                                        <span className="font-semibold">{fmt(resumen.ventas_anio2)} €</span>
                                    </div>
                                </div>

                                <hr className="border-slate-200" />
                                <div className="flex items-center gap-1 text-slate-600 font-semibold text-xs">
                                    <TrendingDown className="w-3.5 h-3.5" /> VARIACIÓN (€)
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <span className="text-red-500 flex items-center gap-0.5">
                                            <ArrowDownRight className="w-3 h-3" /> Clientes bajada:
                                        </span>
                                        <span className="font-semibold text-red-500">{resumen.cli_bajada}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-green-600 flex items-center gap-0.5">
                                            <ArrowUpRight className="w-3 h-3" /> Clientes subida:
                                        </span>
                                        <span className="font-semibold text-green-600">{resumen.cli_subida}</span>
                                    </div>
                                </div>

                                {(resumen.uds_bajada > 0 || resumen.uds_subida > 0) && (
                                    <>
                                        <hr className="border-slate-200" />
                                        <div className="flex items-center gap-1 text-slate-600 font-semibold text-xs">
                                            VARIACIÓN (Uds)
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between">
                                                <span className="text-red-500 flex items-center gap-0.5">
                                                    <ArrowDownRight className="w-3 h-3" /> Clientes bajada:
                                                </span>
                                                <span className="font-semibold text-red-500">{resumen.uds_bajada}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-green-600 flex items-center gap-0.5">
                                                    <ArrowUpRight className="w-3 h-3" /> Clientes subida:
                                                </span>
                                                <span className="font-semibold text-green-600">{resumen.uds_subida}</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <hr className="border-slate-200" />
                                <div className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <span className="text-green-600 flex items-center gap-0.5">
                                            <UserPlus className="w-3 h-3" /> Nuevos:
                                        </span>
                                        <span className="font-semibold text-green-600">{resumen.cli_nuevos}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-red-500 flex items-center gap-0.5">
                                            <UserMinus className="w-3 h-3" /> Perdidos:
                                        </span>
                                        <span className="font-semibold text-red-500">{resumen.cli_perdidos}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Detalle Modal ── */}
            {detalleModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                    onClick={() => setDetalleModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-bold text-slate-700">{detalleModal.nombre}</h2>
                            <button onClick={() => setDetalleModal(null)}
                                className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-auto flex-1 p-4">
                            {detalleLoading ? (
                                <div className="text-center text-slate-400 py-8">Cargando...</div>
                            ) : (
                                <div className="text-xs">
                                    {/* Header */}
                                    <div className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 font-semibold text-slate-500 border-b border-slate-200 pb-1 mb-1 pr-1">
                                        <div>Artículo</div>
                                        <div className="text-right">Ventas {anio1}</div>
                                        <div className="text-right">Ventas {anio2}</div>
                                        <div className="text-right">Uds {anio1}</div>
                                        <div className="text-right">Uds {anio2}</div>
                                    </div>
                                    {/* Tree */}
                                    {(() => {
                                        const tree = buildTree()
                                        return Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)).map(([fam, fNode]) => (
                                            <div key={fam}>
                                                {/* Familia row */}
                                                <div className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 py-1 cursor-pointer hover:bg-slate-50 font-semibold text-slate-700 border-b border-slate-100"
                                                    onClick={() => toggle(`f:${fam}`)}>
                                                    <div className="flex items-center gap-1">
                                                        {expanded.has(`f:${fam}`)
                                                            ? <ChevronDown className="w-3 h-3" />
                                                            : <ChevronRight className="w-3 h-3" />}
                                                        {fam}
                                                    </div>
                                                    <div className="text-right">{fNode.imp1 > 0 ? `${fmt(fNode.imp1)} €` : ''}</div>
                                                    <div className="text-right">{fNode.imp2 > 0 ? `${fmt(fNode.imp2)} €` : ''}</div>
                                                    <div className="text-right">{fNode.uds1 > 0 ? fmtInt(fNode.uds1) : ''}</div>
                                                    <div className="text-right">{fNode.uds2 > 0 ? fmtInt(fNode.uds2) : ''}</div>
                                                </div>

                                                {expanded.has(`f:${fam}`) && Object.entries(fNode.items).sort(([a], [b]) => a.localeCompare(b)).map(([sf, sfNode]) => (
                                                    <div key={sf} className="ml-4">
                                                        {/* Subfamilia row */}
                                                        <div className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 py-0.5 cursor-pointer hover:bg-slate-50 font-medium text-slate-600 border-b border-slate-50"
                                                            onClick={() => toggle(`sf:${fam}:${sf}`)}>
                                                            <div className="flex items-center gap-1">
                                                                {expanded.has(`sf:${fam}:${sf}`)
                                                                    ? <ChevronDown className="w-3 h-3" />
                                                                    : <ChevronRight className="w-3 h-3" />}
                                                                {sf}
                                                            </div>
                                                            <div className="text-right">{sfNode.imp1 > 0 ? `${fmt(sfNode.imp1)} €` : ''}</div>
                                                            <div className="text-right">{sfNode.imp2 > 0 ? `${fmt(sfNode.imp2)} €` : ''}</div>
                                                            <div className="text-right">{sfNode.uds1 > 0 ? fmtInt(sfNode.uds1) : ''}</div>
                                                            <div className="text-right">{sfNode.uds2 > 0 ? fmtInt(sfNode.uds2) : ''}</div>
                                                        </div>

                                                        {expanded.has(`sf:${fam}:${sf}`) && sfNode.arts.sort((a, b) => a.descripcion.localeCompare(b.descripcion)).map((art, i) => (
                                                            <div key={i}
                                                                className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 py-0.5 ml-4 text-slate-500 border-b border-slate-50 hover:bg-slate-50">
                                                                <div className="truncate" title={`${art.referencia} - ${art.descripcion}`}>
                                                                    <span className="font-mono text-slate-400 mr-1">{art.referencia}</span>
                                                                    {art.descripcion}
                                                                </div>
                                                                <div className="text-right">{art.importe_anio1 > 0 ? `${fmt(art.importe_anio1)} €` : ''}</div>
                                                                <div className="text-right">{art.importe_anio2 > 0 ? `${fmt(art.importe_anio2)} €` : ''}</div>
                                                                <div className="text-right">{art.uds_anio1 > 0 ? fmtInt(art.uds_anio1) : ''}</div>
                                                                <div className="text-right">{art.uds_anio2 > 0 ? fmtInt(art.uds_anio2) : ''}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        ))
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ── FiltersContent ─────────────────────────────────────────── */

interface FiltersContentProps {
    filtros: Filtros | null
    familia: number | ''
    setFamilia: (v: string) => void
    subfamilia: number | ''
    setSubfamilia: (v: string) => void
    subfamiliasFiltradas: SubfamiliaOption[]
    articulo: string
    setArticulo: (v: string) => void
    marca: number | ''
    setMarca: (v: string) => void
    tipoArticulo: number | ''
    setTipoArticulo: (v: string) => void
    tipoCliente: number | ''
    setTipoCliente: (v: string) => void
    agente: number | ''
    setAgente: (v: string) => void
    poblacion: string
    setPoblacion: (v: string) => void
    cpostal: string
    setCpostal: (v: string) => void
    ocultarObsoletos: boolean
    setOcultarObsoletos: (v: boolean) => void
    mesesSel: number[]
    toggleMes: (m: number) => void
    clearMeses: () => void
}

function FiltersContent({
    filtros, familia, setFamilia, subfamilia, setSubfamilia, subfamiliasFiltradas,
    articulo, setArticulo, marca, setMarca, tipoArticulo, setTipoArticulo,
    tipoCliente, setTipoCliente, agente, setAgente, poblacion, setPoblacion,
    cpostal, setCpostal, ocultarObsoletos, setOcultarObsoletos,
    mesesSel, toggleMes, clearMeses
}: FiltersContentProps) {
    return (
        <>
            <h3 className="font-semibold text-slate-600 text-xs">Filtros Artículos</h3>

            <div>
                <label className="text-slate-500 block mb-0.5">Familia</label>
                <Sel value={familia} placeholder="Todas" onChange={setFamilia}
                    options={(filtros?.familias ?? []).map(f => ({ v: f.codigo, l: f.nombre }))} />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">SubFamilia</label>
                <Sel value={subfamilia} placeholder="Todas" onChange={setSubfamilia}
                    options={subfamiliasFiltradas.map(f => ({ v: f.codigo, l: f.nombre }))} />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">Artículo</label>
                <input value={articulo} onChange={e => setArticulo(e.target.value)}
                    className="input !py-1 text-[11px] w-full" placeholder="Referencia" />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">Marca</label>
                <Sel value={marca} placeholder="Todas" onChange={setMarca}
                    options={(filtros?.marcas ?? []).map(m => ({ v: m.codigo, l: m.nombre }))} />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">Tipo Artículo</label>
                <Sel value={tipoArticulo} placeholder="Todos" onChange={setTipoArticulo}
                    options={(filtros?.tipos_articulo ?? []).map(t => ({ v: t.codigo, l: t.nombre }))} />
            </div>

            <hr className="border-slate-200" />
            <h3 className="font-semibold text-slate-600 text-xs">Filtros Clientes</h3>

            <div>
                <label className="text-slate-500 block mb-0.5">Tipo Cliente</label>
                <Sel value={tipoCliente} placeholder="Todos" onChange={setTipoCliente}
                    options={(filtros?.tipos_cliente ?? []).map(t => ({ v: t.codigo, l: t.nombre }))} />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">Código Postal</label>
                <Sel value={cpostal} placeholder="Todos" onChange={setCpostal}
                    options={(filtros?.codigos_postales ?? []).map(c => ({ v: c, l: c }))} />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">Población</label>
                <Sel value={poblacion} placeholder="Todas" onChange={setPoblacion}
                    options={(filtros?.poblaciones ?? []).map(p => ({ v: p, l: p }))} />
            </div>
            <div>
                <label className="text-slate-500 block mb-0.5">Agente</label>
                <Sel value={agente} placeholder="Todos" onChange={setAgente}
                    options={(filtros?.agentes ?? []).map(a => ({ v: a.codigo, l: a.nombre }))} />
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer mt-1">
                <input type="checkbox" checked={ocultarObsoletos}
                    onChange={e => setOcultarObsoletos(e.target.checked)}
                    className="accent-blue-600" />
                <span className="text-slate-500">Ocultar Obsoletos</span>
            </label>

            <hr className="border-slate-200" />
            <h3 className="font-semibold text-slate-600 text-xs">Meses</h3>
            <div className="grid grid-cols-4 gap-1">
                {MESES.map(m => (
                    <button key={m.v} onClick={() => toggleMes(m.v)}
                        className={`px-1 py-0.5 rounded text-[10px] border transition-colors
                            ${mesesSel.includes(m.v)
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400'}`}>
                        {m.l}
                    </button>
                ))}
            </div>
            {mesesSel.length > 0 && (
                <button onClick={clearMeses} className="text-[10px] text-blue-600 hover:underline">
                    Todos los meses
                </button>
            )}
        </>
    )
}
