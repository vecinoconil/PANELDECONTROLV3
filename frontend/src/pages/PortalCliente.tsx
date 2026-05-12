/**
 * Portal público de facturas para clientes del ERP.
 * Ruta: /portal/:token  (sin ProtectedRoute — acceso por enlace JWT)
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Printer, Download, ChevronLeft, Globe, AlertTriangle } from 'lucide-react'

const API = '/api/portal'

function fmt(n: number) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface PortalInfo {
    empresa_nombre: string
    cli_codigo: number
    cli_nombre: string
    cli_alias: string | null
    cli_cif: string | null
    cli_direccion: string | null
    cli_localidad: string | null
    cli_cpostal: string | null
    cli_telefono: string | null
    cli_email: string | null
}

interface Factura {
    id: number
    tipodoc: number
    serie: string
    numero: number
    fecha: string
    total: number
    pendiente: number
    tipo_doc: string
}

interface FacturasResponse {
    facturas: Factura[]
    anios: number[]
}

interface Linea {
    orden: number
    referencia: string | null
    descripcion: string
    unidades: number
    precio: number
    importe: number
    pdto1: number
    descuento: number
    piva: number
}

interface Vencimiento {
    fecha: string | null
    importe: number
    situacion: number
}

interface Cabecera {
    tipodoc: number
    serie: string
    numero: number
    fecha: string
    cli_nombre: string
    baseimpo1: number
    baseimpo2: number
    baseimpo3: number
    piva1: number
    piva2: number
    piva3: number
    iva1: number
    iva2: number
    iva3: number
    total: number
    descripcion: string | null
    observaciones: string | null
}

interface DetalleResponse {
    cabecera: Cabecera
    lineas: Linea[]
    vencimientos: Vencimiento[]
    empresa: { nombre: string }
}

type View = 'lista' | 'detalle'

export default function PortalCliente() {
    const { token } = useParams<{ token: string }>()

    const [info, setInfo] = useState<PortalInfo | null>(null)
    const [infoError, setInfoError] = useState('')

    const [facturas, setFacturas] = useState<Factura[]>([])
    const [anios, setAnios] = useState<number[]>([])
    const [anioFiltro, setAnioFiltro] = useState<number | ''>('')
    const [facturasLoading, setFacturasLoading] = useState(true)

    const [view, setView] = useState<View>('lista')
    const [detalle, setDetalle] = useState<DetalleResponse | null>(null)
    const [detalleLoading, setDetalleLoading] = useState(false)
    const [detalleId, setDetalleId] = useState<number | null>(null)
    const [pdfLoading, setPdfLoading] = useState(false)

    // ── Carga info cliente ─────────────────────────────────────────────
    useEffect(() => {
        if (!token) return
        fetch(`${API}/${token}/info`)
            .then(r => {
                if (!r.ok) return r.json().then(d => { throw new Error(d.detail || 'Error') })
                return r.json()
            })
            .then(setInfo)
            .catch(e => setInfoError(e.message))
    }, [token])

    // ── Carga facturas ─────────────────────────────────────────────────
    const cargarFacturas = (anio?: number) => {
        if (!token) return
        setFacturasLoading(true)
        const qs = anio ? `?anio=${anio}` : ''
        fetch(`${API}/${token}/facturas${qs}`)
            .then(r => r.json())
            .then((d: FacturasResponse) => {
                setFacturas(d.facturas)
                setAnios(d.anios)
            })
            .catch(() => setFacturas([]))
            .finally(() => setFacturasLoading(false))
    }

    useEffect(() => { cargarFacturas() }, [token])

    const handleAnioChange = (a: number | '') => {
        setAnioFiltro(a)
        cargarFacturas(a || undefined)
    }

    // ── Cargar detalle ─────────────────────────────────────────────────
    const abrirDetalle = (id: number) => {
        if (!token) return
        setDetalleId(id)
        setDetalleLoading(true)
        setView('detalle')
        fetch(`${API}/${token}/facturas/${id}`)
            .then(r => r.json())
            .then(setDetalle)
            .catch(() => setDetalle(null))
            .finally(() => setDetalleLoading(false))
    }

    const descargarPdf = async () => {
        if (!token || !detalleId) return
        setPdfLoading(true)
        try {
            const r = await fetch(`${API}/${token}/facturas/${detalleId}/pdf`)
            if (!r.ok) throw new Error('Error al generar PDF')
            const blob = await r.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const disp = r.headers.get('content-disposition') || ''
            const match = disp.match(/filename="?([^"]+)"?/)
            a.download = match ? match[1] : `factura_${detalleId}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (e) {
            alert('Error al descargar el PDF')
        } finally {
            setPdfLoading(false)
        }
    }

    const imprimir = () => window.print()

    // ── Error global ───────────────────────────────────────────────────
    if (infoError) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-slate-800 mb-2">Enlace no válido</h1>
                    <p className="text-slate-500 text-sm">{infoError}</p>
                </div>
            </div>
        )
    }

    if (!info) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
        )
    }

    // ══════════════════════════════════════════════════════════════════
    // Vista detalle
    // ══════════════════════════════════════════════════════════════════
    if (view === 'detalle') {
        return (
            <div className="min-h-screen bg-white">
                {/* Barra de navegación — se oculta al imprimir */}
                <div className="no-print bg-slate-800 text-white px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-4">
                    <button
                        onClick={() => { setView('lista'); setDetalle(null) }}
                        className="flex items-center gap-1 text-sm hover:text-slate-200 shrink-0"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Volver</span>
                    </button>
                    <span className="text-slate-400 text-xs sm:text-sm truncate min-w-0">{info.empresa_nombre}</span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={descargarPdf}
                            disabled={pdfLoading}
                            className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">{pdfLoading ? 'Generando...' : 'Descargar PDF'}</span>
                            <span className="sm:hidden">{pdfLoading ? '...' : 'PDF'}</span>
                        </button>
                        <button
                            onClick={imprimir}
                            className="flex items-center gap-1.5 bg-white text-slate-800 px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-100"
                        >
                            <Printer className="w-4 h-4" />
                            <span className="hidden sm:inline">Imprimir</span>
                        </button>
                    </div>
                </div>

                {detalleLoading && (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                )}

                {detalle && !detalleLoading && (
                    <div className="max-w-4xl mx-auto p-4 sm:p-8 print:p-4">
                        {/* Cabecera del documento */}
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-6 sm:mb-8 pb-5 border-b-2 border-slate-200">
                            <div>
                                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-1">
                                    {detalle.cabecera.tipodoc === 8 ? 'FACTURA' : 'ALBARÁN'}
                                </h1>
                                <p className="text-slate-500 text-sm">{detalle.empresa.nombre}</p>
                            </div>
                            <div className="sm:text-right text-sm">
                                <div className="text-slate-400 text-xs uppercase tracking-wide">Nº documento</div>
                                <div className="font-bold text-lg sm:text-xl text-slate-800">
                                    {detalle.cabecera.serie}-{detalle.cabecera.numero}
                                </div>
                                <div className="text-slate-500 mt-0.5">{detalle.cabecera.fecha}</div>
                            </div>
                        </div>

                        {/* Cliente */}
                        <div className="mb-8">
                            <p className="text-xs uppercase text-slate-400 font-semibold mb-1">Cliente</p>
                            <p className="font-semibold text-slate-800">{detalle.cabecera.cli_nombre}</p>
                            {info.cli_cif && <p className="text-sm text-slate-500">CIF/NIF: {info.cli_cif}</p>}
                            {info.cli_direccion && <p className="text-sm text-slate-500">{info.cli_direccion}</p>}
                            {info.cli_localidad && <p className="text-sm text-slate-500">{info.cli_cpostal} {info.cli_localidad}</p>}
                        </div>

                        {/* Descripción */}
                        {detalle.cabecera.descripcion && (
                            <div className="mb-4 bg-slate-50 rounded p-3 text-sm text-slate-600">
                                {detalle.cabecera.descripcion}
                            </div>
                        )}

                        {/* Líneas — tabla con scroll en móvil */}
                        <div className="overflow-x-auto -mx-4 sm:mx-0 mb-6">
                            <table className="w-full text-sm min-w-[520px]">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-600 text-xs">
                                        <th className="text-left py-2 px-3 rounded-tl hidden sm:table-cell">Ref.</th>
                                        <th className="text-left py-2 px-3 sm:rounded-none rounded-tl">Descripción</th>
                                        <th className="text-right py-2 px-3">Uds</th>
                                        <th className="text-right py-2 px-3 hidden sm:table-cell">Precio</th>
                                        <th className="text-right py-2 px-3 hidden sm:table-cell">Dto%</th>
                                        <th className="text-right py-2 px-3 rounded-tr">Importe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.lineas.map((l, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="py-1.5 px-3 text-slate-500 text-xs hidden sm:table-cell">{l.referencia}</td>
                                            <td className="py-1.5 px-3">
                                                <span>{l.descripcion}</span>
                                                {l.referencia && <span className="block text-xs text-slate-400 sm:hidden">{l.referencia}</span>}
                                            </td>
                                            <td className="text-right py-1.5 px-3 font-mono whitespace-nowrap">{l.unidades}</td>
                                            <td className="text-right py-1.5 px-3 font-mono hidden sm:table-cell whitespace-nowrap">{fmt(l.precio)}</td>
                                            <td className="text-right py-1.5 px-3 text-slate-400 font-mono hidden sm:table-cell">{l.descuento > 0 ? l.descuento.toFixed(1) : ''}</td>
                                            <td className="text-right py-1.5 px-3 font-mono font-semibold whitespace-nowrap">{fmt(l.importe)} €</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totales IVA */}
                        <div className="flex justify-end mb-6">
                            <div className="w-full sm:w-72 text-sm">
                                {([1, 2, 3] as const).map(n => {
                                    const base = detalle.cabecera[`baseimpo${n}` as keyof Cabecera] as number
                                    const piva = detalle.cabecera[`piva${n}` as keyof Cabecera] as number
                                    const iva = detalle.cabecera[`iva${n}` as keyof Cabecera] as number
                                    if (!base) return null
                                    return (
                                        <div key={n} className="flex justify-between py-0.5 text-slate-500">
                                            <span>Base imponible {piva}%</span>
                                            <span className="font-mono">{fmt(base)} €</span>
                                        </div>
                                    )
                                })}
                                {([1, 2, 3] as const).map(n => {
                                    const iva = detalle.cabecera[`iva${n}` as keyof Cabecera] as number
                                    const piva = detalle.cabecera[`piva${n}` as keyof Cabecera] as number
                                    if (!iva) return null
                                    return (
                                        <div key={n} className="flex justify-between py-0.5 text-slate-500">
                                            <span>IVA {piva}%</span>
                                            <span className="font-mono">{fmt(iva)} €</span>
                                        </div>
                                    )
                                })}
                                <div className="flex justify-between py-1.5 font-bold text-base border-t-2 border-slate-800 mt-1">
                                    <span>TOTAL</span>
                                    <span className="font-mono text-blue-700">{fmt(detalle.cabecera.total)} €</span>
                                </div>
                            </div>
                        </div>

                        {/* Vencimientos */}
                        {detalle.vencimientos.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 text-sm mb-4">
                                <p className="font-semibold text-amber-700 mb-2">Vencimientos</p>
                                {detalle.vencimientos.map((v, i) => (
                                    <div key={i} className="flex flex-wrap gap-x-4 gap-y-0.5 py-0.5 border-b border-amber-100 last:border-0">
                                        <span className="text-slate-600 w-24">{v.fecha}</span>
                                        <span className="font-mono font-medium">{fmt(v.importe)} €</span>
                                        <span className={`ml-auto text-xs font-medium ${v.situacion === 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {v.situacion === 0 ? 'Pendiente' : 'Cobrado'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Observaciones */}
                        {detalle.cabecera.observaciones && (
                            <div className="mt-6 text-xs text-slate-400 border-t pt-4">
                                {detalle.cabecera.observaciones}
                            </div>
                        )}
                    </div>
                )}

                {/* Estilos para impresión */}
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        body { font-size: 11pt; }
                    }
                `}</style>
            </div>
        )
    }

    // ══════════════════════════════════════════════════════════════════
    // Vista lista (principal)
    // ══════════════════════════════════════════════════════════════════
    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b shadow-sm px-4 sm:px-6 py-3 sm:py-4">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                        <h1 className="font-bold text-slate-800 truncate">{info.empresa_nombre}</h1>
                        <p className="text-xs sm:text-sm text-slate-500 truncate">
                            Portal de facturas — {info.cli_nombre}
                            {info.cli_alias ? ` (${info.cli_alias})` : ''}
                        </p>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
                {/* Filtro año */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-base sm:text-lg font-semibold text-slate-700">Documentos</h2>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-500 hidden sm:inline">Año:</label>
                        <select
                            value={anioFiltro}
                            onChange={e => handleAnioChange(e.target.value ? Number(e.target.value) : '')}
                            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm"
                        >
                            <option value="">Todos los años</option>
                            {anios.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                </div>

                {facturasLoading ? (
                    <div className="flex justify-center py-16">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                ) : facturas.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        No hay documentos para mostrar
                    </div>
                ) : (
                    <>
                        {/* Tabla — visible en sm+ */}
                        <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b text-slate-500 text-xs uppercase">
                                        <th className="text-left py-3 px-4">Tipo</th>
                                        <th className="text-left py-3 px-4">Serie / Nº</th>
                                        <th className="text-left py-3 px-4">Fecha</th>
                                        <th className="text-right py-3 px-4">Total</th>
                                        <th className="text-right py-3 px-4">Pendiente</th>
                                        <th className="py-3 px-4"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {facturas.map(f => (
                                        <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                    f.tipodoc === 8
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {f.tipo_doc}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-mono">{f.serie}-{f.numero}</td>
                                            <td className="py-3 px-4 text-slate-500">{f.fecha}</td>
                                            <td className="py-3 px-4 text-right font-semibold font-mono">{fmt(f.total)} €</td>
                                            <td className="py-3 px-4 text-right font-mono">
                                                {f.pendiente > 0 ? (
                                                    <span className="text-red-600 font-medium">{fmt(f.pendiente)} €</span>
                                                ) : (
                                                    <span className="text-green-600 text-xs">Cobrado</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={() => abrirDetalle(f.id)}
                                                    className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    Ver
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Cards — visibles solo en móvil */}
                        <div className="sm:hidden space-y-2">
                            {facturas.map(f => (
                                <div
                                    key={f.id}
                                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                f.tipodoc === 8
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {f.tipo_doc}
                                            </span>
                                            <span className="font-mono text-sm font-semibold text-slate-800">{f.serie}-{f.numero}</span>
                                        </div>
                                        <button
                                            onClick={() => abrirDetalle(f.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium shrink-0"
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            Ver
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 text-xs">{f.fecha}</span>
                                        <div className="text-right">
                                            <span className="font-semibold font-mono text-slate-800">{fmt(f.total)} €</span>
                                            {f.pendiente > 0 ? (
                                                <span className="block text-xs text-red-600 font-medium">{fmt(f.pendiente)} € pendiente</span>
                                            ) : (
                                                <span className="block text-xs text-green-600">Cobrado</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <p className="text-center text-xs text-slate-300 mt-8">
                    Portal seguro · {info.empresa_nombre}
                </p>
            </main>
        </div>
    )
}
