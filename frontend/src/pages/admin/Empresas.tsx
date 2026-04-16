import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Building2, Plus, Pencil, Trash2, Power } from 'lucide-react'

interface Empresa {
    id: number
    nombre: string
    plan: string
    activo: boolean
    created_at: string
    pg_host: string | null
    pg_port: number
    pg_name: string | null
    pg_user: string | null
}

interface EmpresaForm {
    nombre: string
    plan: string
    pg_host: string
    pg_port: number
    pg_name: string
    pg_user: string
    pg_password: string
}

const emptyForm: EmpresaForm = { nombre: '', plan: 'basic', pg_host: '', pg_port: 5026, pg_name: '', pg_user: '', pg_password: '' }

export default function Empresas() {
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<EmpresaForm>(emptyForm)
    const [error, setError] = useState('')

    const fetchEmpresas = async () => {
        setLoading(true)
        try {
            const { data } = await api.get<Empresa[]>('/api/admin/empresas')
            setEmpresas(data)
        } catch { setError('Error cargando empresas') }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchEmpresas() }, [])

    const openNew = () => { setEditId(null); setForm(emptyForm); setShowModal(true); setError('') }
    const openEdit = (e: Empresa) => {
        setEditId(e.id)
        setForm({ nombre: e.nombre, plan: e.plan, pg_host: e.pg_host || '', pg_port: e.pg_port, pg_name: e.pg_name || '', pg_user: e.pg_user || '', pg_password: '' })
        setShowModal(true)
        setError('')
    }

    const save = async () => {
        setError('')
        try {
            if (editId) {
                const payload: Record<string, unknown> = { ...form }
                if (!payload.pg_password) delete payload.pg_password
                await api.put(`/api/admin/empresas/${editId}`, payload)
            } else {
                await api.post('/api/admin/empresas', form)
            }
            setShowModal(false)
            fetchEmpresas()
        } catch (e: any) { setError(e.response?.data?.detail || 'Error guardando') }
    }

    const toggle = async (id: number) => {
        await api.patch(`/api/admin/empresas/${id}/toggle`)
        fetchEmpresas()
    }

    const remove = async (id: number) => {
        if (!confirm('¿Eliminar esta empresa?')) return
        try {
            await api.delete(`/api/admin/empresas/${id}`)
            fetchEmpresas()
        } catch (e: any) { alert(e.response?.data?.detail || 'Error eliminando') }
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-brand" />
                    <h1 className="text-xl font-bold">Empresas</h1>
                </div>
                <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Nueva Empresa
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
                                <th className="py-2.5 px-3">Plan</th>
                                <th className="py-2.5 px-3">PG Host</th>
                                <th className="py-2.5 px-3">PG Base</th>
                                <th className="py-2.5 px-3">Estado</th>
                                <th className="py-2.5 px-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {empresas.map(e => (
                                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="py-2 px-3 text-slate-400">{e.id}</td>
                                    <td className="py-2 px-3 font-medium">{e.nombre}</td>
                                    <td className="py-2 px-3"><span className="badge bg-blue-100 text-blue-700">{e.plan}</span></td>
                                    <td className="py-2 px-3 text-xs text-slate-500">{e.pg_host || '—'}</td>
                                    <td className="py-2 px-3 text-xs text-slate-500">{e.pg_name || '—'}</td>
                                    <td className="py-2 px-3">
                                        <span className={`badge ${e.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {e.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-slate-100" title="Editar"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => toggle(e.id)} className="p-1.5 rounded hover:bg-slate-100" title="Activar/Desactivar"><Power className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => remove(e.id)} className="p-1.5 rounded hover:bg-red-50" title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {empresas.length === 0 && (
                                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No hay empresas</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold mb-4">{editId ? 'Editar Empresa' : 'Nueva Empresa'}</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
                                <select className="input" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                                    <option value="basic">Basic</option>
                                    <option value="pro">Pro</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <hr className="border-slate-200" />
                            <p className="text-xs text-slate-500 font-medium">Conexión PostgreSQL del cliente</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Host</label>
                                    <input className="input" value={form.pg_host} onChange={e => setForm({ ...form, pg_host: e.target.value })} placeholder="core.solba.com" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Puerto</label>
                                    <input className="input" type="number" value={form.pg_port} onChange={e => setForm({ ...form, pg_port: +e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Base de datos</label>
                                    <input className="input" value={form.pg_name} onChange={e => setForm({ ...form, pg_name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Usuario</label>
                                    <input className="input" value={form.pg_user} onChange={e => setForm({ ...form, pg_user: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Contraseña PG {editId && '(dejar vacío para no cambiar)'}</label>
                                <input className="input" type="password" value={form.pg_password} onChange={e => setForm({ ...form, pg_password: e.target.value })} />
                            </div>
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
