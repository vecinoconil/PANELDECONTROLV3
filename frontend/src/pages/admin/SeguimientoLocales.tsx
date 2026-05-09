import { useEffect, useState, useMemo, useCallback } from 'react'
import { api } from '../../api/client'
import { RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, Wifi, WifiOff, Clock, X, MonitorCheck } from 'lucide-react'

interface Local {
    idcliente: string
    mac: string
    idlocal: number | null
    ultimaconexion: string | null
    nombrelocal: string | null
    version: string | null
    versionactualizador: string | null
    instancia: string | null
    basedatoscashguard: string | null
    tipocajon: string | null
    grupo: string | null
    servidor: string | null
    nif: string | null
    anydesk: string | null
    distribuidor: string | null
    tiempo: number | null
    contrato: number | null
    nombrecontrato: string | null
    preciocontrato: number | null
    basededatos: string | null
    usuario: string | null
    password: string | null
    puerto: string | null
    looker: string | null
    subecashguard: boolean | null
    subelineas: boolean | null
    subetickets: boolean | null
    subemesas: boolean | null
    subeincidencias: boolean | null
    subepicadas: boolean | null
    subemovimientos: boolean | null
    subecarta: boolean | null
    actualizate: boolean | null
    depuracion: boolean | null
    ncierres: number | null
    renovacion: string | null
    localidad: string | null
    error: string | null
}

interface FormState {
    idlocal: string; idcliente: string; tiempo: string; anydesk: string
    distribuidor: string; grupo: string; basededatos: string; servidor: string
    usuario: string; password: string; puerto: string; instancia: string
    basedatoscashguard: string; tipocajon: string; looker: string; contrato: string
    renovacion: string; ncierres: string
    actualizate: boolean; subecashguard: boolean; subelineas: boolean
    subetickets: boolean; subemesas: boolean; subeincidencias: boolean
    subepicadas: boolean; subemovimientos: boolean; depuracion: boolean; subecarta: boolean
}

type SortDir = 'asc' | 'desc'
type SortKey = keyof Local

function minutosDesde(iso: string | null): number | null {
    if (!iso) return null
    return (Date.now() - new Date(iso).getTime()) / 60000
}
function estadoConexion(min: number | null): 'verde' | 'gris' | 'rojo' {
    if (min === null) return 'rojo'
    if (min < 15) return 'verde'
    if (min < 30) return 'gris'
    return 'rojo'
}
function formatUltimaConexion(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function formatMinutos(min: number | null): string {
    if (min === null) return '—'
    if (min < 1) return '< 1 min'
    if (min < 60) return `${Math.floor(min)} min`
    return `${Math.floor(min / 60)}h ${Math.floor(min % 60)}m`
}
function localToForm(l: Local): FormState {
    return {
        idlocal: String(l.idlocal ?? ''), idcliente: l.idcliente ?? '',
        tiempo: String(l.tiempo ?? ''), anydesk: l.anydesk ?? '',
        distribuidor: l.distribuidor ?? '', grupo: l.grupo ?? '',
        basededatos: l.basededatos ?? '', servidor: l.servidor ?? '',
        usuario: l.usuario ?? '', password: l.password ?? '',
        puerto: l.puerto ?? '', instancia: l.instancia ?? '',
        basedatoscashguard: l.basedatoscashguard ?? '', tipocajon: l.tipocajon ?? '',
        looker: l.looker ?? '', contrato: String(l.contrato ?? ''),
        renovacion: l.renovacion ? l.renovacion.slice(0, 10) : '',
        ncierres: String(l.ncierres ?? ''),
        actualizate: l.actualizate ?? false, subecashguard: l.subecashguard ?? false,
        subelineas: l.subelineas ?? false, subetickets: l.subetickets ?? false,
        subemesas: l.subemesas ?? false, subeincidencias: l.subeincidencias ?? false,
        subepicadas: l.subepicadas ?? false, subemovimientos: l.subemovimientos ?? false,
        depuracion: l.depuracion ?? false, subecarta: l.subecarta ?? false,
    }
}

const COLUMNS: { key: SortKey; label: string }[] = [
    { key: 'idcliente',      label: 'ID Cliente' },
    { key: 'mac',            label: 'MAC' },
    { key: 'ultimaconexion', label: 'Últ. Conexión' },
    { key: 'nombrelocal',    label: 'Local' },
    { key: 'version',        label: 'Versión' },
    { key: 'instancia',      label: 'Instancia' },
    { key: 'grupo',          label: 'Grupo' },
    { key: 'servidor',       label: 'Servidor' },
    { key: 'nif',            label: 'NIF' },
    { key: 'anydesk',        label: 'Anydesk' },
    { key: 'distribuidor',   label: 'Distribuidor' },
    { key: 'ncierres',       label: 'Cierres' },
    { key: 'renovacion',     label: 'Renovación' },
]
const CHECKBOXES: { key: keyof FormState; label: string }[] = [
    { key: 'actualizate', label: 'Actualizate' }, { key: 'subecashguard', label: 'Cashguard' },
    { key: 'subelineas', label: 'Sube Líneas' }, { key: 'subetickets', label: 'Sube Tickets' },
    { key: 'subemesas', label: 'Sube Mesas' }, { key: 'subeincidencias', label: 'Sube Incidencias' },
    { key: 'subepicadas', label: 'Sube Picadas' }, { key: 'subemovimientos', label: 'Sube Movimientos' },
    { key: 'depuracion', label: 'Depuración' }, { key: 'subecarta', label: 'Sube Carta' },
]

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
    if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-brand" /> : <ChevronDown className="w-3 h-3 text-brand" />
}

// ── Modal edición ─────────────────────────────────────────────────────────────
function EditModal({ local, onClose, onSaved }: { local: Local; onClose: () => void; onSaved: (u: Local) => void }) {
    const [form, setForm] = useState<FormState>(() => localToForm(local))
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const set = (k: keyof FormState, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

    const handleSave = async () => {
        setSaving(true); setSaveError(null)
        try {
            const payload = {
                idlocal: form.idlocal ? Number(form.idlocal) : null,
                idcliente: form.idcliente || null, tiempo: form.tiempo ? Number(form.tiempo) : null,
                anydesk: form.anydesk || null, distribuidor: form.distribuidor || null,
                grupo: form.grupo || null, basededatos: form.basededatos || null,
                servidor: form.servidor || null, usuario: form.usuario || null,
                password: form.password || null, puerto: form.puerto || null,
                instancia: form.instancia || null, basedatoscashguard: form.basedatoscashguard || null,
                tipocajon: form.tipocajon || null, looker: form.looker || null,
                contrato: form.contrato ? Number(form.contrato) : null,
                renovacion: form.renovacion || null, ncierres: form.ncierres ? Number(form.ncierres) : null,
                actualizate: form.actualizate, subecashguard: form.subecashguard,
                subelineas: form.subelineas, subetickets: form.subetickets,
                subemesas: form.subemesas, subeincidencias: form.subeincidencias,
                subepicadas: form.subepicadas, subemovimientos: form.subemovimientos,
                depuracion: form.depuracion, subecarta: form.subecarta,
            }
            await api.put(`/api/seguimiento/locales/${local.mac}`, payload)
            onSaved({ ...local, ...payload, idlocal: payload.idlocal, tiempo: payload.tiempo, ncierres: payload.ncierres, contrato: payload.contrato, idcliente: payload.idcliente ?? '' })
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } }
            setSaveError(err?.response?.data?.detail ?? 'Error al guardar')
            setSaving(false)
        }
    }

    const min = minutosDesde(local.ultimaconexion)
    const estado = estadoConexion(min)
    const inp = 'input text-sm'
    const lbl = 'block text-xs font-medium text-slate-600 mb-1'
    const section = 'bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            estado === 'verde' ? 'bg-green-500' : estado === 'gris' ? 'bg-slate-400' : 'bg-red-500'
                        }`} />
                        <div>
                            <h2 className="font-bold text-slate-900">{local.idcliente} — {local.nombrelocal}</h2>
                            <p className="text-slate-500 text-xs">
                                MAC: <span className="font-mono">{local.mac}</span>
                                {' · '}{formatUltimaConexion(local.ultimaconexion)}
                                {' · '}<span className={estado === 'verde' ? 'text-green-600 font-medium' : estado === 'gris' ? 'text-slate-500' : 'text-red-600 font-medium'}>{formatMinutos(min)}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {/* Cuerpo */}
                <div className="overflow-y-auto flex-1 p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Sincronización */}
                        <div className={section}>
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pb-1">Sincronización</h3>
                            <div className="space-y-2">
                                {CHECKBOXES.map(({ key, label }) => (
                                    <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                                        <input type="checkbox" checked={form[key] as boolean}
                                            onChange={e => set(key, e.target.checked)}
                                            className="w-4 h-4 rounded accent-brand cursor-pointer" />
                                        <span className="text-sm text-slate-700">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {/* Identificación */}
                        <div className={section}>
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pb-1">Identificación</h3>
                            <div>
                                <label className={lbl}>MAC (solo lectura)</label>
                                <input type="text" value={local.mac} readOnly className="input text-sm opacity-50 cursor-not-allowed" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className={lbl}>ID Local</label><input type="number" value={form.idlocal} onChange={e => set('idlocal', e.target.value)} className={inp} /></div>
                                <div><label className={lbl}>Nº Cierres</label><input type="number" value={form.ncierres} onChange={e => set('ncierres', e.target.value)} className={inp} /></div>
                            </div>
                            <div><label className={lbl}>ID Cliente</label><input type="text" value={form.idcliente} onChange={e => set('idcliente', e.target.value)} className={inp} /></div>
                            <div><label className={lbl}>Tiempo Timer (ms)</label><input type="number" value={form.tiempo} onChange={e => set('tiempo', e.target.value)} className={inp} /></div>
                            <div><label className={lbl}>Anydesk</label><input type="text" value={form.anydesk} onChange={e => set('anydesk', e.target.value)} className={inp} /></div>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className={lbl}>Distribuidor</label><input type="text" value={form.distribuidor} onChange={e => set('distribuidor', e.target.value)} className={inp} /></div>
                                <div><label className={lbl}>Grupo</label><input type="text" value={form.grupo} onChange={e => set('grupo', e.target.value)} className={inp} /></div>
                            </div>
                            <div><label className={lbl}>Renovación</label><input type="date" value={form.renovacion} onChange={e => set('renovacion', e.target.value)} className={inp} /></div>
                            {(local.version || local.nif || local.localidad || local.error) && (
                                <div className="pt-2 border-t border-slate-200 space-y-1">
                                    {local.version && <p className="text-xs text-slate-500">Versión: <span className="font-medium text-slate-700">{local.version}</span></p>}
                                    {local.nif && <p className="text-xs text-slate-500">NIF: <span className="font-mono font-medium text-slate-700">{local.nif}</span></p>}
                                    {local.localidad && <p className="text-xs text-slate-500">Localidad: <span className="text-slate-700">{local.localidad}</span></p>}
                                    {local.error && <p className="text-xs text-red-600 break-words">⚠ {local.error}</p>}
                                </div>
                            )}
                        </div>
                        {/* Conexión */}
                        <div className={section}>
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pb-1">Conexión</h3>
                            <div><label className={lbl}>Base de Datos</label><input type="text" value={form.basededatos} onChange={e => set('basededatos', e.target.value)} className={inp} /></div>
                            <div><label className={lbl}>Servidor</label><input type="text" value={form.servidor} onChange={e => set('servidor', e.target.value)} className={inp} /></div>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className={lbl}>Usuario</label><input type="text" value={form.usuario} onChange={e => set('usuario', e.target.value)} className={inp} /></div>
                                <div><label className={lbl}>Puerto</label><input type="text" value={form.puerto} onChange={e => set('puerto', e.target.value)} className={inp} /></div>
                            </div>
                            <div><label className={lbl}>Password</label><input type="text" value={form.password} onChange={e => set('password', e.target.value)} className={inp} /></div>
                            <div><label className={lbl}>Instancia</label><input type="text" value={form.instancia} onChange={e => set('instancia', e.target.value)} className={inp} /></div>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className={lbl}>B.D. Cashguard</label><input type="text" value={form.basedatoscashguard} onChange={e => set('basedatoscashguard', e.target.value)} className={inp} /></div>
                                <div><label className={lbl}>Tipo Cajón</label><input type="text" value={form.tipocajon} onChange={e => set('tipocajon', e.target.value)} className={inp} /></div>
                            </div>
                            <div><label className={lbl}>Looker</label><input type="text" value={form.looker} onChange={e => set('looker', e.target.value)} className={inp} /></div>
                            <div><label className={lbl}>Contrato</label><input type="number" value={form.contrato} onChange={e => set('contrato', e.target.value)} className={inp} /></div>
                        </div>
                    </div>
                </div>
                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
                    <span className="text-sm text-red-600">{saveError ?? ''}</span>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="btn-ghost">Cancelar</button>
                        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SeguimientoLocales() {
    const [data, setData] = useState<Local[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sortKey, setSortKey] = useState<SortKey>('ultimaconexion')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [search, setSearch] = useState('')
    const [distFilter, setDistFilter] = useState('Todos')
    const [grupoFilter, setGrupoFilter] = useState('Todos')
    const [selectedLocal, setSelectedLocal] = useState<Local | null>(null)
    const [now, setNow] = useState(Date.now())

    const fetchData = useCallback(async () => {
        try {
            setError(null)
            const res = await api.get('/api/seguimiento/locales')
            setData(res.data)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } }
            setError(err?.response?.data?.detail ?? 'Error al cargar datos')
        } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchData(); const t = setInterval(fetchData, 60000); return () => clearInterval(t) }, [fetchData])
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

    const distributors = useMemo(() => ['Todos', ...Array.from(new Set(data.map(r => r.distribuidor ?? '').filter(Boolean))).sort()], [data])
    const grupos = useMemo(() => ['Todos', ...Array.from(new Set(data.map(r => r.grupo ?? '').filter(Boolean))).sort()], [data])

    const sorted = useMemo(() => {
        const q = search.toLowerCase()
        let f = data
        if (distFilter !== 'Todos') f = f.filter(r => r.distribuidor === distFilter)
        if (grupoFilter !== 'Todos') f = f.filter(r => r.grupo === grupoFilter)
        if (q) f = f.filter(r => [r.idcliente, r.mac, r.nombrelocal, r.nif, r.anydesk, r.grupo, r.distribuidor, r.version].some(v => v?.toLowerCase().includes(q)))
        return [...f].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey]
            if (av == null) return 1; if (bv == null) return -1
            return (sortDir === 'asc' ? 1 : -1) * String(av).localeCompare(String(bv), undefined, { numeric: true })
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, sortKey, sortDir, search, distFilter, grupoFilter, now])

    const handleSort = (key: SortKey) => {
        if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDir('desc') }
    }
    const handleSaved = (updated: Local) => { setData(prev => prev.map(r => r.mac === updated.mac ? updated : r)); setSelectedLocal(null) }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const verdes = useMemo(() => data.filter(r => { const m = minutosDesde(r.ultimaconexion); return m !== null && m < 15 }).length, [data, now])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const grises = useMemo(() => data.filter(r => { const m = minutosDesde(r.ultimaconexion); return m !== null && m >= 15 && m < 30 }).length, [data, now])
    const rojos = data.length - verdes - grises

    return (
        <div className="p-6 flex flex-col gap-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MonitorCheck className="w-5 h-5 text-brand" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Seguimiento de Locales</h1>
                        <p className="text-sm text-slate-500">Refresco automático cada minuto · {data.length} locales</p>
                    </div>
                </div>
                <button onClick={() => { setLoading(true); fetchData() }} disabled={loading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Wifi className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{verdes}</p>
                        <p className="text-xs text-slate-500">Activos · &lt; 15 min</p>
                    </div>
                </div>
                <div className="card flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{grises}</p>
                        <p className="text-xs text-slate-500">Semi-activos · 15–30 min</p>
                    </div>
                </div>
                <div className="card flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                        <WifiOff className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{rojos}</p>
                        <p className="text-xs text-slate-500">Sin actividad · &gt; 30 min</p>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
                <input
                    type="text"
                    placeholder="Buscar ID, MAC, local, NIF, anydesk..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input flex-1 min-w-52"
                />
                <select value={distFilter} onChange={e => setDistFilter(e.target.value)} className="input w-40">
                    {distributors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={grupoFilter} onChange={e => setGrupoFilter(e.target.value)} className="input w-36">
                    {grupos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {(search || distFilter !== 'Todos' || grupoFilter !== 'Todos') && (
                    <span className="text-sm text-slate-500">{sorted.length} resultado{sorted.length !== 1 ? 's' : ''}</span>
                )}
            </div>

            {/* Tabla */}
            {loading && data.length === 0 ? (
                <div className="card text-center text-slate-400 py-12">Cargando...</div>
            ) : error ? (
                <div className="card text-center text-red-600 py-12">{error}</div>
            ) : (
                <div className="card overflow-auto p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left">
                                {COLUMNS.map(col => (
                                    <th key={col.key}
                                        onClick={() => handleSort(col.key)}
                                        className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-900 whitespace-nowrap transition-colors">
                                        <span className="flex items-center gap-1">
                                            {col.label}
                                            <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                                        </span>
                                    </th>
                                ))}
                                <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Hace</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((local, i) => {
                                const min = minutosDesde(local.ultimaconexion)
                                const estado = estadoConexion(min)
                                return (
                                    <tr key={`${local.mac}-${i}`}
                                        onClick={() => setSelectedLocal(local)}
                                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                                        <td className="py-2 px-3 whitespace-nowrap">
                                            <span className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${estado === 'verde' ? 'bg-green-500' : estado === 'gris' ? 'bg-slate-400' : 'bg-red-500'}`} />
                                                <span className="font-mono font-semibold text-slate-900">{local.idcliente || '—'}</span>
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 font-mono text-slate-600 text-xs">{local.mac || '—'}</td>
                                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap text-xs">{formatUltimaConexion(local.ultimaconexion)}</td>
                                        <td className="py-2 px-3 font-medium text-slate-900 max-w-[11rem] truncate" title={local.nombrelocal ?? ''}>{local.nombrelocal || '—'}</td>
                                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap text-xs">{local.version || '—'}</td>
                                        <td className="py-2 px-3 text-slate-600 text-xs">{local.instancia || '—'}</td>
                                        <td className="py-2 px-3 text-xs">
                                            {local.grupo ? <span className="badge bg-slate-100 text-slate-600">{local.grupo}</span> : '—'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap text-xs">{local.servidor || '—'}</td>
                                        <td className="py-2 px-3 font-mono text-slate-600 text-xs">{local.nif || '—'}</td>
                                        <td className="py-2 px-3 font-mono text-slate-600 text-xs">{local.anydesk || '—'}</td>
                                        <td className="py-2 px-3 text-xs">
                                            {local.distribuidor ? <span className="badge bg-blue-50 text-blue-700">{local.distribuidor}</span> : '—'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600 text-right text-xs">{local.ncierres ?? '—'}</td>
                                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap text-xs">{local.renovacion ?? '—'}</td>
                                        <td className="py-2 px-3 whitespace-nowrap">
                                            <span className={`badge text-xs font-semibold ${
                                                estado === 'verde' ? 'bg-green-100 text-green-700' :
                                                estado === 'gris'  ? 'bg-slate-100 text-slate-600' :
                                                'bg-red-100 text-red-700'
                                            }`}>{formatMinutos(min)}</span>
                                        </td>
                                    </tr>
                                )
                            })}
                            {sorted.length === 0 && (
                                <tr><td colSpan={14} className="py-10 text-center text-slate-400">No hay resultados</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedLocal && (
                <EditModal local={selectedLocal} onClose={() => setSelectedLocal(null)} onSaved={handleSaved} />
            )}
        </div>
    )
}


