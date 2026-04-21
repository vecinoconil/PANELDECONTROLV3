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
        <div className="p-6 flex flex-col gap-4 h-full">
            {/* Header */}
            <div className="flex items-center gap-2">
                <BookText className="w-5 h-5 text-brand" />
                <h1 className="text-xl font-bold">Contabilidad</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b">
                {(['emitidas', 'recibidas'] as Tab[]).map(t => (
                    <button key={t} onClick={() => { setTab(t); setFacturas([]); setBuscado(false) }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        {t === 'emitidas' ? 'Facturas Emitidas' : 'Facturas Recibidas'}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3 bg-white border rounded-lg px-4 py-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Año</label>
                    <select value={anio} onChange={e => handleAnioChange(Number(e.target.value))}
                        className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand">
                        {Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Período</label>
                    <select value={trimestre} onChange={e => applyTrim(e.target.value as Trimestre, anio)}
                        className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand">
                        {TRIMESTRES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Desde</label>
                    <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setTrimestre('anio') }}
                        className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Hasta</label>
                    <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setTrimestre('anio') }}
                        className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand" />
                </div>
                <button onClick={buscar} disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50">
                    <Search size={14} />
                    {loading ? 'Cargando...' : 'Buscar'}
                </button>
                {buscado && facturas.length > 0 && (
                    <button onClick={exportarCSV}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                        <Download size={14} /> Exportar CSV
                    </button>
                )}
                {buscado && (
                    <span className="ml-auto text-sm text-slate-500 font-medium">
                        {facturas.length} {tab === 'emitidas' ? 'facturas emitidas' : 'facturas recibidas'}
                    </span>
                )}
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-2">{error}</div>}

            {/* Table */}
            {buscado && (
                <div className="bg-white border rounded-lg overflow-auto flex-1">
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
