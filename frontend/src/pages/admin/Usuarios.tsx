import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Users, Plus, Pencil, Trash2, Power } from 'lucide-react'

interface Empresa { id: number; nombre: string }
interface LocalItem { id: number; nombre: string; empresa_id: number }
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
}
interface UsuarioForm {
    empresa_id: number | null
    email: string
    nombre: string
    password: string
    rol: string
    local_ids: number[]
}

const ROLES = ['superadmin', 'gerente', 'encargado', 'usuario']
const emptyForm: UsuarioForm = { empresa_id: null, email: '', nombre: '', password: '', rol: 'usuario', local_ids: [] }

export default function Usuarios() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([])
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [locales, setLocales] = useState<LocalItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<UsuarioForm>(emptyForm)
    const [error, setError] = useState('')

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

    const empresaName = (id: number | null) => id ? empresas.find(e => e.id === id)?.nombre || '—' : '—'
    const localesForEmpresa = form.empresa_id ? locales.filter(l => l.empresa_id === form.empresa_id) : locales

    const openNew = () => { setEditId(null); setForm(emptyForm); setShowModal(true); setError('') }
    const openEdit = (u: Usuario) => {
        setEditId(u.id)
        setForm({ empresa_id: u.empresa_id, email: u.email, nombre: u.nombre, password: '', rol: u.rol, local_ids: u.local_ids })
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
                                    <td className="py-2 px-3 text-xs text-slate-400 font-mono">{u.plain_password || '••••'}</td>
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
