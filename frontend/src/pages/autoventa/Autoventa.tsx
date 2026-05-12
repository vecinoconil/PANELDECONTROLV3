import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { UserMe } from '../../types'
import {
    ShoppingCart, FileText, Truck, Search, Calculator,
    X, Check, Loader2, AlertCircle, CreditCard, ChevronDown, ChevronUp, Plus,
    Image, List, Package, MapPin, PenLine, Trash2, BarChart2, Edit2, Mail,
    Printer, Settings,
} from 'lucide-react'
import { loadPrinterConfig, savePrinterConfig, printTicket, hasAndroidBridge } from '../../utils/thermalPrinter'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AgenteOption { codigo: number; nombre: string }
interface SerieOption { serie: string }
interface ClienteResult {
    codigo: number
    nombre: string
    alias: string
    cif: string
    direccion: string
    localidad: string
    cpostal: string
    provincia: number
    fpago: number
    tarifabase: number
    email: string
}
interface ProductoConsumo {
    referencia: string
    descripcion: string
    uds_total: number
    precio: number
    dto: number
    ultima_fecha: string
    piva: number
    control_lotes?: boolean
    tallas_colores?: boolean
    tiene_imagen?: boolean
    tipo_unidad?: number
    unidad?: string
    canon_digital?: number
    canon_importe?: number
    canon_suma_importe?: boolean
    canon_descripcion?: string
}
interface ArticuloBusqueda {
    referencia: string
    nombre: string
    precio: number
    dto: number
    piva: number
    control_lotes?: boolean
    tallas_colores?: boolean
    grupo_tallas?: number
    grupo_colores?: number
    tiene_imagen?: boolean
    tipo_unidad?: number
    unidad?: string
    canon_digital?: number
    canon_importe?: number
    canon_suma_importe?: boolean
    canon_descripcion?: string
}
interface LineaDoc {
    referencia: string
    descripcion: string
    unidades: string   // string to allow partial input
    gramos: string     // segunda unidad (tipo_unidad=1), string para input parcial
    tipo_unidad: number  // 0=normal, 1=doble unidad
    unidad: string     // nombre de la segunda unidad (p.ej. "Kilos")
    precio: number
    dto: number        // descuento %
    piva: number
    precioEditado: boolean
    control_lotes?: boolean
    tallas_colores?: boolean
    talla?: string
    color?: string
    tiene_imagen?: boolean
    lotes_asignados?: AsignacionLote[]  // lotes asignados a esta línea
    es_canon?: boolean       // línea de canon digital (generada automáticamente)
    canon_de?: string        // referencia del artículo al que pertenece este canon
    canon_suma_importe?: boolean   // este artículo genera línea canon automática
    canon_importe_unit?: number    // importe unitario del canon
    canon_descripcion?: string     // descripción de la línea canon (de articulos_canon.nombre)
}
interface Lote {
    id: number
    lote: string
    fecha_compra: string | null
    fecha_caducidad: string | null
    stock: number
    es_doble_unidad?: boolean
    unidad?: string
}
interface AsignacionLote {
    id: number
    lote: string
    fecha_caducidad: string | null
    stock: number
    asignar: number
}
interface Vencimiento {
    id: number
    fecha_vencimiento: string
    importe: number
    situacion: number
    entregas_cuenta: number
}
interface DocCliente {
    id: number
    tipodoc: number
    tipodoc_label: string
    serie: string
    numero: number
    fecha: string
    cli_nombre: string
    total: number
    pagado: number
    pendiente: number
    vencimientos: Vencimiento[]
}

interface DocListaItem {
    id: number
    serie: string
    numero: number
    fecha: string | null
    cli_codigo: number
    cli_nombre: string
    total: number
    pendiente: number
    finalizado: boolean
}
interface VisitaListaItem {
    id: number
    fecha: string | null
    cli_codigo: number
    cli_nombre: string
    motivo: string
    resultado: string
}
interface LineaDetalle {
    referencia: string
    descripcion: string
    unidades: number
    gramos: number
    tipo_unidad: number
    unidad: string
    precio: number
    dto: number
    piva: number
    talla: string
    color: string
}
interface DetalleAlbaran {
    id: number
    tipodoc: number
    serie: string
    numero: number
    fecha: string | null
    cli_codigo: number
    cli_nombre: string
    total: number
    pendiente: number
    lineas: LineaDetalle[]
}

interface TallaCodigo { codigo: string; nombre: string; orden: number }
interface ColorCodigo { codigo: string; nombre: string; codigo_rgb: string; orden: number }
interface StockTC { talla: string; color: string; actual: number }
interface TCGrid {
    articulo: ArticuloBusqueda
    tallas: TallaCodigo[]
    colores: ColorCodigo[]
    stock: StockTC[]
}

type TipoDoc = 2 | 4 | 8
const TIPOS: { id: TipoDoc; label: string; icon: React.ElementType; color: string }[] = [
    { id: 2, label: 'Pedido',   icon: ShoppingCart, color: 'bg-blue-50 border-blue-300 text-blue-700' },
    { id: 4, label: 'Albarán',  icon: Truck,        color: 'bg-amber-50 border-amber-300 text-amber-700' },
    { id: 8, label: 'Factura',  icon: FileText,     color: 'bg-green-50 border-green-300 text-green-700' },
]


// ── Firma Modal ────────────────────────────────────────────────────────────

function FirmaModal({
    onConfirm,
    onClose,
}: {
    onConfirm: (dataUrl: string) => void
    onClose: () => void
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const [hasStroke, setHasStroke] = useState(false)

    const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        if ('touches' in e) {
            const t = e.touches[0]
            return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
        }
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
    }

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current; if (!canvas) return
        const ctx = canvas.getContext('2d')!
        const pos = getPos(e, canvas)
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        drawing.current = true
        e.preventDefault()
    }

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!drawing.current) return
        const canvas = canvasRef.current; if (!canvas) return
        const ctx = canvas.getContext('2d')!
        const pos = getPos(e, canvas)
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = '#1e293b'
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
        setHasStroke(true)
        e.preventDefault()
    }

    const stopDraw = () => { drawing.current = false }

    const clearCanvas = () => {
        const canvas = canvasRef.current; if (!canvas) return
        canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
        setHasStroke(false)
    }

    const confirm = () => {
        const canvas = canvasRef.current; if (!canvas) return
        onConfirm(canvas.toDataURL('image/png'))
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <PenLine className="w-5 h-5 text-amber-600" />
                        <span className="font-semibold text-slate-800">Firma del cliente</span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                <div className="px-4 pt-4 pb-2">
                    <canvas
                        ref={canvasRef}
                        width={600}
                        height={240}
                        className="w-full border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 touch-none cursor-crosshair"
                        style={{ height: 160 }}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={stopDraw}
                        onMouseLeave={stopDraw}
                        onTouchStart={startDraw}
                        onTouchMove={draw}
                        onTouchEnd={stopDraw}
                    />
                    <p className="text-[11px] text-slate-400 text-center mt-1">Firma con el dedo o el ratón</p>
                </div>
                <div className="flex gap-2 px-4 pb-4 pt-1">
                    <button onClick={clearCanvas} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Trash2 className="w-4 h-4" /> Borrar
                    </button>
                    <button onClick={onClose} className="flex-1 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
                        Cancelar
                    </button>
                    <button onClick={confirm} disabled={!hasStroke}
                        className="flex-1 py-2 text-sm rounded-xl bg-amber-600 text-white font-semibold disabled:opacity-40 hover:bg-amber-700 flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4" /> Guardar firma
                    </button>
                </div>
            </div>
        </div>
    )
}
// \u2500\u2500 Talla/Color Grid Modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function TallaColorModal({
    grid,
    onConfirm,
    onClose,
}: {
    grid: TCGrid
    onConfirm: (cantidades: Record<string, number>) => void
    onClose: () => void
}) {
    const { articulo, tallas, colores, stock } = grid
    const [cantidades, setCantidades] = useState<Record<string, number>>({})

    const stockMap = new Map(stock.map(s => [`${s.color}__${s.talla}`, s.actual]))

    const setQty = (key: string, val: string) => {
        const n = parseInt(val) || 0
        setCantidades(prev => ({ ...prev, [key]: Math.max(0, n) }))
    }

    const totalUds = Object.values(cantidades).reduce((s, v) => s + v, 0)
    const hasAny = totalUds > 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div>
                        <p className="font-semibold text-slate-800">{articulo.nombre}</p>
                        <p className="text-xs text-slate-400 font-mono">{articulo.referencia} \u00b7 {articulo.precio.toFixed(2)} \u20ac \u00b7 IVA {articulo.piva}%</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="overflow-auto flex-1 px-4 py-3">
                    {tallas.length === 0 || colores.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">No hay tallas/colores configurados.</p>
                    ) : (
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="text-left py-2 pr-3 text-slate-500 font-medium text-xs">Color \\ Talla</th>
                                    {tallas.map(t => (
                                        <th key={t.codigo} className="text-center py-2 px-1 text-slate-700 font-semibold min-w-[56px]">{t.nombre}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {colores.map((col, ci) => (
                                    <tr key={col.codigo} className={ci % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                        <td className="py-2 pr-3 whitespace-nowrap">
                                            <span className="text-xs font-medium text-slate-700">{col.nombre}</span>
                                            <span className="text-[10px] text-slate-400 ml-1">({col.codigo})</span>
                                        </td>
                                        {tallas.map(tal => {
                                            const key = `${col.codigo}__${tal.codigo}`
                                            const stockVal = stockMap.get(key) ?? null
                                            const qty = cantidades[key] || 0
                                            return (
                                                <td key={tal.codigo} className="py-1 px-1 text-center">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <input
                                                            type="number" min="0"
                                                            value={qty === 0 ? '' : qty}
                                                            placeholder="0"
                                                            onChange={e => setQty(key, e.target.value)}
                                                            className={`w-12 text-center text-sm border rounded-lg py-1 px-1 focus:outline-none focus:ring-1 focus:ring-brand
                                                                ${qty > 0 ? 'border-brand bg-brand/5 font-semibold text-brand' : 'border-slate-200 bg-white text-slate-700'}`}
                                                        />
                                                        {stockVal !== null && (
                                                            <span className={`text-[9px] font-mono leading-none ${stockVal > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                                                                {stockVal > 0 ? `${Math.floor(stockVal)}u` : 'sin stk'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 gap-3">
                    <span className="text-sm text-slate-500">
                        {hasAny ? <span className="font-semibold text-slate-800">{totalUds} uds en {Object.values(cantidades).filter(v => v > 0).length} combinaciones</span> : 'Introduce cantidades'}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
                        <button onClick={() => onConfirm(cantidades)} disabled={!hasAny}
                            className="px-5 py-2 text-sm rounded-xl bg-brand text-white font-semibold disabled:opacity-40 hover:bg-brand/90 flex items-center gap-1.5">
                            <Check size={15} /> A\u00f1adir{hasAny ? ` (${totalUds} uds)` : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// \u2500\u2500 Lot Assignment Modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function distribuirLotesFEFO(lotes: Lote[], total: number, esDoble = false): AsignacionLote[] {
    let remaining = total
    return lotes.map(l => {
        const asignar = esDoble
            ? Math.round(Math.min(l.stock, Math.max(0, remaining)) * 100) / 100
            : Math.min(Math.floor(l.stock), Math.max(0, Math.floor(remaining)))
        remaining = Math.max(0, remaining - asignar)
        return { id: l.id, lote: l.lote, fecha_caducidad: l.fecha_caducidad, stock: l.stock, asignar }
    })
}

function LoteModal({
    nombre,
    referencia,
    lotes,
    esDobleUnidad,
    unidadNombre,
    onConfirm,
    onClose,
}: {
    nombre: string
    referencia: string
    lotes: Lote[]
    esDobleUnidad?: boolean
    unidadNombre?: string
    onConfirm: (asignaciones: AsignacionLote[]) => void
    onClose: () => void
}) {
    const etiqueta = esDobleUnidad ? (unidadNombre || 'Kilos') : 'Uds'
    const parseCantidad = (v: string) => esDobleUnidad ? parseFloat(v) || 0 : parseInt(v) || 0
    const [cantidad, setCantidad] = useState(esDobleUnidad ? '' : '1')
    const [asignaciones, setAsignaciones] = useState<AsignacionLote[]>(() =>
        distribuirLotesFEFO(lotes, esDobleUnidad ? 0 : 1, esDobleUnidad)
    )

    const totalAsignado = asignaciones.reduce((s, a) => s + a.asignar, 0)
    const totalRequerido = parseCantidad(cantidad)
    const stockTotal = lotes.reduce((s, l) => s + l.stock, 0)
    const diff = Math.abs(totalAsignado - totalRequerido)
    const ok = totalRequerido > 0 && diff < 0.001

    const handleCantidadChange = (val: string) => {
        setCantidad(val)
        const n = parseCantidad(val)
        setAsignaciones(distribuirLotesFEFO(lotes, n, esDobleUnidad))
    }

    const updateAsignacion = (idx: number, val: string) => {
        const n = Math.max(0, esDobleUnidad ? parseFloat(val) || 0 : parseInt(val) || 0)
        setAsignaciones(prev => prev.map((a, i) => i === idx ? { ...a, asignar: n } : a))
    }

    const fmtDate = (d: string | null) => d
        ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '—'

    const fmtStock = (v: number) => esDobleUnidad
        ? v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : Math.floor(v).toString()

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center px-3"
             onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{referencia}</p>
                            {esDobleUnidad && (
                                <span className="text-[10px] text-teal-600 font-semibold">Doble unidad · {etiqueta}</span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                {/* Cantidad total */}
                <div className="px-4 py-3 border-b border-slate-100">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                        Total {etiqueta} a asignar
                    </label>
                    <input
                        type="number"
                        min="0"
                        step={esDobleUnidad ? '0.01' : '1'}
                        max={stockTotal}
                        className="input text-center text-lg font-bold w-full"
                        value={cantidad}
                        placeholder={esDobleUnidad ? '0.000' : '1'}
                        onChange={e => handleCantidadChange(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 text-center mt-1">
                        Stock disponible: {fmtStock(stockTotal)} {etiqueta}
                    </p>
                </div>

                {/* Lotes */}
                <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                    {lotes.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">Sin lotes con stock</p>
                    ) : asignaciones.map((a, idx) => (
                        <div key={a.id} className="px-4 py-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                                <div>
                                    <span className="text-sm font-semibold text-slate-800 font-mono">{a.lote}</span>
                                    {a.fecha_caducidad && (
                                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                            new Date(a.fecha_caducidad) < new Date()
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-amber-50 text-amber-700'
                                        }`}>
                                            Cad. {fmtDate(a.fecha_caducidad)}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-slate-400">Stock: {fmtStock(a.stock)} {etiqueta}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500 w-16">Asignar:</label>
                                <input
                                    type="number"
                                    min="0"
                                    step={esDobleUnidad ? '0.01' : '1'}
                                    max={a.stock}
                                    className="input text-right text-sm flex-1"
                                    value={a.asignar === 0 ? '' : a.asignar}
                                    placeholder="0"
                                    onChange={e => updateAsignacion(idx, e.target.value)}
                                />
                                <span className="text-xs text-slate-400">/ {fmtStock(a.stock)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-200 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total asignado:</span>
                        <span className={`font-bold ${ok ? 'text-green-600' : 'text-red-600'}`}>
                            {fmtStock(totalAsignado)} / {totalRequerido > 0 ? fmtStock(totalRequerido) : '—'} {etiqueta}
                        </span>
                    </div>
                    {totalRequerido > 0 && !ok && (
                        <p className="text-xs text-red-500 text-center">
                            {totalAsignado < totalRequerido ? 'Stock insuficiente para cubrir la demanda' : 'Has asignado más de lo solicitado'}
                        </p>
                    )}
                    <button
                        onClick={() => onConfirm(asignaciones.filter(a => a.asignar > 0))}
                        disabled={totalAsignado === 0}
                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        <Check className="w-4 h-4" /> Confirmar lotes
                    </button>
                </div>
            </div>
        </div>
    )
}

// â”€â”€ Calculator Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CalculatorModal({
    initial,
    onConfirm,
    onClose,
}: {
    initial: string
    onConfirm: (val: string) => void
    onClose: () => void
}) {
    const [val, setVal] = useState(initial === '0' ? '' : initial)

    const press = (ch: string) => {
        if (ch === 'C') { setVal(''); return }
        if (ch === '\u232b') { setVal(v => v.slice(0, -1)); return }
        if (ch === '.' && val.includes('.')) return
        setVal(v => v + ch)
    }

    const keys = ['7','8','9','4','5','6','1','2','3','C','0','.','\u232b']

    return (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60]"
             onClick={onClose}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs p-4"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">Introducir cantidad</span>
                    <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="bg-slate-100 rounded-lg px-3 py-2 text-right text-xl font-mono mb-3 min-h-[2.5rem]">
                    {val || '0'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {keys.map(k => (
                        <button key={k} onClick={() => press(k)}
                            className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                                k === 'C' ? 'bg-red-100 text-red-600 hover:bg-red-200' :
                                k === '\u232b' ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' :
                                'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}>
                            {k}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => { onConfirm(val || '0'); onClose() }}
                    className="mt-3 w-full btn-primary flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Confirmar
                </button>
            </div>
        </div>
    )
}

// -- Doble Unidad Calculator Modal (sin lote) --------------------------

function DobleUnidadCalculatorModal({
    unidadNombre,
    initialUds,
    initialGramos,
    onConfirm,
    onClose,
}: {
    unidadNombre: string
    initialUds: string
    initialGramos: string
    onConfirm: (uds: string, gramos: string) => void
    onClose: () => void
}) {
    const [uds, setUds] = useState(initialUds === '0' ? '' : initialUds)
    const [gramos, setGramos] = useState(initialGramos === '0' ? '' : initialGramos)
    const udsRef = useRef<HTMLInputElement>(null)
    useEffect(() => { udsRef.current?.focus() }, [])

    const ok = (parseFloat(uds) || 0) > 0 && (parseFloat(gramos) || 0) > 0

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs p-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">Doble unidad · {unidadNombre}</span>
                    <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="space-y-3 mb-4">
                    <div>
                        <label className="text-xs text-slate-500 font-medium block mb-1">Unidades</label>
                        <input
                            ref={udsRef}
                            type="number" min="0" step="0.001" inputMode="decimal"
                            className="w-full text-right text-lg font-bold border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
                            value={uds} placeholder="0"
                            onChange={e => setUds(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 font-medium block mb-1">{unidadNombre}</label>
                        <input
                            type="number" min="0" step="0.01" inputMode="decimal"
                            className="w-full text-right text-lg font-bold border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
                            value={gramos} placeholder="0.00"
                            onChange={e => setGramos(e.target.value)}
                        />
                    </div>
                </div>
                <button
                    onClick={() => { onConfirm(uds || '0', gramos || '0'); onClose() }}
                    disabled={!ok}
                    className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
                >
                    <Check className="w-4 h-4" /> Confirmar
                </button>
            </div>
        </div>
    )
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// -- Doble Unidad + Lote Modal ------------------------------------------

function DobleUnidadLoteModal({
    nombre,
    referencia,
    unidadNombre,
    lotes,
    initialUds,
    onConfirm,
    onClose,
}: {
    nombre: string
    referencia: string
    unidadNombre: string
    lotes: Lote[]
    initialUds: string
    onConfirm: (uds: string, asignaciones: AsignacionLote[]) => void
    onClose: () => void
}) {
    const [uds, setUds] = useState(initialUds === '0' ? '' : initialUds)
    const [asignaciones, setAsignaciones] = useState<AsignacionLote[]>(() =>
        lotes.map(l => ({ id: l.id, lote: l.lote, fecha_caducidad: l.fecha_caducidad, stock: l.stock, asignar: 0 }))
    )
    const udsRef = useRef<HTMLInputElement>(null)
    useEffect(() => { udsRef.current?.focus() }, [])

    const totalKilos = asignaciones.reduce((s, a) => s + a.asignar, 0)
    const stockTotal = lotes.reduce((s, l) => s + l.stock, 0)
    const udsNum = parseFloat(uds) || 0
    const ok = udsNum > 0 && totalKilos > 0

    const updateAsignacion = (idx: number, val: string) => {
        const n = Math.max(0, Math.round((parseFloat(val) || 0) * 100) / 100)
        setAsignaciones(prev => prev.map((a, i) => i === idx ? { ...a, asignar: n } : a))
    }

    const fmtKg = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '--'

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center px-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{referencia}</p>
                            <span className="text-[10px] text-teal-600 font-semibold">Doble unidad · {unidadNombre}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                {/* Unidades */}
                <div className="px-4 py-3 border-b border-slate-100">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Unidades</label>
                    <input
                        ref={udsRef}
                        type="number" min="0" step="0.001" inputMode="decimal"
                        className="w-full text-right text-lg font-bold border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
                        value={uds} placeholder="0"
                        onChange={e => setUds(e.target.value)}
                    />
                </div>
                {/* Cabecera lotes */}
                <div className="px-4 pt-2 pb-1 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-600">
                        {unidadNombre} por lote
                        <span className="ml-2 text-slate-400 font-normal">Stock total: {fmtKg(stockTotal)} {unidadNombre}</span>
                    </p>
                </div>
                {/* Lista de lotes */}
                <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                    {lotes.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">Sin lotes con stock</p>
                    ) : asignaciones.map((a, idx) => (
                        <div key={a.id} className="px-4 py-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <div>
                                    <span className="text-sm font-semibold text-slate-800 font-mono">{a.lote}</span>
                                    {a.fecha_caducidad && (
                                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${new Date(a.fecha_caducidad) < new Date() ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                                            Cad. {fmtDate(a.fecha_caducidad)}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-slate-400">Stk: {fmtKg(a.stock)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-teal-600 font-semibold w-20">{unidadNombre}:</label>
                                <input
                                    type="number" min="0" step="0.01" max={a.stock} inputMode="decimal"
                                    className="input text-right text-sm flex-1"
                                    value={a.asignar === 0 ? '' : a.asignar}
                                    placeholder="0.00"
                                    onChange={e => updateAsignacion(idx, e.target.value)}
                                />
                                <span className="text-xs text-slate-400">/ {fmtKg(a.stock)}</span>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-200 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total {unidadNombre}:</span>
                        <span className={`font-bold ${totalKilos > 0 ? 'text-teal-600' : 'text-slate-400'}`}>{fmtKg(totalKilos)}</span>
                    </div>
                    <button
                        onClick={() => onConfirm(uds || '0', asignaciones.filter(a => a.asignar > 0))}
                        disabled={!ok}
                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        <Check className="w-4 h-4" /> Confirmar
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function Autoventa() {
    const { user, selectedLocal, refreshUser } = useAuth()
    const typedUser = user as UserMe | null
    const canEditPrice = typedUser?.rol === 'superadmin' || typedUser?.rol === 'gerente' || typedUser?.autoventa_modifica_precio === true

    // Step state
    const [tipodoc, setTipodoc] = useState<TipoDoc | null>(null)
    const serie = typedUser?.serie_autoventa ?? ''
    const [agenteNombre, setAgenteNombre] = useState<string>('')

    // Client search
    const [clienteQuery, setClienteQuery] = useState('')
    const [clienteResults, setClienteResults] = useState<ClienteResult[]>([])
    const [searchingCliente, setSearchingCliente] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteResult | null>(null)
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchSeq = useRef(0)
    const productosRef = useRef<HTMLDivElement>(null)

    // Products
    const [lineas, setLineas] = useState<LineaDoc[]>([])
    const [loadingProductos, setLoadingProductos] = useState(false)

    // Calculator modals
    const [calcIdx, setCalcIdx] = useState<number | null>(null)
    const [calcDobleIdx, setCalcDobleIdx] = useState<number | null>(null)
    const [calcPrecioIdx, setCalcPrecioIdx] = useState<number | null>(null)

    // Documentos cliente modal
    const [showDocsModal, setShowDocsModal] = useState(false)
    const [docsCliente, setDocsCliente] = useState<DocCliente[]>([])
    const [loadingDocs, setLoadingDocs] = useState(false)
    const [soloPte, setSoloPte] = useState(true)
    const [expandedDoc, setExpandedDoc] = useState<number | null>(null)
    const [docsClienteTarget, setDocsClienteTarget] = useState<ClienteResult | null>(null)

    // Cobrar modal
    const [cobrarTarget, setCobrarTarget] = useState<{
        tipo: 'albaran' | 'vencimiento'
        idcab: number
        vtoId?: number
        maxImporte: number
        label: string
        cli_codigo?: number
    } | null>(null)
    const [cobrarImporte, setCobrarImporte] = useState('')
    const [cobrarLoading, setCobrarLoading] = useState(false)
    const [cobrarError, setCobrarError] = useState('')

    // Cache clientes del agente
    const [clientesCache, setClientesCache] = useState<ClienteResult[]>([])

    // Filtro tipodoc en modal docs
    const [docsFiltraTipo, setDocsFiltraTipo] = useState<'todos' | '4' | '8'>('todos')

    // Modal detalle documento (líneas)
    interface LineaDetalle {
        referencia: string
        descripcion: string
        unidades: number
        gramos?: number
        tipo_unidad?: number
        precio: number
        dto: number
        importe: number
        piva: number
        talla: string
        color: string
    }
    interface DetalleDoc {
        id: number
        tipodoc: number
        serie: string
        numero: number
        fecha: string | null
        cli_codigo: number
        cli_nombre: string
        total: number
        lineas: LineaDetalle[]
    }
    const [detalleDoc, setDetalleDoc] = useState<DetalleDoc | null>(null)
    const [detalleDocLoading, setDetalleDocLoading] = useState(false)
    const [quickPrintingDocId, setQuickPrintingDocId] = useState<number | null>(null)

    const handleQuickPrint = async (cliCodigo: number, doc: { id: number; tipodoc: number; tipodoc_label: string; serie: string; numero: number; fecha: string | null; cli_nombre: string; total: number }) => {
        setQuickPrintingDocId(doc.id)
        try {
            const r = await api.get<DetalleDoc>(`/api/autoventa/clientes/${cliCodigo}/documentos/${doc.id}/lineas`)
            const d = r.data
            const cfg = loadPrinterConfig()
            await printTicket(
                {
                    tipodoc_label: doc.tipodoc_label,
                    serie: doc.serie,
                    numero: doc.numero,
                    fecha: doc.fecha,
                    cli_nombre: doc.cli_nombre,
                    lineas: d.lineas.map(l => ({
                        descripcion: l.descripcion,
                        unidades: String(l.unidades),
                        gramos: l.gramos ? String(l.gramos) : undefined,
                        tipo_unidad: l.tipo_unidad ?? 0,
                        unidad: String(l.unidades),
                        precio: l.precio,
                        dto: l.dto,
                        piva: l.piva,
                        talla: l.talla,
                        color: l.color,
                    })),
                    total: doc.total,
                    agenteNombre: agenteNombre || undefined,
                },
                cfg,
            )
        } catch { /* silencioso */ } finally {
            setQuickPrintingDocId(null)
        }
    }

    const openDetalleDoc = async (cliCodigo: number, idcab: number) => {
        setDetalleDocLoading(true)
        setDetalleDoc(null)
        setDetalleDocEmail('')
        setDetalleDocEmailEnviado(false)
        setDetalleDocEmailError('')
        setDetallePrintOk(false)
        setDetallePrintError('')
        try {
            const r = await api.get<DetalleDoc>(`/api/autoventa/clientes/${cliCodigo}/documentos/${idcab}/lineas`)
            setDetalleDoc(r.data)
        } catch {
            // silencioso — el botón muestra el loader
        } finally {
            setDetalleDocLoading(false)
        }
    }

    // Consultar standalone (sin venta) — nuevo diseño
    interface DocTodos {
        id: number
        tipodoc: number
        tipodoc_label: string
        serie: string
        numero: number
        fecha: string | null
        cli_codigo: number
        cli_nombre: string
        total: number
        pagado: number
        pendiente: number
        vencimientos: Vencimiento[]
    }
    const [showConsultarModal, setShowConsultarModal] = useState(false)
    const [consultarQuery, setConsultarQuery] = useState('')
    const [consultarCliente, setConsultarCliente] = useState<ClienteResult | null>(null)
    const [consultarDocs, setConsultarDocs] = useState<DocTodos[]>([])
    const [consultarLoading, setConsultarLoading] = useState(false)
    const [consultarError, setConsultarError] = useState('')
    const [consultarSeleccion, setConsultarSeleccion] = useState<Set<string>>(new Set())
    const [consultarCobrandoMultiple, setConsultarCobrandoMultiple] = useState(false)
    const [consultarCobrarError, setConsultarCobrarError] = useState('')

    // Liquidación
    interface LiqDocHoy {
        id: number
        tipodoc: number
        tipodoc_label: string
        serie: string
        numero: number | null
        fecha: string
        cli_codigo: number
        cli_nombre: string
        total: number
        cobrado: number
        pendiente: number
    }
    interface LiqCobroOtro {
        id: number
        concepto: string
        serie: string
        numero: number | null
        fecha_doc: string | null
        cli_nombre: string
        ingreso: number
        reintegro: number
    }
    const [showLiquidacionModal, setShowLiquidacionModal] = useState(false)
    const [liqDocsHoy, setLiqDocsHoy] = useState<LiqDocHoy[]>([])
    const [liqCobrosOtros, setLiqCobrosOtros] = useState<LiqCobroOtro[]>([])
    const [liqTotalVentas, setLiqTotalVentas] = useState(0)
    const [liqTotalCobradoHoy, setLiqTotalCobradoHoy] = useState(0)
    const [liqTotalCobrosOtros, setLiqTotalCobrosOtros] = useState(0)
    const [liqFecha, setLiqFecha] = useState('')
    const [liqLoading, setLiqLoading] = useState(false)
    const [liqError, setLiqError] = useState('')
    const [liqEmailSending, setLiqEmailSending] = useState(false)
    const [liqEmailMsg, setLiqEmailMsg] = useState('')
    const [liqEmailDest, setLiqEmailDest] = useState('')
    type LiqFiltro = 'hoy' | 'semana' | 'mes' | 'avanzado'
    const [liqFiltro, setLiqFiltro] = useState<LiqFiltro>('hoy')
    const [liqDesde, setLiqDesde] = useState('')
    const [liqHasta, setLiqHasta] = useState('')

    const calcLiqDates = (filtro: LiqFiltro): { desde: string; hasta: string } | null => {
        const hoy = new Date()
        const fmt = (d: Date) => d.toISOString().slice(0, 10)
        if (filtro === 'hoy') return { desde: fmt(hoy), hasta: fmt(hoy) }
        if (filtro === 'semana') {
            const lunes = new Date(hoy)
            lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
            return { desde: fmt(lunes), hasta: fmt(hoy) }
        }
        if (filtro === 'mes') {
            const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
            return { desde: fmt(primero), hasta: fmt(hoy) }
        }
        return null
    }

    const cargarLiquidacion = async (filtro: LiqFiltro = 'hoy', desde?: string, hasta?: string) => {
        let d = desde, h = hasta
        if (filtro !== 'avanzado') {
            const dates = calcLiqDates(filtro)
            if (!dates) return
            d = dates.desde; h = dates.hasta
        }
        if (!d || !h) return
        setLiqDesde(d)
        setLiqHasta(h)
        setLiqLoading(true)
        setLiqError('')
        setLiqEmailMsg('')
        try {
            const r = await api.get('/api/autoventa/liquidacion', { params: { desde: d, hasta: h } })
            setLiqFecha(r.data.fecha)
            setLiqDocsHoy(r.data.docs_hoy)
            setLiqCobrosOtros(r.data.cobros_otros_dias)
            setLiqTotalVentas(r.data.total_ventas)
            setLiqTotalCobradoHoy(r.data.total_cobrado_hoy)
            setLiqTotalCobrosOtros(r.data.total_cobros_otros_dias)
        } catch {
            setLiqError('Error cargando liquidación')
        } finally {
            setLiqLoading(false)
        }
    }

    const openLiquidacion = () => {
        const hoy = new Date().toISOString().slice(0, 10)
        setLiqDocsHoy([])
        setLiqCobrosOtros([])
        setLiqError('')
        setLiqEmailMsg('')
        setLiqFiltro('hoy')
        setLiqDesde(hoy)
        setLiqHasta(hoy)
        const lastEmail = localStorage.getItem('liq_email_dest')
        setLiqEmailDest(lastEmail || (user as UserMe)?.email || '')
        setShowLiquidacionModal(true)
        cargarLiquidacion('hoy')
    }

    const enviarLiquidacionEmail = async () => {
        setLiqEmailSending(true)
        setLiqEmailMsg('')
        try {
            await api.post('/api/autoventa/enviar-liquidacion', {
                fecha: liqFecha,
                docs_hoy: liqDocsHoy,
                cobros_otros_dias: liqCobrosOtros,
                total_ventas: liqTotalVentas,
                total_cobrado_hoy: liqTotalCobradoHoy,
                total_cobros_otros_dias: liqTotalCobrosOtros,
                email_destino: liqEmailDest,
            })
            setLiqEmailMsg('Email enviado correctamente')
            localStorage.setItem('liq_email_dest', liqEmailDest.trim())
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Error enviando email'
            setLiqEmailMsg(msg)
        } finally {
            setLiqEmailSending(false)
        }
    }

    // ── Consultar: funciones del nuevo modal ──────────────────────────────
    const openConsultarModal = async () => {
        setConsultarQuery('')
        setConsultarSeleccion(new Set())
        setConsultarCobrarError('')
        setConsultarDocs([])
        setShowConsultarModal(true)
        setConsultarLoading(true)
        setConsultarError('')
        try {
            const r = await api.get('/api/autoventa/documentos-todos')
            setConsultarDocs(r.data)
        } catch {
            setConsultarError('Error cargando documentos')
        } finally {
            setConsultarLoading(false)
        }
    }

    const consultarDocsFiltrados = consultarDocs.filter(d => {
        if (!consultarQuery.trim()) return true
        const q = consultarQuery.toLowerCase()
        return (
            d.cli_nombre.toLowerCase().includes(q) ||
            `${d.serie}-${d.numero}`.toLowerCase().includes(q) ||
            String(d.numero).includes(q)
        )
    })

    // Clave única por doc: "tipodoc-idcab[-vtoid]"
    const consultarDocKey = (d: DocTodos, vtoId?: number) =>
        vtoId ? `${d.tipodoc}-${d.id}-${vtoId}` : `${d.tipodoc}-${d.id}`

    const consultarToggleDoc = (d: DocTodos) => {
        const next = new Set(consultarSeleccion)
        if (d.tipodoc === 4) {
            const k = consultarDocKey(d)
            if (next.has(k)) next.delete(k)
            else next.add(k)
        } else {
            // Factura: seleccionar/deseleccionar todos sus vencimientos pendientes
            const keys = d.vencimientos.filter(v => v.situacion === 0).map(v => consultarDocKey(d, v.id))
            const allSelected = keys.every(k => next.has(k))
            if (allSelected) keys.forEach(k => next.delete(k))
            else keys.forEach(k => next.add(k))
        }
        setConsultarSeleccion(next)
    }

    const consultarTotalSeleccionado = consultarDocsFiltrados.reduce((acc, d) => {
        if (d.tipodoc === 4) {
            if (consultarSeleccion.has(consultarDocKey(d))) acc += d.pendiente
        } else {
            d.vencimientos.filter(v => v.situacion === 0).forEach(v => {
                if (consultarSeleccion.has(consultarDocKey(d, v.id)))
                    acc += v.importe - v.entregas_cuenta
            })
        }
        return acc
    }, 0)

    const consultarTotalPte = consultarDocsFiltrados.reduce((acc, d) => acc + d.pendiente, 0)

    const handleCobrarMultiple = async () => {
        if (consultarSeleccion.size === 0) return
        setConsultarCobrandoMultiple(true)
        setConsultarCobrarError('')
        try {
            const items: Array<{tipo: string; idcab: number; cli_codigo: number; importe: number; vto_id?: number}> = []
            for (const d of consultarDocs) {
                if (d.tipodoc === 4) {
                    const k = consultarDocKey(d)
                    if (consultarSeleccion.has(k)) {
                        items.push({ tipo: 'albaran', idcab: d.id, cli_codigo: d.cli_codigo, importe: d.pendiente })
                    }
                } else {
                    for (const v of d.vencimientos.filter(vv => vv.situacion === 0)) {
                        const k = consultarDocKey(d, v.id)
                        if (consultarSeleccion.has(k)) {
                            items.push({ tipo: 'vencimiento', idcab: d.id, cli_codigo: d.cli_codigo, importe: v.importe - v.entregas_cuenta, vto_id: v.id })
                        }
                    }
                }
            }
            await api.post('/api/autoventa/cobrar-multiple', { items })
            // Recargar
            setConsultarSeleccion(new Set())
            setConsultarLoading(true)
            const r = await api.get('/api/autoventa/documentos-todos')
            setConsultarDocs(r.data)
        } catch (e: any) {
            setConsultarCobrarError(e.response?.data?.detail || 'Error registrando cobros')
        } finally {
            setConsultarCobrandoMultiple(false)
            setConsultarLoading(false)
        }
    }

    // Carrito
    const [showCarritoModal, setShowCarritoModal] = useState(false)
    const [conIva, setConIva] = useState(false)

    // Visita
    const [modoVisita, setModoVisita] = useState(false)
    const [visitaMotivo, setVisitaMotivo] = useState('Visita comercial')
    const [visitaResultado, setVisitaResultado] = useState('')
    const [visitaSubmitting, setVisitaSubmitting] = useState(false)
    const [visitaOk, setVisitaOk] = useState(false)
    const [visitaError, setVisitaError] = useState('')

    // Añadir artículo manualmente
    const [showAddArticuloModal, setShowAddArticuloModal] = useState(false)
    const [articuloQuery, setArticuloQuery] = useState('')
    const [articuloResults, setArticuloResults] = useState<ArticuloBusqueda[]>([])
    const [articulosCache, setArticulosCache] = useState<ArticuloBusqueda[]>([])
    const [searchingArticulo, setSearchingArticulo] = useState(false)
    const articuloSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Vista imágenes / líneas
    const [vistaImagenes, setVistaImagenes] = useState(false)

    // Lote modal
    const [loteModal, setLoteModal] = useState<{
        articulo: ArticuloBusqueda
        lotes: Lote[]
    } | null>(null)
    // índice de la línea que abrió el modal de lotes (-1 = artículo nuevo)
    const [loteLineaIdx, setLoteLineaIdx] = useState<number>(-1)

    // Modal doble unidad + lote
    const [dobleUnidadLoteModal, setDobleUnidadLoteModal] = useState<{
        lineaIdx: number
        articulo: ArticuloBusqueda
        lotes: Lote[]
    } | null>(null)

    // Modal talla/color
    const [tcModal, setTcModal] = useState<TCGrid | null>(null)
    const [tcReemplazarIdx, setTcReemplazarIdx] = useState<number | null>(null)

    // Submit
    const [submitting, setSubmitting] = useState(false)
    const [resultado, setResultado] = useState<{
        serie: string; numero: number; tipodoc_label: string; total: number
        idcab: number; cli_codigo: number; cli_email: string; tipodoc: number
    } | null>(null)
    const [error, setError] = useState('')

    // Impresora térmica
    const isAndroid = /android/i.test(navigator.userAgent)
    const [printing, setPrinting] = useState(false)
    const [printError, setPrintError] = useState('')
    const [printOk, setPrintOk] = useState(false)
    const [showPrinterConfig, _setShowPrinterConfig] = useState(false)  // unused, kept for compat
    const [paperWidth, setPaperWidth] = useState<80 | 100>(() => {
        const cfg = loadPrinterConfig()
        return (cfg.paper_width ?? 80) as 80 | 100
    })
    // Precargar historial: viene del perfil del usuario (por defecto true)
    const precargarHistorial = typedUser?.precargar_historial_autoventa !== false

    // Impresión desde detalle documento
    const [detallePrinting, setDetallePrinting] = useState(false)
    const [detallePrintOk, setDetallePrintOk] = useState(false)
    const [detallePrintError, setDetallePrintError] = useState('')

    // Post-venta: cobrar + email
    const [postVentaEmail, setPostVentaEmail] = useState('')
    const [postVentaEnviando, setPostVentaEnviando] = useState(false)
    const [postVentaEmailEnviado, setPostVentaEmailEnviado] = useState(false)
    const [postVentaEmailError, setPostVentaEmailError] = useState('')

    // Detalle doc: envío email
    const [detalleDocEmail, setDetalleDocEmail] = useState('')
    const [detalleDocEnviando, setDetalleDocEnviando] = useState(false)
    const [detalleDocEmailEnviado, setDetalleDocEmailEnviado] = useState(false)
    const [detalleDocEmailError, setDetalleDocEmailError] = useState('')

    // Post-venta: firma
    const [showFirmaModal, setShowFirmaModal] = useState(false)
    const [firmaGuardada, setFirmaGuardada] = useState(false)
    const [firmaGuardando, setFirmaGuardando] = useState(false)
    const [firmaError, setFirmaError] = useState('')

    // Lista de documentos
    const [vista, setVista] = useState<'lista' | 'creando'>('lista')
    const [listaDocumentos, setListaDocumentos] = useState<DocListaItem[]>([])
    const [listaVisitas, setListaVisitas] = useState<VisitaListaItem[]>([])
    const [listaLoading, setListaLoading] = useState(false)
    const [listaError, setListaError] = useState('')
    const [editandoId, setEditandoId] = useState<number | null>(null)
    const [editandoFinalizado, setEditandoFinalizado] = useState(false)
    const [editandoFechaFin, setEditandoFechaFin] = useState<string | null>(null)
    // Detalle albarán
    const [detalleAlbaran, setDetalleAlbaran] = useState<DetalleAlbaran | null>(null)
    const [detalleLoading, setDetalleLoading] = useState(false)

    const hasClienteContext = !!(clienteSeleccionado || consultarCliente || docsClienteTarget)

    // Refrescar perfil al montar para tener precargar_historial_autoventa actualizado
    useEffect(() => { refreshUser().catch(() => {}) }, [])

    // Sincronizar paper_width desde el perfil del usuario al localStorage
    useEffect(() => {
        const w = typedUser?.paper_width_impresora
        if (w === 80 || w === 100) {
            const cfg = loadPrinterConfig()
            savePrinterConfig({ ...cfg, paper_width: w })
            setPaperWidth(w)
        }
    }, [typedUser?.paper_width_impresora])

    // Load agente info + cache clientes on mount
    useEffect(() => {
        api.get<AgenteOption[]>('/api/autoventa/agentes').then(r => {
            const agenteCode = typedUser?.agente_autoventa
            if (agenteCode) {
                const found = r.data.find(a => a.codigo === agenteCode)
                if (found) setAgenteNombre(found.nombre)
            }
        }).catch(() => {})

        api.get<ClienteResult[]>('/api/autoventa/clientes/agente').then(r => {
            setClientesCache(r.data)
        }).catch(() => {})
    }, [typedUser])

    // Client autocomplete â€“ filter from cache first, fallback to API
    const handleClienteInput = (q: string) => {
        searchSeq.current += 1
        const mySeq = searchSeq.current
        setClienteQuery(q)
        setClienteSeleccionado(null)
        setLineas([])
        if (searchTimer.current) clearTimeout(searchTimer.current)

        // Instant filter from cache — multi-word, case-insensitive
        const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
        const cached = clientesCache.filter(c => {
            if (words.length === 0) return true
            const haystack = (c.nombre + ' ' + (c.alias || '') + ' ' + (c.cif || '') + ' ' + (c.localidad || '')).toLowerCase()
            return words.every(w => haystack.includes(w))
        }).slice(0, 50)
        setClienteResults(cached)

        // Also search server for non-cached clients (only when there's a query)
        if (q.length >= 2) {
            searchTimer.current = setTimeout(async () => {
                setSearchingCliente(true)
                try {
                    const r = await api.get<ClienteResult[]>(`/api/autoventa/clientes/buscar?q=${encodeURIComponent(q)}`)
                    if (mySeq !== searchSeq.current) return
                    setClienteResults(r.data)
                } catch { /* keep cached results */ }
                finally { setSearchingCliente(false) }
            }, 300)
        }
    }

    const handleClienteFocus = () => {
        if (!clienteSeleccionado && clienteResults.length === 0) {
            setClienteResults(clientesCache.slice(0, 50))
        }
    }

    const selectCliente = async (c: ClienteResult) => {
        // Invalidate any pending/in-flight search to avoid stale results reappearing.
        searchSeq.current += 1
        if (searchTimer.current) clearTimeout(searchTimer.current)
        setSearchingCliente(false)
        setClienteSeleccionado(c)
        setClienteResults([])
        setClienteQuery('')
        setArticulosCache([])
        setTimeout(() => productosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
        if (modoVisita) return   // en modo visita no cargar productos
        setLoadingProductos(true)
        setLineas([])
        try {
            if (!precargarHistorial) {
                // Sin precargar historial: lista vacía
                setLineas([])
            } else {
            const r = await api.get<ProductoConsumo[]>(`/api/autoventa/clientes/${c.codigo}/consumo-90dias`)
            setLineas(r.data.map(p => ({
                referencia: p.referencia,
                descripcion: p.descripcion,
                unidades: '0',
                gramos: '0',
                tipo_unidad: p.tipo_unidad ?? 0,
                unidad: p.unidad ?? '',
                precio: p.precio,
                dto: p.dto ?? 0,
                piva: p.piva,
                precioEditado: false,
                control_lotes: p.control_lotes,
                tallas_colores: p.tallas_colores || false,
                tiene_imagen: p.tiene_imagen,
                canon_suma_importe: p.canon_suma_importe ?? false,
                canon_importe_unit: p.canon_importe ?? 0,
                canon_descripcion: p.canon_descripcion ?? '',
            })))
            }
        } catch { setLineas([]) }
        finally { setLoadingProductos(false) }
    }

    const updateUnidades = (idx: number, val: string) => {
        setLineas(prev => {
            const linea = prev[idx]
            const newUds = parseFloat(val) || 0

            // Actualizar unidades del artículo y sincronizar canon existente
            let updated = prev.map((l, i) => {
                if (i === idx) return { ...l, unidades: val }
                if (l.es_canon && l.canon_de === linea?.referencia) return { ...l, unidades: val }
                return l
            })

            // Gestionar creación/eliminación de línea canon en precargados
            if (!linea?.es_canon && linea?.canon_suma_importe && (linea?.canon_importe_unit ?? 0) > 0) {
                const canonExists = updated.some(l => l.es_canon && l.canon_de === linea.referencia)
                if (newUds > 0 && !canonExists) {
                    // Insertar línea canon justo después del artículo
                    updated = [
                        ...updated.slice(0, idx + 1),
                        {
                            referencia: '',
                            descripcion: linea.canon_descripcion || 'Canon Digital según Real Decreto 209/2023 de 28 de marzo',
                            unidades: val,
                            gramos: '0',
                            tipo_unidad: 0,
                            unidad: '',
                            precio: linea.canon_importe_unit!,
                            dto: 0,
                            piva: linea.piva,
                            precioEditado: false,
                            es_canon: true,
                            canon_de: linea.referencia,
                        },
                        ...updated.slice(idx + 1),
                    ]
                } else if (newUds <= 0 && canonExists) {
                    // Eliminar línea canon al volver a 0
                    updated = updated.filter(l => !(l.es_canon && l.canon_de === linea.referencia))
                }
            }

            return updated
        })
    }

    const updateGramos = (idx: number, val: string) => {
        setLineas(prev => prev.map((l, i) => i === idx ? { ...l, gramos: val } : l))
    }

    const abrirLotesParaLinea = async (idx: number) => {
        const linea = lineas[idx]
        if (!linea) return
        try {
            const r = await api.get<Lote[]>(`/api/autoventa/articulos/${encodeURIComponent(linea.referencia)}/lotes`)
            setLoteLineaIdx(idx)
            setLoteModal({
                articulo: { referencia: linea.referencia, nombre: linea.descripcion, precio: linea.precio, dto: linea.dto, piva: linea.piva, control_lotes: true, tiene_imagen: linea.tiene_imagen, tipo_unidad: linea.tipo_unidad, unidad: linea.unidad },
                lotes: r.data,
            })
        } catch { /* ignore */ }
    }

    const abrirDobleUnidadLoteModal = async (idx: number) => {
        const linea = lineas[idx]
        if (!linea) return
        try {
            const r = await api.get<Lote[]>(`/api/autoventa/articulos/${encodeURIComponent(linea.referencia)}/lotes`)
            setDobleUnidadLoteModal({
                lineaIdx: idx,
                articulo: { referencia: linea.referencia, nombre: linea.descripcion, precio: linea.precio, dto: linea.dto, piva: linea.piva, control_lotes: true, tiene_imagen: linea.tiene_imagen, tipo_unidad: 1, unidad: linea.unidad },
                lotes: r.data,
            })
        } catch { /* ignore */ }
    }

    const abrirTcParaLinea = async (idx: number) => {
        const linea = lineas[idx]
        if (!linea) return
        try {
            const r = await api.get<{ tallas: TallaCodigo[]; colores: ColorCodigo[]; stock: StockTC[] }>(
                `/api/autoventa/articulos/${encodeURIComponent(linea.referencia)}/tallas-colores`
            )
            setTcReemplazarIdx(idx)
            setTcModal({
                articulo: { referencia: linea.referencia, nombre: linea.descripcion, precio: linea.precio, dto: linea.dto, piva: linea.piva, tallas_colores: true, tiene_imagen: linea.tiene_imagen },
                ...r.data,
            })
        } catch { /* ignore */ }
    }

    const updatePrecio = (idx: number, val: string) => {
        const n = parseFloat(val)
        if (!isNaN(n)) {
            setLineas(prev => prev.map((l, i) => i === idx ? { ...l, precio: n, precioEditado: true } : l))
        }
    }

    const updateDto = (idx: number, val: string) => {
        const n = parseFloat(val)
        if (!isNaN(n) && n >= 0 && n <= 100) {
            setLineas(prev => prev.map((l, i) => i === idx ? { ...l, dto: n } : l))
        } else if (val === '' || val === '-') {
            setLineas(prev => prev.map((l, i) => i === idx ? { ...l, dto: 0 } : l))
        }
    }

    const lineasConUds = lineas.filter(l => {
        const uds = parseFloat(l.unidades)
        if (l.tipo_unidad === 1) return uds > 0 && parseFloat(l.gramos) > 0
        return uds > 0
    })

    const total = lineasConUds.reduce((acc, l) => {
        const precioEfectivo = l.precio * (1 - l.dto / 100)
        const baseQty = l.tipo_unidad === 1 ? parseFloat(l.gramos) || 0 : parseFloat(l.unidades) || 0
        const imp = baseQty * precioEfectivo
        return acc + imp + imp * l.piva / 100
    }, 0)

    const totalSinIva = lineasConUds.reduce((acc, l) => {
        const precioEfectivo = l.precio * (1 - l.dto / 100)
        const baseQty = l.tipo_unidad === 1 ? parseFloat(l.gramos) || 0 : parseFloat(l.unidades) || 0
        return acc + baseQty * precioEfectivo
    }, 0)

    const desgloseIva = Object.entries(
        lineasConUds.reduce((acc, l) => {
            const precioEfectivo = l.precio * (1 - l.dto / 100)
            const baseQty = l.tipo_unidad === 1 ? parseFloat(l.gramos) || 0 : parseFloat(l.unidades) || 0
            const base = baseQty * precioEfectivo
            const piva = l.piva
            if (!acc[piva]) acc[piva] = 0
            acc[piva] += base * piva / 100
            return acc
        }, {} as Record<number, number>)
    ).sort(([a], [b]) => Number(a) - Number(b))

    const openDocsModal = async (cli?: ClienteResult, setAsCurrent = true) => {
        const c = cli || clienteSeleccionado
        if (!c) return
        if (cli && setAsCurrent) setClienteSeleccionado(cli)
        setDocsClienteTarget(c)
        setShowDocsModal(true)
        setExpandedDoc(null)
        setDocsFiltraTipo('todos')
        setLoadingDocs(true)
        try {
            const r = await api.get<DocCliente[]>(`/api/autoventa/clientes/${c.codigo}/documentos?solo_pte=true`)
            setDocsCliente(r.data)
        } catch { setDocsCliente([]) }
        finally { setLoadingDocs(false) }
    }

    const reloadDocs = async (pte: boolean, tipoFiltro?: 'todos' | '4' | '8') => {
        const c = docsClienteTarget || clienteSeleccionado
        if (!c) return
        setLoadingDocs(true)
        try {
            const tipo = tipoFiltro ?? docsFiltraTipo
            const tipoParam = tipo !== 'todos' ? `&tipodoc=${tipo}` : ''
            const r = await api.get<DocCliente[]>(`/api/autoventa/clientes/${c.codigo}/documentos?solo_pte=${pte}${tipoParam}`)
            setDocsCliente(r.data)
        } catch { setDocsCliente([]) }
        finally { setLoadingDocs(false) }
    }

    const totalPteCobro = docsCliente.reduce((acc, doc) => acc + (doc.pendiente || 0), 0)

    const openCobrar = (target: typeof cobrarTarget) => {
        setCobrarTarget(target)
        setCobrarImporte(target ? target.maxImporte.toFixed(2) : '')
        setCobrarError('')
    }

    const handleCobrar = async () => {
        const clienteCobro = docsClienteTarget || clienteSeleccionado
        const codigoCobro = cobrarTarget?.cli_codigo ?? clienteCobro?.codigo
        if (!cobrarTarget || !codigoCobro) return
        const imp = parseFloat(cobrarImporte)
        if (isNaN(imp) || imp <= 0) { setCobrarError('Importe inválido'); return }
        if (imp > cobrarTarget.maxImporte + 0.01) { setCobrarError(`Máximo permitido: ${cobrarTarget.maxImporte.toFixed(2)}€`); return }
        setCobrarLoading(true)
        setCobrarError('')
        try {
            if (cobrarTarget.tipo === 'albaran') {
                await api.post(`/api/autoventa/clientes/${codigoCobro}/documentos/${cobrarTarget.idcab}/cobrar-albaran`, {
                    importe: imp,
                })
            } else {
                await api.post(`/api/autoventa/clientes/${codigoCobro}/documentos/${cobrarTarget.idcab}/cobrar-vencimiento`, {
                    vto_id: cobrarTarget.vtoId,
                    importe: imp,
                })
            }
            setCobrarTarget(null)
            // Si cobro desde la lista de albaranes, recargamos la lista
            if (tipodoc && vista === 'lista') cargarLista(tipodoc)
            else reloadDocs(soloPte, docsFiltraTipo)
        } catch (e: any) {
            const detail = e.response?.data?.detail
            setCobrarError(typeof detail === 'string' ? detail : 'Error registrando cobro')
        } finally {
            setCobrarLoading(false)
        }
    }

    const handleArticuloInput = (q: string) => {
        setArticuloQuery(q)
        if (articuloSearchTimer.current) clearTimeout(articuloSearchTimer.current)
        const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
        const filtered = articulosCache.filter(a => {
            if (words.length === 0) return true
            const haystack = (a.referencia + ' ' + a.nombre).toLowerCase()
            return words.every(w => haystack.includes(w))
        })
        setArticuloResults(filtered)
    }

    const openAddArticuloModal = async () => {
        setShowAddArticuloModal(true)
        setArticuloQuery('')
        setArticuloResults([])
        setArticulosCache([])  // siempre recargar para datos frescos
        if (!clienteSeleccionado) return
        setSearchingArticulo(true)
        try {
            const r = await api.get<ArticuloBusqueda[]>(
                `/api/autoventa/articulos/buscar?q=&cli_codigo=${clienteSeleccionado.codigo}`
            )
            setArticulosCache(r.data)
            setArticuloResults(r.data)
        } catch { /* ignore */ }
        finally { setSearchingArticulo(false) }
    }

    const addArticuloToLineas = async (a: ArticuloBusqueda) => {
        setShowAddArticuloModal(false)
        setArticuloQuery('')
        setArticuloResults([])

        // For albarán/factura with lot control, open lot modal
        if (a.control_lotes && (tipodoc === 4 || tipodoc === 8)) {
            try {
                const r = await api.get<Lote[]>(`/api/autoventa/articulos/${encodeURIComponent(a.referencia)}/lotes`)
                const esDoble = (a.tipo_unidad ?? 0) === 1
                if (esDoble) {
                    // Crear línea vacía primero y abrir modal combinado de doble unidad + lote
                    const nuevaLinea: LineaDoc = {
                        referencia: a.referencia,
                        descripcion: a.nombre,
                        unidades: '0',
                        gramos: '0',
                        tipo_unidad: 1,
                        unidad: a.unidad ?? '',
                        precio: a.precio,
                        dto: a.dto ?? 0,
                        piva: a.piva,
                        precioEditado: false,
                        control_lotes: true,
                        tiene_imagen: a.tiene_imagen,
                    }
                    let nuevoIdx = -1
                    setLineas(prev => {
                        nuevoIdx = prev.length
                        return [...prev, nuevaLinea]
                    })
                    // Esperar al siguiente tick para que setLineas haya aplicado
                    setTimeout(() => {
                        setDobleUnidadLoteModal({
                            lineaIdx: nuevoIdx,
                            articulo: { ...a, control_lotes: true, tipo_unidad: 1 },
                            lotes: r.data,
                        })
                    }, 0)
                } else {
                    setLoteLineaIdx(-1)
                    setLoteModal({ articulo: a, lotes: r.data })
                }
            } catch {
                // fallback: add without lot control
                _addLineaSinLote(a, '1')
            }
            return
        }

        // Talla/color: abrir cuadrícula
        if (a.tallas_colores) {
            try {
                const r = await api.get<{ tallas: TallaCodigo[]; colores: ColorCodigo[]; stock: StockTC[] }>(
                    `/api/autoventa/articulos/${encodeURIComponent(a.referencia)}/tallas-colores`
                )
                setTcModal({ articulo: a, ...r.data })
            } catch {
                _addLineaSinLote(a, '1')
            }
            return
        }

        _addLineaSinLote(a, '1')
    }

    const _addLineaSinLote = (a: ArticuloBusqueda, uds: string) => {
        const existing = lineas.findIndex(l => l.referencia === a.referencia)
        if (existing < 0) {
            const lineasNuevas: LineaDoc[] = [{
                referencia: a.referencia,
                descripcion: a.nombre,
                unidades: uds,
                gramos: '0',
                tipo_unidad: a.tipo_unidad ?? 0,
                unidad: a.unidad ?? '',
                precio: a.precio,
                dto: a.dto ?? 0,
                piva: a.piva,
                precioEditado: false,
                control_lotes: a.control_lotes,
                tiene_imagen: a.tiene_imagen,
            }]
            // Si el artículo tiene canon digital activo, añadir línea canon automáticamente
            if (a.canon_suma_importe && (a.canon_importe ?? 0) > 0) {
                lineasNuevas.push({
                    referencia: '',
                    descripcion: a.canon_descripcion || 'Canon Digital según Real Decreto 209/2023 de 28 de marzo',
                    unidades: uds,
                    gramos: '0',
                    tipo_unidad: 0,
                    unidad: '',
                    precio: a.canon_importe!,
                    dto: 0,
                    piva: a.piva,
                    precioEditado: false,
                    es_canon: true,
                    canon_de: a.referencia,
                })
            }
            setLineas(prev => [...prev, ...lineasNuevas])
        }
    }

    const handleConfirmarLotes = (asignaciones: AsignacionLote[]) => {
        if (!loteModal) return
        const { articulo } = loteModal
        const esDoble = (articulo.tipo_unidad ?? 0) === 1
        const validas = asignaciones.filter(a => a.asignar > 0)
        if (validas.length === 0) { setLoteModal(null); setLoteLineaIdx(-1); return }
        const totalAsignado = validas.reduce((s, a) => s + a.asignar, 0)

        if (loteLineaIdx >= 0) {
            // Actualizar línea existente (precargada)
            setLineas(prev => {
                const linea = prev[loteLineaIdx]
                let updated = prev.map((l, i) => i === loteLineaIdx
                    ? esDoble
                        ? { ...l, gramos: String(totalAsignado), lotes_asignados: validas }
                        : { ...l, unidades: String(totalAsignado), lotes_asignados: validas }
                    : l
                )
                // Gestionar línea canon para precargados
                if (linea && !linea.es_canon && linea.canon_suma_importe && (linea.canon_importe_unit ?? 0) > 0) {
                    const udsCanon = esDoble ? '1' : String(totalAsignado)
                    const canonExists = updated.some(l => l.es_canon && l.canon_de === linea.referencia)
                    if (!canonExists) {
                        updated = [
                            ...updated.slice(0, loteLineaIdx + 1),
                            {
                                referencia: '',
                                descripcion: linea.canon_descripcion || 'Canon Digital según Real Decreto 209/2023 de 28 de marzo',
                                unidades: udsCanon,
                                gramos: '0',
                                tipo_unidad: 0,
                                unidad: '',
                                precio: linea.canon_importe_unit!,
                                dto: 0,
                                piva: linea.piva,
                                precioEditado: false,
                                es_canon: true,
                                canon_de: linea.referencia,
                            },
                            ...updated.slice(loteLineaIdx + 1),
                        ]
                    } else {
                        updated = updated.map(l =>
                            l.es_canon && l.canon_de === linea.referencia ? { ...l, unidades: udsCanon } : l
                        )
                    }
                }
                return updated
            })
        } else {
            // Nueva línea con todos los lotes
            const nuevasLineas: LineaDoc[] = [{
                referencia: articulo.referencia,
                descripcion: articulo.nombre,
                unidades: esDoble ? '1' : String(totalAsignado),
                gramos: esDoble ? String(totalAsignado) : '0',
                tipo_unidad: articulo.tipo_unidad ?? 0,
                unidad: articulo.unidad ?? '',
                precio: articulo.precio,
                dto: articulo.dto ?? 0,
                piva: articulo.piva,
                precioEditado: false,
                control_lotes: true,
                tiene_imagen: articulo.tiene_imagen,
                lotes_asignados: validas,
            }]
            if (articulo.canon_suma_importe && (articulo.canon_importe ?? 0) > 0) {
                const udsCanon = esDoble ? '1' : String(totalAsignado)
                nuevasLineas.push({
                    referencia: '',
                    descripcion: articulo.canon_descripcion || 'Canon Digital según Real Decreto 209/2023 de 28 de marzo',
                    unidades: udsCanon,
                    gramos: '0',
                    tipo_unidad: 0,
                    unidad: '',
                    precio: articulo.canon_importe!,
                    dto: 0,
                    piva: articulo.piva,
                    precioEditado: false,
                    es_canon: true,
                    canon_de: articulo.referencia,
                })
            }
            setLineas(prev => [...prev, ...nuevasLineas])
        }
        setLoteModal(null)
        setLoteLineaIdx(-1)
    }

    const handleConfirmarDobleUnidadLote = (uds: string, asignaciones: AsignacionLote[]) => {
        if (!dobleUnidadLoteModal) return
        const { lineaIdx } = dobleUnidadLoteModal
        const validas = asignaciones.filter(a => a.asignar > 0)
        const totalKilos = validas.reduce((s, a) => s + a.asignar, 0)
        setLineas(prev => prev.map((l, i) => i === lineaIdx
            ? { ...l, unidades: uds, gramos: String(totalKilos), lotes_asignados: validas }
            : l
        ))
        setDobleUnidadLoteModal(null)
    }

    // Confirmar cuadrícula talla/color â†’ añadir una línea por celda con uds > 0
    const handleConfirmarTC = (cantidades: Record<string, number>) => {
        if (!tcModal) return
        const { articulo, tallas, colores } = tcModal
        const nuevas: LineaDoc[] = []
        for (const col of colores) {
            for (const tal of tallas) {
                const key = `${col.codigo}__${tal.codigo}`
                const uds = cantidades[key] || 0
                if (uds <= 0) continue
                nuevas.push({
                    referencia: articulo.referencia,
                    descripcion: articulo.nombre,
                    unidades: String(uds),
                    gramos: '0',
                    tipo_unidad: articulo.tipo_unidad ?? 0,
                    unidad: articulo.unidad ?? '',
                    precio: articulo.precio,
                    dto: articulo.dto ?? 0,
                    piva: articulo.piva,
                    precioEditado: false,
                    tallas_colores: true,
                    talla: tal.codigo,
                    color: col.codigo,
                    tiene_imagen: articulo.tiene_imagen,
                })
            }
        }
        if (nuevas.length > 0) {
            if (tcReemplazarIdx !== null) {
                setLineas(prev => [
                    ...prev.slice(0, tcReemplazarIdx),
                    ...nuevas,
                    ...prev.slice(tcReemplazarIdx + 1),
                ])
            } else {
                setLineas(prev => [...prev, ...nuevas])
            }
        }
        setTcModal(null)
        setTcReemplazarIdx(null)
    }

    const cargarLista = async (td: TipoDoc) => {
        setListaLoading(true)
        setListaError('')
        try {
            const r = await api.get<DocListaItem[]>(`/api/autoventa/mis-documentos?tipodoc=${td}`)
            setListaDocumentos(r.data)
        } catch (e: any) {
            setListaDocumentos([])
            setListaError(e.response?.data?.detail || 'Error cargando documentos')
        } finally { setListaLoading(false) }
    }

    const cargarListaVisitas = async () => {
        setListaLoading(true)
        setListaError('')
        try {
            const r = await api.get<VisitaListaItem[]>('/api/autoventa/mis-visitas')
            setListaVisitas(r.data)
        } catch (e: any) {
            setListaVisitas([])
            setListaError(e.response?.data?.detail || 'Error cargando visitas')
        } finally { setListaLoading(false) }
    }

    const iniciarNuevo = () => {
        setClienteSeleccionado(null)
        setClienteQuery('')
        setClienteResults([])
        setLineas([])
        setError('')
        setEditandoId(null)
        setEditandoFinalizado(false)
        setEditandoFechaFin(null)
        setVisitaOk(false)
        setVisitaMotivo('Visita comercial')
        setVisitaResultado('')
        setVisitaError('')
        setVista('creando')
    }

    const editarPedido = async (id: number) => {
        setError('')
        try {
            const r = await api.get<{
                id: number; tipodoc: number; serie: string; numero: number; fecha: string | null
                fecha_finalizacion: string | null
                cli_codigo: number; cli_nombre: string; cli_cif: string; cli_direccion: string
                cli_localidad: string; cli_cpostal: string; cli_provincia: number
                fpago: number; tarifa: number; observaciones: string; total: number
                lineas: { referencia: string; descripcion: string; unidades: number; gramos: number; tipo_unidad: number; unidad: string; precio: number; dto: number; piva: number; talla: string; color: string; control_lotes?: boolean; tallas_colores?: boolean }[]
            }>(`/api/autoventa/documentos/${id}/detalle`)
            const doc = r.data
            const cli: ClienteResult = {
                codigo: doc.cli_codigo, nombre: doc.cli_nombre,
                cif: doc.cli_cif, alias: '',
                direccion: doc.cli_direccion, localidad: doc.cli_localidad,
                cpostal: doc.cli_cpostal, provincia: doc.cli_provincia,
                fpago: doc.fpago, tarifabase: doc.tarifa, email: '',
            }
            setClienteSeleccionado(cli)
            setLineas(doc.lineas.map(l => ({
                referencia: l.referencia,
                descripcion: l.descripcion,
                unidades: String(l.unidades),
                gramos: String(l.gramos ?? 0),
                tipo_unidad: l.tipo_unidad ?? 0,
                unidad: l.unidad ?? '',
                precio: l.precio,
                dto: l.dto,
                piva: l.piva,
                precioEditado: false,
                control_lotes: l.control_lotes ?? false,
                tallas_colores: l.tallas_colores ?? false,
                talla: l.talla || undefined,
                color: l.color || undefined,
            })))
            setEditandoId(id)
            setEditandoFinalizado(!!doc.fecha_finalizacion)
            setEditandoFechaFin(doc.fecha_finalizacion ?? null)
            setVista('creando')
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error cargando pedido')
        }
    }

    const verDetalleAlbaran = async (id: number) => {
        setDetalleLoading(true)
        setDetallePrintOk(false)
        setDetallePrintError('')
        try {
            const r = await api.get<DetalleAlbaran>(`/api/autoventa/documentos/${id}/detalle`)
            setDetalleAlbaran(r.data)
        } catch {
            // silencioso: si falla, no abre el panel
        } finally {
            setDetalleLoading(false)
        }
    }

    const handleSubmit = async () => {
        if (!tipodoc || !clienteSeleccionado) return
        if (lineasConUds.length === 0) { setError('Añade al menos una línea con unidades'); return }
        setError('')
        setSubmitting(true)
        const payload = {
            tipodoc,
            serie,
            cli_codigo: clienteSeleccionado.codigo,
            cli_nombre: clienteSeleccionado.nombre,
            cli_cif: clienteSeleccionado.cif,
            cli_direccion: clienteSeleccionado.direccion,
            cli_localidad: clienteSeleccionado.localidad,
            cli_cpostal: clienteSeleccionado.cpostal,
            cli_provincia: clienteSeleccionado.provincia,
            fpago: clienteSeleccionado.fpago,
            tarifa: clienteSeleccionado.tarifabase,
            lineas: lineasConUds.map(l => ({
                referencia: l.referencia,
                descripcion: l.descripcion,
                unidades: parseFloat(l.unidades),
                gramos: parseFloat(l.gramos) || 0,
                tipo_unidad: l.tipo_unidad ?? 0,
                precio: l.precio,
                dto: l.dto,
                piva: l.piva,
                lotes_asignados: l.lotes_asignados?.map(a => ({ id: a.id, lote: a.lote, asignar: a.asignar })) ?? [],
                talla: l.talla ?? '',
                color: l.color ?? '',
            })),
        }
        try {
            const r = editandoId
                ? await api.put(`/api/autoventa/documentos/${editandoId}`, payload)
                : await api.post('/api/autoventa/documento', payload)
            setResultado({
                ...r.data,
                idcab: r.data.id,
                cli_codigo: clienteSeleccionado.codigo,
                cli_email: clienteSeleccionado.email || '',
                tipodoc,
            })
            setPostVentaEmail(clienteSeleccionado.email || '')
            setPostVentaEmailEnviado(false)
            setPostVentaEmailError('')
            setFirmaGuardada(false)
            setFirmaError('')
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error creando documento')
        } finally {
            setSubmitting(false)
        }
    }

    const handleEnviarEmailDetalle = async () => {
        if (!detalleDoc || !detalleDocEmail) return
        setDetalleDocEnviando(true)
        setDetalleDocEmailError('')
        try {
            await api.post('/api/autoventa/enviar-documento', {
                cli_codigo: detalleDoc.cli_codigo,
                idcab: detalleDoc.id,
                tipodoc: detalleDoc.tipodoc,
                email_destino: detalleDocEmail,
                local_id: selectedLocal?.id ?? null,
            })
            setDetalleDocEmailEnviado(true)
        } catch (e: any) {
            setDetalleDocEmailError(e.response?.data?.detail || 'Error enviando email')
        } finally {
            setDetalleDocEnviando(false)
        }
    }

    const handleEnviarEmail = async () => {
        if (!resultado || !postVentaEmail) return
        setPostVentaEnviando(true)
        setPostVentaEmailError('')
        try {
            await api.post('/api/autoventa/enviar-documento', {
                cli_codigo: resultado.cli_codigo,
                idcab: resultado.idcab,
                tipodoc: resultado.tipodoc,
                email_destino: postVentaEmail,
                local_id: selectedLocal?.id ?? null,
            })
            setPostVentaEmailEnviado(true)
        } catch (e: any) {
            setPostVentaEmailError(e.response?.data?.detail || 'Error enviando email')
        } finally {
            setPostVentaEnviando(false)
        }
    }

    const handleGuardarFirma = async (dataUrl: string) => {
        if (!resultado) return
        setShowFirmaModal(false)
        setFirmaGuardando(true)
        setFirmaError('')
        try {
            await api.post(`/api/autoventa/documento/${resultado.idcab}/firma`, { firma: dataUrl })
            setFirmaGuardada(true)
        } catch (e: any) {
            setFirmaError(e.response?.data?.detail || 'Error guardando firma')
        } finally {
            setFirmaGuardando(false)
        }
    }

    const handleSubmitVisita = async () => {
        if (!clienteSeleccionado) return
        if (!visitaResultado.trim()) { setVisitaError('Indica el resultado de la visita'); return }
        setVisitaError('')
        setVisitaSubmitting(true)
        try {
            await api.post('/api/autoventa/visita', {
                cli_codigo: clienteSeleccionado.codigo,
                cli_nombre: clienteSeleccionado.nombre,
                motivo: visitaMotivo,
                resultado: visitaResultado.trim(),
            })
            setVisitaOk(true)
        } catch (e: any) {
            setVisitaError(e.response?.data?.detail || 'Error registrando visita')
        } finally {
            setVisitaSubmitting(false)
        }
    }

    const handleNuevo = () => {
        setResultado(null)
        setClienteQuery('')
        setClienteResults([])
        setClienteSeleccionado(null)
        setLineas([])
        setShowDocsModal(false)
        setDocsCliente([])
        setDocsClienteTarget(null)
        setExpandedDoc(null)
        setShowConsultarModal(false)
        setConsultarCliente(null)
        setConsultarQuery('')
        setShowAddArticuloModal(false)
        setArticuloQuery('')
        setArticuloResults([])
        setError('')
        setFirmaGuardada(false)
        setFirmaError('')
        setShowFirmaModal(false)
        setEditandoId(null)
        setEditandoFinalizado(false)
        setEditandoFechaFin(null)
        setVista('lista')
        // recargar lista tras cerrar resultado
        if (tipodoc) cargarLista(tipodoc)
        else if (modoVisita) {
            setVisitaMotivo('Visita comercial')
            setVisitaResultado('')
            setVisitaOk(false)
            setVisitaError('')
            cargarListaVisitas()
        }
    }

    // â”€â”€ Pantalla post-venta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Imprimir ticket térmico ──────────────────────────────────────────────
    const handlePrint = async () => {
        if (!resultado || !clienteSeleccionado) return
        const cfg = loadPrinterConfig()
        setPrinting(true)
        setPrintError('')
        setPrintOk(false)
        try {
            await printTicket(
                {
                    tipodoc_label: resultado.tipodoc_label,
                    serie: resultado.serie,
                    numero: resultado.numero,
                    fecha: new Date().toISOString(),
                    cli_nombre: clienteSeleccionado.nombre,
                    lineas: lineas.map(l => ({
                        descripcion: l.descripcion,
                        unidades: l.unidades,
                        gramos: l.gramos,
                        tipo_unidad: l.tipo_unidad,
                        unidad: l.unidad,
                        precio: l.precio,
                        dto: l.dto,
                        piva: l.piva,
                        talla: l.talla,
                        color: l.color,
                        es_canon: l.es_canon,
                    })),
                    total: resultado.total,
                    agenteNombre: agenteNombre || undefined,
                },
                cfg,
            )
            setPrintOk(true)
        } catch (e: any) {
            setPrintError(e.message || 'Error al imprimir')
        } finally {
            setPrinting(false)
        }
    }

    // ── Imprimir desde detalle de documento (detalleAlbaran / detalleDoc) ───
    const handlePrintDoc = async (doc: {
        tipodoc_label: string
        serie: string
        numero: number
        fecha: string | null
        cli_nombre: string
        total: number
        lineas: Array<{
            descripcion: string
            unidades: number
            precio: number
            dto: number
            piva: number
            talla?: string
            color?: string
            gramos?: number
            tipo_unidad?: number
            unidad?: string
        }>
    }) => {
        const cfg = loadPrinterConfig()
        setDetallePrinting(true)
        setDetallePrintError('')
        setDetallePrintOk(false)
        try {
            await printTicket(
                {
                    tipodoc_label: doc.tipodoc_label,
                    serie: doc.serie,
                    numero: doc.numero,
                    fecha: doc.fecha,
                    cli_nombre: doc.cli_nombre,
                    lineas: doc.lineas.map(l => ({
                        descripcion: l.descripcion,
                        unidades: String(l.unidades),
                        gramos: l.gramos ? String(l.gramos) : undefined,
                        tipo_unidad: l.tipo_unidad ?? 0,
                        unidad: l.unidad,
                        precio: l.precio,
                        dto: l.dto,
                        piva: l.piva,
                        talla: l.talla,
                        color: l.color,
                    })),
                    total: doc.total,
                    agenteNombre: agenteNombre || undefined,
                },
                cfg,
            )
            setDetallePrintOk(true)
        } catch (e: any) {
            setDetallePrintError(e.message || 'Error al imprimir')
        } finally {
            setDetallePrinting(false)
        }
    }

    if (resultado) {
        const esCobrable = resultado.tipodoc === 4 || resultado.tipodoc === 8
        return (
            <div className="p-4 max-w-md mx-auto space-y-4">
                {/* Resultado */}
                <div className="card p-6 text-center">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Check className="w-7 h-7 text-green-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">{resultado.tipodoc_label} creado</h2>
                    <p className="text-slate-500 text-sm mb-2">
                        Serie <span className="font-semibold">{resultado.serie}</span> · Nº <span className="font-semibold">{resultado.numero}</span>
                    </p>
                    <p className="text-2xl font-bold text-brand">
                        {resultado.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </p>
                </div>

                {/* Cobrar */}
                {esCobrable && (
                    <div className="card p-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-green-600" /> ¿Cobrar ahora?
                        </p>
                        <button
                            onClick={() => {
                                // Open cobrar for this document
                                if (resultado.tipodoc === 4) {
                                    openCobrar({ tipo: 'albaran', idcab: resultado.idcab, maxImporte: resultado.total, label: `${resultado.tipodoc_label} ${resultado.serie}-${resultado.numero}` })
                                }
                            }}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                                resultado.tipodoc === 4
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            disabled={resultado.tipodoc !== 4}
                        >
                            <CreditCard className="w-4 h-4" />
                            {resultado.tipodoc === 4 ? 'Cobrar albarán' : 'Cobro por vencimientos (ver documentos)'}
                        </button>
                        {resultado.tipodoc === 8 && (
                            <button
                                onClick={() => openDocsModal()}
                                className="w-full mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-xl py-2.5 hover:bg-amber-100 transition-colors"
                            >
                                Ver vencimientos del cliente
                            </button>
                        )}
                    </div>
                )}

                {/* Firma — solo albaranes */}
                {resultado.tipodoc === 4 && (
                    <div className="card p-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <PenLine className="w-4 h-4 text-amber-600" /> Firma del cliente
                        </p>
                        {firmaGuardada ? (
                            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                                <Check className="w-4 h-4 flex-shrink-0" />
                                <span className="text-sm font-medium">Firma registrada correctamente</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowFirmaModal(true)}
                                disabled={firmaGuardando}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                                {firmaGuardando
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                                    : <><PenLine className="w-4 h-4" /> Firmar albarán</>
                                }
                            </button>
                        )}
                        {firmaError && (
                            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />{firmaError}
                            </p>
                        )}
                    </div>
                )}

                {/* Enviar email */}
                <div className="card p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> Enviar copia al cliente
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="email"
                            className="input flex-1 text-sm"
                            placeholder="email@cliente.com"
                            value={postVentaEmail}
                            onChange={e => { setPostVentaEmail(e.target.value); setPostVentaEmailEnviado(false); setPostVentaEmailError('') }}
                        />
                        <button
                            onClick={handleEnviarEmail}
                            disabled={postVentaEnviando || postVentaEmailEnviado || !postVentaEmail}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${
                                postVentaEmailEnviado
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                            }`}
                        >
                            {postVentaEnviando
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : postVentaEmailEnviado
                                    ? <><Check className="w-4 h-4 inline mr-1" />Enviado</>
                                    : 'Enviar'}
                        </button>
                    </div>
                    {postVentaEmailError && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />{postVentaEmailError}
                        </p>
                    )}
                </div>

                {/* Imprimir ticket térmico */}
                <div className="card p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Printer className="w-4 h-4 text-slate-600" /> Imprimir ticket térmico
                    </p>

                    <button
                        onClick={handlePrint}
                        disabled={printing}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                            printOk
                                ? 'bg-green-50 border border-green-200 text-green-700'
                                : 'bg-slate-700 text-white hover:bg-slate-800'
                        } disabled:opacity-50`}
                    >
                        {printing
                            ? <><Loader2 className="w-4 h-4 animate-spin" />Imprimiendo...</>
                            : printOk
                                ? <><Check className="w-4 h-4" />Ticket imprimiéndose</>
                                : <><Printer className="w-4 h-4" />Imprimir ticket ({paperWidth} mm)</>
                        }
                    </button>
                    {printError && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />{printError}
                        </p>
                    )}
                    {isAndroid && !hasAndroidBridge() && (
                        <a
                            href="/downloads/solba-panel.apk"
                            download
                            className="mt-2 flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                        >
                            📲 Instala la app Solba Panel para imprimir directamente
                        </a>
                    )}
                </div>

                <button onClick={handleNuevo} className="btn-primary w-full">Nuevo documento</button>

                {/* Cobrar modal (para albarán post-venta) */}
                {cobrarTarget && (
                    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-base font-bold text-slate-800">Cobrar â€“ {cobrarTarget.label}</h2>
                                <button onClick={() => setCobrarTarget(null)} className="p-1 rounded hover:bg-slate-100">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-medium text-slate-600">Importe a cobrar</label>
                                        <span className="text-xs text-slate-400">pte. {cobrarTarget.maxImporte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
                                    </div>
                                    <input type="number" step="0.01" min="0.01" max={cobrarTarget.maxImporte}
                                        className="input text-right text-lg font-bold"
                                        value={cobrarImporte} onChange={e => setCobrarImporte(e.target.value)} />
                                    <p className="text-[11px] text-slate-400 mt-1">Puedes cobrar menos (entrega a cuenta)</p>
                                </div>
                                {cobrarError && <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4 flex-shrink-0" />{cobrarError}</p>}
                                <button onClick={handleCobrar} disabled={cobrarLoading}
                                    className="btn-primary w-full flex items-center justify-center gap-2">
                                    {cobrarLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Registrando...</> : <><Check className="w-4 h-4" />Confirmar cobro</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Firma modal */}
                {showFirmaModal && (
                    <FirmaModal
                        onConfirm={handleGuardarFirma}
                        onClose={() => setShowFirmaModal(false)}
                    />
                )}

            </div>
        )
    }

    return (<>
        <div className="p-4 w-full lg:max-w-[75%] lg:mx-auto">
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <ShoppingCart className="w-5 h-5 text-brand" />
                <h1 className="text-xl font-bold">Autoventa</h1>
                {agenteNombre && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {agenteNombre}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    {/* Banner instalar APK: visible en Android cuando no está la app nativa */}
                    {isAndroid && !hasAndroidBridge() && (
                        <a
                            href="/downloads/solba-panel.apk"
                            download
                            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                            title="Descarga la app nativa para imprimir directamente a la Bixolon"
                        >
                            📲 App
                        </a>
                    )}
                    {lineasConUds.length > 0 && !editandoFinalizado && (
                        <button
                            onClick={() => setShowCarritoModal(true)}
                            className="relative flex items-center gap-1.5 text-sm font-medium text-white bg-brand px-3 py-1.5 rounded-xl hover:bg-brand/90 transition-colors"
                            title="Ver pedido"
                        >
                            <ShoppingCart className="w-4 h-4" />
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                                {lineasConUds.length}
                            </span>
                        </button>
                    )}
                    <button
                        onClick={openConsultarModal}
                        className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors"
                    >
                        <Search className="w-4 h-4" /> Consultar
                    </button>
                    <button
                        onClick={openLiquidacion}
                        className="flex items-center gap-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-300 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors"
                    >
                        <BarChart2 className="w-4 h-4" /> Liquidación
                    </button>
                    <button
                        onClick={handleNuevo}
                        disabled={!hasClienteContext}
                        className="inline-flex items-center justify-center w-9 h-9 text-slate-700 bg-slate-100 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Cancelar"
                        aria-label="Cancelar"
                    >
                        <X className="w-4 h-4" />
                    </button>

                </div>
            </div>

            {/* Step 1 â€“ Tipo de documento */}
            <div className="card p-3">
                <div className="grid grid-cols-4 gap-2">
                    {(typedUser?.tipodocs_autoventa?.length
                        ? TIPOS.filter(t => typedUser.tipodocs_autoventa.includes(t.id))
                        : TIPOS
                    ).map(t => (
                        <button
                            key={t.id}
                            onClick={() => {
                                if (!serie) return
                                setTipodoc(t.id)
                                setModoVisita(false)
                                setVista('lista')
                                setListaDocumentos([])
                                setClienteSeleccionado(null)
                                setClienteQuery('')
                                setClienteResults([])
                                setLineas([])
                                setEditandoId(null)
                                setEditandoFinalizado(false)
                                setEditandoFechaFin(null)
                                setError('')
                                cargarLista(t.id)
                            }}
                            disabled={!serie}
                            title={!serie ? 'No tienes serie asignada. Contacta con el administrador.' : t.label}
                            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                tipodoc === t.id && !modoVisita ? t.color : 'border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                        >
                            <t.icon className="w-5 h-5" />
                            <span className="text-xs font-semibold">{t.label}</span>
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            setModoVisita(true)
                            setTipodoc(null)
                            setVista('lista')
                            setListaVisitas([])
                            setClienteSeleccionado(null)
                            setClienteQuery('')
                            setClienteResults([])
                            setLineas([])
                            setEditandoId(null)
                            setEditandoFinalizado(false)
                            setEditandoFechaFin(null)
                            setError('')
                            cargarListaVisitas()
                        }}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                            modoVisita ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                    >
                        <MapPin className="w-5 h-5" />
                        <span className="text-xs font-semibold">Visita</span>
                    </button>
                </div>
            </div>

            {/* Vista LISTA */}
            {(tipodoc || modoVisita) && vista === 'lista' && (
                <div className="card overflow-hidden">
                    {listaLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-brand" />
                        </div>
                    ) : listaError ? (
                        <div className="flex items-center gap-2 text-red-600 text-sm px-4 py-6">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {listaError}
                        </div>
                    ) : modoVisita ? (
                        listaVisitas.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">Sin visitas registradas</p>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {listaVisitas.map(v => (
                                    <div key={v.id} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-slate-800 leading-tight">{v.cli_nombre}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">{v.motivo}</p>
                                                {v.resultado && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{v.resultado}</p>}
                                            </div>
                                            <p className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                                                {v.fecha ? new Date(v.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        listaDocumentos.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">Sin documentos en esta serie</p>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {listaDocumentos.map(doc => {
                                    const esEditable = tipodoc === 2 && !doc.finalizado
                                    const esCobrable = tipodoc === 4 && !doc.finalizado
                                    const esCobrado = tipodoc === 4 && doc.finalizado
                                    const esAlbaran = tipodoc === 4
                                    const esPedido = tipodoc === 2
                                    const esClickable = esPedido || esAlbaran
                                    return (
                                    <div
                                        key={doc.id}
                                        className={`flex items-center gap-3 px-4 py-3 ${esClickable ? 'cursor-pointer hover:bg-slate-50 active:bg-slate-100' : ''}`}
                                        onClick={() => {
                                            if (esPedido) editarPedido(doc.id)
                                            else if (esAlbaran) verDetalleAlbaran(doc.id)
                                        }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-xs font-mono font-semibold text-brand">{doc.serie}-{doc.numero}</span>
                                                <span className="text-[10px] text-slate-400">
                                                    {doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                                </span>
                                                {tipodoc === 2 && doc.finalizado && (
                                                    <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Finalizado</span>
                                                )}
                                                {esCobrado && (
                                                    <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Cobrado</span>
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-slate-700 truncate">{doc.cli_nombre}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className="text-right">
                                                <span className="text-sm font-bold text-slate-800">
                                                    {doc.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                                </span>
                                                {esCobrable && doc.pendiente < doc.total && (
                                                    <p className="text-[11px] text-red-500 font-medium leading-tight">
                                                        Pte: {doc.pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                                                    </p>
                                                )}
                                            </div>
                                            {/* Botón imprimir (pedidos y albaranes) */}
                                            {(esPedido || esAlbaran) && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleQuickPrint(doc.cli_codigo, { id: doc.id, tipodoc: tipodoc!, tipodoc_label: TIPOS.find(t => t.id === tipodoc)?.label ?? '', serie: doc.serie, numero: doc.numero, fecha: doc.fecha, cli_nombre: doc.cli_nombre, total: doc.total }) }}
                                                    disabled={quickPrintingDocId === doc.id}
                                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 flex-shrink-0"
                                                    title="Imprimir ticket"
                                                >
                                                    {quickPrintingDocId === doc.id
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <Printer className="w-3.5 h-3.5" />
                                                    }
                                                </button>
                                            )}
                                            {esEditable && (
                                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Editar</span>
                                            )}
                                            {esPedido && doc.finalizado && (
                                                <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">Ver</span>
                                            )}
                                            {esAlbaran && (
                                                detalleLoading
                                                    ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                                                    : <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                                                        {esCobrable ? 'Ver / Cobrar' : 'Ver'}
                                                      </span>
                                            )}
                                        </div>
                                    </div>
                                    )
                                })}
                            </div>
                        )
                    )}
                </div>
            )}

            {/* FAB + */}
            {(tipodoc || modoVisita) && vista === 'lista' && (
                <button
                    onClick={iniciarNuevo}
                    className="fixed bottom-6 right-6 w-14 h-14 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center z-40 transition-colors"
                    title={modoVisita ? 'Nueva visita' : `Nuevo ${TIPOS.find(t => t.id === tipodoc)?.label ?? ''}`}
                >
                    <Plus className="w-7 h-7" />
                </button>
            )}

            {/* Step 2 - Cliente (solo lectura cuando finalizado) */}
            {(tipodoc || modoVisita) && vista === 'creando' && editandoFinalizado && clienteSeleccionado && (
                <div className="card p-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-brand flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-slate-800">{clienteSeleccionado.nombre}</p>
                        <p className="text-xs text-slate-500">{clienteSeleccionado.localidad} · {clienteSeleccionado.cif}</p>
                    </div>
                </div>
            )}

            {/* Step 2 - Cliente */}
            {(tipodoc || modoVisita) && vista === 'creando' && !editandoFinalizado && (
                <div className="card p-4">
                    <p className="text-sm font-semibold text-slate-600 mb-3">2. Cliente</p>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            className="input pl-8"
                            placeholder="Buscar por nombre, alias, CIF..."
                            value={clienteQuery}
                            onChange={e => handleClienteInput(e.target.value)}
                            onFocus={handleClienteFocus}
                        />
                        {searchingCliente && (
                            <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 animate-spin" />
                        )}
                    </div>
                    {clienteResults.length > 0 && (
                        <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                            {clienteResults.map(c => (
                                <button
                                    key={c.codigo}
                                    onClick={() => selectCliente(c)}
                                    className="w-full text-left px-3 py-2 hover:bg-brand/5 border-b border-slate-100 last:border-0"
                                >
                                    <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                                    {c.alias && <p className="text-xs text-slate-500">{c.alias}</p>}
                                    <p className="text-xs text-slate-400">{c.localidad} · {c.cif}</p>
                                </button>
                            ))}
                        </div>
                    )}
                    {clienteSeleccionado && (
                        <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-lg px-3 py-2">
                                <Check className="w-4 h-4 text-brand flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{clienteSeleccionado.nombre}</p>
                                    <p className="text-xs text-slate-500">{clienteSeleccionado.localidad} · {clienteSeleccionado.cif}</p>
                                </div>
                                <button
                                    className="ml-auto p-1 rounded hover:bg-slate-200"
                                    onClick={() => { setClienteSeleccionado(null); setClienteQuery(''); setLineas([]) }}
                                >
                                    <X className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                            </div>
                            <button
                                onClick={() => openDocsModal()}
                                className="w-full flex items-center justify-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg py-2 hover:bg-amber-100 transition-colors"
                            >
                                <CreditCard className="w-4 h-4" />
                                Consultar Doc. Cliente
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Step 3 â€“ Formulario Visita */}
            {modoVisita && clienteSeleccionado && vista === 'creando' && (
                <div ref={productosRef} className="card p-4 space-y-4">
                    <p className="text-sm font-semibold text-slate-600">3. Datos de la visita</p>
                    {visitaOk ? (
                        <div className="flex flex-col items-center py-6 gap-3 text-center">
                            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center">
                                <Check className="w-7 h-7 text-purple-600" />
                            </div>
                            <p className="text-base font-bold text-slate-800">Visita registrada</p>
                            <p className="text-sm text-slate-500">{clienteSeleccionado.nombre}</p>
                            <button onClick={handleNuevo} className="btn-primary mt-2">Nueva acción</button>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Motivo de visita</label>
                                <select
                                    value={visitaMotivo}
                                    onChange={e => setVisitaMotivo(e.target.value)}
                                    className="input"
                                >
                                    <option>Visita comercial</option>
                                    <option>Visita pedido</option>
                                    <option>Presentación de productos</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Resultado</label>
                                <textarea
                                    value={visitaResultado}
                                    onChange={e => setVisitaResultado(e.target.value)}
                                    rows={4}
                                    placeholder="Describe el resultado de la visita..."
                                    className="input resize-none"
                                />
                            </div>
                            {visitaError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {visitaError}
                                </div>
                            )}
                            <button
                                onClick={handleSubmitVisita}
                                disabled={visitaSubmitting}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {visitaSubmitting
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                                    : <><MapPin className="w-4 h-4" /> Registrar visita</>
                                }
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Step 4 — Productos */}
            {!modoVisita && clienteSeleccionado && vista === 'creando' && (
                <div ref={productosRef} className="card p-4">
                    {editandoFinalizado && (
                        <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg">
                            <span className="font-semibold">Pedido finalizado</span>
                            {editandoFechaFin && (
                                <span className="text-amber-600">
                                    el {new Date(editandoFechaFin).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                </span>
                            )}
                            <span className="ml-auto text-amber-500">(solo lectura)</span>
                        </div>
                    )}
                    <p className="text-sm font-semibold text-slate-600 mb-3 flex items-center justify-between">
                        <span>
                            {editandoFinalizado ? 'Líneas del pedido' : '3. Productos consumidos (últimos 90 días)'}
                            {lineas.length > 0 && (
                                <span className="ml-2 text-xs font-normal text-slate-400">{lineas.length} artículos</span>
                            )}
                        </span>
                        <span className="flex items-center gap-1.5">
                            {/* Toggle IVA */}
                            <button
                                onClick={() => setConIva(v => !v)}
                                title={conIva ? 'Mostrando con IVA — pulsa para ver sin IVA' : 'Mostrando sin IVA — pulsa para ver con IVA'}
                                className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                                    conIva
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                }`}
                            >
                                {conIva ? 'I.I.' : 'S.I.'}
                            </button>
                            {/* Toggle vista */}
                            <button
                                onClick={() => setVistaImagenes(v => !v)}
                                title={vistaImagenes ? 'Vista líneas' : 'Vista imágenes'}
                                className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                                {vistaImagenes ? <List className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
                                {vistaImagenes ? 'Vista Líneas' : 'Vista Imágenes'}
                            </button>
                            {clienteSeleccionado && !loadingProductos && !editandoFinalizado && (
                                <button
                                    onClick={() => openAddArticuloModal()}
                                    className="flex items-center gap-1 text-xs font-medium text-brand bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg hover:bg-brand/20 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Añadir
                                </button>
                            )}
                        </span>
                    </p>

                    <div className={editandoFinalizado ? 'pointer-events-none opacity-70' : ''}>
                    {loadingProductos ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Cargando productos...</span>
                        </div>
                    ) : lineas.length === 0 ? (
                        <div className="flex flex-col items-center py-6 gap-3">
                            <p className="text-sm text-slate-400 text-center">
                                Este cliente no tiene compras en los últimos 90 días.
                            </p>
                            <button
                                onClick={() => openAddArticuloModal()}
                                className="flex items-center gap-2 text-sm font-medium text-brand bg-brand/10 border border-brand/30 px-4 py-2 rounded-xl hover:bg-brand/20 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Añadir artículo
                            </button>
                        </div>
                    ) : vistaImagenes ? (
                        /* â”€â”€ Vista Imágenes â”€â”€ */
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {lineas.map((l, idx) => {
                                const uds = parseFloat(l.unidades)
                                const tieneUds = !isNaN(uds) && uds > 0
                                const precioEfectivo = l.precio * (1 - l.dto / 100)
                                const esDoble = l.tipo_unidad === 1
                                const baseQty = esDoble ? parseFloat(l.gramos) || 0 : uds
                                const importe = baseQty > 0 ? baseQty * precioEfectivo * (conIva ? (1 + l.piva / 100) : 1) : null
                                const necesitaLotes = l.control_lotes && (tipodoc === 4 || tipodoc === 8)
                                const necesitaLotesUds = necesitaLotes && !esDoble
                                const necesitaLotesGramos = necesitaLotes && esDoble
                                const esTallaColor = !!l.tallas_colores && !l.talla
                                return (
                                    <div
                                        key={l.referencia + idx}
                                        className={`rounded-xl border overflow-hidden flex flex-col transition-all ${tieneUds ? 'border-brand shadow-sm' : 'border-slate-200'}`}
                                    >
                                        {/* Imagen */}
                                        {l.tiene_imagen ? (
                                            <div className="bg-slate-50 flex items-center justify-center overflow-hidden" style={{ height: 90 }}>
                                                <img
                                                    src={`/api/autoventa/articulos/${encodeURIComponent(l.referencia)}/imagen`}
                                                    alt={l.descripcion}
                                                    className="object-contain w-full h-full"
                                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="bg-slate-100 flex items-center justify-center" style={{ height: 90 }}>
                                                <Package className="w-8 h-8 text-slate-300" />
                                            </div>
                                        )}
                                        {/* Info */}
                                        <div className="p-2 flex-1 flex flex-col">
                                            <p className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2 flex-1">{l.descripcion}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    {precioEfectivo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                                    {l.dto > 0 && <span className="ml-1 text-amber-600">(-{l.dto}%)</span>}
                                                </span>
                                                {necesitaLotes && <Package className="w-3 h-3 text-amber-500" />}
                                                {esTallaColor && <span className="text-[9px] font-semibold text-violet-600 bg-violet-50 px-1 rounded">TC</span>}
                                            </div>
                                            {importe !== null && (
                                                <p className="text-xs font-bold text-brand mt-0.5">
                                                    Total: {importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                                </p>
                                            )}
                                            {l.canon_suma_importe && (l.canon_importe_unit ?? 0) > 0 && (
                                                <p className="text-[9px] text-amber-600 font-mono leading-tight mt-0.5">● Canon: {(l.canon_importe_unit!).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ud</p>
                                            )}
                                        </div>
                                        {/* Controles */}
                                        <div className="px-2 pb-2 flex items-center gap-1">
                                            {esTallaColor ? (
                                                <button
                                                    onClick={() => abrirTcParaLinea(idx)}
                                                    className="flex-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg py-1 px-1.5 hover:bg-violet-100 transition-colors text-center"
                                                >
                                                    Sel. talla/color
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-end gap-0">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.001"
                                                        inputMode="decimal"
                                                        className={`flex-1 w-full text-sm text-right border rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand ${tieneUds ? 'border-brand' : 'border-slate-200'} ${necesitaLotesUds ? 'cursor-pointer bg-slate-50' : ''}`}
                                                        placeholder="Uds"
                                                        value={l.unidades === '0' ? '' : l.unidades}
                                                        readOnly={necesitaLotesUds}
                                                        onChange={e => { if (!necesitaLotesUds) updateUnidades(idx, e.target.value) }}
                                                        onClick={async () => { if (necesitaLotesUds) await abrirLotesParaLinea(idx) }}
                                                        onKeyDown={async e => { if (e.key === 'Enter' && necesitaLotesUds) { e.preventDefault(); await abrirLotesParaLinea(idx) } }}
                                                    />
                                                    {esDoble && parseFloat(l.gramos) > 0 && (
                                                        <span className="text-[10px] text-teal-600 font-mono leading-tight">{parseFloat(l.gramos).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {l.unidad || 'kg'}</span>
                                                    )}
                                                </div>
                                            )}
                                            {!esTallaColor && (
                                            <button onClick={async () => { if (esTallaColor) { await abrirTcParaLinea(idx) } else if (esDoble && necesitaLotes) { await abrirDobleUnidadLoteModal(idx) } else if (necesitaLotes) { await abrirLotesParaLinea(idx) } else if (esDoble) { setCalcDobleIdx(idx) } else { setCalcIdx(idx) } }} className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500">
                                                <Calculator className="w-3.5 h-3.5" />
                                            </button>
                                            )}
                                            <button onClick={() => setLineas(prev => { const ref = prev[idx]?.referencia; return prev.filter((ll, i) => i !== idx && !(ll.es_canon && ll.canon_de === ref)) })} className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        /* â”€â”€ Vista Líneas â”€â”€ */
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            {/* Header — solo visible en sm+ */}
                            <div className="hidden sm:grid bg-slate-50 border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500" style={{ gridTemplateColumns: canEditPrice ? 'auto 1fr auto auto auto auto' : 'auto 1fr auto auto auto' }}>
                                <span className="w-24 text-center">Unidades</span>
                                <span className="px-2">Descripción</span>
                                <span className="w-32 text-right">P. Unitario</span>
                                {canEditPrice && <span className="w-20 text-right">Dto.%</span>}
                                <span className="w-24 text-right">{conIva ? 'Total I.I.' : 'Total S.I.'}</span>
                                <span className="w-8"></span>
                            </div>
                            {lineas.map((l, idx) => {
                                if (l.es_canon) return null
                                const uds = parseFloat(l.unidades)
                                const tieneUds = !isNaN(uds) && uds > 0
                                const precioEfectivo = l.precio * (1 - l.dto / 100)
                                const esDoble = l.tipo_unidad === 1
                                const baseQty = esDoble ? parseFloat(l.gramos) || 0 : uds
                                const importe = baseQty > 0 ? baseQty * precioEfectivo * (conIva ? (1 + l.piva / 100) : 1) : null
                                const necesitaLotes = l.control_lotes && (tipodoc === 4 || tipodoc === 8)
                                const necesitaLotesUds = necesitaLotes && !esDoble
                                const necesitaLotesGramos = necesitaLotes && esDoble
                                const esTallaColor = !!l.tallas_colores && !l.talla
                                return (
                                    <div
                                        key={l.referencia + idx}
                                        className={`border-b border-slate-100 last:border-0 transition-colors ${tieneUds ? 'bg-brand/5' : esTallaColor ? 'bg-violet-50/50' : 'bg-white'}`}
                                    >
                                        {/* — Móvil: layout apilado — */}
                                        <div className="sm:hidden px-3 py-2">
                                            {/* Fila 1: descripción (izq) + total línea (der) */}
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-xs font-semibold text-slate-800 leading-tight">{l.descripcion}</p>
                                                        {l.es_canon && <span className="flex-shrink-0 text-[9px] font-bold bg-amber-500 text-white px-1 py-0.5 rounded">Canon</span>}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{l.referencia || '—'} · IVA {l.piva}%</p>
                                                    {l.lotes_asignados && l.lotes_asignados.length > 0 && (
                                                        <p className="text-[10px] text-amber-600 font-mono mt-0.5">{l.lotes_asignados.map(a => `${a.lote}(${a.asignar})`).join(' · ')}</p>
                                                    )}
                                                    {l.talla && (
                                                        <p className="text-[10px] text-violet-600 font-mono mt-0.5">T:{l.talla} C:{l.color}</p>
                                                    )}
                                                    {l.canon_suma_importe && (l.canon_importe_unit ?? 0) > 0 && (
                                                        <p className="text-[10px] text-amber-600 font-mono mt-0.5">&#9679; Canon: {(l.canon_importe_unit!).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ud</p>
                                                    )}
                                                </div>
                                                {importe !== null && (
                                                    <span className="text-sm font-bold text-brand whitespace-nowrap flex-shrink-0">
                                                        {importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                                    </span>
                                                )}
                                            </div>
                                            {/* Fila 2: uds | precio [+ dto] | borrar */}
                                            <div className="flex items-center gap-2">
                                                {/* Unidades */}
                                                <div className="flex items-center gap-1">
                                                    {esTallaColor ? (
                                                        <button
                                                            onClick={() => abrirTcParaLinea(idx)}
                                                            className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg py-1.5 px-2 hover:bg-violet-100 transition-colors whitespace-nowrap"
                                                        >
                                                            Sel. talla/color
                                                        </button>
                                                    ) : (
                                                        <>
                                                        <div className="flex flex-col items-end gap-0">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                inputMode="decimal"
                                                                className={`w-16 text-sm text-right border rounded-lg py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-brand ${tieneUds ? 'border-brand bg-white' : 'border-slate-200 bg-white'} ${necesitaLotesUds ? 'cursor-pointer bg-slate-50' : ''}`}
                                                                placeholder="Uds"
                                                                value={l.unidades === '0' ? '' : l.unidades}
                                                                readOnly={necesitaLotesUds}
                                                                onChange={e => { if (!necesitaLotesUds) updateUnidades(idx, e.target.value) }}
                                                                onClick={async () => { if (necesitaLotesUds) await abrirLotesParaLinea(idx) }}
                                                                onKeyDown={async e => { if (e.key === 'Enter' && necesitaLotesUds) { e.preventDefault(); await abrirLotesParaLinea(idx) } }}
                                                            />
                                                            {esDoble && parseFloat(l.gramos) > 0 && (
                                                                <span className="text-[10px] text-teal-600 font-mono leading-tight">{parseFloat(l.gramos).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {l.unidad || 'kg'}</span>
                                                            )}
                                                        </div>
                                                        <button
                                                            title="Calculadora unidades"
                                                            onClick={async () => { if (esDoble && necesitaLotes) { await abrirDobleUnidadLoteModal(idx) } else if (necesitaLotesUds) { await abrirLotesParaLinea(idx) } else if (esDoble) { setCalcDobleIdx(idx) } else { setCalcIdx(idx) } }}
                                                            className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500"
                                                        >
                                                            <Calculator className="w-3.5 h-3.5" />
                                                        </button>
                                                        </>
                                                    )}
                                                </div>
                                                {/* Precio + Dto */}
                                                <div className="flex items-center gap-1 flex-1 justify-end">
                                                    {canEditPrice ? (
                                                        <>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                inputMode="decimal"
                                                                className="w-20 text-sm text-right border border-slate-300 rounded-lg py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                                                                value={parseFloat(l.precio.toFixed(2))}
                                                                onChange={e => updatePrecio(idx, e.target.value)}
                                                            />
                                                            <button
                                                                title="Calculadora precio"
                                                                onClick={() => setCalcPrecioIdx(idx)}
                                                                className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500"
                                                            >
                                                                <Calculator className="w-3.5 h-3.5" />
                                                            </button>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                min="0"
                                                                max="100"
                                                                inputMode="decimal"
                                                                className="w-14 text-sm text-right border border-amber-300 rounded-lg py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                                                placeholder="Dto%"
                                                                value={l.dto === 0 ? '' : l.dto}
                                                                onChange={e => updateDto(idx, e.target.value)}
                                                            />
                                                        </>
                                                    ) : (
                                                        <span className="text-sm text-slate-600 font-mono">
                                                            {precioEfectivo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                                            {l.dto > 0 && <span className="ml-1 text-xs text-amber-600">(-{l.dto}%)</span>}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Borrar */}
                                                <button
                                                    title="Eliminar línea"
                                                    onClick={() => setLineas(prev => { const ref = prev[idx]?.referencia; return prev.filter((ll, i) => i !== idx && !(ll.es_canon && ll.canon_de === ref)) })}
                                                    className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 flex-shrink-0"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* â”€â”€ Desktop sm+: grid horizontal â”€â”€ */}
                                        <div
                                            className="hidden sm:grid items-center px-3 py-1.5"
                                            style={{ gridTemplateColumns: canEditPrice ? 'auto 1fr auto auto auto auto' : 'auto 1fr auto auto auto' }}
                                        >
                                            {/* Unidades + calc */}
                                            <div className="flex items-center gap-1 w-24">
                                                {esTallaColor ? (
                                                    <button
                                                        onClick={() => abrirTcParaLinea(idx)}
                                                        className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg py-1 px-1.5 hover:bg-violet-100 transition-colors whitespace-nowrap"
                                                    >
                                                        TC ▸
                                                    </button>
                                                ) : (
                                                    <>
                                                    <div className="flex flex-col items-end gap-0">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.001"
                                                            inputMode="decimal"
                                                            className={`w-14 text-sm text-right border rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand ${tieneUds ? 'border-brand bg-white' : 'border-slate-200 bg-white'} ${necesitaLotesUds ? 'cursor-pointer bg-slate-50' : ''}`}
                                                            placeholder="Uds"
                                                            value={l.unidades === '0' ? '' : l.unidades}
                                                            readOnly={necesitaLotesUds}
                                                            onChange={e => { if (!necesitaLotesUds) updateUnidades(idx, e.target.value) }}
                                                            onClick={async () => { if (necesitaLotesUds) await abrirLotesParaLinea(idx) }}
                                                            onKeyDown={async e => { if (e.key === 'Enter' && necesitaLotesUds) { e.preventDefault(); await abrirLotesParaLinea(idx) } }}
                                                        />
                                                        {esDoble && parseFloat(l.gramos) > 0 && (
                                                            <span className="text-[10px] text-teal-600 font-mono leading-tight">{parseFloat(l.gramos).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {l.unidad || 'kg'}</span>
                                                        )}
                                                    </div>
                                                    <button
                                                        title="Calculadora unidades"
                                                        onClick={async () => { if (esDoble && necesitaLotes) { await abrirDobleUnidadLoteModal(idx) } else if (necesitaLotesUds) { await abrirLotesParaLinea(idx) } else if (esDoble) { setCalcDobleIdx(idx) } else { setCalcIdx(idx) } }}
                                                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 flex-shrink-0"
                                                    >
                                                        <Calculator className="w-3.5 h-3.5" />
                                                    </button>
                                                    </>
                                                )}
                                            </div>
                                            {/* Descripción */}
                                            <div className="px-2 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-xs font-medium text-slate-800 leading-tight truncate">{l.descripcion}</p>
                                                    {l.es_canon && <span className="flex-shrink-0 text-[9px] font-bold bg-amber-500 text-white px-1 py-0.5 rounded">Canon</span>}
                                                </div>
                                                <p className="text-[10px] text-slate-400 font-mono">{l.referencia || '—'} · IVA {l.piva}%</p>
                                                {l.lotes_asignados && l.lotes_asignados.length > 0 && (
                                                    <p className="text-[10px] text-amber-600 font-mono">{l.lotes_asignados.map(a => `${a.lote}(${a.asignar})`).join(' · ')}</p>
                                                )}
                                                {l.talla && (
                                                    <p className="text-[10px] text-violet-600 font-mono">T:{l.talla} C:{l.color}</p>
                                                )}
                                                {l.canon_suma_importe && (l.canon_importe_unit ?? 0) > 0 && (
                                                    <p className="text-[10px] text-amber-600 font-mono">&#9679; Canon: {(l.canon_importe_unit!).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ud</p>
                                                )}
                                            </div>
                                            {/* Precio unitario */}
                                            <div className="flex items-center gap-1 w-32 justify-end">
                                                {canEditPrice ? (
                                                    <>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-20 text-sm text-right border border-slate-300 rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                                                            value={parseFloat(l.precio.toFixed(2))}
                                                            onChange={e => updatePrecio(idx, e.target.value)}
                                                        />
                                                        <button
                                                            title="Calculadora precio"
                                                            onClick={() => setCalcPrecioIdx(idx)}
                                                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 flex-shrink-0"
                                                        >
                                                            <Calculator className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="text-sm text-slate-700 font-mono">
                                                        {precioEfectivo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                                        {l.dto > 0 && <span className="ml-1 text-xs text-amber-600">(-{l.dto}%)</span>}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Dto% — solo si canEditPrice */}
                                            {canEditPrice && (
                                                <div className="flex items-center justify-end w-20 pl-1">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        max="100"
                                                        className="w-16 text-sm text-right border border-amber-300 rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                                        placeholder="Dto%"
                                                        value={l.dto === 0 ? '' : l.dto}
                                                        onChange={e => updateDto(idx, e.target.value)}
                                                    />
                                                </div>
                                            )}
                                            {/* Total */}
                                            <div className="w-24 text-right">
                                                {importe !== null ? (
                                                    <span className="text-sm font-semibold text-brand">{importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                                                ) : (
                                                    <span className="text-xs text-slate-300">—</span>
                                                )}
                                            </div>
                                            {/* Eliminar */}
                                            <div className="w-8 flex justify-center">
                                                <button
                                                    title="Eliminar línea"
                                                    onClick={() => setLineas(prev => { const ref = prev[idx]?.referencia; return prev.filter((ll, i) => i !== idx && !(ll.es_canon && ll.canon_de === ref)) })}
                                                    className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    </div>{/* end pointer-events wrapper */}
                </div>
            )}

            {/* Barra flotante — Añadir + Carrito (solo modo documento) */}
            {!modoVisita && clienteSeleccionado && !loadingProductos && !editandoFinalizado && (
                <div className="card p-3 sticky bottom-4 shadow-lg">
                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm mb-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={() => openAddArticuloModal()}
                            className="flex items-center justify-center gap-2 text-sm font-medium text-brand bg-brand/10 border border-brand/30 px-4 py-2.5 rounded-xl hover:bg-brand/20 transition-colors flex-shrink-0"
                        >
                            <Plus className="w-4 h-4" /> Añadir artículo
                        </button>
                        {lineasConUds.length > 0 && (
                            <button
                                onClick={() => setShowCarritoModal(true)}
                                className="btn-primary flex-1 flex items-center justify-between gap-2 px-4"
                            >
                                <span className="flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4" />
                                    <span className="text-xs font-semibold bg-white/25 rounded-full px-2 py-0.5">{lineasConUds.length}</span>
                                    <span className="text-xs font-normal opacity-75">{conIva ? 'I.I.' : 'S.I.'}</span>
                                </span>
                                <span className="font-bold">{(conIva ? total : totalSinIva).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Calculator modal */}
            {calcIdx !== null && (
                <CalculatorModal
                    initial={lineas[calcIdx]?.unidades ?? '0'}
                    onConfirm={async val => {
                        updateUnidades(calcIdx, val)
                        setCalcIdx(null)
                        const linea = lineas[calcIdx]
                        if (linea?.control_lotes && (tipodoc === 4 || tipodoc === 8)) {
                            await abrirLotesParaLinea(calcIdx)
                        }
                    }}
                    onClose={() => setCalcIdx(null)}
                />
            )}
            {calcDobleIdx !== null && (
                <DobleUnidadCalculatorModal
                    unidadNombre={lineas[calcDobleIdx]?.unidad || 'Kilos'}
                    initialUds={lineas[calcDobleIdx]?.unidades ?? '0'}
                    initialGramos={lineas[calcDobleIdx]?.gramos ?? '0'}
                    onConfirm={(u, g) => { updateUnidades(calcDobleIdx, u); updateGramos(calcDobleIdx, g); setCalcDobleIdx(null) }}
                    onClose={() => setCalcDobleIdx(null)}
                />
            )}
            {calcPrecioIdx !== null && (
                <CalculatorModal
                    initial={String(lineas[calcPrecioIdx]?.precio ?? '0')}
                    onConfirm={val => updatePrecio(calcPrecioIdx, val)}
                    onClose={() => setCalcPrecioIdx(null)}
                />
            )}

            {/* Lote modal */}
            {loteModal && (
                <LoteModal
                    nombre={loteModal.articulo.nombre}
                    referencia={loteModal.articulo.referencia}
                    lotes={loteModal.lotes}
                    esDobleUnidad={(loteModal.articulo.tipo_unidad ?? 0) === 1}
                    unidadNombre={loteModal.articulo.unidad || loteModal.lotes[0]?.unidad || 'Kilos'}
                    onConfirm={handleConfirmarLotes}
                    onClose={() => setLoteModal(null)}
                />
            )}

            {/* Doble unidad + lote modal */}
            {dobleUnidadLoteModal && (
                <DobleUnidadLoteModal
                    nombre={dobleUnidadLoteModal.articulo.nombre}
                    referencia={dobleUnidadLoteModal.articulo.referencia}
                    unidadNombre={dobleUnidadLoteModal.articulo.unidad || dobleUnidadLoteModal.lotes[0]?.unidad || 'Kilos'}
                    lotes={dobleUnidadLoteModal.lotes}
                    initialUds={lineas[dobleUnidadLoteModal.lineaIdx]?.unidades ?? '0'}
                    onConfirm={handleConfirmarDobleUnidadLote}
                    onClose={() => setDobleUnidadLoteModal(null)}
                />
            )}

            {/* Talla/Color modal */}
            {tcModal && (
                <TallaColorModal
                    grid={tcModal}
                    onConfirm={handleConfirmarTC}
                    onClose={() => setTcModal(null)}
                />
            )}

            {/* â”€â”€ Modal Documentos Cliente â”€â”€ */}
            {showDocsModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-800">
                                Documentos — {docsClienteTarget?.nombre}
                            </h2>
                            <button onClick={() => { setShowDocsModal(false); setDocsClienteTarget(null) }} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        {!loadingDocs && docsCliente.length > 0 && (
                            <div className="px-4 py-2 border-b border-slate-100 bg-amber-50/70">
                                <p className="text-xs font-medium text-amber-800">
                                    {docsCliente.filter(d => d.tipodoc === 4).length > 0
                                        ? `Albaranes pte. facturar: ${docsCliente.filter(d => d.tipodoc === 4).length} · Pte. cobro facturas: ${totalPteCobro.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
                                        : `Total pte. cobro: ${totalPteCobro.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
                                    }
                                </p>
                            </div>
                        )}
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-brand"
                                    checked={soloPte}
                                    onChange={e => { setSoloPte(e.target.checked); reloadDocs(e.target.checked, docsFiltraTipo) }}
                                />
                                Solo pendientes
                            </label>
                            <select
                                className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                                value={docsFiltraTipo}
                                onChange={e => {
                                    const v = e.target.value as 'todos' | '4' | '8'
                                    setDocsFiltraTipo(v)
                                    reloadDocs(soloPte, v)
                                }}
                            >
                                <option value="todos">Todos</option>
                                <option value="4">Albaranes</option>
                                <option value="8">Facturas</option>
                            </select>
                        </div>
                        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                            {loadingDocs ? (
                                <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                                </div>
                            ) : docsCliente.length === 0 ? (
                                <p className="text-center text-slate-400 py-8 text-sm">No hay documentos{soloPte ? ' pendientes' : ''}</p>
                            ) : docsCliente.map(doc => (
                                <div key={doc.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <button
                                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                                    >
                                        {doc.tipodoc === 4 ? <Truck className="w-4 h-4 text-amber-600" /> : <FileText className="w-4 h-4 text-green-600" />}
                                        <div className="flex-1 text-left">
                                            <p className="text-sm font-semibold text-slate-800">
                                                {doc.tipodoc_label} {doc.serie}-{doc.numero}
                                                <span className="ml-2 text-xs text-slate-400 font-normal">{doc.fecha}</span>
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Total: {doc.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                                                {doc.pendiente > 0 && (
                                                    <span className="ml-2 text-red-600 font-medium">Pte: {doc.pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
                                                )}
                                            </p>
                                        </div>
                                        {expandedDoc === doc.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                    </button>

                                    {expandedDoc === doc.id && (
                                        <div className="px-3 pb-3 pt-2 space-y-2">
                                            {/* Cabecera: importe + botones Ver / Editar */}
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs text-slate-600 space-y-0.5">
                                                    {doc.tipodoc === 4 && <p className="text-amber-700 font-medium">&#x23F3; Pendiente de facturar</p>}
                                                    <p>Importe: <span className="font-medium">{doc.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&#x20AC;</span></p>
                                                </div>
                                                <div className="flex gap-1.5 flex-wrap justify-end">
                                                    <button
                                                        onClick={() => openDetalleDoc((docsClienteTarget || clienteSeleccionado)!.codigo, doc.id)}
                                                        className="flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg"
                                                    >
                                                        <List className="w-3.5 h-3.5" /> Ver
                                                    </button>
                                                    <button
                                                        onClick={() => handleQuickPrint((docsClienteTarget || clienteSeleccionado)!.codigo, doc)}
                                                        disabled={quickPrintingDocId === doc.id}
                                                        className="flex items-center gap-1 text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 px-3 py-1.5 rounded-lg disabled:opacity-50"
                                                    >
                                                        {quickPrintingDocId === doc.id
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Printer className="w-3.5 h-3.5" />
                                                        }
                                                        Imprimir
                                                    </button>
                                                    {doc.tipodoc === 4 && (
                                                        <button
                                                            onClick={() => { setShowDocsModal(false); setDocsClienteTarget(null); editarPedido(doc.id) }}
                                                            className="flex items-center gap-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" /> Editar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Vencimientos (solo facturas/pedidos) */}
                                            {doc.tipodoc !== 4 && (
                                                doc.vencimientos.length === 0 ? (
                                                    <p className="text-xs text-slate-400">Sin vencimientos</p>
                                                ) : doc.vencimientos.map(vto => (
                                                    <div key={vto.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-2 py-1.5 bg-white">
                                                        <div className="text-xs text-slate-600 space-y-0.5">
                                                            <p className="font-medium">{vto.fecha_vencimiento}</p>
                                                            <p>
                                                                {vto.importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&#x20AC;
                                                                {vto.entregas_cuenta > 0 && (
                                                                    <span className="ml-1 text-slate-400">(a cta: {vto.entregas_cuenta.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&#x20AC;)</span>
                                                                )}
                                                                {vto.situacion === 0 ? (
                                                                    <span className="ml-2 text-red-500 font-medium">Pte</span>
                                                                ) : (
                                                                    <span className="ml-2 text-green-600 font-medium">Cobrado</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        {vto.situacion === 0 && (
                                                            <button
                                                                onClick={() => openCobrar({
                                                                    tipo: 'vencimiento',
                                                                    idcab: doc.id,
                                                                    vtoId: vto.id,
                                                                    maxImporte: Math.max(0, vto.importe - vto.entregas_cuenta),
                                                                    label: `Vto. ${vto.fecha_vencimiento}`,
                                                                })}
                                                                className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg"
                                                            >
                                                                <CreditCard className="w-3.5 h-3.5" /> Cobrar
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* â”€â”€ Modal Cobrar â”€â”€ */}
            {cobrarTarget && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-bold text-slate-800">Cobrar â€“ {cobrarTarget.label}</h2>
                            <button onClick={() => setCobrarTarget(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-slate-600">Importe a cobrar</label>
                                    <span className="text-xs text-slate-400">pte. {cobrarTarget.maxImporte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
                                </div>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={cobrarTarget.maxImporte}
                                    className="input text-right text-lg font-bold"
                                    value={cobrarImporte}
                                    onChange={e => setCobrarImporte(e.target.value)}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Puedes cobrar menos (entrega a cuenta)</p>
                            </div>
                            {cobrarError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {cobrarError}
                                </div>
                            )}
                            <button
                                onClick={handleCobrar}
                                disabled={cobrarLoading}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {cobrarLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</> : <><Check className="w-4 h-4" /> Confirmar cobro</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal detalle documento (líneas) ── */}
            {(detalleDoc || detalleDocLoading) && (
                <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center px-4" onClick={() => setDetalleDoc(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            {detalleDoc ? (
                                <div>
                                    <h2 className="text-base font-bold text-slate-800">
                                        {detalleDoc.tipodoc === 4 ? 'Albarán' : detalleDoc.tipodoc === 8 ? 'Factura' : detalleDoc.tipodoc === 2 ? 'Pedido' : 'Documento'} {detalleDoc.serie}-{detalleDoc.numero}
                                    </h2>
                                    <p className="text-xs text-slate-500">{detalleDoc.cli_nombre} · {detalleDoc.fecha}</p>
                                </div>
                            ) : (
                                <h2 className="text-base font-bold text-slate-800">Cargando...</h2>
                            )}
                            <button onClick={() => setDetalleDoc(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-4">
                            {detalleDocLoading ? (
                                <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando líneas...
                                </div>
                            ) : detalleDoc && detalleDoc.lineas.length === 0 ? (
                                <p className="text-center text-slate-400 py-8 text-sm">Sin líneas</p>
                            ) : detalleDoc && (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-slate-500 border-b border-slate-200">
                                            <th className="pb-1.5 font-medium">Ref.</th>
                                            <th className="pb-1.5 font-medium">Descripción</th>
                                            <th className="pb-1.5 font-medium text-right">Uds.</th>
                                            <th className="pb-1.5 font-medium text-right">Precio</th>
                                            <th className="pb-1.5 font-medium text-right">%Dto</th>
                                            <th className="pb-1.5 font-medium text-right">Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detalleDoc.lineas.map((l, i) => (
                                            <tr key={i} className="border-b border-slate-100 last:border-0">
                                                <td className="py-1.5 pr-2 text-slate-500">{l.referencia}</td>
                                                <td className="py-1.5 pr-2 text-slate-800">
                                                    {l.descripcion}
                                                    {(l.talla || l.color) && (
                                                        <span className="ml-1 text-slate-400">({[l.talla, l.color].filter(Boolean).join('/')})</span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 pr-2 text-right">{l.unidades}</td>
                                                <td className="py-1.5 pr-2 text-right">{l.precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</td>
                                                <td className="py-1.5 pr-2 text-right">{l.dto > 0 ? `${l.dto}%` : '—'}</td>
                                                <td className="py-1.5 text-right font-medium">{l.importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-300">
                                            <td colSpan={5} className="pt-2 text-right font-semibold text-slate-700 text-sm">Total</td>
                                            <td className="pt-2 text-right font-bold text-slate-900 text-sm">{detalleDoc.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                        {/* ── Footer envío email + imprimir ── */}
                        {detalleDoc && (
                            <div className="border-t border-slate-200 px-4 py-3 flex-shrink-0 space-y-2">
                                {/* Email */}
                                {detalleDocEmailEnviado ? (
                                    <p className="text-green-600 text-sm flex items-center gap-1.5">
                                        <Check className="w-4 h-4" /> Email enviado correctamente
                                    </p>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            className="input flex-1 text-sm"
                                            type="email"
                                            placeholder="Email destinatario..."
                                            value={detalleDocEmail}
                                            onChange={e => { setDetalleDocEmail(e.target.value); setDetalleDocEmailEnviado(false); setDetalleDocEmailError('') }}
                                        />
                                        <button
                                            onClick={handleEnviarEmailDetalle}
                                            disabled={!detalleDocEmail || detalleDocEnviando}
                                            className="btn-primary flex items-center gap-1.5 text-sm px-3 disabled:opacity-50"
                                        >
                                            {detalleDocEnviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                            Enviar
                                        </button>
                                    </div>
                                )}
                                {detalleDocEmailError && <p className="text-red-600 text-xs mt-1">{detalleDocEmailError}</p>}
                                {/* Imprimir */}
                                <button
                                    onClick={() => handlePrintDoc({
                                        tipodoc_label: detalleDoc.tipodoc === 4 ? 'Albarán' : detalleDoc.tipodoc === 8 ? 'Factura' : 'Pedido',
                                        serie: detalleDoc.serie,
                                        numero: detalleDoc.numero,
                                        fecha: detalleDoc.fecha,
                                        cli_nombre: detalleDoc.cli_nombre,
                                        total: detalleDoc.total,
                                        lineas: detalleDoc.lineas,
                                    })}
                                    disabled={detallePrinting}
                                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors border ${
                                        detallePrintOk
                                            ? 'bg-green-50 border-green-200 text-green-700'
                                            : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                                    } disabled:opacity-50`}
                                >
                                    {detallePrinting
                                        ? <><Loader2 className="w-4 h-4 animate-spin" />Imprimiendo...</>
                                        : detallePrintOk
                                            ? <><Check className="w-4 h-4" />Ticket enviado</>
                                            : <><Printer className="w-4 h-4" />Imprimir ticket</>
                                    }
                                </button>
                                {isAndroid && (
                                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                                        Requiere{' '}
                                        <a href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">RawBT Print Service</a>{' '}con la Bixolon vinculada por Bluetooth.
                                    </p>
                                )}
                                {detallePrintError && (
                                    <p className="text-red-600 text-xs flex items-center gap-1">
                                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{detallePrintError}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Modal Consultar (standalone) — nuevo diseño ── */}
            {showConsultarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-4 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{maxHeight:'92vh'}}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <Search className="w-4 h-4 text-amber-600" /> Documentos pendientes
                            </h2>
                            <button onClick={() => setShowConsultarModal(false)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        {/* Buscador */}
                        <div className="px-4 py-2 border-b border-slate-100 flex-shrink-0">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    className="input pl-8 text-sm"
                                    placeholder="Filtrar por cliente o nº documento..."
                                    value={consultarQuery}
                                    onChange={e => setConsultarQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        {/* Lista */}
                        <div className="overflow-y-auto flex-1 min-h-0">
                            {consultarLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
                                </div>
                            ) : consultarError ? (
                                <p className="text-red-600 text-sm text-center py-8">{consultarError}</p>
                            ) : consultarDocsFiltrados.length === 0 ? (
                                <p className="text-slate-400 text-sm text-center py-12">
                                    {consultarQuery ? 'Sin resultados para la búsqueda' : 'No hay documentos pendientes'}
                                </p>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {consultarDocsFiltrados.map(d => {
                                        const esAlb = d.tipodoc === 4
                                        const keyDoc = consultarDocKey(d)
                                        const vtoPtes = d.vencimientos.filter(v => v.situacion === 0)
                                        const allVtosSelected = !esAlb && vtoPtes.length > 0 && vtoPtes.every(v => consultarSeleccion.has(consultarDocKey(d, v.id)))
                                        const isSelected = esAlb ? consultarSeleccion.has(keyDoc) : allVtosSelected
                                        return (
                                            <div key={d.id + '-' + d.tipodoc}
                                                className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-amber-50' : ''}`}
                                                onClick={() => consultarToggleDoc(d)}
                                            >
                                                {/* Checkbox */}
                                                <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                                </div>
                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 ${esAlb ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                                {d.tipodoc_label}
                                                            </span>
                                                            <span className="font-mono font-semibold text-sm text-slate-800">{d.serie}-{d.numero}</span>
                                                            {d.fecha && <span className="text-xs text-slate-400 ml-2">{new Date(d.fecha).toLocaleDateString('es-ES', {day:'2-digit',month:'2-digit',year:'2-digit'})}</span>}
                                                            {esAlb && (
                                                                <button
                                                                    className="ml-2 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                                                                    onClick={e => { e.stopPropagation(); openDetalleDoc(d.cli_codigo, d.id) }}
                                                                >
                                                                    <List className="w-3 h-3" /> Ver
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <p className="text-sm font-bold text-slate-800">{d.pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</p>
                                                            {d.pendiente < d.total - 0.01 && <p className="text-[10px] text-slate-400">de {d.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</p>}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-600 mt-0.5">{d.cli_nombre}</p>
                                                    {/* Vencimientos de facturas */}
                                                    {!esAlb && vtoPtes.length > 0 && (
                                                        <div className="mt-1.5 space-y-1">
                                                            {vtoPtes.map(v => {
                                                                const kv = consultarDocKey(d, v.id)
                                                                const vSel = consultarSeleccion.has(kv)
                                                                const pteV = v.importe - v.entregas_cuenta
                                                                return (
                                                                    <div key={v.id}
                                                                        className={`flex items-center gap-2 pl-2 text-xs rounded py-0.5 ${vSel ? 'text-amber-700' : 'text-slate-500'}`}
                                                                        onClick={e => { e.stopPropagation(); const n=new Set(consultarSeleccion); vSel?n.delete(kv):n.add(kv); setConsultarSeleccion(n) }}
                                                                    >
                                                                        <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${vSel ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                                                                            {vSel && <Check className="w-2 h-2 text-white" />}
                                                                        </div>
                                                                        <span>Vto. {new Date(v.fecha_vencimiento).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
                                                                        <span className="font-semibold ml-auto">{pteV.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        {/* Footer */}
                        {!consultarLoading && !consultarError && (
                            <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 bg-slate-50 rounded-b-2xl">
                                {consultarCobrarError && (
                                    <p className="text-red-600 text-xs mb-2 flex items-center gap-1">
                                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{consultarCobrarError}
                                    </p>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm">
                                        {consultarSeleccion.size === 0 ? (
                                            <span className="text-slate-500">Total pte: <strong className="text-slate-800">{consultarTotalPte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</strong></span>
                                        ) : (
                                            <span className="text-amber-700">Seleccionado: <strong>{consultarTotalSeleccionado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</strong></span>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleCobrarMultiple}
                                        disabled={consultarSeleccion.size === 0 || consultarCobrandoMultiple}
                                        className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
                                    >
                                        {consultarCobrandoMultiple
                                            ? <><Loader2 className="w-4 h-4 animate-spin" />Cobrando...</>
                                            : <><CreditCard className="w-4 h-4" />Cobrar ({consultarSeleccion.size})</>
                                        }
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* â”€â”€ Modal Carrito â”€â”€ */}
            {showCarritoModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <div>
                                <h2 className="text-base font-bold text-slate-800">{TIPOS.find(t => t.id === tipodoc)?.label} — {clienteSeleccionado?.nombre}</h2>
                                <p className="text-xs text-slate-500">{lineasConUds.length} línea{lineasConUds.length !== 1 ? 's' : ''} · {serie}</p>
                            </div>
                            <button onClick={() => setShowCarritoModal(false)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
                            {lineasConUds.map((l, idx) => {
                                const uds = parseFloat(l.unidades)
                                const precioEfectivo = l.precio * (1 - l.dto / 100)
                                const importe = uds * precioEfectivo * (1 + l.piva / 100)
                                return (
                                    <div key={l.referencia + idx} className={`flex items-center gap-3 px-4 py-3 ${l.es_canon ? 'bg-amber-50/50' : ''}`}>
                                        {/* Badge unidades */}
                                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${l.es_canon ? 'bg-amber-100/60 border border-amber-200' : 'bg-brand/10 border border-brand/20'}`}>
                                            <span className={`text-base font-bold leading-none ${l.es_canon ? 'text-amber-600' : 'text-brand'}`}>{Number.isInteger(uds) ? uds : uds.toFixed(2)}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-semibold text-slate-800 leading-tight">{l.descripcion}</p>
                                                {l.es_canon && <span className="flex-shrink-0 text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded">Canon</span>}
                                            </div>
                                            <p className="text-xs text-slate-400 font-mono">{l.referencia || '—'}</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                {precioEfectivo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ud
                                                {l.dto > 0 && <span className="text-amber-600 ml-1">(-{l.dto}%)</span>}
                                                <span className="ml-1 text-slate-400">IVA {l.piva}%</span>
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-slate-800 whitespace-nowrap">
                                            {importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="px-4 py-3 border-t border-slate-200">
                            <div className="space-y-1.5 mb-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-slate-500">Base imponible</p>
                                    <p className="text-sm font-semibold text-slate-700">
                                        {totalSinIva.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                    </p>
                                </div>
                                {desgloseIva.map(([piva, ivaImporte]) => (
                                    <div key={piva} className="flex items-center justify-between">
                                        <p className="text-xs text-slate-400">IVA {piva}%</p>
                                        <p className="text-xs text-slate-500 font-mono">
                                            {(ivaImporte as number).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                        </p>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                                    <p className="text-sm font-bold text-slate-700">Total</p>
                                    <p className="text-xl font-bold text-slate-800">
                                        {total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowCarritoModal(false); handleSubmit() }}
                                disabled={submitting}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {submitting
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</>
                                    : <><Check className="w-4 h-4" /> Confirmar y crear {TIPOS.find(t => t.id === tipodoc)?.label}</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* â”€â”€ Modal Añadir Artículo â”€â”€ */}
            {showAddArticuloModal && clienteSeleccionado && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 px-2 pb-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-800">Añadir artículo</h2>
                            <button onClick={() => { setShowAddArticuloModal(false); setArticuloQuery(''); setArticuloResults([]) }} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="relative mb-3">
                                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    className="input pl-8 pr-8"
                                    placeholder="Buscar por referencia o nombre..."
                                    value={articuloQuery}
                                    onChange={e => handleArticuloInput(e.target.value)}
                                    autoFocus
                                />
                                {searchingArticulo && (
                                    <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 animate-spin" />
                                )}
                            </div>
                            {articulosCache.length > 0 && (
                                <p className="text-xs text-slate-400 mb-2">
                                    {articuloResults.length === articulosCache.length
                                        ? `${articulosCache.length} artículos`
                                        : `${articuloResults.length} de ${articulosCache.length} artículos`}
                                </p>
                            )}
                            {articuloResults.length > 0 ? (
                                vistaImagenes ? (
                                    <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                                        {articuloResults.map(a => (
                                            <button
                                                key={a.referencia}
                                                onClick={() => addArticuloToLineas(a)}
                                                className="text-left rounded-xl border border-slate-200 overflow-hidden hover:border-brand transition-colors flex flex-col"
                                            >
                                                {a.tiene_imagen ? (
                                                    <div className="bg-slate-50 flex items-center justify-center overflow-hidden" style={{ height: 70 }}>
                                                        <img
                                                            src={`/api/autoventa/articulos/${encodeURIComponent(a.referencia)}/imagen`}
                                                            alt={a.nombre}
                                                            className="object-contain w-full h-full"
                                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="bg-slate-100 flex items-center justify-center" style={{ height: 70 }}>
                                                        <Package className="w-6 h-6 text-slate-300" />
                                                    </div>
                                                )}
                                                <div className="p-1.5">
                                                    <p className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2">{a.nombre}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                        {a.precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                                        {a.control_lotes && <Package className="inline w-2.5 h-2.5 ml-1 text-amber-500" />}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100">
                                        {articuloResults.map(a => (
                                            <button
                                                key={a.referencia}
                                                onClick={() => addArticuloToLineas(a)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-brand/5 transition-colors"
                                            >
                                                <p className="text-sm font-medium text-slate-800 leading-tight flex items-center gap-1.5">
                                                    {a.nombre}
                                                    {a.control_lotes && <Package className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                                                </p>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5">
                                                    {a.referencia}
                                                    <span className="ml-2 text-slate-600 font-sans">{a.precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
                                                    <span className="ml-1 text-slate-300">IVA {a.piva}%</span>
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )
                            ) : articuloQuery.length > 0 && !searchingArticulo ? (
                                <p className="text-sm text-slate-400 text-center py-6">Sin resultados para &ldquo;{articuloQuery}&rdquo;</p>
                            ) : searchingArticulo ? null : (
                                <p className="text-xs text-slate-400 text-center py-4">Cargando artículos...</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </div>

        {/* Panel detalle albar\u00e1n */}
        {detalleAlbaran && (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center">
                <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                    {/* Cabecera */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                        <div>
                            <p className="text-xs text-slate-400 font-mono">{detalleAlbaran.serie}-{detalleAlbaran.numero}</p>
                            <p className="text-base font-bold text-slate-800 leading-tight">{detalleAlbaran.cli_nombre}</p>
                            {detalleAlbaran.fecha && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {new Date(detalleAlbaran.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                </p>
                            )}
                        </div>
                        <button onClick={() => setDetalleAlbaran(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    {/* L\u00edneas */}
                    <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                        {detalleAlbaran.lineas.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-6">Sin l\u00edneas</p>
                        ) : detalleAlbaran.lineas.map((l, i) => {
                            const base = l.unidades * l.precio * (1 - l.dto / 100)
                            const total = base * (1 + l.piva / 100)
                            return (
                                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 leading-tight">{l.descripcion}</p>
                                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                                            {l.referencia}
                                            {l.talla && <span className="ml-1 text-slate-500">T:{l.talla}</span>}
                                            {l.color && <span className="ml-1 text-slate-500">C:{l.color}</span>}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {l.unidades} ud × {l.precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                                            {l.dto > 0 && <span className="ml-1 text-amber-600">-{l.dto}%</span>}
                                            <span className="ml-1 text-slate-400">IVA {l.piva}%</span>
                                        </p>
                                    </div>
                                    <span className="text-sm font-bold text-slate-800 flex-shrink-0">
                                        {total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Total + Cobrar + Editar + Imprimir */}
                    <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-600">Total albarán</span>
                            <span className="text-xl font-bold text-slate-900">
                                {detalleAlbaran.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </span>
                        </div>
                        {(detalleAlbaran.pendiente ?? detalleAlbaran.total) > 0.01 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const d = detalleAlbaran
                                        setDetalleAlbaran(null)
                                        editarPedido(d.id)
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                                >
                                    <Edit2 className="w-4 h-4" />Editar
                                </button>
                                <button
                                    onClick={() => {
                                        const d = detalleAlbaran
                                        setDetalleAlbaran(null)
                                        openCobrar({ tipo: 'albaran', idcab: d.id, maxImporte: d.pendiente ?? d.total, label: `Alb. ${d.serie}-${d.numero}`, cli_codigo: d.cli_codigo })
                                    }}
                                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                                >
                                    <Check className="w-4 h-4" />Cobrar
                                </button>
                            </div>
                        )}
                        {/* Botón imprimir */}
                        <button
                            onClick={() => handlePrintDoc({
                                tipodoc_label: detalleAlbaran.tipodoc === 4 ? 'Albarán' : detalleAlbaran.tipodoc === 2 ? 'Pedido' : 'Factura',
                                serie: detalleAlbaran.serie,
                                numero: detalleAlbaran.numero,
                                fecha: detalleAlbaran.fecha,
                                cli_nombre: detalleAlbaran.cli_nombre,
                                total: detalleAlbaran.total,
                                lineas: detalleAlbaran.lineas,
                            })}
                            disabled={detallePrinting}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                detallePrintOk
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                            } disabled:opacity-50`}
                        >
                            {detallePrinting
                                ? <><Loader2 className="w-4 h-4 animate-spin" />Imprimiendo...</>
                                : detallePrintOk
                                    ? <><Check className="w-4 h-4" />Ticket enviado a impresora</>
                                    : <><Printer className="w-4 h-4" />Imprimir ticket</>
                            }
                        </button>
                        {isAndroid && (
                            <p className="text-[11px] text-slate-400 leading-snug">
                                Requiere{' '}
                                <a href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">RawBT Print Service</a>{' '}con la Bixolon vinculada por Bluetooth.
                            </p>
                        )}
                        {detallePrintError && (
                            <p className="text-red-600 text-xs flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{detallePrintError}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Modal cobro desde lista */}
        {cobrarTarget && vista === 'lista' && (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-slate-800">Cobrar — {cobrarTarget.label}</h2>
                        <button onClick={() => setCobrarTarget(null)} className="p-1 rounded hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium text-slate-600">Importe a cobrar</label>
                                <span className="text-xs text-slate-400">pte. {cobrarTarget.maxImporte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
                            </div>
                            <input type="number" step="0.01" min="0.01" max={cobrarTarget.maxImporte}
                                className="input text-right text-lg font-bold"
                                value={cobrarImporte} onChange={e => setCobrarImporte(e.target.value)} />
                            <p className="text-[11px] text-slate-400 mt-1">Puedes cobrar menos (entrega a cuenta)</p>
                        </div>
                        {cobrarError && <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4 flex-shrink-0" />{cobrarError}</p>}
                        <button onClick={handleCobrar} disabled={cobrarLoading}
                            className="btn-primary w-full flex items-center justify-center gap-2">
                            {cobrarLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Registrando...</> : <><Check className="w-4 h-4" />Confirmar cobro</>}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ── Modal Liquidación ── */}
        {showLiquidacionModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-4 px-2 pb-6 overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                        <div className="flex flex-col gap-0.5">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-indigo-600" />
                                Liquidación{agenteNombre ? ` — Agente ${agenteNombre}` : ''}
                            </h2>
                            {liqDesde && liqHasta && (
                                <span className="text-xs text-slate-400 pl-6">
                                    {liqDesde === liqHasta
                                        ? new Date(liqDesde + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                        : `Del ${new Date(liqDesde + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} al ${new Date(liqHasta + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                                </span>
                            )}
                        </div>
                        <button onClick={() => setShowLiquidacionModal(false)} className="p-1 rounded hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    {/* Filtros de fecha */}
                    <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-2 items-center">
                        {(['hoy', 'semana', 'mes', 'avanzado'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => {
                                    setLiqFiltro(f)
                                    if (f !== 'avanzado') cargarLiquidacion(f)
                                }}
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    liqFiltro === f
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Esta semana' : f === 'mes' ? 'Este mes' : 'Avanzado'}
                            </button>
                        ))}
                        {liqFiltro === 'avanzado' && (
                            <>
                                <input
                                    type="date"
                                    value={liqDesde}
                                    onChange={e => setLiqDesde(e.target.value)}
                                    className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <span className="text-xs text-slate-400">—</span>
                                <input
                                    type="date"
                                    value={liqHasta}
                                    onChange={e => setLiqHasta(e.target.value)}
                                    className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <button
                                    onClick={() => cargarLiquidacion('avanzado', liqDesde, liqHasta)}
                                    className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                >
                                    Buscar
                                </button>
                            </>
                        )}
                    </div>

                    {/* Contenido */}
                    <div className="p-4 max-h-[65vh] overflow-y-auto space-y-5">
                        {liqLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                            </div>
                        ) : liqError ? (
                            <p className="text-red-600 text-sm text-center py-6">{liqError}</p>
                        ) : (
                            <>
                                {/* Documentos del período */}
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                        {liqFiltro === 'hoy' ? 'Documentos de hoy' : 'Documentos del período'}
                                    </p>
                                    {liqDocsHoy.length === 0 ? (
                                        <p className="text-slate-400 text-xs text-center py-4">
                                            {liqFiltro === 'hoy' ? 'Sin documentos creados hoy' : 'Sin documentos en el período'}
                                        </p>
                                    ) : (
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-slate-500">
                                                    <th className="text-left py-2 pr-2 font-medium">Tipo</th>
                                                    <th className="text-left py-2 pr-2 font-medium">Documento</th>
                                                    <th className="text-left py-2 pr-2 font-medium">Cliente</th>
                                                    <th className="text-right py-2 pr-2 font-medium">Total</th>
                                                    <th className="text-right py-2 pr-2 font-medium">Cobrado</th>
                                                    <th className="text-right py-2 font-medium">Pendiente</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {liqDocsHoy.map(d => {
                                                    const parcial = d.cobrado > 0.01 && d.pendiente > 0.01
                                                    const totCobrado = d.pendiente <= 0.01
                                                    return (
                                                    <tr key={d.id} className={`hover:bg-slate-50 ${parcial ? 'bg-amber-50/60' : ''}`}>
                                                        <td className="py-2 pr-2">
                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${d.tipodoc === 2 ? 'bg-blue-50 text-blue-700' : d.tipodoc === 4 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                                                                {d.tipodoc_label}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 pr-2 font-mono font-semibold text-indigo-700 whitespace-nowrap">
                                                            {d.serie}-{d.numero}
                                                        </td>
                                                        <td className="py-2 pr-2 text-slate-700">{d.cli_nombre}</td>
                                                        <td className="py-2 pr-2 text-right font-medium text-slate-800">
                                                            {d.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-2 pr-2 text-right">
                                                            {d.cobrado > 0.01 ? (
                                                                <span className="text-green-700 font-semibold">
                                                                    {d.cobrado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-300">—</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 text-right whitespace-nowrap">
                                                            {totCobrado ? (
                                                                <span className="inline-flex items-center gap-0.5 text-green-600 font-semibold">
                                                                    <Check className="w-3 h-3" /> Cobrado
                                                                </span>
                                                            ) : parcial ? (
                                                                <span className="inline-flex flex-col items-end gap-0">
                                                                    <span className="text-red-600 font-bold">
                                                                        {d.pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                    <span className="text-[10px] text-amber-600 font-medium">parcial</span>
                                                                </span>
                                                            ) : (
                                                                <span className="text-red-500 font-medium">
                                                                    {d.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                    {liqDocsHoy.length > 0 && (
                                        <div className="flex justify-end gap-4 text-xs mt-2 text-slate-500">
                                            <span>Total ventas: <strong className="text-slate-800">{liqTotalVentas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</strong></span>
                                            <span>Cobrado hoy: <strong className="text-green-700">{liqTotalCobradoHoy.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</strong></span>
                                        </div>
                                    )}
                                </div>

                                {/* Cobros de docs de otros días */}
                                {liqCobrosOtros.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cobros de documentos anteriores</p>
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-slate-500">
                                                    <th className="text-left py-2 pr-2 font-medium">Fecha doc.</th>
                                                    <th className="text-left py-2 pr-2 font-medium">Documento</th>
                                                    <th className="text-left py-2 pr-2 font-medium">Cliente</th>
                                                    <th className="text-right py-2 font-medium">Ingreso</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {liqCobrosOtros.map(c => (
                                                    <tr key={c.id} className="hover:bg-slate-50">
                                                        <td className="py-2 pr-2 text-slate-400 whitespace-nowrap">
                                                            {c.fecha_doc ? new Date(c.fecha_doc + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '—'}
                                                        </td>
                                                        <td className="py-2 pr-2 font-mono font-semibold text-indigo-700 whitespace-nowrap">
                                                            {c.serie && c.numero ? `${c.serie}-${c.numero}` : (c.concepto || '—')}
                                                        </td>
                                                        <td className="py-2 pr-2 text-slate-700">{c.cli_nombre || '—'}</td>
                                                        <td className="py-2 text-right text-green-700 font-medium">
                                                            {c.ingreso.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="flex justify-end mt-2 text-xs">
                                            <span className="text-slate-500">Total cobros anteriores: <strong className="text-green-700">{liqTotalCobrosOtros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</strong></span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer con totales y botón email */}
                    {!liqLoading && !liqError && (
                        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <span className="text-sm text-slate-600">
                                    Total cobrado hoy: <strong className="text-green-700">{(liqTotalCobradoHoy + liqTotalCobrosOtros).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</strong>
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <input
                                        type="email"
                                        value={liqEmailDest}
                                        onChange={e => { setLiqEmailDest(e.target.value); setLiqEmailMsg('') }}
                                        placeholder="Dirección de email"
                                        className="input text-xs py-1.5 w-52"
                                    />
                                    <button
                                        onClick={enviarLiquidacionEmail}
                                        disabled={liqEmailSending || liqDocsHoy.length === 0 || !liqEmailDest.trim()}
                                        className="flex items-center gap-2 text-sm font-medium text-white bg-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {liqEmailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                        Enviar
                                    </button>
                                </div>
                            </div>
                            {liqEmailMsg && (
                                <p className={`text-xs ${liqEmailMsg.startsWith('Email') ? 'text-green-600' : 'text-red-600'}`}>{liqEmailMsg}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}

        </>
    )
}
