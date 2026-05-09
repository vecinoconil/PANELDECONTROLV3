import { useState, useMemo } from 'react'
import { api } from '../../api/client'
import { BookText, Download, Search } from 'lucide-react'
import type { LibroIVALinea } from '../../types'

type Tab = 'emitidas' | 'recibidas'
type Trimestre = 'anio' | '1T' | '2T' | '3T' | '4T'

const TRIMESTRES: { key: Trimestre; label: string }[] = [
    { key: 'anio', label: 'Año completo' },
    { key: '1T', label: '1T (Ene–Mar)' },
    { key: '2T', label: '2T (Abr–Jun)' },
    { key: '3T', label: '3T (Jul–Sep)' },
    { key: '4T', label: '4T (Oct–Dic)' },
]

const TRIM_RANGES: Record<string, (y: number) => [string, string]> = {
    '1T':  y => [`${y}-01-01`, `${y}-03-31`],
    '2T':  y => [`${y}-04-01`, `${y}-06-30`],
    '3T':  y => [`${y}-07-01`, `${y}-09-30`],
    '4T':  y => [`${y}-10-01`, `${y}-12-31`],
    'anio':y => [`${y}-01-01`, `${y}-12-31`],
}

function fmt2(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function LibroIVA() {
    const hoy = new Date()
    const [tab, setTab] = useState<Tab>('emitidas')
    const [anio, setAnio] = useState(hoy.getFullYear())
    const [trimestre, setTrimestre] = useState<Trimestre>('anio')
    const [desde, setDesde] = useState(`${hoy.getFullYear()}-01-01`)
    const [hasta, setHasta] = useState(`${hoy.getFullYear()}-12-31`)
    const [facturas, setFacturas] = useState<LibroIVALinea[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [buscado, setBuscado] = useState(false)

    const applyTrim = (t: Trimestre, yr: number) => {
        const [d, h] = TRIM_RANGES[t](yr)
        setDesde(d); setHasta(h); setTrimestre(t)
    }

    const handleAnioChange = (yr: number) => {
        setAnio(yr)
        applyTrim(trimestre, yr)
    }

    const buscar = async () => {
        setLoading(true); setError('')
        try {
            const { data } = await api.get('/api/contabilidad/libro-iva', {
                params: { tipo: tab, desde, hasta }
            })
            setFacturas(data.facturas)
            setBuscado(true)
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando datos')
        } finally { setLoading(false) }
    }

    // Derived flags (hide empty columns)
    const hasTier2 = useMemo(() => facturas.some(f => f.baseimpo2 !== 0 || f.iva2 !== 0), [facturas])
    const hasTier3 = useMemo(() => facturas.some(f => f.baseimpo3 !== 0 || f.iva3 !== 0), [facturas])
    const hasRec   = useMemo(() => facturas.some(f => f.rec1 !== 0 || f.rec2 !== 0 || f.rec3 !== 0), [facturas])
    const hasIRPF  = useMemo(() => facturas.some(f => f.irpf !== 0), [facturas])

    const formasPago = useMemo(() =>
        [...new Set(facturas.map(f => f.fpago_nombre))].sort(),
        [facturas]
    )

    const totales = useMemo(() => {
        const t = { base1: 0, iva1: 0, rec1: 0, base2: 0, iva2: 0, rec2: 0, base3: 0, iva3: 0, rec3: 0, irpf: 0, total: 0, pendiente: 0, porFpago: {} as Record<string, number> }
        for (const f of facturas) {
            t.base1 += f.baseimpo1; t.iva1 += f.iva1; t.rec1 += f.rec1
            t.base2 += f.baseimpo2; t.iva2 += f.iva2; t.rec2 += f.rec2
            t.base3 += f.baseimpo3; t.iva3 += f.iva3; t.rec3 += f.rec3
            t.irpf += f.irpf; t.total += f.total; t.pendiente += f.pendiente
            t.porFpago[f.fpago_nombre] = (t.porFpago[f.fpago_nombre] || 0) + f.total
        }
        return t
    }, [facturas])

    const exportarCSV = () => {
        const BOM = '\uFEFF'
        const terceroLabel = tab === 'emitidas' ? 'Cliente' : 'Proveedor'
        const headers = [
            'Fecha', 'Serie', 'Número', terceroLabel,
            'Base 1', '%IVA 1', 'Cuota IVA 1',
            ...(hasRec ? ['Rec. Equiv. 1'] : []),
            ...(hasTier2 ? ['Base 2', '%IVA 2', 'Cuota IVA 2', ...(hasRec ? ['Rec. Equiv. 2'] : [])] : []),
            ...(hasTier3 ? ['Base 3', '%IVA 3', 'Cuota IVA 3', ...(hasRec ? ['Rec. Equiv. 3'] : [])] : []),
            ...(hasIRPF ? ['IRPF'] : []),
            'Total',
            ...formasPago,
            'Pendiente',
        ]
        const rows = facturas.map(f => [
            f.fecha, f.serie, f.numero, `"${f.nombre_tercero}"`,
            f.baseimpo1.toFixed(2), f.piva1.toFixed(2), f.iva1.toFixed(2),
            ...(hasRec ? [f.rec1.toFixed(2)] : []),
            ...(hasTier2 ? [f.baseimpo2.toFixed(2), f.piva2.toFixed(2), f.iva2.toFixed(2), ...(hasRec ? [f.rec2.toFixed(2)] : [])] : []),
            ...(hasTier3 ? [f.baseimpo3.toFixed(2), f.piva3.toFixed(2), f.iva3.toFixed(2), ...(hasRec ? [f.rec3.toFixed(2)] : [])] : []),
            ...(hasIRPF ? [f.irpf.toFixed(2)] : []),
            f.total.toFixed(2),
            ...formasPago.map(fp => (fp === f.fpago_nombre ? f.total : 0).toFixed(2)),
            f.pendiente.toFixed(2),
        ].join(';'))
        const csv = BOM + [headers.join(';'), ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url
        a.download = `libro_iva_${tab}_${desde}_${hasta}.csv`
        a.click(); URL.revokeObjectURL(url)
    }

    const thCls = 'py-1.5 px-2 text-right text-[11px] font-semibold text-slate-500 whitespace-nowrap border-b bg-slate-50'
    const thLCls = 'py-1.5 px-2 text-left text-[11px] font-semibold text-slate-500 whitespace-nowrap border-b bg-slate-50'
    const tdCls = 'py-1 px-2 text-right text-xs font-mono whitespace-nowrap'
    const tdLCls = 'py-1 px-2 text-left text-xs whitespace-nowrap'
    const ftCls = 'py-1.5 px-2 text-right text-xs font-bold font-mono bg-slate-100 border-t border-slate-300 whitespace-nowrap'
    const ftLCls = 'py-1.5 px-2 text-left text-xs font-bold bg-slate-100 border-t border-slate-300'

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-white shadow-sm flex-shrink-0 px-3 md:px-6 pt-3 md:pt-5 pb-2">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-sm flex-shrink-0">
                            <BookText className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800 leading-tight">Contabilidad</h1>
                            <p className="text-[10px] text-slate-400">Libro de IVA</p>
                        </div>
                    </div>
                    {buscado && facturas.length > 0 && (
                        <button onClick={exportarCSV}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 flex-shrink-0">
                            <Download size={13} /> CSV
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-0.5 border-b border-slate-200">
                    {(['emitidas', 'recibidas'] as Tab[]).map(t => (
                        <button key={t} onClick={() => { setTab(t); setFacturas([]); setBuscado(false) }}
                            className={`px-3 md:px-5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            {t === 'emitidas' ? 'Emitidas' : 'Recibidas'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="flex-shrink-0 bg-slate-50 border-b border-slate-200 px-3 md:px-6 py-2.5">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Año</label>
                        <select value={anio} onChange={e => handleAnioChange(Number(e.target.value))}
                            className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-violet-400">
                            {Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Período</label>
                        <select value={trimestre} onChange={e => applyTrim(e.target.value as Trimestre, anio)}
                            className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-violet-400">
                            {TRIMESTRES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Desde</label>
                        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setTrimestre('anio') }}
                            className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-violet-400" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Hasta</label>
                        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setTrimestre('anio') }}
                            className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-violet-400" />
                    </div>
                    <button onClick={buscar} disabled={loading}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50">
                        <Search size={13} />
                        {loading ? 'Cargando...' : 'Buscar'}
                    </button>
                    {buscado && (
                        <span className="text-xs text-slate-500 font-medium ml-1">
                            {facturas.length} {tab === 'emitidas' ? 'emitidas' : 'recibidas'}
                        </span>
                    )}
                </div>
            </div>

            {error && <div className="mx-3 md:mx-6 mt-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>}

            {/* Table */}
            {buscado && (
                <div className="flex-1 overflow-auto bg-white">
                    <table className="text-xs w-max min-w-full">
                        <thead>
                            <tr>
                                <th className={thLCls}>Fecha</th>
                                <th className={thLCls}>Doc</th>
                                <th className={`${thLCls} min-w-[200px]`}>{tab === 'emitidas' ? 'Cliente' : 'Proveedor'}</th>
                                <th className={thCls}>Base 1</th>
                                <th className={thCls}>%IVA 1</th>
                                <th className={thCls}>IVA 1</th>
                                {hasRec && <th className={thCls}>Rec. 1</th>}
                                {hasTier2 && <>
                                    <th className={thCls}>Base 2</th>
                                    <th className={thCls}>%IVA 2</th>
                                    <th className={thCls}>IVA 2</th>
                                    {hasRec && <th className={thCls}>Rec. 2</th>}
                                </>}
                                {hasTier3 && <>
                                    <th className={thCls}>Base 3</th>
                                    <th className={thCls}>%IVA 3</th>
                                    <th className={thCls}>IVA 3</th>
                                    {hasRec && <th className={thCls}>Rec. 3</th>}
                                </>}
                                {hasIRPF && <th className={thCls}>IRPF</th>}
                                <th className={`${thCls} bg-blue-50 text-blue-700`}>Total</th>
                                {formasPago.map(fp => (
                                    <th key={fp} className={`${thCls} bg-green-50 text-green-700`}>{fp}</th>
                                ))}
                                <th className={`${thCls} bg-red-50 text-red-700`}>Pendiente</th>
                            </tr>
                        </thead>
                        <tbody>
                            {facturas.map(f => (
                                <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className={tdLCls}>{f.fecha}</td>
                                    <td className={`${tdLCls} font-mono`}>{f.serie}/{String(f.numero).padStart(6, '0')}</td>
                                    <td className={`${tdLCls} max-w-[220px] truncate`} title={f.nombre_tercero}>{f.nombre_tercero}</td>
                                    <td className={tdCls}>{fmt2(f.baseimpo1)}</td>
                                    <td className={tdCls}>{f.piva1 > 0 ? f.piva1.toFixed(0) + '%' : '—'}</td>
                                    <td className={tdCls}>{fmt2(f.iva1)}</td>
                                    {hasRec && <td className={tdCls}>{fmt2(f.rec1)}</td>}
                                    {hasTier2 && <>
                                        <td className={tdCls}>{fmt2(f.baseimpo2)}</td>
                                        <td className={tdCls}>{f.piva2 > 0 ? f.piva2.toFixed(0) + '%' : '—'}</td>
                                        <td className={tdCls}>{fmt2(f.iva2)}</td>
                                        {hasRec && <td className={tdCls}>{fmt2(f.rec2)}</td>}
                                    </>}
                                    {hasTier3 && <>
                                        <td className={tdCls}>{fmt2(f.baseimpo3)}</td>
                                        <td className={tdCls}>{f.piva3 > 0 ? f.piva3.toFixed(0) + '%' : '—'}</td>
                                        <td className={tdCls}>{fmt2(f.iva3)}</td>
                                        {hasRec && <td className={tdCls}>{fmt2(f.rec3)}</td>}
                                    </>}
                                    {hasIRPF && <td className={tdCls}>{f.irpf !== 0 ? fmt2(f.irpf) : '—'}</td>}
                                    <td className={`${tdCls} font-semibold text-blue-700`}>{fmt2(f.total)}</td>
                                    {formasPago.map(fp => (
                                        <td key={fp} className={`${tdCls} text-green-700`}>
                                            {fp === f.fpago_nombre ? fmt2(f.total) : ''}
                                        </td>
                                    ))}
                                    <td className={`${tdCls} ${f.pendiente > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                                        {f.pendiente > 0 ? fmt2(f.pendiente) : ''}
                                    </td>
                                </tr>
                            ))}
                            {facturas.length === 0 && (
                                <tr>
                                    <td colSpan={99} className="py-10 text-center text-slate-400">
                                        Sin resultados para el período seleccionado
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {facturas.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td className={ftLCls} colSpan={3}>TOTALES</td>
                                    <td className={ftCls}>{fmt2(totales.base1)}</td>
                                    <td className={ftCls}></td>
                                    <td className={ftCls}>{fmt2(totales.iva1)}</td>
                                    {hasRec && <td className={ftCls}>{fmt2(totales.rec1)}</td>}
                                    {hasTier2 && <>
                                        <td className={ftCls}>{fmt2(totales.base2)}</td>
                                        <td className={ftCls}></td>
                                        <td className={ftCls}>{fmt2(totales.iva2)}</td>
                                        {hasRec && <td className={ftCls}>{fmt2(totales.rec2)}</td>}
                                    </>}
                                    {hasTier3 && <>
                                        <td className={ftCls}>{fmt2(totales.base3)}</td>
                                        <td className={ftCls}></td>
                                        <td className={ftCls}>{fmt2(totales.iva3)}</td>
                                        {hasRec && <td className={ftCls}>{fmt2(totales.rec3)}</td>}
                                    </>}
                                    {hasIRPF && <td className={ftCls}>{fmt2(totales.irpf)}</td>}
                                    <td className={`${ftCls} text-blue-700`}>{fmt2(totales.total)}</td>
                                    {formasPago.map(fp => (
                                        <td key={fp} className={`${ftCls} text-green-700`}>{fmt2(totales.porFpago[fp] || 0)}</td>
                                    ))}
                                    <td className={`${ftCls} text-red-600`}>{fmt2(totales.pendiente)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}
        </div>
    )
}
