import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { MapPin, Plus, Pencil, Trash2, Power } from 'lucide-react'

interface Empresa { id: number; nombre: string }
interface Local {
    id: number
    empresa_id: number
    nombre: string
    activo: boolean
}
interface LocalForm { empresa_id: number; nombre: string }

export default function Locales() {
    const [locales, setLocales] = useState<Local[]>([])
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<LocalForm>({ empresa_id: 0, nombre: '' })
    const [filterEmpresa, setFilterEmpresa] = useState<number | 0>(0)
    const [error, setError] = useState('')

    const fetch = async () => {
        setLoading(true)
        try {
            const [loc, emp] = await Promise.all([
                api.get<Local[]>('/api/admin/locales'),
                api.get<Empresa[]>('/api/admin/empresas'),
            ])
            setLocales(loc.data)
            setEmpresas(emp.data)
        } catch { setError('Error cargando datos') }
        finally { setLoading(false) }
    }

    useEffect(() => { fetch() }, [])

    const empresaName = (id: number) => empresas.find(e => e.id === id)?.nombre || '—'
    const filtered = filterEmpresa ? locales.filter(l => l.empresa_id === filterEmpresa) : locales

    const openNew = () => { setEditId(null); setForm({ empresa_id: empresas[0]?.id || 0, nombre: '' }); setShowModal(true); setError('') }
    const openEdit = (l: Local) => { setEditId(l.id); setForm({ empresa_id: l.empresa_id, nombre: l.nombre }); setShowModal(true); setError('') }

    const save = async () => {
        setError('')
        try {
            if (editId) {
                await api.put(`/api/admin/locales/${editId}`, { nombre: form.nombre })
            } else {
                await api.post('/api/admin/locales', form)
            }
            setShowModal(false)
            fetch()
        } catch (e: any) { setError(e.response?.data?.detail || 'Error guardando') }
    }

    const toggle = async (id: number) => { await api.patch(`/api/admin/locales/${id}/toggle`); fetch() }
    const remove = async (id: number) => {
        if (!confirm('¿Eliminar este local?')) return
        try { await api.delete(`/api/admin/locales/${id}`); fetch() }
        catch (e: any) { alert(e.response?.data?.detail || 'Error eliminando') }
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-brand" />
                    <h1 className="text-xl font-bold">Locales</h1>
                </div>
                <div className="flex items-center gap-3">
                    <select className="input w-48 !py-1.5 text-sm" value={filterEmpresa} onChange={e => setFilterEmpresa(+e.target.value)}>
                        <option value={0}>Todas las empresas</option>
                        {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                    <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> Nuevo Local
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
                                <th className="py-2.5 px-3">Empresa</th>
                                <th className="py-2.5 px-3">Estado</th>
                                <th className="py-2.5 px-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(l => (
                                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="py-2 px-3 text-slate-400">{l.id}</td>
                                    <td className="py-2 px-3 font-medium">{l.nombre}</td>
                                    <td className="py-2 px-3 text-slate-500">{empresaName(l.empresa_id)}</td>
                                    <td className="py-2 px-3">
                                        <span className={`badge ${l.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {l.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(l)} className="p-1.5 rounded hover:bg-slate-100" title="Editar"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => toggle(l.id)} className="p-1.5 rounded hover:bg-slate-100" title="Activar/Desactivar"><Power className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-red-50" title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="py-8 text-center text-slate-400">No hay locales</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold mb-4">{editId ? 'Editar Local' : 'Nuevo Local'}</h2>
                        <div className="space-y-3">
                            {!editId && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                                    <select className="input" value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: +e.target.value })}>
                                        {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
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
