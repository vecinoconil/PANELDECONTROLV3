import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import {
    Truck, Plus, ArrowRight, X, Printer, Save, ChevronUp, ChevronDown,
    Loader2, AlertCircle, Trash2, ArrowLeft, MapPin, User, FileText,
    GripVertical, ChevronRight, Pencil
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Conductor {
    id: number
    nombre: string
}

interface Documento {
    id: number
    tipodoc: number
    tipo_label: string
    serie: string
    numero: number
    cli_codigo: number
    cli_nombre: string
    cli_localidad: string
    fecha: string | null
    total: number
    observaciones: string
    // runtime
    _uid: string
}

interface HojaResumen {
    id: number
    fecha: string
    fecha_prevista: string | null
    repartidor_nombre: string
    usuario_nombre: string
    observaciones: string
    estado: string
    num_lineas: number
    total: number
}

interface HojaDetalle extends HojaResumen {
    repartidor_usuario_id: number
    lineas: LineaHoja[]
}

interface LineaHoja {
    id?: number
    orden: number
    tipodoc: number
    tipo_label: string
    serie: string
    numero: number
    cli_codigo: number
    cli_nombre: string
    cli_localidad: string
    fecha_doc: string | null
    total: number
    observaciones: string
    _uid: string
}

type SortField = 'tipo_label' | 'doc' | 'cli_nombre' | 'cli_localidad' | 'fecha_doc' | 'total'
type SortDir = 'asc' | 'desc'

// ── Helper ──────────────────────────────────────────────────────────────────

function fmtFecha(iso: string | null) {
    if (!iso) return '—'
    const d = iso.slice(0, 10).split('-')
    return `${d[2]}/${d[1]}/${d[0]}`
}

function fmtEur(n: number) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function docLabel(d: Documento | LineaHoja) {
    return `${d.serie} ${d.numero}`
}

let _uid_ctr = 0
function uid() { return String(++_uid_ctr) }

// ── Main Component ────────────────────────────────────────────────────────

export default function HojasCarga() {
    const { selectedLocal } = useAuth()
    const localId = selectedLocal?.id

    // Vista: 'list' | 'create' | 'detail' | 'edit'
    const [vista, setVista] = useState<'list' | 'create' | 'detail' | 'edit'>('list')

    // ─ DATA ─
    const [hojas, setHojas] = useState<HojaResumen[]>([])
    const [conductores, setConductores] = useState<Conductor[]>([])
    const [documentos, setDocumentos] = useState<Documento[]>([])
    const [localidades, setLocalidades] = useState<string[]>([])
    const [hojaDetalle, setHojaDetalle] = useState<HojaDetalle | null>(null)

    // ─ FILTROS izquierda ─
    const [filterTipo, setFilterTipo] = useState<'' | '2' | '4'>('')
    const [filterLocalidad, setFilterLocalidad] = useState('')

    // ─ HOJA EN CONSTRUCCIÓN ─
    const [repartidorCodigo, setRepartidorCodigo] = useState<number | null>(null)
    const [hojaLineas, setHojaLineas] = useState<LineaHoja[]>([])
    const [hojaObs, setHojaObs] = useState('')
    const [hojaFechaPrevista, setHojaFechaPrevista] = useState<string>('')
    const [hojaEditId, setHojaEditId] = useState<number | null>(null)

    // ─ SORT hoja ─
    const [sortField, setSortField] = useState<SortField>('cli_localidad')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    // ─ UI STATE ─
    const [loadingDocs, setLoadingDocs] = useState(false)
    const [loadingHojas, setLoadingHojas] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
    const [dragOverHoja, setDragOverHoja] = useState(false)
    const [dragUid, setDragUid] = useState<string | null>(null)

    const printRef = useRef<HTMLDivElement>(null)

    // ─────────────────────────────────────────────────────────────────
    // Cargar datos al montar / cambiar local
    // ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!localId) return
        fetchHojas()
        fetchConductores()
        fetchLocalidades()
    }, [localId])

    async function fetchHojas() {
        setLoadingHojas(true)
        try {
            const { data } = await api.get<HojaResumen[]>('/api/almacen/hojas-carga', {
                params: { local_id: localId },
            })
            setHojas(data)
        } catch { /* ignore */ }
        finally { setLoadingHojas(false) }
    }

    async function fetchConductores() {
        try {
            const { data } = await api.get<Conductor[]>('/api/almacen/hojas-carga/conductores', {
                params: { local_id: localId },
            })
            setConductores(data)
            if (data.length > 0 && repartidorCodigo === null) {
                setRepartidorCodigo(data[0].id)
            }
        } catch { /* ignore */ }
    }

    async function fetchLocalidades() {
        try {
            const { data } = await api.get<string[]>('/api/almacen/hojas-carga/localidades', {
                params: { local_id: localId },
            })
            setLocalidades(data)
        } catch { /* ignore */ }
    }

    async function fetchDocumentos() {
        if (!localId) return
        setLoadingDocs(true)
        setError('')
        try {
            const params: Record<string, unknown> = { local_id: localId }
            if (filterTipo) params.tipodoc = filterTipo
            if (filterLocalidad) params.localidad = filterLocalidad
            if (hojaEditId !== null) params.hoja_id_exclude = hojaEditId
            const { data } = await api.get<Documento[]>('/api/almacen/hojas-carga/documentos', { params })
            setDocumentos(data.map(d => ({ ...d, _uid: uid() })))
        } catch {
            setError('Error al cargar documentos')
        } finally {
            setLoadingDocs(false)
        }
    }

    // Re-cargar documentos cuando cambian filtros (en vista create/edit)
    useEffect(() => {
        if (vista === 'create' || vista === 'edit') fetchDocumentos()
    }, [filterTipo, filterLocalidad, vista, localId])

    // ─────────────────────────────────────────────────────────────────
    // Acciones
    // ─────────────────────────────────────────────────────────────────

    function openCreate() {
        setHojaLineas([])
        setHojaObs('')
        setHojaFechaPrevista('')
        setHojaEditId(null)
        setSelectedDocId(null)
        setFilterTipo('')
        setFilterLocalidad('')
        setSortField('cli_localidad')
        setSortDir('asc')
        if (conductores.length > 0) setRepartidorCodigo(conductores[0].id)
        setVista('create')
    }

    function openEdit(hoja: HojaDetalle) {
        const lineas = hoja.lineas.map(l => ({ ...l, _uid: uid() }))
        setHojaEditId(hoja.id)
        setHojaLineas(lineas)
        setHojaObs(hoja.observaciones)
        setHojaFechaPrevista(hoja.fecha_prevista || '')
        setRepartidorCodigo(hoja.repartidor_usuario_id)
        setSelectedDocId(null)
        setFilterTipo('')
        setFilterLocalidad('')
        setSortField('cli_localidad')
        setSortDir('asc')
        setVista('edit')
    }

    function openDetalle(id: number) {
        const h = hojas.find(x => x.id === id)
        if (!h) return
        loadHojaDetalle(id)
    }

    async function loadHojaDetalle(id: number) {
        try {
            const { data } = await api.get<HojaDetalle>(`/api/almacen/hojas-carga/${id}`, {
                params: { local_id: localId },
            })
            const lineas = data.lineas.map(l => ({ ...l, _uid: uid() }))
            setHojaDetalle({
                ...data,
                num_lineas: lineas.length,
                total: lineas.reduce((s, l) => s + l.total, 0),
                lineas,
            })
            setVista('detail')
        } catch {
            setError('Error al cargar la hoja')
        }
    }

    function moveDocToHoja(docUid: string) {
        const doc = documentos.find(d => d._uid === docUid)
        if (!doc) return
        if (hojaLineas.some(l => l.serie === doc.serie && l.numero === doc.numero && l.tipodoc === doc.tipodoc)) return
        const linea: LineaHoja = {
            orden: hojaLineas.length,
            tipodoc: doc.tipodoc,
            tipo_label: doc.tipo_label,
            serie: doc.serie,
            numero: doc.numero,
            cli_codigo: doc.cli_codigo,
            cli_nombre: doc.cli_nombre,
            cli_localidad: doc.cli_localidad,
            fecha_doc: doc.fecha,
            total: doc.total,
            observaciones: doc.observaciones,
            _uid: uid(),
        }
        setHojaLineas(prev => [...prev, linea])
        setSelectedDocId(null)
    }

    function removeFromHoja(lineaUid: string) {
        setHojaLineas(prev => prev.filter(l => l._uid !== lineaUid))
    }

    async function saveHoja() {
        if (!repartidorCodigo) { setError('Selecciona un repartidor'); return }
        if (hojaLineas.length === 0) { setError('Añade al menos un documento'); return }
        const conductor = conductores.find(c => c.id === repartidorCodigo)
        setSaving(true)
        setError('')
        try {
            const body = {
                repartidor_usuario_id: repartidorCodigo,
                repartidor_nombre: conductor ? conductor.nombre : '',
                observaciones: hojaObs,
                fecha_prevista: hojaFechaPrevista || null,
                lineas: hojaLineas.map((l, i) => ({
                    tipodoc: l.tipodoc,
                    serie: l.serie,
                    numero: l.numero,
                    cli_codigo: l.cli_codigo,
                    cli_nombre: l.cli_nombre,
                    cli_localidad: l.cli_localidad,
                    fecha_doc: l.fecha_doc,
                    total: l.total,
                    observaciones: l.observaciones,
                    orden: i,
                })),
            }
            await api.post('/api/almacen/hojas-carga', body, { params: { local_id: localId } })
            await fetchHojas()
            setVista('list')
        } catch {
            setError('Error al guardar la hoja')
        } finally {
            setSaving(false)
        }
    }

    async function updateHoja() {
        if (!repartidorCodigo) { setError('Selecciona un repartidor'); return }
        if (hojaLineas.length === 0) { setError('Añade al menos un documento'); return }
        if (hojaEditId === null) return
        const conductor = conductores.find(c => c.id === repartidorCodigo)
        setSaving(true)
        setError('')
        try {
            const body = {
                repartidor_usuario_id: repartidorCodigo,
                repartidor_nombre: conductor ? conductor.nombre : '',
                observaciones: hojaObs,
                fecha_prevista: hojaFechaPrevista || null,
                lineas: hojaLineas.map((l, i) => ({
                    tipodoc: l.tipodoc,
                    serie: l.serie,
                    numero: l.numero,
                    cli_codigo: l.cli_codigo,
                    cli_nombre: l.cli_nombre,
                    cli_localidad: l.cli_localidad,
                    fecha_doc: l.fecha_doc,
                    total: l.total,
                    observaciones: l.observaciones,
                    orden: i,
                })),
            }
            await api.put(`/api/almacen/hojas-carga/${hojaEditId}`, body, { params: { local_id: localId } })
            await fetchHojas()
            setVista('list')
        } catch {
            setError('Error al actualizar la hoja')
        } finally {
            setSaving(false)
        }
    }

    async function deleteHoja(id: number) {
        if (!confirm('¿Eliminar esta hoja de carga?')) return
        try {
            await api.delete(`/api/almacen/hojas-carga/${id}`, { params: { local_id: localId } })
            await fetchHojas()
            if (vista === 'detail') setVista('list')
        } catch {
            setError('Error al eliminar')
        }
    }

    function printHoja() {
        window.print()
    }

    // ─────────────────────────────────────────────────────────────────
    // Sort hoja lineas
    // ─────────────────────────────────────────────────────────────────

    function toggleSort(field: SortField) {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('asc')
        }
    }

    function getSortedLineas(lineas: LineaHoja[]) {
        return [...lineas].sort((a, b) => {
            let va: string | number = ''
            let vb: string | number = ''
            switch (sortField) {
                case 'tipo_label': va = a.tipo_label; vb = b.tipo_label; break
                case 'doc': va = `${a.serie}${String(a.numero).padStart(8,'0')}`; vb = `${b.serie}${String(b.numero).padStart(8,'0')}`; break
                case 'cli_nombre': va = a.cli_nombre; vb = b.cli_nombre; break
                case 'cli_localidad': va = a.cli_localidad; vb = b.cli_localidad; break
                case 'fecha_doc': va = a.fecha_doc || ''; vb = b.fecha_doc || ''; break
                case 'total': va = a.total; vb = b.total; break
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1
            if (va > vb) return sortDir === 'asc' ? 1 : -1
            return 0
        })
    }

    // ─────────────────────────────────────────────────────────────────
    // Drag & Drop (docs → hoja)
    // ─────────────────────────────────────────────────────────────────

    function onDragStart(docUid: string) {
        setDragUid(docUid)
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragOverHoja(false)
        if (dragUid) moveDocToHoja(dragUid)
        setDragUid(null)
    }

    // ─────────────────────────────────────────────────────────────────
    // Filtered docs (izquierda)
    // ─────────────────────────────────────────────────────────────────

    const docsVisibles = documentos.filter(d => {
        if (filterTipo && String(d.tipodoc) !== filterTipo) return false
        // Ocultar docs que ya están en la hoja (derecha)
        if (hojaLineas.some(l => l.tipodoc === d.tipodoc && l.serie === d.serie && l.numero === d.numero)) return false
        return true
    })

    // ─────────────────────────────────────────────────────────────────
    // Render header sort icon
    // ─────────────────────────────────────────────────────────────────

    function SortIcon({ field }: { field: SortField }) {
        if (sortField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />
        return sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-blue-600" />
            : <ChevronDown className="w-3 h-3 text-blue-600" />
    }

    // ═════════════════════════════════════════════════════════════════
    // RENDER: LISTA DE HOJAS
    // ═════════════════════════════════════════════════════════════════

    if (vista === 'list') {
        return (
            <div className="p-6 space-y-4 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                            <Truck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Hojas de Carga</h1>
                            <p className="text-xs text-slate-500">Reparto para conductores</p>
                        </div>
                    </div>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nueva Hoja
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {loadingHojas ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                    </div>
                ) : hojas.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No hay hojas de carga</p>
                        <button onClick={openCreate} className="mt-3 text-blue-600 text-sm hover:underline">
                            Crear la primera
                        </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Prevista</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Repartidor</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Usuario</th>
                                    <th className="text-center px-4 py-3 font-semibold text-slate-600">Docs</th>
                                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Total</th>
                                    <th className="text-center px-4 py-3 font-semibold text-slate-600">Estado</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {hojas.map(h => (
                                    <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetalle(h.id)}>
                                        <td className="px-4 py-3 text-slate-700">{fmtFecha(h.fecha)}</td>
                                        <td className="px-4 py-3">
                                            {h.fecha_prevista
                                                ? <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{fmtFecha(h.fecha_prevista)}</span>
                                                : <span className="text-slate-300 text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-slate-800">{h.repartidor_nombre || '—'}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{h.usuario_nombre || '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">{h.num_lineas}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtEur(h.total)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${h.estado === 'activa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {h.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <ChevronRight className="w-4 h-4 text-slate-400" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // RENDER: DETALLE DE HOJA (vista + impresión)
    // ═════════════════════════════════════════════════════════════════

    if (vista === 'detail' && hojaDetalle) {
        const lineas = getSortedLineas(hojaDetalle.lineas as LineaHoja[])
        const totalHoja = lineas.reduce((s, l) => s + l.total, 0)

        return (
            <div className="p-6 space-y-4 max-w-5xl mx-auto">
                {/* Toolbar — oculto al imprimir */}
                <div className="flex items-center justify-between print:hidden">
                    <button onClick={() => setVista('list')} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openEdit(hojaDetalle)}
                            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
                        >
                            <Pencil className="w-4 h-4" /> Editar
                        </button>
                        <button
                            onClick={printHoja}
                            className="flex items-center gap-1.5 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-slate-800"
                        >
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                        <button
                            onClick={() => deleteHoja(hojaDetalle.id)}
                            className="flex items-center gap-1.5 text-red-600 border border-red-300 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50"
                        >
                            <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                    </div>
                </div>

                {/* Contenido imprimible */}
                <div ref={printRef} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:shadow-none print:border-none print:p-0">
                    {/* Cabecera hoja */}
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Hoja de Carga #{hojaDetalle.id}</h2>
                            <p className="text-sm text-slate-500 mt-0.5">
                                {fmtFecha(hojaDetalle.fecha)} · Creada por {hojaDetalle.usuario_nombre || '—'}
                            </p>
                            {hojaDetalle.fecha_prevista && (
                                <p className="text-sm mt-1 flex items-center gap-1.5">
                                    <span className="text-slate-500">Reparto previsto:</span>
                                    <span className="font-semibold text-amber-700">{fmtFecha(hojaDetalle.fecha_prevista)}</span>
                                </p>
                            )}
                            {hojaDetalle.observaciones && (
                                <p className="text-sm text-slate-600 mt-1 italic">{hojaDetalle.observaciones}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="flex items-center gap-1.5 justify-end text-slate-700 font-medium">
                                <User className="w-4 h-4 text-slate-400" />
                                {hojaDetalle.repartidor_nombre || '—'}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{hojaDetalle.num_lineas} documentos</p>
                        </div>
                    </div>

                    {/* Tabla lineas */}
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border border-slate-200">
                                <th
                                    className="text-left px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap print:cursor-default"
                                    onClick={() => toggleSort('tipo_label')}
                                >
                                    <span className="flex items-center gap-1">Tipo <SortIcon field="tipo_label" /></span>
                                </th>
                                <th
                                    className="text-left px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap print:cursor-default"
                                    onClick={() => toggleSort('doc')}
                                >
                                    <span className="flex items-center gap-1">Documento <SortIcon field="doc" /></span>
                                </th>
                                <th
                                    className="text-left px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none print:cursor-default"
                                    onClick={() => toggleSort('cli_nombre')}
                                >
                                    <span className="flex items-center gap-1">Cliente <SortIcon field="cli_nombre" /></span>
                                </th>
                                <th
                                    className="text-left px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none print:cursor-default"
                                    onClick={() => toggleSort('cli_localidad')}
                                >
                                    <span className="flex items-center gap-1">Localidad <SortIcon field="cli_localidad" /></span>
                                </th>
                                <th
                                    className="text-left px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap print:cursor-default"
                                    onClick={() => toggleSort('fecha_doc')}
                                >
                                    <span className="flex items-center gap-1">Fecha <SortIcon field="fecha_doc" /></span>
                                </th>
                                <th
                                    className="text-right px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none print:cursor-default"
                                    onClick={() => toggleSort('total')}
                                >
                                    <span className="flex items-center gap-1 justify-end">Total <SortIcon field="total" /></span>
                                </th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Obs.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineas.map((l, i) => (
                                <tr key={l._uid} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                    <td className="px-3 py-2">
                                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${l.tipodoc === 2 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {l.tipo_label}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{l.serie} {l.numero}</td>
                                    <td className="px-3 py-2 text-slate-800">{l.cli_nombre}</td>
                                    <td className="px-3 py-2">
                                        <span className="flex items-center gap-1 text-slate-600">
                                            {l.cli_localidad ? <><MapPin className="w-3 h-3 text-slate-400" />{l.cli_localidad}</> : '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtFecha(l.fecha_doc)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-slate-800 whitespace-nowrap">{fmtEur(l.total)}</td>
                                    <td className="px-3 py-2 text-slate-400 text-xs max-w-[12rem] truncate">{l.observaciones}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                <td colSpan={5} className="px-3 py-2 text-right text-slate-700">TOTAL</td>
                                <td className="px-3 py-2 text-right text-slate-900">{fmtEur(totalHoja)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Firma conductor — solo en impresión */}
                    <div className="hidden print:flex mt-16 justify-between">
                        <div className="text-center">
                            <div className="border-b border-slate-400 w-48 mb-1"></div>
                            <p className="text-xs text-slate-500">Firma del conductor</p>
                        </div>
                        <div className="text-center">
                            <div className="border-b border-slate-400 w-48 mb-1"></div>
                            <p className="text-xs text-slate-500">Fecha y hora entrega</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // RENDER: CREAR / EDITAR HOJA
    // ═════════════════════════════════════════════════════════════════

    const sortedLineas = getSortedLineas(hojaLineas)
    const totalHoja = hojaLineas.reduce((s, l) => s + l.total, 0)
    const isEditMode = vista === 'edit'

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 print:hidden">
                <div className="flex items-center gap-3">
                    <button onClick={() => setVista(isEditMode ? 'detail' : 'list')} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Truck className="w-5 h-5 text-blue-600" />
                        <span className="font-semibold text-slate-800">
                            {isEditMode ? `Editando Hoja #${hojaEditId}` : 'Nueva Hoja de Carga'}
                        </span>
                    </div>
                </div>

                {/* Selector repartidor */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <label className="text-sm text-slate-600 font-medium">Repartidor:</label>
                        <select
                            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={repartidorCodigo ?? ''}
                            onChange={e => setRepartidorCodigo(Number(e.target.value))}
                        >
                            <option value="">— Seleccionar —</option>
                            {conductores.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    <input
                        type="text"
                        placeholder="Observaciones..."
                        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
                        value={hojaObs}
                        onChange={e => setHojaObs(e.target.value)}
                    />

                    <div className="flex items-center gap-1.5">
                        <label className="text-xs text-slate-500 whitespace-nowrap">Fecha reparto:</label>
                        <input
                            type="date"
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={hojaFechaPrevista}
                            onChange={e => setHojaFechaPrevista(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={isEditMode ? updateHoja : saveHoja}
                        disabled={saving || hojaLineas.length === 0 || !repartidorCodigo}
                        className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isEditMode ? 'Actualizar' : 'Guardar'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex-shrink-0 flex items-center gap-2 text-red-600 text-sm bg-red-50 border-b border-red-200 px-6 py-2 print:hidden">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Main split panel */}
            <div className="flex-1 flex overflow-hidden min-h-0 relative">

                {/* ───── PANEL IZQUIERDA: Documentos disponibles ───── */}
                <div className="w-[48%] flex flex-col border-r border-slate-200 bg-white overflow-hidden">
                    {/* Filtros */}
                    <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Documentos pendientes</span>
                        <div className="ml-auto flex items-center gap-1.5">
                            <select
                                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                value={filterTipo}
                                onChange={e => setFilterTipo(e.target.value as '' | '2' | '4')}
                            >
                                <option value="">Todos</option>
                                <option value="2">Pedidos</option>
                                <option value="4">Albaranes</option>
                            </select>
                            {localidades.length > 0 && (
                                <select
                                    className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    value={filterLocalidad}
                                    onChange={e => setFilterLocalidad(e.target.value)}
                                >
                                    <option value="">Todas las localidades</option>
                                    {localidades.map(loc => (
                                        <option key={loc} value={loc}>{loc}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Lista documentos */}
                    <div className="flex-1 overflow-y-auto">
                        {loadingDocs ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                            </div>
                        ) : docsVisibles.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-xs">No hay documentos pendientes</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {docsVisibles.map(doc => {
                                    const isSelected = selectedDocId === doc._uid
                                    return (
                                        <div
                                            key={doc._uid}
                                            draggable
                                            onDragStart={() => onDragStart(doc._uid)}
                                            onClick={() => setSelectedDocId(isSelected ? null : doc._uid)}
                                            onDoubleClick={() => moveDocToHoja(doc._uid)}
                                            title="Doble clic para añadir a la hoja"
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none
                                                ${isSelected
                                                    ? 'border-blue-400 bg-blue-50 shadow-sm'
                                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                }`}
                                        >
                                            <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${doc.tipodoc === 2 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {doc.tipo_label}
                                            </span>
                                            <span className="font-mono text-xs text-slate-700 flex-shrink-0 w-20">{doc.serie} {doc.numero}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-slate-800 truncate font-medium leading-tight">{doc.cli_nombre}</p>
                                                {doc.cli_localidad && (
                                                    <p className="text-xs text-slate-400 flex items-center gap-0.5">
                                                        <MapPin className="w-2.5 h-2.5" />{doc.cli_localidad}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-xs font-semibold text-slate-700 flex-shrink-0">{fmtEur(doc.total)}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Contador */}
                    <div className="flex-shrink-0 border-t border-slate-100 px-4 py-1.5 bg-slate-50 text-xs text-slate-400">
                        {docsVisibles.length} documentos
                    </div>
                </div>

                {/* ───── BOTON FLOTANTE CENTRAL ───── */}
                <button
                    onClick={() => selectedDocId && moveDocToHoja(selectedDocId)}
                    disabled={!selectedDocId}
                    title="Añadir a la hoja (o doble clic en el documento)"
                    className="absolute left-[48%] top-1/2 -translate-x-1/2 -translate-y-1/2 z-20
                               w-12 h-12 flex items-center justify-center
                               bg-blue-600 text-white rounded-full
                               hover:bg-blue-700 hover:scale-110
                               disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100
                               transition-all shadow-xl shadow-blue-500/40 border-2 border-white"
                >
                    <ArrowRight className="w-6 h-6" />
                </button>

                {/* ───── PANEL DERECHA: Hoja de carga ───── */}
                <div
                    className={`flex-1 flex flex-col overflow-hidden ${dragOverHoja ? 'bg-blue-50' : 'bg-white'} transition-colors`}
                    onDragOver={e => { e.preventDefault(); setDragOverHoja(true) }}
                    onDragLeave={() => setDragOverHoja(false)}
                    onDrop={onDrop}
                >
                    {/* Header hoja */}
                    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                Hoja de carga
                                {repartidorCodigo && conductores.find(c => c.id === repartidorCodigo) && (
                                    <span className="ml-1 text-blue-600 normal-case font-medium">
                                        — {conductores.find(c => c.id === repartidorCodigo)!.nombre}
                                    </span>
                                )}
                            </span>
                        </div>
                        <span className="text-xs text-slate-400">{hojaLineas.length} docs · {fmtEur(totalHoja)}</span>
                    </div>

                    {/* Tabla hoja */}
                    {hojaLineas.length === 0 ? (
                        <div className={`flex-1 flex flex-col items-center justify-center gap-2 text-slate-300 ${dragOverHoja ? 'border-2 border-dashed border-blue-400 rounded-lg m-4' : ''}`}>
                            <Truck className="w-10 h-10 opacity-20" />
                            <p className="text-sm">Arrastra o selecciona documentos</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-10 bg-white border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('tipo_label')}>
                                            <span className="flex items-center gap-1">Tipo <SortIcon field="tipo_label" /></span>
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('doc')}>
                                            <span className="flex items-center gap-1">Documento <SortIcon field="doc" /></span>
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleSort('cli_nombre')}>
                                            <span className="flex items-center gap-1">Cliente <SortIcon field="cli_nombre" /></span>
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleSort('cli_localidad')}>
                                            <span className="flex items-center gap-1">Localidad <SortIcon field="cli_localidad" /></span>
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('fecha_doc')}>
                                            <span className="flex items-center gap-1">Fecha <SortIcon field="fecha_doc" /></span>
                                        </th>
                                        <th className="text-right px-3 py-2 font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleSort('total')}>
                                            <span className="flex items-center gap-1 justify-end">Total <SortIcon field="total" /></span>
                                        </th>
                                        <th className="w-8 px-2 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedLineas.map((l, i) => (
                                        <tr key={l._uid} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'} hover:bg-blue-50/30 transition-colors`}>
                                            <td className="px-3 py-2">
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${l.tipodoc === 2 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {l.tipo_label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">{l.serie} {l.numero}</td>
                                            <td className="px-3 py-2 text-slate-800 text-sm">{l.cli_nombre}</td>
                                            <td className="px-3 py-2 text-sm">
                                                {l.cli_localidad ? (
                                                    <span className="flex items-center gap-1 text-slate-600">
                                                        <MapPin className="w-3 h-3 text-slate-400" />{l.cli_localidad}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{fmtFecha(l.fecha_doc)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-slate-800 text-sm whitespace-nowrap">{fmtEur(l.total)}</td>
                                            <td className="px-2 py-2">
                                                <button
                                                    onClick={() => removeFromHoja(l._uid)}
                                                    title="Quitar de la hoja"
                                                    className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
                                    <tr>
                                        <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">TOTAL</td>
                                        <td className="px-3 py-2 text-right font-bold text-slate-900 text-sm">{fmtEur(totalHoja)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
