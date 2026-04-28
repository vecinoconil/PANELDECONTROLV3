import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Users, Plus, Pencil, Trash2, Power, Eye, EyeOff, Mail } from 'lucide-react'
import { PERMISOS_DISPONIBLES, type PermisosMap } from '../../types'

interface Empresa { id: number; nombre: string }
interface LocalItem { id: number; nombre: string; empresa_id: number }
interface AgenteOption { codigo: number; nombre: string }
interface SerieOption { serie: string }
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
    fpagos_autoventa: number[]
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
    fpagos_autoventa: number[]
}

const ROLES = ['superadmin', 'gerente', 'encargado', 'usuario']
const emptyForm: UsuarioForm = {
    empresa_id: null, email: '', nombre: '', password: '', rol: 'usuario',
    local_ids: [], permisos: {},
    agente_autoventa: null, serie_autoventa: null, autoventa_modifica_precio: false, fpagos_autoventa: [],
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
    const [fpagosOptions, setFpagosOptions] = useState<FpagoOption[]>([])
    const [loadingPgData, setLoadingPgData] = useState(false)

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

    // Load agentes, series y formaspago when autoventa is selected and empresa is set
    useEffect(() => {
        if (showModal && (form.permisos.autoventa?.ver || form.permisos.autoventa?.entrar) && form.empresa_id) {
            setLoadingPgData(true)
            Promise.all([
                api.get<AgenteOption[]>(`/api/admin/pg-data/agentes?empresa_id=${form.empresa_id}`),
                api.get<SerieOption[]>(`/api/admin/pg-data/series?empresa_id=${form.empresa_id}`),
                api.get<FpagoOption[]>(`/api/admin/pg-data/formaspago?empresa_id=${form.empresa_id}`),
            ])
                .then(([a, s, f]) => { setAgentesOptions(a.data); setSeriesOptions(s.data); setFpagosOptions(f.data) })
                .catch(() => { setAgentesOptions([]); setSeriesOptions([]); setFpagosOptions([]) })
                .finally(() => setLoadingPgData(false))
        }
    }, [showModal, form.permisos, form.empresa_id])

    const empresaName = (id: number | null) => id ? empresas.find(e => e.id === id)?.nombre || '—' : '—'
    const localesForEmpresa = form.empresa_id ? locales.filter(l => l.empresa_id === form.empresa_id) : locales

    const openNew = () => { setEditId(null); setForm(emptyForm); setShowModal(true); setError('') }
    const openEdit = (u: Usuario) => {
        setEditId(u.id)
        setForm({
            empresa_id: u.empresa_id, email: u.email, nombre: u.nombre,
            password: '', rol: u.rol, local_ids: u.local_ids, permisos: u.permisos || [],
            agente_autoventa: u.agente_autoventa ?? null,
            serie_autoventa: u.serie_autoventa ?? null,
            autoventa_modifica_precio: u.autoventa_modifica_precio ?? false,
            fpagos_autoventa: u.fpagos_autoventa ?? [],
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

    const showPermisos = form.rol === 'gerente' || form.rol === 'encargado' || form.rol === 'usuario'

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

    const rolBadge = (rol: string) => {
        const colors: Record<string, string> = {
            superadmin: 'bg-purple-100 text-purple-700',
            gerente: 'bg-blue-100 text-blue-700',
            encargado: 'bg-amber-100 text-amber-700',
            usuario: 'bg-slate-100 text-slate-700',
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
                <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Nuevo Usuario
                </button>
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
                            {usuarios.map(u => (
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
                            {usuarios.length === 0 && (
                                <tr><td colSpan={8} className="py-8 text-center text-slate-400">No hay usuarios</td></tr>
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
                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                                <select className="input" value={form.empresa_id || ''} onChange={e => setForm({ ...form, empresa_id: e.target.value ? +e.target.value : null, local_ids: [] })}>
                                    <option value="">Sin empresa</option>
                                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                                </select>
                            </div>
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
                                        {PERMISOS_DISPONIBLES.map(p => (
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
                                                        onChange={e => setPermisoFlag(p.key, 'entrar', e.target.checked)}
                                                    />
                                                    Entrar
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Superadmin y Gerente tienen acceso total automáticamente.</p>
                                </div>
                            )}
                            {/* Autoventa config */}
                            {((form.permisos.autoventa?.ver || form.permisos.autoventa?.entrar) || form.rol === 'superadmin' || form.rol === 'gerente') && (
                                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-3">
                                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Configuración Autoventa</p>
                                    {!form.empresa_id ? (
                                        <p className="text-xs text-amber-600">Asigna una empresa al usuario para cargar agentes y series.</p>
                                    ) : loadingPgData ? (
                                        <p className="text-xs text-slate-400">Cargando agentes y series...</p>
                                    ) : agentesOptions.length === 0 ? (
                                        <p className="text-xs text-red-600">No hay agentes activos. Crea un agente en el ERP antes de configurar Autoventa.</p>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Agente</label>
                                                    <select
                                                        className="input text-sm"
                                                        value={form.agente_autoventa ?? ''}
                                                        onChange={e => setForm({ ...form, agente_autoventa: e.target.value ? +e.target.value : null })}
                                                    >
                                                        <option value="">— Sin agente —</option>
                                                        {agentesOptions.map(a => (
                                                            <option key={a.codigo} value={a.codigo}>{a.nombre}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Serie predeterminada</label>
                                                    <select
                                                        className="input text-sm"
                                                        value={form.serie_autoventa ?? ''}
                                                        onChange={e => setForm({ ...form, serie_autoventa: e.target.value || null })}
                                                    >
                                                        <option value="">— Sin serie —</option>
                                                        {seriesOptions.map(s => (
                                                            <option key={s.serie} value={s.serie}>{s.serie}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 accent-brand"
                                                    checked={form.autoventa_modifica_precio}
                                                    onChange={e => setForm({ ...form, autoventa_modifica_precio: e.target.checked })}
                                                />
                                                <span className="text-xs text-slate-700">Puede modificar precios en Autoventa</span>
                                            </label>
                                            {fpagosOptions.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-medium text-slate-700 mb-1">Formas de pago permitidas</p>
                                                    <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto border border-amber-200 rounded p-2 bg-white">
                                                        {fpagosOptions.map(fp => (
                                                            <label key={fp.codigo} className="flex items-center gap-1 cursor-pointer select-none">
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-3.5 h-3.5 accent-brand"
                                                                    checked={form.fpagos_autoventa.includes(fp.codigo)}
                                                                    onChange={e => {
                                                                        const next = e.target.checked
                                                                            ? [...form.fpagos_autoventa, fp.codigo]
                                                                            : form.fpagos_autoventa.filter(c => c !== fp.codigo)
                                                                        setForm({ ...form, fpagos_autoventa: next })
                                                                    }}
                                                                />
                                                                <span className="text-xs text-slate-600 leading-tight">{fp.nombre}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowModal(false)} className="btn-ghost">Cancelar</button>
                            <button onClick={save} className="btn-primary">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
