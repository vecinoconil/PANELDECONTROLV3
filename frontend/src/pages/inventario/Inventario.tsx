import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { Package, Search, Save, ChevronLeft, X, Plus, Trash2, Pencil, Clock, CheckCircle2, Calculator } from 'lucide-react'

// ─── Tipos de datos ───────────────────────────────────────────────────────

interface Almacen { codigo: number; nombre: string }
interface Familia { codigo: number; nombre: string }
interface Subfamilia { codigo: number; nombre: string; familia: number }
interface Marca { codigo: number; nombre: string }

interface InvArticulo {
    referencia: string
    nombre: string
    familia: number | null
    subfamilia: number | null
    marca: number | null
    control_lotes: boolean
    tallas_colores: boolean
    grupo_tallas: number
    grupo_colores: number
    stock_actual: number
    tiene_imagen: boolean
}

interface LoteItem {
    id: number
    lote: string
    fecha_compra: string | null
    fecha_caducidad: string | null
    stock: number
}

interface TallaItem { codigo: string; nombre: string; orden: number }
interface ColorItem { codigo: string; nombre: string; codigo_rgb: string; orden: number }
interface StockTCItem { talla: string; color: string; actual: number }

interface LoteContado { id_lote: number; lote: string; unidades: number }
interface TCContado { talla: string; color: string; unidades: number }

interface InvLine {
    referencia: string
    descripcion: string
    coste: number
    unidades: number
    lotes: LoteContado[]
    tallas_colores: TCContado[]
}

type Mode = 'familia' | 'subfamilia' | 'marca' | 'sueltos'

interface HistorialItem {
    id: number
    numero: number
    serie: string
    fecha: string
    descripcion: string
    almacen: number
    almacen_nombre: string
    importe: number
    aplicado: boolean
    fecha_aplicacion: string | null
    n_lineas: number
}

const BASE = '/api/inventario'

// ─── Modal Lotes ─────────────────────────────────────────────────────────

interface LotesModalProps {
    referencia: string
    artNombre: string
    lotes: LoteItem[]
    loading: boolean
    current: LoteContado[]
    onSave: (counted: LoteContado[]) => void
    onClose: () => void
}

function LotesModal({ referencia, artNombre, lotes, loading, current, onSave, onClose }: LotesModalProps) {
    const [localCounted, setLocalCounted] = useState<Record<number, number>>(() => {
        const m: Record<number, number> = {}
        current.forEach(c => { m[c.id_lote] = c.unidades })
        return m
    })
    const [calcLote, setCalcLote] = useState<{ id: number; lote: string } | null>(null)
    const firstInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!loading && lotes.length > 0) {
            firstInputRef.current?.focus()
            firstInputRef.current?.select()
        }
    }, [loading, lotes.length])

    const handleSave = () => {
        const result: LoteContado[] = lotes
            .map(l => ({ id_lote: l.id, lote: l.lote, unidades: localCounted[l.id] ?? 0 }))
            .filter(l => l.unidades > 0)
        onSave(result)
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h3 className="font-semibold text-gray-900">Lotes — {artNombre}</h3>
                        <p className="text-xs text-gray-500 font-mono">{referencia}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <p className="text-center text-gray-500 py-8">Cargando lotes...</p>
                    ) : lotes.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Sin lotes registrados</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 text-xs border-b">
                                    <th className="pb-2 font-medium">Lote</th>
                                    <th className="pb-2 font-medium">Caducidad</th>
                                    <th className="pb-2 font-medium text-right pr-4">Stock</th>
                                    <th className="pb-2 font-medium text-right">Contado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lotes.map((l, idx) => (
                                    <tr key={l.id} className="hover:bg-gray-50">
                                        <td className="py-2.5 pr-3 font-mono text-xs">{l.lote}</td>
                                        <td className="py-2.5 pr-4 text-xs text-gray-600">
                                            {l.fecha_caducidad
                                                ? new Date(l.fecha_caducidad).toLocaleDateString('es-ES')
                                                : '—'}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right text-gray-700 font-medium">
                                            {l.stock.toFixed(0)}
                                        </td>
                                        <td className="py-2.5 text-right">
                                            {/* Móvil: toca para abrir calculadora */}
                                            <button
                                                className="sm:hidden flex items-center gap-1.5 ml-auto bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-lg px-2.5 py-1.5 transition-colors min-w-[4rem] justify-end"
                                                onClick={() => setCalcLote({ id: l.id, lote: l.lote })}
                                            >
                                                <span className="text-sm font-mono font-semibold text-gray-900">{(localCounted[l.id] ?? 0).toFixed(0)}</span>
                                                <Calculator className="w-3.5 h-3.5 text-brand" />
                                            </button>
                                            {/* Escritorio: input normal */}
                                            <input
                                                ref={idx === 0 ? firstInputRef : undefined}
                                                type="number"
                                                inputMode="decimal"
                                                min="0"
                                                step="1"
                                                value={localCounted[l.id] ?? 0}
                                                onFocus={e => e.target.select()}
                                                onChange={e =>
                                                    setLocalCounted(prev => ({
                                                        ...prev,
                                                        [l.id]: parseFloat(e.target.value) || 0,
                                                    }))
                                                }
                                                className="hidden sm:block w-20 border border-gray-300 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-4 border-t flex justify-between items-center">
                    <span className="text-sm text-gray-500">
                        Total:{' '}
                        {Object.values(localCounted)
                            .reduce((s, v) => s + v, 0)
                            .toFixed(0)}{' '}
                        uds
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90"
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
            {calcLote && (
                <CalcModal
                    label={`${artNombre} — Lote: ${calcLote.lote}`}
                    initial={localCounted[calcLote.id] ?? 0}
                    onConfirm={v => setLocalCounted(prev => ({ ...prev, [calcLote.id]: v }))}
                    onClose={() => setCalcLote(null)}
                />
            )}
        </div>
    )
}

// ─── Modal Tallas/Colores ─────────────────────────────────────────────────

interface TCModalProps {
    referencia: string
    artNombre: string
    tallas: TallaItem[]
    colores: ColorItem[]
    stock: StockTCItem[]
    loading: boolean
    current: TCContado[]
    onSave: (counted: TCContado[]) => void
    onClose: () => void
}

function TCModal({ referencia, artNombre, tallas, colores, stock, loading, current, onSave, onClose }: TCModalProps) {
    const [grid, setGrid] = useState<Record<string, number>>(() => {
        const m: Record<string, number> = {}
        current.forEach(c => { m[`${c.talla}|${c.color}`] = c.unidades })
        return m
    })
    const [calcTC, setCalcTC] = useState<{ key: string; talla: string; color: string } | null>(null)

    const getStock = (talla: string, color: string) =>
        stock.find(s => s.talla === talla && s.color === color)?.actual ?? 0

    const handleSave = () => {
        const result: TCContado[] = []
        for (const [key, uds] of Object.entries(grid)) {
            if (uds > 0) {
                const [talla, color] = key.split('|')
                result.push({ talla, color, unidades: uds })
            }
        }
        onSave(result)
    }

    const totalContado = Object.values(grid).reduce((s, v) => s + v, 0)

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h3 className="font-semibold text-gray-900">Tallas/Colores — {artNombre}</h3>
                        <p className="text-xs text-gray-500 font-mono">{referencia}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {loading ? (
                        <p className="text-center text-gray-500 py-8">Cargando tallas/colores...</p>
                    ) : tallas.length === 0 || colores.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Sin tallas/colores configurados para este artículo</p>
                    ) : (
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs text-gray-500 min-w-[110px]">
                                        Color \ Talla
                                    </th>
                                    {tallas.map(t => (
                                        <th
                                            key={t.codigo}
                                            className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs text-gray-700 min-w-[72px]"
                                        >
                                            {t.nombre}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {colores.map(c => (
                                    <tr key={c.codigo}>
                                        <td className="border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                                            {c.codigo_rgb && (
                                                <span
                                                    className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle border border-gray-300"
                                                    style={{ backgroundColor: `#${c.codigo_rgb}` }}
                                                />
                                            )}
                                            {c.nombre}
                                        </td>
                                        {tallas.map(t => {
                                            const key = `${t.codigo}|${c.codigo}`
                                            const stk = getStock(t.codigo, c.codigo)
                                            return (
                                                <td
                                                    key={t.codigo}
                                                    className="border border-gray-200 px-2 py-1.5 text-center"
                                                >
                                                    {/* Móvil: toca la celda para abrir calculadora */}
                                                    <button
                                                        className="sm:hidden w-full flex flex-col items-center gap-0.5"
                                                        onClick={() => setCalcTC({ key, talla: t.nombre, color: c.nombre })}
                                                    >
                                                        <span className={`text-sm font-mono font-semibold rounded px-1.5 py-0.5 w-full text-center ${
                                                            (grid[key] ?? 0) > 0
                                                                ? 'bg-brand text-white'
                                                                : 'bg-gray-100 text-gray-500'
                                                        }`}>
                                                            {(grid[key] ?? 0).toFixed(0)}
                                                        </span>
                                                        {stk > 0 && (
                                                            <span className="text-[10px] text-gray-400">
                                                                stk:{stk.toFixed(0)}
                                                            </span>
                                                        )}
                                                    </button>
                                                    {/* Escritorio: input normal */}
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        min="0"
                                                        step="1"
                                                        value={grid[key] ?? 0}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e =>
                                                            setGrid(prev => ({
                                                                ...prev,
                                                                [key]: parseFloat(e.target.value) || 0,
                                                            }))
                                                        }
                                                        className="hidden sm:block w-14 border border-gray-300 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-2 focus:ring-brand/50 mx-auto"
                                                    />
                                                    {stk > 0 && (
                                                        <span className="hidden sm:block text-[10px] text-gray-400 mt-0.5">
                                                            stk:{stk.toFixed(0)}
                                                        </span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-4 border-t flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                        Total contado: <strong>{totalContado.toFixed(0)}</strong> uds
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90"
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
            {calcTC && (
                <CalcModal
                    label={`${artNombre} — ${calcTC.color} / ${calcTC.talla}`}
                    initial={grid[calcTC.key] ?? 0}
                    onConfirm={v => setGrid(prev => ({ ...prev, [calcTC.key]: v }))}
                    onClose={() => setCalcTC(null)}
                />
            )}
        </div>
    )
}

// ─── Calculadora modal (móvil) ─────────────────────────────────────────────

interface CalcModalProps {
    label: string
    initial: number
    onConfirm: (v: number) => void
    onClose: () => void
}

function CalcModal({ label, initial, onConfirm, onClose }: CalcModalProps) {
    const [display, setDisplay] = useState(initial > 0 ? String(initial) : '0')

    const press = (key: string) => {
        if (key === 'C') { setDisplay('0'); return }
        if (key === '⌫') { setDisplay(d => d.length > 1 ? d.slice(0, -1) : '0'); return }
        setDisplay(d => {
            if (key === '.' && d.includes('.')) return d
            return d === '0' && key !== '.' ? key : d + key
        })
    }

    const confirm = () => {
        onConfirm(parseFloat(display) || 0)
        onClose()
    }

    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫']

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-xs rounded-t-2xl sm:rounded-2xl shadow-2xl p-4"
                onClick={e => e.stopPropagation()}
            >
                <p className="text-xs text-gray-500 truncate mb-2 text-center px-2">{label}</p>
                <div className="text-right text-4xl font-bold text-gray-900 bg-gray-50 rounded-xl px-4 py-4 mb-4 font-mono min-h-[4rem] flex items-center justify-end">
                    {display}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                    {keys.map(k => (
                        <button
                            key={k}
                            onClick={() => press(k)}
                            className={`py-5 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
                                k === 'C'
                                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                    : k === '⌫'
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                            }`}
                        >
                            {k}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => press('.')}
                    className="w-full py-3 bg-gray-100 text-gray-900 rounded-xl text-xl font-semibold mb-3 hover:bg-gray-200 active:scale-95 transition-all"
                >
                    .
                </button>
                <button
                    onClick={confirm}
                    className="w-full py-4 bg-brand text-white rounded-xl text-lg font-semibold hover:bg-brand/90 active:bg-brand/80 transition-all"
                >
                    ✓ Confirmar
                </button>
            </div>
        </div>
    )
}

// ─── Componente principal ─────────────────────────────────────────────────

export default function Inventario() {
    // Datos de lookup
    const [almacenes, setAlmacenes] = useState<Almacen[]>([])
    const [familias, setFamilias] = useState<Familia[]>([])
    const [subfamilias, setSubfamilias] = useState<Subfamilia[]>([])
    const [marcas, setMarcas] = useState<Marca[]>([])

    // Paso 1
    const [almacen, setAlmacen] = useState(1)
    const [mode, setMode] = useState<Mode>('familia')
    const [filtroFamilia, setFiltroFamilia] = useState<number | ''>('')
    const [filtroSubfamilia, setFiltroSubfamilia] = useState<number | ''>('')
    const [filtroMarca, setFiltroMarca] = useState<number | ''>('')

    // Paso 2
    const [step, setStep] = useState<1 | 2>(1)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [articulos, setArticulos] = useState<InvArticulo[]>([])
    const [catalogoSueltos, setCatalogoSueltos] = useState<InvArticulo[]>([])
    const [sueltosSearch, setSueltosSearch] = useState('')
    const [sueltosSearchLoading, setSueltosSearchLoading] = useState(false)
    const [lines, setLines] = useState<Record<string, InvLine>>({})
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [descripcion, setDescripcion] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // Historial
    const [historial, setHistorial] = useState<HistorialItem[]>([])
    const [historialLoading, setHistorialLoading] = useState(false)
    const [lotesRef, setLotesRef] = useState<string | null>(null)
    const [lotesData, setLotesData] = useState<LoteItem[]>([])
    const [lotesLoading, setLotesLoading] = useState(false)
    const [tcRef, setTCRef] = useState<string | null>(null)
    const [tcData, setTCData] = useState<{ tallas: TallaItem[]; colores: ColorItem[]; stock: StockTCItem[] } | null>(null)
    const [tcLoading, setTCLoading] = useState(false)
    const [calcMain, setCalcMain] = useState<{ ref: string; label: string; value: number } | null>(null)

    // Carga inicial de datos de lookup + historial
    useEffect(() => {
        Promise.all([
            api.get<Almacen[]>(`${BASE}/almacenes`),
            api.get<Familia[]>(`${BASE}/familias`),
            api.get<Marca[]>(`${BASE}/marcas`),
        ])
            .then(([a, f, m]) => {
                setAlmacenes(a.data)
                setFamilias(f.data)
                setMarcas(m.data)
                if (a.data.length > 0) setAlmacen(a.data[0].codigo)
            })
            .catch(() => {})
        loadHistorial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadHistorial = async () => {
        setHistorialLoading(true)
        try {
            const r = await api.get<HistorialItem[]>(`${BASE}/documentos`)
            setHistorial(r.data)
        } catch {
            // silencioso
        }
        setHistorialLoading(false)
    }

    const loadDocumento = async (id: number) => {
        if (articulos.length > 0 && editingId === null) {
            if (!confirm('Hay un inventario en curso sin guardar. ¿Abandonarlo y cargar este?')) return
        }
        setError('')
        setLoading(true)
        try {
            const r = await api.get<{
                id: number; numero: number; serie: string; fecha: string
                descripcion: string; almacen: number; aplicado: boolean
                articulos: InvArticulo[]
                lines: Record<string, InvLine>
            }>(`${BASE}/documentos/${id}`)
            const doc = r.data
            if (doc.aplicado) {
                setError('Este inventario ya está aplicado y no se puede editar')
                setLoading(false)
                return
            }
            setAlmacen(doc.almacen)
            setDescripcion(doc.descripcion)
            setArticulos(doc.articulos)
            setLines(doc.lines)
            setCatalogoSueltos([])
            setSueltosSearch('')
            setSearchQuery('')
            setEditingId(doc.id)
            setStep(2)
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando inventario')
        }
        setLoading(false)
    }

    const eliminarDocumento = async (id: number) => {
        if (!confirm('¿Eliminar este inventario guardado?')) return
        try {
            await api.delete(`${BASE}/documentos/${id}`)
            setHistorial(prev => prev.filter(h => h.id !== id))
            if (editingId === id) {
                setEditingId(null)
                setArticulos([])
                setLines({})
                setDescripcion('')
                setStep(1)
            }
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error eliminando inventario')
        }
    }

    // Cargar subfamilias al cambiar la familia (modo subfamilia)
    useEffect(() => {
        if (mode === 'subfamilia' && filtroFamilia !== '') {
            api.get<Subfamilia[]>(`${BASE}/subfamilias?familia=${filtroFamilia}`)
                .then(r => setSubfamilias(r.data))
                .catch(() => {})
            setFiltroSubfamilia('')
        }
    }, [filtroFamilia, mode])

    const removeArticulo = (ref: string) => {
        setArticulos(prev => prev.filter(a => a.referencia !== ref))
        setLines(prev => { const n = { ...prev }; delete n[ref]; return n })
    }

    const addFromCatalog = (art: InvArticulo) => {
        if (!articulos.find(a => a.referencia === art.referencia)) {
            setArticulos(prev => [...prev, art])
            setLines(prev => ({
                ...prev,
                [art.referencia]: {
                    referencia: art.referencia,
                    descripcion: art.nombre,
                    coste: 0,
                    unidades: art.tallas_colores || art.control_lotes ? 0 : 1,
                    lotes: [],
                    tallas_colores: [],
                },
            }))
        }
        if (art.tallas_colores) openTC(art.referencia)
        else if (art.control_lotes) openLotes(art.referencia)
    }

    // Cargar artículos (modos familia/subfamilia/marca)
    const loadArticulos = async () => {
        if (mode === 'familia' && filtroFamilia === '') {
            setError('Selecciona una familia')
            return
        }
        if (mode === 'subfamilia' && filtroSubfamilia === '') {
            setError('Selecciona una subfamilia')
            return
        }
        if (mode === 'marca' && filtroMarca === '') {
            setError('Selecciona una marca')
            return
        }
        setLoading(true)
        setError('')
        try {
            if (mode === 'sueltos') {
                // Sueltos: no carga masiva, ir directo al paso 2 con buscador en tiempo real
                setStep(2)
                setLoading(false)
                return
            }
            let url = `${BASE}/articulos/buscar?almacen=${almacen}`
            if (mode === 'familia') url += `&familia=${filtroFamilia}`
            else if (mode === 'subfamilia') url += `&subfamilia=${filtroSubfamilia}`
            else if (mode === 'marca') url += `&marca=${filtroMarca}`

            const res = await api.get<InvArticulo[]>(url)
            const arts = res.data
            // Merge: añadir solo los que no estaban ya
            setArticulos(prev => {
                const existing = new Set(prev.map(a => a.referencia))
                const nuevos = arts.filter(a => !existing.has(a.referencia))
                return [...prev, ...nuevos]
            })
            setLines(prev => {
                const next = { ...prev }
                arts.forEach(a => {
                    if (!next[a.referencia]) {
                        next[a.referencia] = {
                            referencia: a.referencia,
                            descripcion: a.nombre,
                            coste: 0,
                            unidades: 0,
                            lotes: [],
                            tallas_colores: [],
                        }
                    }
                })
                return next
            })
            setStep(2)
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando artículos')
        }
        setLoading(false)
    }

    const cancelarInventario = () => {
        if (!confirm('¿Cancelar el inventario en curso? Se perderán todos los artículos añadidos.')) return
        setArticulos([])
        setCatalogoSueltos([])
        setSueltosSearch('')
        setLines({})
        setDescripcion('')
        setSearchQuery('')
        setError('')
        setSuccess('')
        setEditingId(null)
    }

    const setUnidades = (ref: string, val: number) =>
        setLines(prev => ({ ...prev, [ref]: { ...prev[ref], unidades: val } }))

    const setCoste = (ref: string, val: number) =>
        setLines(prev => ({ ...prev, [ref]: { ...prev[ref], coste: val } }))

    // Modal lotes
    const openLotes = async (ref: string) => {
        setLotesRef(ref)
        setLotesLoading(true)
        try {
            const r = await api.get<LoteItem[]>(`${BASE}/articulos/${ref}/lotes`)
            setLotesData(r.data)
        } catch {
            setLotesData([])
        }
        setLotesLoading(false)
    }

    // Modal TC
    const openTC = async (ref: string) => {
        setTCRef(ref)
        setTCLoading(true)
        setTCData(null)
        try {
            const r = await api.get<{ tallas: TallaItem[]; colores: ColorItem[]; stock: StockTCItem[] }>(
                `${BASE}/articulos/${ref}/tallas-colores?almacen=${almacen}`
            )
            setTCData(r.data)
        } catch {
            setTCData({ tallas: [], colores: [], stock: [] })
        }
        setTCLoading(false)
    }

    // Guardar (nuevo o actualización)
    const save = async () => {
        setSaving(true)
        setError('')
        setSuccess('')

        const lineasToSave = articulos
            .map(a => lines[a.referencia])
            .filter(
                l =>
                    l &&
                    (l.unidades > 0 ||
                        l.lotes.some(lt => lt.unidades > 0) ||
                        l.tallas_colores.some(tc => tc.unidades > 0))
            )

        if (lineasToSave.length === 0) {
            setError('No hay artículos con unidades contadas')
            setSaving(false)
            return
        }

        const payload = {
            almacen,
            descripcion: descripcion || `Inventario ${new Date().toLocaleDateString('es-ES')}`,
            lineas: lineasToSave,
        }

        try {
            if (editingId !== null) {
                await api.put(`${BASE}/documentos/${editingId}`, payload)
                setSuccess(`Inventario actualizado correctamente`)
            } else {
                const res = await api.post<{ id: number; numero: number; serie: string }>(`${BASE}/documento`, payload)
                setSuccess(`Inventario guardado — ${res.data.serie}/${res.data.numero}`)
            }
            setStep(1)
            setArticulos([])
            setCatalogoSueltos([])
            setSueltosSearch('')
            setLines({})
            setDescripcion('')
            setSearchQuery('')
            setEditingId(null)
            loadHistorial()
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error guardando inventario')
        }
        setSaving(false)
    }

    const displayedArticulos = (() => {
        if (mode === 'sueltos') return articulos
        if (!searchQuery.trim()) return articulos
        const words = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
        return articulos.filter(a =>
            words.every(
                w =>
                    a.referencia.toLowerCase().includes(w) ||
                    a.nombre.toLowerCase().includes(w)
            )
        )
    })()

    const catalogoFiltrado = (() => {
        if (mode !== 'sueltos' || !sueltosSearch.trim()) return []
        // El catálogo viene del API en tiempo real, no del estado local
        return catalogoSueltos.slice(0, 20)
    })()

    // Búsqueda en tiempo real para sueltos (mínimo 2 caracteres)
    useEffect(() => {
        if (mode !== 'sueltos') return
        const q = sueltosSearch.trim()
        if (q.length < 2) {
            setCatalogoSueltos([])
            return
        }
        setSueltosSearchLoading(true)
        const timer = setTimeout(async () => {
            try {
                const r = await api.get<InvArticulo[]>(
                    `${BASE}/articulos/buscar?q=${encodeURIComponent(q)}&almacen=${almacen}`
                )
                setCatalogoSueltos(r.data)
            } catch {
                setCatalogoSueltos([])
            }
            setSueltosSearchLoading(false)
        }, 300)
        return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sueltosSearch, almacen, mode])

    const totalContado = articulos.reduce((s, a) => s + (lines[a.referencia]?.unidades ?? 0), 0)
    const artConUnidades = articulos.filter(a => (lines[a.referencia]?.unidades ?? 0) > 0).length

    const modeLabels: Record<Mode, string> = {
        familia: 'Familia',
        subfamilia: 'Subfamilia',
        marca: 'Marca',
        sueltos: 'Artículos sueltos',
    }

    const getFiltroLabel = () => {
        if (mode === 'familia' && filtroFamilia !== '')
            return familias.find(f => f.codigo === filtroFamilia)?.nombre ?? ''
        if (mode === 'subfamilia' && filtroSubfamilia !== '')
            return subfamilias.find(s => s.codigo === filtroSubfamilia)?.nombre ?? ''
        if (mode === 'marca' && filtroMarca !== '')
            return marcas.find(m => m.codigo === filtroMarca)?.nombre ?? ''
        return ''
    }

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="px-4 pt-4 md:px-6 md:pt-6">
            <div className="max-w-5xl mx-auto">
            {/* Cabecera */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-brand" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Inventario</h1>
                    <p className="text-sm text-gray-500">Recuento y ajuste de stock</p>
                </div>
            </div>

            {/* Mensajes */}
            {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
                    {success}
                    <button className="ml-auto" onClick={() => setSuccess('')}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex items-center gap-2">
                    {error}
                    <button className="ml-auto" onClick={() => setError('')}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* ── Paso 1: Configuración ── */}
            {step === 1 && (
                <>
                <div className="max-w-2xl">
                    {/* Banner inventario en curso */}
                    {articulos.length > 0 && (
                        <div className="mb-5 bg-brand/5 border border-brand/20 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-sm font-semibold text-brand">Inventario en curso</p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    {articulos.length} artículos·{artConUnidades} con unidades contadas
                                </p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => setStep(2)}
                                    className="text-sm bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand/90"
                                >
                                    Ver inventario
                                </button>
                                <button
                                    onClick={cancelarInventario}
                                    className="flex items-center gap-1.5 text-sm border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Cancelar inventario
                                </button>
                            </div>
                        </div>
                    )}

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
                    {articulos.length > 0 && (
                        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-4 border-b">
                            Añadir más artículos al inventario
                        </h3>
                    )}

                    {/* Fila principal: Almacén + Tipo lado a lado en sm+ */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        {/* Almacén */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Almacén</label>
                            <select
                                value={almacen}
                                onChange={e => setAlmacen(Number(e.target.value))}
                                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand/50"
                            >
                                {almacenes.map(a => (
                                    <option key={a.codigo} value={a.codigo}>
                                        {a.codigo} — {a.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Tipo de inventario */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['familia', 'subfamilia', 'marca', 'sueltos'] as Mode[]).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => {
                                            setMode(m)
                                            setError('')
                                        }}
                                        className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                                            mode === m
                                                ? 'bg-brand text-white border-brand'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-brand/50 hover:bg-brand/5'
                                        }`}
                                    >
                                        {modeLabels[m]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Filtros */}
                    {mode === 'familia' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Familia</label>
                            <select
                                value={filtroFamilia}
                                onChange={e =>
                                    setFiltroFamilia(e.target.value === '' ? '' : Number(e.target.value))
                                }
                                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand/50"
                            >
                                <option value="">— Selecciona familia —</option>
                                {familias.map(f => (
                                    <option key={f.codigo} value={f.codigo}>{f.nombre}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {mode === 'subfamilia' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Familia</label>
                                <select
                                    value={filtroFamilia}
                                    onChange={e =>
                                        setFiltroFamilia(e.target.value === '' ? '' : Number(e.target.value))
                                    }
                                    className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand/50"
                                >
                                    <option value="">— Selecciona familia —</option>
                                    {familias.map(f => (
                                        <option key={f.codigo} value={f.codigo}>{f.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Subfamilia</label>
                                <select
                                    value={filtroSubfamilia}
                                    onChange={e =>
                                        setFiltroSubfamilia(
                                            e.target.value === '' ? '' : Number(e.target.value)
                                        )
                                    }
                                    disabled={subfamilias.length === 0}
                                    className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-50"
                                >
                                    <option value="">— Selecciona subfamilia —</option>
                                    {subfamilias.map(s => (
                                        <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                    {mode === 'marca' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Marca</label>
                            <select
                                value={filtroMarca}
                                onChange={e =>
                                    setFiltroMarca(e.target.value === '' ? '' : Number(e.target.value))
                                }
                                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand/50"
                            >
                                <option value="">— Selecciona marca —</option>
                                {marcas.map(m => (
                                    <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {mode === 'sueltos' && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                            Se cargarán todos los artículos. Usa el buscador para filtrar al escribir.
                        </div>
                    )}

                    <button
                        onClick={loadArticulos}
                        disabled={loading}
                        className="w-full bg-brand text-white py-3 rounded-lg font-medium text-sm hover:bg-brand/90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Cargando...' : articulos.length > 0 ? 'Añadir al inventario' : 'Cargar artículos'}
                    </button>
                </div>
                </div>

                {/* ── Historial de inventarios ── */}
                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-700">Inventarios guardados</h2>
                        <button
                            onClick={loadHistorial}
                            className="text-xs text-brand hover:underline"
                        >
                            Actualizar
                        </button>
                    </div>
                    {historialLoading ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Cargando...</p>
                    ) : historial.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">No hay inventarios guardados</p>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                        <th className="text-left px-4 py-2.5 font-medium">Nº / Fecha</th>
                                        <th className="hidden sm:table-cell text-left px-4 py-2.5 font-medium">Descripción</th>
                                        <th className="hidden sm:table-cell text-right px-4 py-2.5 font-medium">Art.</th>
                                        <th className="text-center px-4 py-2.5 font-medium">Estado</th>
                                        <th className="px-4 py-2.5"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {historial.map(h => (
                                        <tr key={h.id} className={`hover:bg-gray-50 ${
                                            editingId === h.id ? 'bg-brand/5 ring-1 ring-inset ring-brand/20' : ''
                                        }`}>
                                            <td className="px-4 py-2.5">
                                                <p className="font-mono text-xs font-semibold text-gray-800">{h.serie}/{h.numero}</p>
                                                <p className="text-xs text-gray-500">{new Date(h.fecha).toLocaleDateString('es-ES')}</p>
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-2.5 text-gray-600 truncate max-w-[200px]">
                                                {h.descripcion ? h.descripcion : <span className="text-gray-400">Sin descripción</span>}
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-2.5 text-right text-gray-600">{h.n_lineas}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                {h.aplicado ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Aplicado
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                                        <Clock className="w-3 h-3" />
                                                        Pendiente
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {!h.aplicado && (
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <button
                                                            onClick={() => loadDocumento(h.id)}
                                                            className="flex items-center gap-1 text-xs bg-brand text-white px-2.5 py-1 rounded-lg hover:bg-brand/90"
                                                        >
                                                            <Pencil className="w-3 h-3" /> Editar
                                                        </button>
                                                        <button
                                                            onClick={() => eliminarDocumento(h.id)}
                                                            className="flex items-center gap-1 text-xs border border-red-300 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                </>
            )}

            {/* ── Paso 2: Lista de artículos ── */}
            {step === 2 && (
                <>
                    {/* Barra superior */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <button
                            onClick={() => {
                                setStep(1)
                                setError('')
                                setSuccess('')
                            }}
                            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                        >
                            <ChevronLeft className="w-4 h-4" /> Volver
                        </button>
                        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
                            {editingId !== null ? (
                                <>
                                    <Pencil className="w-3.5 h-3.5 text-brand" />
                                    <span className="font-medium text-brand">
                                        Editando {historial.find(h => h.id === editingId)?.serie}/{historial.find(h => h.id === editingId)?.numero ?? editingId}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="font-medium text-gray-800">{modeLabels[mode]}</span>
                                    {getFiltroLabel() && (
                                        <span className="text-gray-500">· {getFiltroLabel()}</span>
                                    )}
                                    <span className="text-gray-400">
                                        · Almacén {almacenes.find(a => a.codigo === almacen)?.nombre ?? almacen}
                                    </span>
                                </>
                            )}
                        </div>
                        <span className="text-sm text-gray-500 ml-auto">
                            {articulos.length} art. · {artConUnidades} con uds ·{' '}
                            {totalContado.toFixed(0)} total
                        </span>
                    </div>

                    {/* Campo búsqueda: modo sueltos = buscar en catálogo; otros = filtrar tabla */}
                    {mode === 'sueltos' ? (
                        <div className="relative mb-4">
                            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-xl px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-brand/50 focus-within:border-brand">
                                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Escribe ref. o nombre (mín. 2 caracteres)..."
                                    value={sueltosSearch}
                                    onChange={e => setSueltosSearch(e.target.value)}
                                    className="flex-1 text-sm outline-none bg-transparent"
                                    autoFocus
                                />
                                {sueltosSearchLoading && (
                                    <svg className="w-4 h-4 text-brand animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                )}
                                {sueltosSearch && !sueltosSearchLoading && (
                                    <button onClick={() => setSueltosSearch('')}>
                                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                                    </button>
                                )}
                            </div>
                            {sueltosSearch.trim() && (
                                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 mt-1 max-h-72 overflow-y-auto">
                                    {sueltosSearch.trim().length < 2 ? (
                                        <p className="text-sm text-gray-400 px-4 py-3">Escribe al menos 2 caracteres para buscar</p>
                                    ) : sueltosSearchLoading ? (
                                        <p className="text-sm text-gray-400 px-4 py-3">Buscando...</p>
                                    ) : catalogoFiltrado.length === 0 ? (
                                        <p className="text-sm text-gray-500 px-4 py-3">Sin resultados</p>
                                    ) : catalogoFiltrado.map(a => {
                                        const isAdded = !!articulos.find(x => x.referencia === a.referencia)
                                        return (
                                            <div key={a.referencia} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{a.nombre}</p>
                                                    <p className="text-xs text-gray-500 font-mono">{a.referencia} · Stk: {a.stock_actual.toFixed(0)}</p>
                                                    <div className="flex gap-1 mt-0.5">
                                                        {a.control_lotes && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">LOTES</span>}
                                                        {a.tallas_colores && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded">T/C</span>}
                                                    </div>
                                                </div>
                                                {isAdded ? (
                                                    <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Añadido</span>
                                                ) : (
                                                    <button
                                                        onClick={() => addFromCatalog(a)}
                                                        className="flex items-center gap-1 text-xs bg-brand text-white px-2.5 py-1 rounded-lg hover:bg-brand/90 flex-shrink-0"
                                                    >
                                                        <Plus className="w-3 h-3" /> Añadir
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-xl px-3 py-2.5 mb-4 shadow-sm focus-within:ring-2 focus-within:ring-brand/50 focus-within:border-brand">
                            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <input
                                type="text"
                                placeholder="Filtrar por referencia o nombre..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="flex-1 text-sm outline-none bg-transparent"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')}>
                                    <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Tabla de artículos */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-4">
                        {displayedArticulos.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                <p>
                                    {mode === 'sueltos'
                                        ? 'Usa el buscador para añadir artículos al inventario'
                                        : 'Sin artículos'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                            <th className="text-left px-4 py-3 font-medium">Artículo</th>
                                            <th className="hidden sm:table-cell text-right px-4 py-3 font-medium">Stock</th>
                                            <th className="text-right px-4 py-3 font-medium w-36">Contado</th>
                                            {searchQuery.trim() && (
                                                <th className="px-2 py-3 w-10" />
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {displayedArticulos.map(art => {
                                            const line = lines[art.referencia]
                                            const isTC = art.tallas_colores
                                            const isLotes = art.control_lotes && !isTC
                                            const tcTotal =
                                                line?.tallas_colores.reduce(
                                                    (s, tc) => s + tc.unidades,
                                                    0
                                                ) ?? 0
                                            const lotesTotal =
                                                line?.lotes.reduce((s, l) => s + l.unidades, 0) ?? 0
                                            const hasValue =
                                                (line?.unidades ?? 0) > 0 ||
                                                tcTotal > 0 ||
                                                lotesTotal > 0

                                            return (
                                                <tr
                                                    key={art.referencia}
                                                    className={`hover:bg-gray-50 transition-colors ${
                                                        hasValue ? 'bg-green-50/40' : ''
                                                    }`}
                                                >
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-medium text-gray-900">
                                                            {art.nombre}
                                                        </p>
                                                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                                                            {art.referencia}
                                                        </p>
                                                        <div className="flex gap-1 mt-0.5">
                                                            {art.control_lotes && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                                                                    LOTES
                                                                </span>
                                                            )}
                                                            {art.tallas_colores && (
                                                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded">
                                                                    T/C
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="hidden sm:table-cell px-4 py-2.5 text-right">
                                                        <span
                                                            className={`font-medium ${
                                                                art.stock_actual > 0
                                                                    ? 'text-gray-900'
                                                                    : 'text-gray-400'
                                                            }`}
                                                        >
                                                            {art.stock_actual.toFixed(0)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">
                                                        {isTC ? (
                                                            <button
                                                                onClick={() =>
                                                                    openTC(art.referencia)
                                                                }
                                                                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                                                    tcTotal > 0
                                                                        ? 'bg-purple-600 text-white border-purple-600'
                                                                        : 'border-purple-300 text-purple-700 hover:bg-purple-50'
                                                                }`}
                                                            >
                                                                {tcTotal > 0
                                                                    ? `${tcTotal.toFixed(0)} uds`
                                                                    : 'T/C'}
                                                            </button>
                                                        ) : isLotes ? (
                                                            <button
                                                                onClick={() =>
                                                                    openLotes(art.referencia)
                                                                }
                                                                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                                                    lotesTotal > 0
                                                                        ? 'bg-amber-500 text-white border-amber-500'
                                                                        : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                                                }`}
                                                            >
                                                                {lotesTotal > 0
                                                                    ? `${lotesTotal.toFixed(0)} uds`
                                                                    : 'Lotes'}
                                                            </button>
                                                        ) : (
                                                            <div className="flex items-center justify-end">
                                                                {/* Móvil: toca para abrir calculadora */}
                                                                <button
                                                                    className="sm:hidden flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-lg px-3 py-2 transition-colors min-w-[3.5rem] justify-end"
                                                                    onClick={() => setCalcMain({ ref: art.referencia, label: art.nombre, value: line?.unidades ?? 0 })}
                                                                >
                                                                    <span className="text-sm font-mono font-semibold text-gray-900">{(line?.unidades ?? 0).toFixed(0)}</span>
                                                                    <Calculator className="w-4 h-4 text-brand" />
                                                                </button>
                                                                {/* Escritorio: input normal */}
                                                                <input
                                                                    type="number"
                                                                    inputMode="decimal"
                                                                    min="0"
                                                                    step="1"
                                                                    value={line?.unidades ?? 0}
                                                                    onFocus={e => e.target.select()}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault()
                                                                            const inputs = Array.from(
                                                                                document.querySelectorAll<HTMLInputElement>('input[data-qty]')
                                                                            )
                                                                            const idx = inputs.indexOf(e.currentTarget)
                                                                            if (idx >= 0 && idx < inputs.length - 1) {
                                                                                inputs[idx + 1].focus()
                                                                            }
                                                                        }
                                                                    }}
                                                                    onChange={e =>
                                                                        setUnidades(
                                                                            art.referencia,
                                                                            parseFloat(e.target.value) || 0
                                                                        )
                                                                    }
                                                                    data-qty="1"
                                                                    className="hidden sm:block w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                                                                />
                                                            </div>
                                                        )}
                                                    </td>
                                                    {/* Botón +Añadir cuando hay búsqueda activa */}
                                                    {searchQuery.trim() && (
                                                        <td className="px-2 py-2.5 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    if (isTC) {
                                                                        openTC(art.referencia)
                                                                    } else if (isLotes) {
                                                                        openLotes(art.referencia)
                                                                    } else {
                                                                        setUnidades(art.referencia, (lines[art.referencia]?.unidades ?? 0) + 1)
                                                                    }
                                                                }}
                                                                className="flex items-center gap-1 text-xs bg-brand text-white px-2 py-1 rounded-lg hover:bg-brand/90 whitespace-nowrap"
                                                                title="Añadir al inventario"
                                                            >
                                                                <Plus className="w-3 h-3" />
                                                                Añadir
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {/* Espaciador para que el último artículo no quede oculto bajo la barra flotante */}
                    <div className="h-32 sm:h-24" aria-hidden="true" />
                </>
            )}

            </div>

            {/* Barra flotante de guardado */}
            {step === 2 && (
                <div className="fixed bottom-0 left-0 right-0 lg:left-16 bg-white border-t border-gray-200 shadow-lg px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 z-30">
                    <input
                        type="text"
                        placeholder="Descripción del inventario (opcional)..."
                        value={descripcion}
                        onChange={e => setDescripcion(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                    />
                    <button
                        onClick={save}
                        disabled={saving}
                        className="flex items-center justify-center gap-2 bg-brand text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-brand/90 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Guardando...' : 'Guardar inventario'}
                    </button>
                </div>
            )}

            {/* Modal Lotes */}
            {lotesRef && (
                <LotesModal
                    referencia={lotesRef}
                    artNombre={articulos.find(a => a.referencia === lotesRef)?.nombre ?? ''}
                    lotes={lotesData}
                    loading={lotesLoading}
                    current={lines[lotesRef]?.lotes ?? []}
                    onSave={counted => {
                        setLines(prev => ({
                            ...prev,
                            [lotesRef]: {
                                ...prev[lotesRef],
                                lotes: counted,
                                unidades: counted.reduce((s, l) => s + l.unidades, 0),
                            },
                        }))
                        setLotesRef(null)
                    }}
                    onClose={() => setLotesRef(null)}
                />
            )}

            {/* Calculadora móvil - tabla principal */}
            {calcMain && (
                <CalcModal
                    label={calcMain.label}
                    initial={calcMain.value}
                    onConfirm={v => setUnidades(calcMain.ref, v)}
                    onClose={() => setCalcMain(null)}
                />
            )}

            {/* Modal TC */}
            {tcRef && (
                <TCModal
                    referencia={tcRef}
                    artNombre={articulos.find(a => a.referencia === tcRef)?.nombre ?? ''}
                    tallas={tcData?.tallas ?? []}
                    colores={tcData?.colores ?? []}
                    stock={tcData?.stock ?? []}
                    loading={tcLoading}
                    current={lines[tcRef]?.tallas_colores ?? []}
                    onSave={counted => {
                        const total = counted.reduce((s, tc) => s + tc.unidades, 0)
                        setLines(prev => ({
                            ...prev,
                            [tcRef]: {
                                ...prev[tcRef],
                                tallas_colores: counted,
                                unidades: total,
                            },
                        }))
                        setTCRef(null)
                    }}
                    onClose={() => setTCRef(null)}
                />
            )}
        </div>
    )
}
