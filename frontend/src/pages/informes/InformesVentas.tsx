import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../../api/client'
import FichaCliente from '../../components/FichaCliente'
import FichaAgente from '../../components/FichaAgente'
import FichaArticulo from '../../components/FichaArticulo'
import {
    Search, Download, ChevronDown, ChevronRight, Users, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownRight, UserPlus, UserMinus, X, Loader2,
    BarChart3, Calendar, SlidersHorizontal, FileSearch
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

interface FO { codigo: number; nombre: string }
interface SFO extends FO { familia: number }
interface Filtros {
    familias: FO[]; subfamilias: SFO[]; agentes: FO[]; tipos_cliente: FO[]
    tipos_articulo: FO[]; marcas: FO[]; poblaciones: string[]; codigos_postales: string[]
}

// Tab Clientes
interface ClienteRow { cli_codigo: number; cli_nombre: string; ventas_anio1: number; ventas_anio2: number; uds_anio1: number | null; uds_anio2: number | null }
interface Resumen { total_clientes: number; clientes_anio1: number; clientes_anio2: number; ventas_anio1: number; ventas_anio2: number; cli_subida: number; cli_bajada: number; cli_nuevos: number; cli_perdidos: number; uds_bajada: number; uds_subida: number }
interface DetalleItem { familia: string; subfamilia: string; referencia: string; descripcion: string; importe_anio1: number; uds_anio1: number; importe_anio2: number; uds_anio2: number }

// Tab Agentes
interface AgClienteRow { cli_codigo: number; cli_nombre: string; ventas_anio1: number; ventas_anio2: number; pendiente: number }
interface AgenteRow { agente_codigo: number; agente_nombre: string; ventas_anio1: number; ventas_anio2: number; pendiente: number; clientes: AgClienteRow[] }

// Tab Artículos
interface ArtClienteRow { cli_nombre: string; importe_anio1: number; importe_anio2: number; uds_anio1: number; uds_anio2: number }
interface ArticuloRow { referencia: string; descripcion: string; importe_anio1: number; importe_anio2: number; uds_anio1: number; uds_anio2: number; stock: number; clientes: ArtClienteRow[] }

// Tab Familias
interface FamItem { familia: string; referencia: string; descripcion: string; cli_nombre: string; importe_anio1: number; importe_anio2: number; uds_anio1: number; uds_anio2: number }

// Tab Seguimiento
interface MesData { mes: number; v1: number; v2: number }
interface SeguimientoRow { cli_codigo: number; cli_nombre: string; ventas_anio1: number; ventas_anio2: number; meses: MesData[] }

// Tab Condiciones
interface CondDetalle { referencia: string; art_nombre: string; fam_nombre: string; descuento: number; precio: number }
interface CondRow { cli_codigo: number; cli_nombre: string; tarifaespecial: number; tarifa_nombre: string; detalle: CondDetalle[] }

type Tab = 'clientes' | 'agentes' | 'articulos' | 'familias' | 'seguimiento' | 'condiciones'

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
const colorVar = (v1: number, v2: number) =>
    v2 > v1 ? 'text-green-600' : v2 < v1 ? 'text-red-500' : ''

const MESES = [
    { v: 1, l: 'Ene' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Abr' },
    { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Ago' },
    { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dic' },
]

const MESES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Sept.', 'Oct.', 'Nov.', 'Dic.']

const TABS: { key: Tab; label: string }[] = [
    { key: 'clientes', label: 'Ventas por Clientes' },
    { key: 'agentes', label: 'Ventas por Agente' },
    { key: 'articulos', label: 'Ventas por Artículos' },
    { key: 'familias', label: 'Ventas por Familia' },
    { key: 'seguimiento', label: 'Seguimiento' },
    { key: 'condiciones', label: 'Cond. Especiales' },
]

/* ══════════════════════════════════════════════════════════════
   Sel component
   ══════════════════════════════════════════════════════════════ */
const Sel = ({ value, onChange, options, placeholder, className = '' }: {
    value: string | number; onChange: (v: string) => void
    options: { v: string | number; l: string }[]; placeholder: string; className?: string
}) => (
    <select value={value} onChange={e => onChange(e.target.value)}
        className={`input !py-1 text-[11px] ${className}`}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
)

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function InformesVentas() {
    const thisYear = new Date().getFullYear()

    // Shared state
    const [tab, setTab] = useState<Tab>('clientes')
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
    const [filtros, setFiltros] = useState<Filtros | null>(null)

    // Load trigger
    const [loadKey, setLoadKey] = useState(0)
    const [params, setParams] = useState<Record<string, string>>({})

    // Load filter options
    useEffect(() => {
        api.get<Filtros>('/api/informes/filtros-comparativa').then(r => setFiltros(r.data))
    }, [])

    const subfamiliasFiltradas = filtros?.subfamilias.filter(
        sf => familia === '' || sf.familia === familia
    ) ?? []

    const buildParams = useCallback(() => {
        const p: Record<string, string> = { anio1: String(anio1), anio2: String(anio2) }
        if (mesesSel.length > 0) p.meses = mesesSel.join(',')
        if (familia !== '') p.familia = String(familia)
        if (subfamilia !== '') p.subfamilia = String(subfamilia)
        if (articulo) p.articulo = articulo
        if (marca !== '') p.marca = String(marca)
        if (tipoArticulo !== '') p.tipo_articulo = String(tipoArticulo)
        if (tipoCliente !== '') p.tipo_cliente = String(tipoCliente)
        if (agente !== '') p.agente = String(agente)
        if (poblacion) p.poblacion = poblacion
        if (cpostal) p.cpostal = cpostal
        if (ocultarObsoletos) p.ocultar_obsoletos = 'true'
        return p
    }, [anio1, anio2, mesesSel, familia, subfamilia, articulo, marca, tipoArticulo, tipoCliente, agente, poblacion, cpostal, ocultarObsoletos])

    // Auto-carga al entrar y cada vez que cambie cualquier filtro o año
    useEffect(() => {
        setParams(buildParams())
        setLoadKey(k => k + 1)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anio1, anio2, familia, subfamilia, marca, tipoArticulo, tipoCliente, agente, poblacion, cpostal, ocultarObsoletos, mesesSel])

    const toggleMes = (m: number) => setMesesSel(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

    return (
        <div className="flex flex-col h-screen max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="bg-white shadow-sm flex-shrink-0">
                {/* Title bar */}
                <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
                            <BarChart3 className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800 leading-tight">Informes de Ventas</h1>
                            <p className="text-[10px] text-slate-400">Comparativa y análisis comercial</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <input type="number" value={anio1} onChange={e => setAnio1(+e.target.value)}
                                className="w-16 text-xs font-medium text-center border border-slate-200 rounded-md py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <span className="text-slate-300">vs</span>
                            <input type="number" value={anio2} onChange={e => setAnio2(+e.target.value)}
                                className="w-16 text-xs font-medium text-center border border-slate-200 rounded-md py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </div>
                    </div>
                </div>
                {/* Tabs */}
                <div className="px-5 flex items-center justify-center gap-0.5 border-b border-slate-200">
                    <div className="flex items-center gap-0.5 bg-blue-50 rounded-t-lg px-1 pt-0.5">
                        {TABS.map(t => (
                            <button key={t.key} onClick={() => setTab(t.key)}
                                className={`px-3.5 py-2 text-xs font-medium transition-all rounded-t-md
                                    ${tab === t.key
                                        ? 'bg-white text-blue-700 shadow-sm border border-b-0 border-slate-200'
                                        : 'text-slate-500 hover:text-blue-600 hover:bg-blue-100/50'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* ── Left sidebar: Filters ── */}
                {tab !== 'condiciones' && (
                    <div className="w-64 flex-shrink-0 bg-slate-200 border-r border-slate-300 overflow-y-auto p-3 space-y-2 text-[11px]">
                        {/* Filtros Artículos */}
                        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span className="font-semibold text-xs uppercase tracking-wider">Artículos</span>
                        </div>
                        <div className="space-y-2 bg-blue-100/70 rounded-lg p-2.5 border border-blue-200">
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Familia</label>
                                <Sel value={familia} placeholder="Todas"
                                    onChange={v => { setFamilia(v ? +v : ''); setSubfamilia('') }}
                                    options={(filtros?.familias ?? []).map(f => ({ v: f.codigo, l: f.nombre }))} />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">SubFamilia</label>
                                <Sel value={subfamilia} placeholder="Todas"
                                    onChange={v => setSubfamilia(v ? +v : '')}
                                    options={subfamiliasFiltradas.map(f => ({ v: f.codigo, l: f.nombre }))} />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Artículo</label>
                                <input value={articulo} onChange={e => setArticulo(e.target.value)}
                                    className="input !py-1 text-[11px] w-full" placeholder="Referencia" />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Marca</label>
                                <Sel value={marca} placeholder="Todas"
                                    onChange={v => setMarca(v ? +v : '')}
                                    options={(filtros?.marcas ?? []).map(m => ({ v: m.codigo, l: m.nombre }))} />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Tipo Artículo</label>
                                <Sel value={tipoArticulo} placeholder="Todos"
                                    onChange={v => setTipoArticulo(v ? +v : '')}
                                    options={(filtros?.tipos_articulo ?? []).map(t => ({ v: t.codigo, l: t.nombre }))} />
                            </div>
                        </div>

                        {/* Filtros Clientes */}
                        <div className="flex items-center gap-1.5 text-slate-500 mt-3 mb-1">
                            <Users className="w-3.5 h-3.5" />
                            <span className="font-semibold text-xs uppercase tracking-wider">Clientes</span>
                        </div>
                        <div className="space-y-2 bg-emerald-100/70 rounded-lg p-2.5 border border-emerald-200">
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Tipo Cliente</label>
                                <Sel value={tipoCliente} placeholder="Todos"
                                    onChange={v => setTipoCliente(v ? +v : '')}
                                    options={(filtros?.tipos_cliente ?? []).map(t => ({ v: t.codigo, l: t.nombre }))} />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Código Postal</label>
                                <Sel value={cpostal} placeholder="Todos"
                                    onChange={v => setCpostal(v)}
                                    options={(filtros?.codigos_postales ?? []).map(c => ({ v: c, l: c }))} />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Población</label>
                                <Sel value={poblacion} placeholder="Todas"
                                    onChange={v => setPoblacion(v)}
                                    options={(filtros?.poblaciones ?? []).map(p => ({ v: p, l: p }))} />
                            </div>
                            <div>
                                <label className="text-slate-400 text-[10px] font-medium uppercase tracking-wide block mb-0.5">Agente</label>
                                <Sel value={agente} placeholder="Todos"
                                    onChange={v => setAgente(v ? +v : '')}
                                    options={(filtros?.agentes ?? []).map(a => ({ v: a.codigo, l: a.nombre }))} />
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer mt-1">
                                <input type="checkbox" checked={ocultarObsoletos}
                                    onChange={e => setOcultarObsoletos(e.target.checked)} className="accent-blue-600 rounded" />
                                <span className="text-slate-500">Ocultar Obsoletos</span>
                            </label>
                        </div>

                        {/* Meses */}
                        <div className="flex items-center gap-1.5 text-slate-500 mt-3 mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="font-semibold text-xs uppercase tracking-wider">Meses</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                            {MESES.map(m => (
                                <button key={m.v} onClick={() => toggleMes(m.v)}
                                    className={`py-1 rounded-md text-[10px] font-medium transition-all border
                                        ${mesesSel.includes(m.v)
                                            ? 'bg-blue-600 text-white shadow-sm border-blue-600'
                                            : 'bg-white text-slate-500 border-slate-200/70 hover:border-blue-300 hover:text-slate-700'}`}>
                                    {m.l}
                                </button>
                            ))}
                        </div>
                        {mesesSel.length > 0 && (
                            <button onClick={() => setMesesSel([])}
                                className="text-[10px] text-blue-600 hover:underline w-full text-center mt-1">Limpiar selección</button>
                        )}
                    </div>
                )}

                {/* ── Tab content ── */}
                <div className="flex-1 overflow-hidden flex flex-col bg-white">
                    <TabClientes visible={tab === 'clientes'} params={params} loadKey={loadKey}
                        anio1={anio1} anio2={anio2} busqueda={busqueda} setBusqueda={setBusqueda} mesesSel={mesesSel} />
                    <TabAgentes visible={tab === 'agentes'} params={params} loadKey={loadKey}
                        anio1={anio1} anio2={anio2} busqueda={busqueda} setBusqueda={setBusqueda} />
                    <TabArticulos visible={tab === 'articulos'} params={params} loadKey={loadKey}
                        anio1={anio1} anio2={anio2} busqueda={busqueda} setBusqueda={setBusqueda} />
                    <TabFamilias visible={tab === 'familias'} params={params} loadKey={loadKey}
                        anio1={anio1} anio2={anio2} busqueda={busqueda} setBusqueda={setBusqueda} />
                    <TabSeguimiento visible={tab === 'seguimiento'} params={params} loadKey={loadKey}
                        anio1={anio1} anio2={anio2} busqueda={busqueda} setBusqueda={setBusqueda} />
                    <TabCondiciones visible={tab === 'condiciones'} loadKey={loadKey}
                        busqueda={busqueda} setBusqueda={setBusqueda} />
                </div>
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   Shared Tab wrapper
   ══════════════════════════════════════════════════════════════ */

function SearchBar({ busqueda, setBusqueda, count, placeholder }: {
    busqueda: string; setBusqueda: (v: string) => void; count: number; placeholder: string
}) {
    return (
        <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 bg-slate-50 rounded-md px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-300" placeholder={placeholder} />
                {busqueda && (
                    <button onClick={() => setBusqueda('')} className="text-slate-300 hover:text-slate-500">
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums font-medium bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
        </div>
    )
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3">
            <FileSearch className="w-10 h-10 stroke-[1.2]" />
            <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Sin datos</p>
                <p className="text-xs text-slate-300 mt-0.5">Los datos se cargarán automáticamente</p>
            </div>
        </div>
    )
}

function LoadingState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Cargando datos...</span>
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   TAB 1: VENTAS POR CLIENTES
   ══════════════════════════════════════════════════════════════ */

function TabClientes({ visible, params, loadKey, anio1, anio2, busqueda, setBusqueda, mesesSel }: {
    visible: boolean; params: Record<string, string>; loadKey: number
    anio1: number; anio2: number; busqueda: string; setBusqueda: (v: string) => void; mesesSel: number[]
}) {
    const [data, setData] = useState<ClienteRow[]>([])
    const [resumen, setResumen] = useState<Resumen | null>(null)
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const lastKey = useRef(0)

    // Tree expansion per client
    const [expandedCli, setExpandedCli] = useState<Set<number>>(new Set())
    const [detalleCache, setDetalleCache] = useState<Record<number, DetalleItem[]>>({})
    const [detalleLoading, setDetalleLoading] = useState<Set<number>>(new Set())
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    // FichaCliente modal
    const [fichaCliente, setFichaCliente] = useState<{ codigo: number; nombre: string } | null>(null)

    useEffect(() => {
        if (visible && loadKey > 0 && loadKey !== lastKey.current) {
            lastKey.current = loadKey
            doLoad()
        }
    }, [visible, loadKey])

    async function doLoad() {
        setLoading(true)
        try {
            const { data: d } = await api.get('/api/informes/comparativa-ventas-clientes', { params })
            setData(d.clientes)
            setResumen(d.resumen)
            setLoaded(true)
            setExpandedCli(new Set()); setDetalleCache({}); setExpanded(new Set())
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const toggleCliente = async (c: ClienteRow) => {
        const code = c.cli_codigo
        setExpandedCli(prev => {
            const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n
        })
        if (!detalleCache[code] && !detalleLoading.has(code)) {
            setDetalleLoading(prev => { const n = new Set(prev); n.add(code); return n })
            try {
                const p: Record<string, string> = { cli_codigo: String(code), anio1: String(anio1), anio2: String(anio2) }
                if (mesesSel.length > 0) p.meses = mesesSel.join(',')
                const { data: d } = await api.get('/api/informes/comparativa-cliente-detalle', { params: p })
                setDetalleCache(prev => ({ ...prev, [code]: d.detalle }))
            } catch (e) { console.error(e) }
            finally { setDetalleLoading(prev => { const n = new Set(prev); n.delete(code); return n }) }
        }
    }

    const filtered = busqueda
        ? data.filter(c => c.cli_nombre?.toLowerCase().includes(busqueda.toLowerCase()))
        : data

    const toggle = (key: string) => setExpanded(p => {
        const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n
    })

    const buildTree = (items: DetalleItem[]) => {
        const tree: Record<string, { items: Record<string, { arts: DetalleItem[]; imp1: number; imp2: number; uds1: number; uds2: number }>; imp1: number; imp2: number; uds1: number; uds2: number }> = {}
        for (const d of items) {
            const fk = d.familia, sfk = d.subfamilia || '(sin subfamilia)'
            if (!tree[fk]) tree[fk] = { items: {}, imp1: 0, imp2: 0, uds1: 0, uds2: 0 }
            if (!tree[fk].items[sfk]) tree[fk].items[sfk] = { arts: [], imp1: 0, imp2: 0, uds1: 0, uds2: 0 }
            tree[fk].items[sfk].arts.push(d)
            tree[fk].items[sfk].imp1 += d.importe_anio1; tree[fk].items[sfk].imp2 += d.importe_anio2
            tree[fk].items[sfk].uds1 += d.uds_anio1; tree[fk].items[sfk].uds2 += d.uds_anio2
            tree[fk].imp1 += d.importe_anio1; tree[fk].imp2 += d.importe_anio2
            tree[fk].uds1 += d.uds_anio1; tree[fk].uds2 += d.uds_anio2
        }
        return tree
    }

    const exportCSV = () => {
        if (!filtered.length) return
        const BOM = '\uFEFF'
        const header = `Cliente;Ventas ${anio1};Ventas ${anio2}`
        const rows = filtered.map(c => `"${c.cli_nombre}";${c.ventas_anio1.toFixed(2)};${c.ventas_anio2.toFixed(2)}`)
        const csv = BOM + [header, ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `comparativa_clientes_${anio1}_${anio2}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    if (!visible) return null

    return (
        <>
            <SearchBar busqueda={busqueda} setBusqueda={setBusqueda} count={filtered.length} placeholder="Buscar cliente..." />
            <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-auto">
                    {!loaded && !loading ? <EmptyState /> : loading ? <LoadingState /> : (
                        <div className="text-xs">
                            {filtered.map(c => {
                                const isOpen = expandedCli.has(c.cli_codigo)
                                const col = c.ventas_anio1 > 0 && c.ventas_anio2 === 0 ? 'text-red-500'
                                    : c.ventas_anio1 === 0 && c.ventas_anio2 > 0 ? 'text-green-600'
                                        : colorVar(c.ventas_anio1, c.ventas_anio2)
                                const cliDetalle = detalleCache[c.cli_codigo]
                                const cliLoading = detalleLoading.has(c.cli_codigo)
                                return (
                                    <div key={c.cli_codigo}>
                                        {/* Client row */}
                                        <div className={`grid grid-cols-[1fr_120px_120px] gap-1 py-1.5 px-3 cursor-pointer hover:bg-blue-50 font-semibold border-b border-slate-200 ${col}`}
                                            onClick={() => toggleCliente(c)}>
                                            <div className="flex items-center gap-1">
                                                {isOpen ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                                                <span className="truncate hover:underline text-blue-700 hover:text-blue-900"
                                                    title="Abrir ficha de cliente"
                                                    onClick={e => { e.stopPropagation(); setFichaCliente({ codigo: c.cli_codigo, nombre: c.cli_nombre }) }}>
                                                    {c.cli_nombre}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                {c.ventas_anio1 > 0 ? `${fmt(c.ventas_anio1)} €` : ''}
                                            </div>
                                            <div className="text-right">
                                                {c.ventas_anio2 > 0 ? `${fmt(c.ventas_anio2)} €` : ''}
                                            </div>
                                        </div>
                                        {/* Inline tree: Familia > Subfamilia > Artículo */}
                                        {isOpen && (
                                            <div className="bg-slate-50/50">
                                                {cliLoading ? (
                                                    <div className="text-center text-slate-400 py-3 text-[11px]">Cargando detalle...</div>
                                                ) : cliDetalle ? (
                                                    <div className="ml-6">
                                                        {Object.entries(buildTree(cliDetalle)).sort(([a], [b]) => a.localeCompare(b)).map(([fam, fN]) => {
                                                            const fKey = `${c.cli_codigo}:f:${fam}`
                                                            return (
                                                                <div key={fam}>
                                                                    <div className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 py-1 px-2 cursor-pointer hover:bg-slate-100 font-semibold text-slate-700 border-b border-slate-100"
                                                                        onClick={() => toggle(fKey)}>
                                                                        <div className="flex items-center gap-1">
                                                                            {expanded.has(fKey) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{fam}
                                                                        </div>
                                                                        <div className="text-right">{fN.imp1 ? `${fmt(fN.imp1)} €` : ''}</div>
                                                                        <div className="text-right">{fN.imp2 ? `${fmt(fN.imp2)} €` : ''}</div>
                                                                        <div className="text-right">{fN.uds1 ? fmtInt(fN.uds1) : ''}</div>
                                                                        <div className="text-right">{fN.uds2 ? fmtInt(fN.uds2) : ''}</div>
                                                                    </div>
                                                                    {expanded.has(fKey) && Object.entries(fN.items).sort(([a], [b]) => a.localeCompare(b)).map(([sf, sfN]) => {
                                                                        const sfKey = `${c.cli_codigo}:sf:${fam}:${sf}`
                                                                        return (
                                                                            <div key={sf} className="ml-4">
                                                                                <div className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 py-0.5 px-2 cursor-pointer hover:bg-slate-100 font-medium text-slate-600 border-b border-slate-50"
                                                                                    onClick={() => toggle(sfKey)}>
                                                                                    <div className="flex items-center gap-1">
                                                                                        {expanded.has(sfKey) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{sf}
                                                                                    </div>
                                                                                    <div className="text-right">{sfN.imp1 ? `${fmt(sfN.imp1)} €` : ''}</div>
                                                                                    <div className="text-right">{sfN.imp2 ? `${fmt(sfN.imp2)} €` : ''}</div>
                                                                                    <div className="text-right">{sfN.uds1 ? fmtInt(sfN.uds1) : ''}</div>
                                                                                    <div className="text-right">{sfN.uds2 ? fmtInt(sfN.uds2) : ''}</div>
                                                                                </div>
                                                                                {expanded.has(sfKey) && sfN.arts.sort((a, b) => a.descripcion.localeCompare(b.descripcion)).map((art, i) => (
                                                                                    <div key={i} className="grid grid-cols-[1fr_100px_100px_70px_70px] gap-1 py-0.5 px-2 ml-4 text-slate-500 border-b border-slate-50 hover:bg-slate-50">
                                                                                        <div className="truncate" title={`${art.referencia} - ${art.descripcion}`}>
                                                                                            <span className="font-mono text-slate-400 mr-1">{art.referencia}</span>{art.descripcion}
                                                                                        </div>
                                                                                        <div className="text-right">{art.importe_anio1 ? `${fmt(art.importe_anio1)} €` : ''}</div>
                                                                                        <div className="text-right">{art.importe_anio2 ? `${fmt(art.importe_anio2)} €` : ''}</div>
                                                                                        <div className="text-right">{art.uds_anio1 ? fmtInt(art.uds_anio1) : ''}</div>
                                                                                        <div className="text-right">{art.uds_anio2 ? fmtInt(art.uds_anio2) : ''}</div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Summary panel */}
                {loaded && resumen && (
                    <div className="w-52 flex-shrink-0 bg-white border-l border-slate-100 overflow-y-auto p-3 space-y-3 text-[11px]">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 text-center">
                            <div className="flex items-center justify-center gap-1 text-blue-600 font-bold text-[10px] uppercase tracking-wider mb-1">
                                <Users className="w-3.5 h-3.5" /> Total Clientes
                            </div>
                            <div className="text-2xl font-bold text-blue-700">{resumen.total_clientes}</div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between"><span className="text-slate-500">Clientes {anio1}:</span><span className="font-semibold">{resumen.clientes_anio1}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Clientes {anio2}:</span><span className="font-semibold">{resumen.clientes_anio2}</span></div>
                        </div>
                        <hr className="border-slate-200" />
                        <div className="flex items-center gap-1 text-slate-600 font-semibold text-[10px] uppercase tracking-wider"><TrendingUp className="w-3.5 h-3.5" /> Ventas</div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between"><span className="text-slate-500">{anio1}:</span><span className="font-semibold">{fmt(resumen.ventas_anio1)} €</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">{anio2}:</span><span className="font-semibold">{fmt(resumen.ventas_anio2)} €</span></div>
                        </div>
                        <hr className="border-slate-200" />
                        <div className="space-y-1.5">
                            <div className="flex justify-between"><span className="text-red-500 flex items-center gap-0.5"><ArrowDownRight className="w-3 h-3" />Bajada:</span><span className="font-semibold text-red-500">{resumen.cli_bajada}</span></div>
                            <div className="flex justify-between"><span className="text-green-600 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" />Subida:</span><span className="font-semibold text-green-600">{resumen.cli_subida}</span></div>
                            <div className="flex justify-between"><span className="text-green-600 flex items-center gap-0.5"><UserPlus className="w-3 h-3" />Nuevos:</span><span className="font-semibold text-green-600">{resumen.cli_nuevos}</span></div>
                            <div className="flex justify-between"><span className="text-red-500 flex items-center gap-0.5"><UserMinus className="w-3 h-3" />Perdidos:</span><span className="font-semibold text-red-500">{resumen.cli_perdidos}</span></div>
                        </div>
                        <hr className="border-slate-200" />
                        <button onClick={exportCSV} className="btn-primary !py-1 !px-3 text-[11px] flex items-center gap-1 !bg-green-600 hover:!bg-green-700 w-full justify-center">
                            <Download className="w-3 h-3" /> Exportar CSV
                        </button>
                    </div>
                )}
            </div>

            {/* FichaCliente Modal */}
            {fichaCliente && (
                <FichaCliente
                    cliCodigo={fichaCliente.codigo}
                    cliNombre={fichaCliente.nombre}
                    initialAnio={anio2}
                    onClose={() => setFichaCliente(null)}
                />
            )}
        </>
    )
}

/* ══════════════════════════════════════════════════════════════
   TAB 2: VENTAS POR AGENTE
   ══════════════════════════════════════════════════════════════ */

function TabAgentes({ visible, params, loadKey, anio1, anio2, busqueda, setBusqueda }: {
    visible: boolean; params: Record<string, string>; loadKey: number
    anio1: number; anio2: number; busqueda: string; setBusqueda: (v: string) => void
}) {
    const [data, setData] = useState<AgenteRow[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const lastKey = useRef(0)
    const [expanded, setExpanded] = useState<Set<number>>(new Set())

    // Modales
    const [fichaAgente, setFichaAgente] = useState<{ codigo: number; nombre: string } | null>(null)
    const [fichaCliente, setFichaCliente] = useState<{ codigo: number; nombre: string } | null>(null)

    useEffect(() => {
        if (visible && loadKey > 0 && loadKey !== lastKey.current) {
            lastKey.current = loadKey; doLoad()
        }
    }, [visible, loadKey])

    async function doLoad() {
        setLoading(true)
        try {
            const { data: d } = await api.get('/api/informes/comparativa-ventas-agentes', { params })
            setData(d.agentes); setLoaded(true)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const toggle = (code: number) => setExpanded(p => {
        const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n
    })

    const filtered = busqueda
        ? data.filter(a => a.agente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            a.clientes.some(c => c.cli_nombre?.toLowerCase().includes(busqueda.toLowerCase())))
        : data

    if (!visible) return null

    return (
        <>
            <SearchBar busqueda={busqueda} setBusqueda={setBusqueda} count={filtered.length} placeholder="Buscar agente o cliente..." />
            <div className="flex-1 overflow-auto">
                {!loaded && !loading ? <EmptyState /> : loading ? <LoadingState /> : (
                    <div className="text-xs">
                        {filtered.map(ag => {
                            const isOpen = expanded.has(ag.agente_codigo)
                            const col = colorVar(ag.ventas_anio1, ag.ventas_anio2)
                            return (
                                <div key={ag.agente_codigo}>
                                    {/* Agent row */}
                                    <div className={`grid grid-cols-[1fr_120px_120px_120px] gap-1 py-1.5 px-3 cursor-pointer hover:bg-blue-50 font-semibold border-b border-slate-200 ${col}`}
                                        onClick={() => toggle(ag.agente_codigo)}>
                                        <div className="flex items-center gap-1">
                                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                                            <span className="truncate hover:underline text-blue-700 hover:text-blue-900"
                                                title="Abrir ficha de agente"
                                                onClick={e => { e.stopPropagation(); setFichaAgente({ codigo: ag.agente_codigo, nombre: ag.agente_nombre }) }}>
                                                {ag.agente_nombre}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-slate-400 mr-1">Ventas {anio1}:</span>{fmt(ag.ventas_anio1)} €
                                        </div>
                                        <div className="text-right">
                                            <span className="text-slate-400 mr-1">Ventas {anio2}:</span>{fmt(ag.ventas_anio2)} €
                                        </div>
                                        <div className="text-right">
                                            <span className="text-slate-400 mr-1">Pendiente:</span>
                                            <span className={ag.pendiente > 0 ? 'text-amber-600' : ''}>{fmt(ag.pendiente)} €</span>
                                        </div>
                                    </div>
                                    {/* Client rows */}
                                    {isOpen && ag.clientes.map(c => {
                                        const cc = c.ventas_anio1 > 0 && c.ventas_anio2 === 0 ? 'text-red-500'
                                            : c.ventas_anio1 === 0 && c.ventas_anio2 > 0 ? 'text-green-600'
                                                : colorVar(c.ventas_anio1, c.ventas_anio2)
                                        return (
                                            <div key={c.cli_codigo}
                                                className={`grid grid-cols-[1fr_120px_120px_120px] gap-1 py-1 px-3 pl-10 border-b border-slate-50 hover:bg-slate-50 ${cc}`}>
                                                <div className="truncate cursor-pointer hover:underline text-blue-700 hover:text-blue-900"
                                                    onClick={() => setFichaCliente({ codigo: c.cli_codigo, nombre: c.cli_nombre })}>
                                                    {c.cli_nombre}
                                                </div>
                                                <div className="text-right">{c.ventas_anio1 ? `${fmt(c.ventas_anio1)} €` : '0,00 €'}</div>
                                                <div className="text-right">{c.ventas_anio2 ? `${fmt(c.ventas_anio2)} €` : '0,00 €'}</div>
                                                <div className="text-right">
                                                    <span className={c.pendiente > 0 ? 'text-amber-600' : ''}>{fmt(c.pendiente)} €</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* FichaAgente Modal */}
            {fichaAgente && (
                <FichaAgente
                    agenteCodigo={fichaAgente.codigo}
                    agenteNombre={fichaAgente.nombre}
                    initialAnio={anio2}
                    onClose={() => setFichaAgente(null)}
                />
            )}

            {/* FichaCliente Modal */}
            {fichaCliente && (
                <FichaCliente
                    cliCodigo={fichaCliente.codigo}
                    cliNombre={fichaCliente.nombre}
                    initialAnio={anio2}
                    onClose={() => setFichaCliente(null)}
                />
            )}
        </>
    )
}

/* ══════════════════════════════════════════════════════════════
   TAB 3: VENTAS POR ARTÍCULOS
   ══════════════════════════════════════════════════════════════ */

function TabArticulos({ visible, params, loadKey, anio1, anio2, busqueda, setBusqueda }: {
    visible: boolean; params: Record<string, string>; loadKey: number
    anio1: number; anio2: number; busqueda: string; setBusqueda: (v: string) => void
}) {
    const [data, setData] = useState<ArticuloRow[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const lastKey = useRef(0)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [fichaArticulo, setFichaArticulo] = useState<{ referencia: string; descripcion: string } | null>(null)

    useEffect(() => {
        if (visible && loadKey > 0 && loadKey !== lastKey.current) {
            lastKey.current = loadKey; doLoad()
        }
    }, [visible, loadKey])

    async function doLoad() {
        setLoading(true)
        try {
            const { data: d } = await api.get('/api/informes/comparativa-ventas-articulos', { params })
            setData(d.articulos); setLoaded(true)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const toggle = (ref: string) => setExpanded(p => {
        const n = new Set(p); n.has(ref) ? n.delete(ref) : n.add(ref); return n
    })

    const filtered = busqueda
        ? data.filter(a => a.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) || a.referencia?.toLowerCase().includes(busqueda.toLowerCase()))
        : data

    if (!visible) return null

    return (
        <>
            <SearchBar busqueda={busqueda} setBusqueda={setBusqueda} count={filtered.length} placeholder="Buscar artículo..." />
            <div className="flex-1 overflow-auto">
                {!loaded && !loading ? <EmptyState /> : loading ? <LoadingState /> : (
                    <div className="text-xs">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_100px_100px_70px_70px_70px] gap-1 px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm sticky top-0 z-10">

                            <div>Artículo</div>
                            <div className="text-right">{anio1} €</div>
                            <div className="text-right">{anio2} €</div>
                            <div className="text-right">{anio1} uds</div>
                            <div className="text-right">{anio2} uds</div>
                            <div className="text-right">Stock</div>
                        </div>
                        {filtered.map(art => {
                            const isOpen = expanded.has(art.referencia)
                            const col = colorVar(art.importe_anio1, art.importe_anio2)
                            return (
                                <div key={art.referencia}>
                                    <div className={`grid grid-cols-[1fr_100px_100px_70px_70px_70px] gap-1 px-3 py-1 cursor-pointer hover:bg-blue-50 border-b border-slate-100 ${col}`}
                                        onClick={() => toggle(art.referencia)}>
                                        <div className="flex items-center gap-1 truncate">
                                            {art.clientes.length > 0 && (isOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />)}
                                            <span className="truncate hover:underline text-blue-700 hover:text-blue-900 cursor-pointer"
                                                title="Abrir ficha del artículo"
                                                onClick={e => { e.stopPropagation(); setFichaArticulo({ referencia: art.referencia, descripcion: art.descripcion }) }}>
                                                {art.descripcion || art.referencia}
                                            </span>
                                        </div>
                                        <div className="text-right font-medium">{art.importe_anio1 ? `${fmt(art.importe_anio1)} €` : '0,00 €'}</div>
                                        <div className="text-right font-medium">{art.importe_anio2 ? `${fmt(art.importe_anio2)} €` : '0,00 €'}</div>
                                        <div className="text-right">{art.uds_anio1 ? fmtInt(art.uds_anio1) + ' uds' : '0 uds'}</div>
                                        <div className="text-right">{art.uds_anio2 ? fmtInt(art.uds_anio2) + ' uds' : '0 uds'}</div>
                                        <div className="text-right">
                                            <span className={art.stock === 0 ? 'text-amber-500' : 'text-slate-600'}>
                                                Stock: {art.stock}
                                                {art.stock === 0 && ' ⚠'}
                                            </span>
                                        </div>
                                    </div>
                                    {isOpen && art.clientes.map((c, i) => {
                                        const cc = colorVar(c.importe_anio1, c.importe_anio2)
                                        return (
                                            <div key={i} className={`grid grid-cols-[1fr_100px_100px_70px_70px_70px] gap-1 px-3 pl-10 py-0.5 border-b border-slate-50 hover:bg-slate-50 ${cc}`}>
                                                <div className="truncate">{c.cli_nombre}</div>
                                                <div className="text-right">{c.importe_anio1 ? `${fmt(c.importe_anio1)} €` : ''}</div>
                                                <div className="text-right">{c.importe_anio2 ? `${fmt(c.importe_anio2)} €` : ''}</div>
                                                <div className="text-right">{c.uds_anio1 ? fmtInt(c.uds_anio1) + ' uds' : ''}</div>
                                                <div className="text-right">{c.uds_anio2 ? fmtInt(c.uds_anio2) + ' uds' : ''}</div>
                                                <div></div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {fichaArticulo && (
                <FichaArticulo
                    referencia={fichaArticulo.referencia}
                    descripcion={fichaArticulo.descripcion}
                    initialAnio={anio2}
                    onClose={() => setFichaArticulo(null)}
                />
            )}
        </>
    )
}

/* ══════════════════════════════════════════════════════════════
   TAB 4: VENTAS POR FAMILIA
   ══════════════════════════════════════════════════════════════ */

function TabFamilias({ visible, params, loadKey, anio1, anio2, busqueda, setBusqueda }: {
    visible: boolean; params: Record<string, string>; loadKey: number
    anio1: number; anio2: number; busqueda: string; setBusqueda: (v: string) => void
}) {
    const [items, setItems] = useState<FamItem[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const lastKey = useRef(0)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (visible && loadKey > 0 && loadKey !== lastKey.current) {
            lastKey.current = loadKey; doLoad()
        }
    }, [visible, loadKey])

    async function doLoad() {
        setLoading(true)
        try {
            const { data: d } = await api.get('/api/informes/comparativa-ventas-familias', { params })
            setItems(d.items); setLoaded(true)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const toggle = (key: string) => setExpanded(p => {
        const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n
    })

    // Build tree: familia > articulo > cliente
    type ArtNode = { ref: string; descr: string; imp1: number; imp2: number; uds1: number; uds2: number; clientes: { nombre: string; imp1: number; imp2: number; uds1: number; uds2: number }[] }
    type FamNode = { imp1: number; imp2: number; uds1: number; uds2: number; articulos: Record<string, ArtNode> }

    const buildFamTree = () => {
        const tree: Record<string, FamNode> = {}
        const fItems = busqueda
            ? items.filter(i => i.familia.toLowerCase().includes(busqueda.toLowerCase()) || i.descripcion?.toLowerCase().includes(busqueda.toLowerCase()))
            : items
        for (const item of fItems) {
            const fk = item.familia
            if (!tree[fk]) tree[fk] = { imp1: 0, imp2: 0, uds1: 0, uds2: 0, articulos: {} }
            const rk = `${item.referencia}|${item.descripcion}`
            if (!tree[fk].articulos[rk]) tree[fk].articulos[rk] = { ref: item.referencia, descr: item.descripcion, imp1: 0, imp2: 0, uds1: 0, uds2: 0, clientes: [] }
            tree[fk].articulos[rk].imp1 += item.importe_anio1
            tree[fk].articulos[rk].imp2 += item.importe_anio2
            tree[fk].articulos[rk].uds1 += item.uds_anio1
            tree[fk].articulos[rk].uds2 += item.uds_anio2
            tree[fk].articulos[rk].clientes.push({ nombre: item.cli_nombre, imp1: item.importe_anio1, imp2: item.importe_anio2, uds1: item.uds_anio1, uds2: item.uds_anio2 })
            tree[fk].imp1 += item.importe_anio1
            tree[fk].imp2 += item.importe_anio2
            tree[fk].uds1 += item.uds_anio1
            tree[fk].uds2 += item.uds_anio2
        }
        return tree
    }

    if (!visible) return null

    const tree = loaded ? buildFamTree() : {}
    const famCount = Object.keys(tree).length

    return (
        <>
            <SearchBar busqueda={busqueda} setBusqueda={setBusqueda} count={famCount} placeholder="Buscar familia o artículo..." />
            <div className="flex-1 overflow-auto">
                {!loaded && !loading ? <EmptyState /> : loading ? <LoadingState /> : (
                    <div className="text-xs">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_110px_110px_80px_80px] gap-1 px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm sticky top-0 z-10">
                            <div>Familia / Artículo / Cliente</div>
                            <div className="text-right">{anio1} €</div>
                            <div className="text-right">{anio2} €</div>
                            <div className="text-right">{anio1} uds</div>
                            <div className="text-right">{anio2} uds</div>
                        </div>
                        {Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)).map(([fam, fN]) => (
                            <div key={fam}>
                                {/* Familia */}
                                <div className={`grid grid-cols-[1fr_110px_110px_80px_80px] gap-1 px-3 py-1.5 cursor-pointer hover:bg-blue-50 font-bold border-b border-slate-200 ${colorVar(fN.imp1, fN.imp2)}`}
                                    onClick={() => toggle(`f:${fam}`)}>
                                    <div className="flex items-center gap-1">
                                        {expanded.has(`f:${fam}`) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        {fam}
                                    </div>
                                    <div className="text-right">{fmt(fN.imp1)} €</div>
                                    <div className="text-right">{fmt(fN.imp2)} €</div>
                                    <div className="text-right">{fmtInt(fN.uds1)} uds</div>
                                    <div className="text-right">{fmtInt(fN.uds2)} uds</div>
                                </div>
                                {expanded.has(`f:${fam}`) && Object.values(fN.articulos).sort((a, b) => a.descr.localeCompare(b.descr)).map(art => (
                                    <div key={art.ref}>
                                        {/* Artículo */}
                                        <div className={`grid grid-cols-[1fr_110px_110px_80px_80px] gap-1 px-3 pl-8 py-1 cursor-pointer hover:bg-slate-50 font-medium border-b border-slate-100 ${colorVar(art.imp1, art.imp2)}`}
                                            onClick={() => toggle(`a:${fam}:${art.ref}`)}>
                                            <div className="flex items-center gap-1 truncate">
                                                {art.clientes.length > 1 && (expanded.has(`a:${fam}:${art.ref}`) ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />)}
                                                <span className="truncate">{art.descr || art.ref}</span>
                                            </div>
                                            <div className="text-right">{art.imp1 ? `${fmt(art.imp1)} €` : ''}</div>
                                            <div className="text-right">{art.imp2 ? `${fmt(art.imp2)} €` : ''}</div>
                                            <div className="text-right">{art.uds1 ? `${fmtInt(art.uds1)} uds` : ''}</div>
                                            <div className="text-right">{art.uds2 ? `${fmtInt(art.uds2)} uds` : ''}</div>
                                        </div>
                                        {expanded.has(`a:${fam}:${art.ref}`) && art.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((cl, i) => (
                                            <div key={i} className={`grid grid-cols-[1fr_110px_110px_80px_80px] gap-1 px-3 pl-14 py-0.5 border-b border-slate-50 hover:bg-slate-50 text-slate-500`}>
                                                <div className="truncate">{cl.nombre}</div>
                                                <div className="text-right">{cl.imp1 ? `${fmt(cl.imp1)} €` : ''}</div>
                                                <div className="text-right">{cl.imp2 ? `${fmt(cl.imp2)} €` : ''}</div>
                                                <div className="text-right">{cl.uds1 ? `${fmtInt(cl.uds1)} uds` : ''}</div>
                                                <div className="text-right">{cl.uds2 ? `${fmtInt(cl.uds2)} uds` : ''}</div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    )
}

/* ══════════════════════════════════════════════════════════════
   TAB 5: SEGUIMIENTO
   ══════════════════════════════════════════════════════════════ */

function TabSeguimiento({ visible, params, loadKey, anio1, anio2, busqueda, setBusqueda }: {
    visible: boolean; params: Record<string, string>; loadKey: number
    anio1: number; anio2: number; busqueda: string; setBusqueda: (v: string) => void
}) {
    const [data, setData] = useState<SeguimientoRow[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const lastKey = useRef(0)
    const [expanded, setExpanded] = useState<Set<number>>(new Set())
    const [noCompraMeses, setNoCompraMeses] = useState<string>('')

    useEffect(() => {
        if (visible && loadKey > 0 && loadKey !== lastKey.current) {
            lastKey.current = loadKey; doLoad()
        }
    }, [visible, loadKey])

    async function doLoad() {
        setLoading(true)
        try {
            const p = { ...params }
            if (noCompraMeses) p.no_compra_meses = noCompraMeses
            const { data: d } = await api.get('/api/informes/seguimiento-clientes', { params: p })
            setData(d.clientes); setLoaded(true)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const toggle = (code: number) => setExpanded(p => {
        const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n
    })

    const filtered = busqueda
        ? data.filter(c => c.cli_nombre?.toLowerCase().includes(busqueda.toLowerCase()))
        : data

    if (!visible) return null

    return (
        <>
            <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1 bg-slate-50 rounded-md px-2.5 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-300" placeholder="Buscar cliente..." />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[11px] text-slate-500">Clientes que NO compran desde hace</span>
                    <select value={noCompraMeses} onChange={e => setNoCompraMeses(e.target.value)}
                        className="input !py-1 text-[11px]">
                        <option value="">Todos</option>
                        <option value="1">1 mes</option><option value="2">2 meses</option>
                        <option value="3">3 meses</option><option value="6">6 meses</option>
                        <option value="12">12 meses</option><option value="24">24 meses</option>
                    </select>
                    <span className="text-[10px] text-slate-400 tabular-nums font-medium bg-slate-100 px-2 py-0.5 rounded-full">{filtered.length} clientes</span>
                </div>
            </div>
            <div className="flex-1 overflow-auto">
                {!loaded && !loading ? <EmptyState /> : loading ? <LoadingState /> : (
                    <div className="text-xs">
                        {filtered.map(c => {
                            const isOpen = expanded.has(c.cli_codigo)
                            const diff = c.ventas_anio2 - c.ventas_anio1
                            const pct = c.ventas_anio1 > 0 ? ((diff / c.ventas_anio1) * 100) : (c.ventas_anio2 > 0 ? 100 : 0)
                            const isNew = c.ventas_anio1 === 0 && c.ventas_anio2 > 0
                            const col = isNew ? 'text-green-600' : diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : ''
                            return (
                                <div key={c.cli_codigo}>
                                    <div className={`grid grid-cols-[1fr_100px_100px_30px_90px_80px_80px] gap-1 px-3 py-1.5 cursor-pointer hover:bg-blue-50 border-b border-slate-200 font-medium ${col}`}
                                        onClick={() => toggle(c.cli_codigo)}>
                                        <div className="flex items-center gap-1 truncate">
                                            {isOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                                            <span className="truncate">{c.cli_nombre}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-slate-400 mr-1">{anio1}:</span>
                                            {c.ventas_anio1 ? `${fmt(c.ventas_anio1)} €` : '0,00 €'}
                                        </div>
                                        <div className="text-right">
                                            <span className="text-slate-400 mr-1">{anio2}:</span>
                                            {c.ventas_anio2 ? `${fmt(c.ventas_anio2)} €` : '0,00 €'}
                                        </div>
                                        <div className="text-center">
                                            {diff > 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-green-600 inline" /> :
                                                diff < 0 ? <ArrowDownRight className="w-3.5 h-3.5 text-red-500 inline" /> : null}
                                        </div>
                                        <div className="text-right">{diff !== 0 ? `${diff > 0 ? '+' : ''}${fmt(diff)}` : ''}</div>
                                        <div className="text-right">{c.ventas_anio1 > 0 && diff !== 0 ? `${pct > 0 ? '↑' : '↓'}% :${Math.abs(pct).toFixed(2)} %` : ''}</div>
                                        <div className="text-right">{isNew && <span className="text-green-600 font-bold">Nuevo</span>}</div>
                                    </div>
                                    {isOpen && c.meses.map(m => {
                                        const md = m.v2 - m.v1
                                        const mp = m.v1 > 0 ? ((md / m.v1) * 100) : 0
                                        const mc = md > 0 ? 'text-green-600' : md < 0 ? 'text-red-500' : 'text-slate-400'
                                        return (
                                            <div key={m.mes}
                                                className={`grid grid-cols-[1fr_100px_100px_30px_90px_80px_80px] gap-1 px-3 pl-10 py-0.5 border-b border-slate-50 hover:bg-slate-50 ${mc}`}>
                                                <div>{MESES_FULL[m.mes - 1]}</div>
                                                <div className="text-right">
                                                    <span className="text-slate-400 mr-1">{anio1}:</span>
                                                    {m.v1 ? `${fmt(m.v1)} €` : '0,00 €'}
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-slate-400 mr-1">{anio2}:</span>
                                                    {m.v2 ? `${fmt(m.v2)} €` : '0,00 €'}
                                                </div>
                                                <div className="text-center">
                                                    {md > 0 ? <ArrowUpRight className="w-3 h-3 text-green-600 inline" /> :
                                                        md < 0 ? <ArrowDownRight className="w-3 h-3 text-red-500 inline" /> : null}
                                                </div>
                                                <div className="text-right">{md !== 0 ? `${md > 0 ? '+€: ' : '-€: '}${fmt(Math.abs(md))}` : '+€: 0,00'}</div>
                                                <div className="text-right">{m.v1 > 0 ? `${mp.toFixed(2)}%` : '0.00%'}</div>
                                                <div></div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </>
    )
}

/* ══════════════════════════════════════════════════════════════
   TAB 6: CONDICIONES ESPECIALES
   ══════════════════════════════════════════════════════════════ */

function TabCondiciones({ visible, loadKey, busqueda, setBusqueda }: {
    visible: boolean; loadKey: number; busqueda: string; setBusqueda: (v: string) => void
}) {
    const [data, setData] = useState<CondRow[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const loadedOnce = useRef(false)
    const [expanded, setExpanded] = useState<Set<number>>(new Set())

    useEffect(() => {
        if (visible && !loadedOnce.current) {
            loadedOnce.current = true; doLoad()
        }
    }, [visible])

    async function doLoad() {
        setLoading(true)
        try {
            const { data: d } = await api.get('/api/informes/condiciones-especiales')
            setData(d.clientes); setLoaded(true)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const toggle = (code: number) => setExpanded(p => {
        const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n
    })

    const filtered = busqueda
        ? data.filter(c => c.cli_nombre?.toLowerCase().includes(busqueda.toLowerCase()))
        : data

    if (!visible) return null

    return (
        <>
            <SearchBar busqueda={busqueda} setBusqueda={setBusqueda} count={filtered.length} placeholder="Buscar cliente..." />
            <div className="flex-1 overflow-auto">
                {!loaded && !loading ? <LoadingState /> : loading ? <LoadingState /> : (
                    <div className="text-xs p-2">
                        <div className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider px-3 py-2.5 border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm">
                            Cliente / Condición especial
                        </div>
                        {filtered.map(c => {
                            const isOpen = expanded.has(c.cli_codigo)
                            return (
                                <div key={c.cli_codigo}>
                                    <div className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 border-b border-slate-100 flex items-center gap-1 font-medium text-blue-800"
                                        onClick={() => toggle(c.cli_codigo)}>
                                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        <span>{c.cli_codigo} - {c.cli_nombre}</span>
                                        <span className="text-slate-500 ml-1">(Tarifa: {c.tarifaespecial})</span>
                                    </div>
                                    {isOpen && (
                                        <div className="pl-10 py-1 border-b border-slate-50">
                                            {c.detalle.length === 0 ? (
                                                <div className="text-slate-400 italic">(Sin detalle en la tarifa)</div>
                                            ) : (
                                                <div className="space-y-0.5">
                                                    {c.detalle.map((d, i) => (
                                                        <div key={i} className="flex items-center gap-3 text-slate-600 hover:bg-slate-50 px-2 py-0.5 rounded">
                                                            {d.referencia && <span className="font-mono text-slate-400">{d.referencia}</span>}
                                                            <span>{d.art_nombre || d.fam_nombre || 'General'}</span>
                                                            {d.descuento > 0 && <span className="text-green-600">Dto: {d.descuento}%</span>}
                                                            {d.precio > 0 && <span className="text-blue-600">Precio: {fmt(d.precio)} €</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </>
    )
}
