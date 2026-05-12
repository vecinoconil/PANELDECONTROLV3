import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Users, Plus, Pencil, Trash2, Power, Eye, EyeOff, Mail, Settings, Search } from 'lucide-react'
import { PERMISOS_DISPONIBLES, hasPermiso, type PermisosMap } from '../../types'
import { useAuth } from '../../auth/AuthContext'

interface Empresa { id: number; nombre: string }
interface LocalItem { id: number; nombre: string; empresa_id: number }
interface AgenteOption { codigo: number; nombre: string }
interface SerieOption { serie: string }
interface CajaOption { codigo: number; nombre: string }
interface AlmacenOption { codigo: number; nombre: string }
interface FpagoOption { codigo: number; nombre: string }
interface Usuario {
    id: number
    empresa_id: number | null
    email: string
    nombre: string
    rol: string
    activo: boolean
    plain_password: string | null
    created_at: string
    local_ids: number[]
    permisos: PermisosMap
    agente_autoventa: number | null
    serie_autoventa: string | null
    autoventa_modifica_precio: boolean
    tipodocs_autoventa: number[]
    caja_autoventa: number | null
    almacen_autoventa: number | null
    fpago_autoventa: number | null
    solo_clientes_agente: boolean
    precargar_historial_autoventa: boolean
    serie_expediciones: string[]
    caja_reparto: number | null
    paper_width_impresora: 80 | 100
}
interface UsuarioForm {
    empresa_id: number | null
    email: string
    nombre: string
    password: string
    rol: string
    local_ids: number[]
    permisos: PermisosMap
    agente_autoventa: number | null
    serie_autoventa: string | null
    autoventa_modifica_precio: boolean
    tipodocs_autoventa: number[]
    caja_autoventa: number | null
    almacen_autoventa: number | null
    fpago_autoventa: number | null
    solo_clientes_agente: boolean
    precargar_historial_autoventa: boolean
    serie_expediciones: string[]
    caja_reparto: number | null
    paper_width_impresora: 80 | 100
}

const ROLES = ['superadmin', 'gerente', 'encargado', 'usuario', 'distribuidor']
const emptyForm: UsuarioForm = {
    empresa_id: null, email: '', nombre: '', password: '', rol: 'usuario',
    local_ids: [], permisos: {},
    agente_autoventa: null, serie_autoventa: null, autoventa_modifica_precio: false, tipodocs_autoventa: [], caja_autoventa: null, almacen_autoventa: null, fpago_autoventa: null, solo_clientes_agente: false, precargar_historial_autoventa: true,
    serie_expediciones: [], caja_reparto: null, paper_width_impresora: 80,
}

export default function Usuarios() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([])
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [locales, setLocales] = useState<LocalItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<UsuarioForm>(emptyForm)
    const [error, setError] = useState('')
    const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set())
    const [sendingEmail, setSendingEmail] = useState<number | null>(null)
    const [agentesOptions, setAgentesOptions] = useState<AgenteOption[]>([])
    const [seriesOptions, setSeriesOptions] = useState<SerieOption[]>([])
    const [cajasOptions, setCajasOptions] = useState<CajaOption[]>([])
    const [almacenesOptions, setAlmacenesOptions] = useState<AlmacenOption[]>([])
    const [fpagosOptions, setFpagosOptions] = useState<FpagoOption[]>([])
    const [loadingPgData, setLoadingPgData] = useState(false)
    const [pgDataError, setPgDataError] = useState(false)
    const [configModal, setConfigModal] = useState<'autoventa' | 'expediciones' | 'reparto' | null>(null)
    const [configFromCheck, setConfigFromCheck] = useState(false)
    const [subError, setSubError] = useState('')
    const [busqueda, setBusqueda] = useState('')

    const { user: currentUser } = useAuth()

    const usuariosFiltrados = busqueda.trim()
        ? (() => {
            const q = busqueda.toLowerCase().trim()
            return usuarios.filter(u => {
                const empresa = empresas.find(e => e.id === u.empresa_id)
                const uLocales = locales.filter(l => u.local_ids.includes(l.id))
                return (
                    u.nombre.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q) ||
                    u.rol.toLowerCase().includes(q) ||
                    (empresa?.nombre ?? '').toLowerCase().includes(q) ||
                    uLocales.some(l => l.nombre.toLowerCase().includes(q))
                )
            })
          })()
        : usuarios

    const fetch = async () => {
        setLoading(true)
        try {
            const [u, e, l] = await Promise.all([
                api.get<Usuario[]>('/api/admin/usuarios'),
                api.get<Empresa[]>('/api/admin/empresas'),
                api.get<LocalItem[]>('/api/admin/locales'),
            ])
            setUsuarios(u.data)
            setEmpresas(e.data)
            setLocales(l.data)
        } catch { setError('Error cargando datos') }
        finally { setLoading(false) }
    }

    useEffect(() => { fetch() }, [])

    // Load agentes, series y formaspago when autoventa OR expediciones is selected and empresa is set
    const needsPgData = (form.permisos.autoventa?.ver || form.permisos.autoventa?.entrar ||
                         form.permisos.expediciones?.ver || form.permisos.expediciones?.entrar ||
                         form.permisos.reparto?.ver || form.permisos.reparto?.entrar)
    useEffect(() => {
        if (showModal && (needsPgData || !!configModal) && form.empresa_id) {
            setLoadingPgData(true)
            setPgDataError(false)
            Promise.all([
                api.get<AgenteOption[]>(`/api/admin/pg-data/agentes?empresa_id=${form.empresa_id}`),
                api.get<SerieOption[]>(`/api/admin/pg-data/series?empresa_id=${form.empresa_id}`),
                api.get<CajaOption[]>(`/api/admin/pg-data/cajas?empresa_id=${form.empresa_id}`),
                api.get<AlmacenOption[]>(`/api/admin/pg-data/almacenes?empresa_id=${form.empresa_id}`),
                api.get<FpagoOption[]>(`/api/admin/pg-data/formaspago?empresa_id=${form.empresa_id}`),
            ])
                .then(([a, s, c, alm, fp]) => { setAgentesOptions(a.data); setSeriesOptions(s.data); setCajasOptions(c.data); setAlmacenesOptions(alm.data); setFpagosOptions(fp.data) })
                .catch(() => { setPgDataError(true); setAgentesOptions([]); setSeriesOptions([]); setCajasOptions([]); setAlmacenesOptions([]); setFpagosOptions([]) })
                .finally(() => setLoadingPgData(false))
        }
    }, [showModal, form.permisos, form.empresa_id, configModal])

    const empresaName = (id: number | null) => id ? empresas.find(e => e.id === id)?.nombre || '—' : '—'
    const localesForEmpresa = form.empresa_id ? locales.filter(l => l.empresa_id === form.empresa_id) : locales

    const openNew = () => {
        setEditId(null)
        setForm({
            ...emptyForm,
            empresa_id: currentUser?.rol === 'gerente' ? (currentUser.empresa_id ?? null) : null,
        })
        setShowModal(true)
        setError('')
    }
    const openEdit = (u: Usuario) => {
        setEditId(u.id)
        setForm({
            empresa_id: u.empresa_id, email: u.email, nombre: u.nombre,
            password: '', rol: u.rol, local_ids: u.local_ids, permisos: u.permisos || [],
            agente_autoventa: u.agente_autoventa ?? null,
            serie_autoventa: u.serie_autoventa ?? null,
            autoventa_modifica_precio: u.autoventa_modifica_precio ?? false,
            tipodocs_autoventa: u.tipodocs_autoventa ?? [],
            caja_autoventa: u.caja_autoventa ?? null,
            almacen_autoventa: u.almacen_autoventa ?? null,
            fpago_autoventa: u.fpago_autoventa ?? null,
            solo_clientes_agente: u.solo_clientes_agente ?? false,
            precargar_historial_autoventa: u.precargar_historial_autoventa ?? true,
            serie_expediciones: u.serie_expediciones ?? [],
            caja_reparto: u.caja_reparto ?? null,
            paper_width_impresora: (u.paper_width_impresora === 100 ? 100 : 80) as 80 | 100,
        })
        setShowModal(true)
        setError('')
    }

    const toggleLocal = (id: number) => {
        setForm(prev => ({
            ...prev,
            local_ids: prev.local_ids.includes(id)
                ? prev.local_ids.filter(l => l !== id)
                : [...prev.local_ids, id]
        }))
    }

    const setPermisoFlag = (key: string, field: 'ver' | 'entrar', value: boolean) => {
        setForm(prev => ({
            ...prev,
            permisos: {
                ...prev.permisos,
                [key]: {
                    ver: field === 'ver' ? value : !!prev.permisos[key]?.ver,
                    entrar: field === 'entrar' ? value : !!prev.permisos[key]?.entrar,
                },
            },
        }))
    }

    const handleEntrarCheck = (key: string, value: boolean) => {
        setPermisoFlag(key, 'entrar', value)
        if (value && (key === 'autoventa' || key === 'expediciones' || key === 'reparto')) {
            setSubError('')
            setConfigFromCheck(true)
            setConfigModal(key as 'autoventa' | 'expediciones' | 'reparto')
        }
    }

    const openConfig = (type: 'autoventa' | 'expediciones' | 'reparto') => {
        setSubError('')
        setConfigFromCheck(false)
        setConfigModal(type)
    }

    const closeConfigModal = (applied: boolean) => {
        if (!applied && configFromCheck) {
            if (configModal === 'autoventa') setPermisoFlag('autoventa', 'entrar', false)
            if (configModal === 'expediciones') setPermisoFlag('expediciones', 'entrar', false)
            if (configModal === 'reparto') setPermisoFlag('reparto', 'entrar', false)
        }
        setConfigModal(null)
        setConfigFromCheck(false)
        setSubError('')
    }

    const saveConfigToApi = async () => {
        if (!editId) return
        const payload: Record<string, unknown> = { ...form }
        if (!payload.password) delete payload.password
        await api.put(`/api/admin/usuarios/${editId}`, payload)
        fetch()
    }

    const applyAutoventa = async () => {
        if (!form.agente_autoventa) { setSubError('Selecciona un agente'); return }
        try {
            await saveConfigToApi()
        } catch (e: any) { setSubError(e.response?.data?.detail || 'Error guardando'); return }
        closeConfigModal(true)
    }

    const applyExpediciones = async () => {
        if (form.serie_expediciones.length === 0) { setSubError('Selecciona al menos una serie'); return }
        try {
            await saveConfigToApi()
        } catch (e: any) { setSubError(e.response?.data?.detail || 'Error guardando'); return }
        closeConfigModal(true)
    }

    const applyReparto = async () => {
        try {
            await saveConfigToApi()
        } catch (e: any) { setSubError(e.response?.data?.detail || 'Error guardando'); return }
        closeConfigModal(true)
    }

    const showPermisos = form.rol === 'gerente' || form.rol === 'encargado' || form.rol === 'usuario'

    // Roles que el usuario actual puede asignar
    const availableRoles = currentUser?.rol === 'superadmin'
        ? ['superadmin', 'gerente', 'encargado', 'usuario', 'distribuidor']
        : ['encargado', 'usuario', 'distribuidor']

    // Permisos que el usuario actual puede asignar (solo los que él mismo tiene)
    const assignablePermisos = PERMISOS_DISPONIBLES.filter(p => {
        if (!currentUser) return false
        if (currentUser.rol === 'superadmin') return true
        return hasPermiso(currentUser.permisos, p.key, 'entrar')
    })

    const togglePasswordVisible = (id: number) => {
        setVisiblePasswords(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const save = async () => {
        setError('')
        try {
            if (editId) {
                const payload: Record<string, unknown> = { ...form }
                if (!payload.password) delete payload.password
                await api.put(`/api/admin/usuarios/${editId}`, payload)
            } else {
                await api.post('/api/admin/usuarios', form)
            }
            setShowModal(false)
            fetch()
        } catch (e: any) { setError(e.response?.data?.detail || 'Error guardando') }
    }

    const toggle = async (id: number) => {
        try { await api.patch(`/api/admin/usuarios/${id}/toggle`); fetch() }
        catch (e: any) { alert(e.response?.data?.detail || 'Error') }
    }

    const remove = async (id: number) => {
        if (!confirm('¿Eliminar este usuario?')) return
        try { await api.delete(`/api/admin/usuarios/${id}`); fetch() }
        catch (e: any) { alert(e.response?.data?.detail || 'Error eliminando') }
    }

    const sendCredentials = async (id: number, email: string) => {
        if (!confirm(`¿Enviar credenciales de acceso a ${email}?`)) return
        setSendingEmail(id)
        try {
            await api.post(`/api/admin/usuarios/${id}/send-credentials`)
            alert('Credenciales enviadas correctamente')
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error enviando email')
        } finally {
            setSendingEmail(null)
        }
    }

    const saveAndSend = async () => {
        setError('')
        try {
            let userId: number
            if (editId) {
                const payload: Record<string, unknown> = { ...form }
                if (!payload.password) delete payload.password
                await api.put(`/api/admin/usuarios/${editId}`, payload)
                userId = editId
            } else {
                const res = await api.post<{ id: number }>('/api/admin/usuarios', form)
                userId = res.data.id
            }
            setShowModal(false)
            fetch()
            await api.post(`/api/admin/usuarios/${userId}/send-credentials`)
            alert('Usuario guardado y credenciales enviadas correctamente')
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error al guardar o enviar email')
        }
    }

    const rolBadge = (rol: string) => {
        const colors: Record<string, string> = {
            superadmin: 'bg-purple-100 text-purple-700',
            gerente: 'bg-blue-100 text-blue-700',
            encargado: 'bg-amber-100 text-amber-700',
            usuario: 'bg-slate-100 text-slate-700',
            distribuidor: 'bg-teal-100 text-teal-700',
        }
        return colors[rol] || 'bg-slate-100 text-slate-700'
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand" />
                    <h1 className="text-xl font-bold">Usuarios</h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, email, empresa, local..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand w-72"
                        />
                    </div>
                    <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> Nuevo Usuario
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="card text-center text-slate-400 py-12">Cargando...</div>
            ) : (
                <div className="card overflow-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-500 text-left">
                                <th className="py-2.5 px-3">ID</th>
                                <th className="py-2.5 px-3">Nombre</th>
                                <th className="py-2.5 px-3">Email</th>
                                <th className="py-2.5 px-3">Contraseña</th>
                                <th className="py-2.5 px-3">Rol</th>
                                <th className="py-2.5 px-3">Empresa</th>
                                <th className="py-2.5 px-3">Estado</th>
                                <th className="py-2.5 px-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usuariosFiltrados.map(u => (
                                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="py-2 px-3 text-slate-400">{u.id}</td>
                                    <td className="py-2 px-3 font-medium">{u.nombre}</td>
                                    <td className="py-2 px-3 text-slate-600">{u.email}</td>
                                    <td className="py-2 px-3 text-xs font-mono text-slate-400">
                                        <div className="flex items-center gap-1">
                                            <span>{u.plain_password ? (visiblePasswords.has(u.id) ? u.plain_password : '••••••••') : '—'}</span>
                                            {u.plain_password && (
                                                <button
                                                    onClick={() => togglePasswordVisible(u.id)}
                                                    className="p-0.5 rounded hover:bg-slate-200"
                                                    title={visiblePasswords.has(u.id) ? 'Ocultar' : 'Ver contraseña'}
                                                >
                                                    {visiblePasswords.has(u.id)
                                                        ? <EyeOff className="w-3 h-3 text-slate-400" />
                                                        : <Eye className="w-3 h-3 text-slate-400" />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-2 px-3"><span className={`badge ${rolBadge(u.rol)}`}>{u.rol}</span></td>
                                    <td className="py-2 px-3 text-slate-500">{empresaName(u.empresa_id)}</td>
                                    <td className="py-2 px-3">
                                        <span className={`badge ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {u.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-slate-100" title="Editar"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button
                                                onClick={() => sendCredentials(u.id, u.email)}
                                                className="p-1.5 rounded hover:bg-blue-50"
                                                title="Enviar credenciales por email"
                                                disabled={sendingEmail === u.id}
                                            >
                                                <Mail className={`w-3.5 h-3.5 ${sendingEmail === u.id ? 'text-slate-300' : 'text-blue-500'}`} />
                                            </button>
                                            <button onClick={() => toggle(u.id)} className="p-1.5 rounded hover:bg-slate-100" title="Activar/Desactivar"><Power className="w-3.5 h-3.5 text-slate-500" /></button>
                                            {u.rol !== 'superadmin' && <button onClick={() => remove(u.id)} className="p-1.5 rounded hover:bg-red-50" title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {usuariosFiltrados.length === 0 && (
                                <tr><td colSpan={8} className="py-8 text-center text-slate-400">
                                    {busqueda ? 'Sin resultados' : 'No hay usuarios'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold mb-4">{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                                    <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Contraseña {editId && <span className="text-xs text-slate-400">(vacío = no cambiar)</span>}
                                    </label>
                                    <input className="input" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                                    <select className="input" value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                                        {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                            {currentUser?.rol === 'superadmin' ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                                    <select className="input" value={form.empresa_id || ''} onChange={e => { setPgDataError(false); setForm({ ...form, empresa_id: e.target.value ? +e.target.value : null, local_ids: [] }) }}>
                                        <option value="">Sin empresa</option>
                                        {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                                    <p className="input bg-slate-50 text-slate-500 cursor-default">{empresas.find(e => e.id === form.empresa_id)?.nombre || '—'}</p>
                                </div>
                            )}
                            {localesForEmpresa.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Locales asignados</label>
                                    <div className="flex flex-wrap gap-2">
                                        {localesForEmpresa.map(l => (
                                            <label key={l.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-xs ${form.local_ids.includes(l.id) ? 'bg-brand/10 border-brand text-brand' : 'border-slate-200 text-slate-500'}`}>
                                                <input type="checkbox" className="sr-only" checked={form.local_ids.includes(l.id)} onChange={() => toggleLocal(l.id)} />
                                                {l.nombre}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {showPermisos && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Permisos de acceso</label>
                                    <div className="flex flex-wrap gap-2">
                                        {assignablePermisos.map(p => (
                                            <div key={p.key} className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                                                <span className="text-slate-700 min-w-[120px]">{p.label}</span>
                                                <label className="inline-flex items-center gap-1 text-slate-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!form.permisos[p.key]?.ver}
                                                        onChange={e => setPermisoFlag(p.key, 'ver', e.target.checked)}
                                                    />
                                                    Ver
                                                </label>
                                                <label className="inline-flex items-center gap-1 text-slate-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!form.permisos[p.key]?.entrar}
                                                        onChange={e => handleEntrarCheck(p.key, e.target.checked)}
                                                    />
                                                    Entrar
                                                </label>
                                                {(p.key === 'autoventa' || p.key === 'expediciones' || p.key === 'reparto') && !!form.permisos[p.key]?.entrar && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openConfig(p.key as 'autoventa' | 'expediciones' | 'reparto')}
                                                        className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                                                        title={`Configurar ${p.label}`}
                                                    >
                                                        <Settings className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Superadmin tiene acceso total automáticamente.</p>
                                </div>
                            )}
                            {/* Config buttons para superadmin/gerente (sin grid de permisos) */}
                            {!showPermisos && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Configuraciones especiales</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openConfig('autoventa')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs hover:bg-amber-100"
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                            Autoventa
                                            {form.agente_autoventa ? <span className="bg-amber-200 text-amber-800 rounded px-1 font-semibold">✓</span> : <span className="text-amber-400">— sin config —</span>}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openConfig('expediciones')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs hover:bg-blue-100"
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                            Expediciones
                                            {form.serie_expediciones.length > 0 ? <span className="bg-blue-200 text-blue-800 rounded px-1 font-semibold">✓ {form.serie_expediciones.join(', ')}</span> : <span className="text-blue-400">— sin serie —</span>}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openConfig('reparto')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-xs hover:bg-green-100"
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                            Reparto
                                            {form.caja_reparto ? <span className="bg-green-200 text-green-800 rounded px-1 font-semibold">✓ caja {form.caja_reparto}</span> : <span className="text-green-400">— sin caja —</span>}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowModal(false)} className="btn-ghost">Cancelar</button>
                            <button
                                onClick={saveAndSend}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                <Mail className="w-3.5 h-3.5" />
                                {editId ? 'Guardar y enviar' : 'Crear y enviar credenciales'}
                            </button>
                            <button onClick={save} className="btn-primary">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-modal de configuración (z-[60] sobre el modal principal) */}
            {configModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => closeConfigModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>

                        {/* ── Autoventa ── */}
                        {configModal === 'autoventa' && (
                            <>
                                <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-amber-600" />
                                    Configuración Autoventa
                                </h3>
                                {!form.empresa_id ? (
                                    <p className="text-sm text-amber-600 mb-4">Asigna una empresa al usuario antes de configurar Autoventa.</p>
                                ) : loadingPgData ? (
                                    <p className="text-sm text-slate-400 mb-4">Cargando datos...</p>
                                ) : (
                                    <div className="space-y-3">
                                        {pgDataError && (
                                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-1">
                                                ⚠ Sin conexión al ERP — introduce los códigos manualmente.
                                            </p>
                                        )}
                                        {!pgDataError && agentesOptions.length === 0 && (
                                            <p className="text-xs text-red-600 mb-1">No hay agentes activos en el ERP para esta empresa.</p>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Agente <span className="text-red-500">*</span></label>
                                                {pgDataError ? (
                                                    <input
                                                        type="number"
                                                        className="input text-sm"
                                                        placeholder="Código agente"
                                                        value={form.agente_autoventa ?? ''}
                                                        onChange={e => setForm(f => ({ ...f, agente_autoventa: e.target.value ? +e.target.value : null }))}
                                                    />
                                                ) : (
                                                <select
                                                    className="input text-sm"
                                                    value={form.agente_autoventa ?? ''}
                                                    onChange={e => setForm(f => ({ ...f, agente_autoventa: e.target.value ? +e.target.value : null }))}
                                                >
                                                    <option value="">— Sin agente —</option>
                                                    {agentesOptions.map(a => (
                                                        <option key={a.codigo} value={a.codigo}>{a.nombre}</option>
                                                    ))}
                                                </select>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Serie predeterminada</label>
                                                {pgDataError ? (
                                                    <input
                                                        type="text"
                                                        className="input text-sm"
                                                        placeholder="Ej: A"
                                                        value={form.serie_autoventa ?? ''}
                                                        onChange={e => setForm(f => ({ ...f, serie_autoventa: e.target.value || null }))}
                                                    />
                                                ) : (
                                                <select
                                                    className="input text-sm"
                                                    value={form.serie_autoventa ?? ''}
                                                    onChange={e => setForm(f => ({ ...f, serie_autoventa: e.target.value || null }))}
                                                >
                                                    <option value="">— Sin serie —</option>
                                                    {seriesOptions.map(s => (
                                                        <option key={s.serie} value={s.serie}>{s.serie}</option>
                                                    ))}
                                                </select>
                                                )}
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-brand"
                                                checked={form.autoventa_modifica_precio}
                                                onChange={e => setForm(f => ({ ...f, autoventa_modifica_precio: e.target.checked }))}
                                            />
                                            <span className="text-xs text-slate-700">Puede modificar precios en Autoventa</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-brand"
                                                checked={form.solo_clientes_agente}
                                                onChange={e => setForm(f => ({ ...f, solo_clientes_agente: e.target.checked }))}
                                            />
                                            <span className="text-xs text-slate-700">Ver solo sus clientes (filtrar por agente)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-brand"
                                                checked={form.precargar_historial_autoventa}
                                                onChange={async e => {
                                                    const next = e.target.checked
                                                    if (!editId) {
                                                        setForm(f => ({ ...f, precargar_historial_autoventa: next }))
                                                        return
                                                    }
                                                    setForm(f => ({ ...f, precargar_historial_autoventa: next }))
                                                    try {
                                                        await api.put(`/api/admin/usuarios/${editId}`, { precargar_historial_autoventa: next })
                                                        fetch()
                                                    } catch (err: any) {
                                                        setSubError(err.response?.data?.detail || 'Error guardando')
                                                        setForm(f => ({ ...f, precargar_historial_autoventa: !next }))
                                                    }
                                                }}
                                            />
                                            <span className="text-xs text-slate-700">Precargar ventas anteriores (últimos 90 días)</span>
                                        </label>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Ancho papel impresora térmica</label>
                                            <div className="flex gap-2">
                                                {([80, 100] as const).map(w => (
                                                    <button
                                                        key={w}
                                                        type="button"
                                                        onClick={async () => {
                                                            setForm(f => ({ ...f, paper_width_impresora: w }))
                                                            if (editId) {
                                                                try {
                                                                    await api.put(`/api/admin/usuarios/${editId}`, { paper_width_impresora: w })
                                                                    fetch()
                                                                } catch (err: any) {
                                                                    setSubError(err.response?.data?.detail || 'Error guardando')
                                                                    setForm(f => ({ ...f, paper_width_impresora: w === 80 ? 100 : 80 }))
                                                                }
                                                            }
                                                        }}
                                                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                                            form.paper_width_impresora === w
                                                                ? 'bg-slate-700 text-white border-slate-700'
                                                                : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'
                                                        }`}
                                                    >
                                                        {w} mm
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Caja de cobros (efectivo)</label>
                                            {pgDataError ? (
                                                <input type="number" className="input text-sm" placeholder="Código caja"
                                                    value={form.caja_autoventa ?? ''}
                                                    onChange={e => setForm(f => ({ ...f, caja_autoventa: e.target.value ? +e.target.value : null }))} />
                                            ) : (
                                            <select className="input text-sm" value={form.caja_autoventa ?? ''}
                                                onChange={e => setForm(f => ({ ...f, caja_autoventa: e.target.value ? +e.target.value : null }))}
                                            >
                                                <option value="">— Sin caja —</option>
                                                {cajasOptions.map(c => (
                                                    <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                                                ))}
                                            </select>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Forma de pago en cobros</label>
                                            {pgDataError ? (
                                                <input type="number" className="input text-sm" placeholder="Código forma de pago"
                                                    value={form.fpago_autoventa ?? ''}
                                                    onChange={e => setForm(f => ({ ...f, fpago_autoventa: e.target.value ? +e.target.value : null }))} />
                                            ) : (
                                            <select className="input text-sm" value={form.fpago_autoventa ?? ''}
                                                onChange={e => setForm(f => ({ ...f, fpago_autoventa: e.target.value ? +e.target.value : null }))}
                                            >
                                                <option value="">— Sin forma de pago —</option>
                                                {fpagosOptions.map(fp => (
                                                    <option key={fp.codigo} value={fp.codigo}>{fp.nombre}</option>
                                                ))}
                                            </select>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Almacén por defecto</label>
                                            {pgDataError ? (
                                                <input type="number" className="input text-sm" placeholder="Código almacén (vacío = 1)"
                                                    value={form.almacen_autoventa ?? ''}
                                                    onChange={e => setForm(f => ({ ...f, almacen_autoventa: e.target.value ? +e.target.value : null }))} />
                                            ) : (
                                            <select className="input text-sm" value={form.almacen_autoventa ?? ''}
                                                onChange={e => setForm(f => ({ ...f, almacen_autoventa: e.target.value ? +e.target.value : null }))}
                                            >
                                                <option value="">— Almacén 1 (por defecto) —</option>
                                                {almacenesOptions.map(a => (
                                                    <option key={a.codigo} value={a.codigo}>{a.codigo} — {a.nombre}</option>
                                                ))}
                                            </select>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-slate-700 mb-1">Tipos de documento permitidos</p>
                                            <div className="flex gap-3">
                                                {[{id: 2, label: 'Pedido'}, {id: 4, label: 'Albarán'}, {id: 8, label: 'Factura'}].map(td => (
                                                    <label key={td.id} className="flex items-center gap-1 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            className="w-3.5 h-3.5 accent-brand"
                                                            checked={form.tipodocs_autoventa.includes(td.id)}
                                                            onChange={e => {
                                                                const next = e.target.checked
                                                                    ? [...form.tipodocs_autoventa, td.id]
                                                                    : form.tipodocs_autoventa.filter(c => c !== td.id)
                                                                setForm(f => ({ ...f, tipodocs_autoventa: next }))
                                                            }}
                                                        />
                                                        <span className="text-xs text-slate-600">{td.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {subError && <p className="text-red-600 text-xs mt-2">{subError}</p>}
                                <div className="flex justify-end gap-2 mt-4">
                                    <button type="button" onClick={() => closeConfigModal(false)} className="btn-ghost text-sm">Cancelar</button>
                                    {(agentesOptions.length > 0 || pgDataError) && form.empresa_id && (
                                        <button type="button" onClick={applyAutoventa} className="btn-primary text-sm">Aplicar</button>
                                    )}
                                </div>
                            </>
                        )}

                        {/* ── Reparto ── */}
                        {configModal === 'reparto' && (
                            <>
                                <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-green-600" />
                                    Configuración Reparto
                                </h3>
                                {!form.empresa_id ? (
                                    <p className="text-sm text-green-600 mb-4">Asigna una empresa al usuario antes de configurar Reparto.</p>
                                ) : loadingPgData ? (
                                    <p className="text-sm text-slate-400 mb-4">Cargando cajas...</p>
                                ) : pgDataError ? (
                                    <p className="text-sm text-red-600 mb-4">Error al conectar con la base de datos del ERP. Comprueba la configuración de la empresa.</p>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Caja de cobros del reparto</label>
                                            <select
                                                className="input text-sm"
                                                value={form.caja_reparto ?? ''}
                                                onChange={e => setForm(f => ({ ...f, caja_reparto: e.target.value ? +e.target.value : null }))}
                                            >
                                                <option value="">— Sin caja —</option>
                                                {cajasOptions.map(c => (
                                                    <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-slate-400 mt-1">Los cobros del repartidor se registrarán en esta caja.</p>
                                        </div>
                                    </div>
                                )}
                                {subError && <p className="text-red-600 text-xs mt-2">{subError}</p>}
                                <div className="flex justify-end gap-2 mt-4">
                                    <button type="button" onClick={() => closeConfigModal(false)} className="btn-ghost text-sm">Cancelar</button>
                                    {form.empresa_id && (
                                        <button type="button" onClick={applyReparto} className="btn-primary text-sm">Aplicar</button>
                                    )}
                                </div>
                            </>
                        )}

                        {/* ── Expediciones ── */}
                        {configModal === 'expediciones' && (
                            <>
                                <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-blue-600" />
                                    Configuración Expediciones
                                </h3>
                                {!form.empresa_id ? (
                                    <p className="text-sm text-blue-600 mb-4">Asigna una empresa al usuario antes de configurar Expediciones.</p>
                                ) : loadingPgData ? (
                                    <p className="text-sm text-slate-400 mb-4">Cargando series...</p>
                                ) : pgDataError ? (
                                    <p className="text-sm text-red-600 mb-4">Error al conectar con la base de datos del ERP. Comprueba la configuración de la empresa.</p>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-2">
                                                Series de pedidos a gestionar <span className="text-red-500">*</span>
                                            </label>
                                            {seriesOptions.length > 0 ? (
                                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                                    {seriesOptions.map(s => {
                                                        const checked = form.serie_expediciones.includes(s.serie)
                                                        return (
                                                            <label
                                                                key={s.serie}
                                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-xs select-none ${checked ? 'bg-blue-100 border-blue-400 text-blue-800 font-semibold' : 'border-slate-200 text-slate-600'}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only"
                                                                    checked={checked}
                                                                    onChange={e => {
                                                                        const next = e.target.checked
                                                                            ? [...form.serie_expediciones, s.serie]
                                                                            : form.serie_expediciones.filter(x => x !== s.serie)
                                                                        setForm(f => ({ ...f, serie_expediciones: next }))
                                                                    }}
                                                                />
                                                                {s.serie}
                                                            </label>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <input
                                                    className="input text-sm"
                                                    placeholder="Ej: CI 26 (separadas por coma)"
                                                    value={form.serie_expediciones.join(', ')}
                                                    onChange={e => {
                                                        const vals = e.target.value.split(',').map(v => v.trim()).filter(Boolean)
                                                        setForm(f => ({ ...f, serie_expediciones: vals }))
                                                    }}
                                                />
                                            )}
                                            <p className="text-xs text-slate-400 mt-1">El usuario solo verá pedidos de las series seleccionadas. Sin selección = todas.</p>
                                        </div>
                                    </div>
                                )}
                                {subError && <p className="text-red-600 text-xs mt-2">{subError}</p>}
                                <div className="flex justify-end gap-2 mt-4">
                                    <button type="button" onClick={() => closeConfigModal(false)} className="btn-ghost text-sm">Cancelar</button>
                                    {form.empresa_id && (
                                        <button type="button" onClick={applyExpediciones} className="btn-primary text-sm">Aplicar</button>
                                    )}
                                </div>
                            </>
                        )}

                    </div>
                </div>
            )}
        </div>
    )
}
