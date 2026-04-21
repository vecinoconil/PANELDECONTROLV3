import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Building2, Plus, Pencil, Trash2, Power, PlugZap, Download, Network } from 'lucide-react'

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
    usar_tunnel: boolean
    tunnel_port: number | null
}

interface EmpresaForm {
    nombre: string
    plan: string
    pg_host: string
    pg_port: number
    pg_name: string
    pg_user: string
    pg_password: string
    usar_tunnel: boolean
    tunnel_port: number | ''
}

const emptyForm: EmpresaForm = {
    nombre: '', plan: 'basic',
    pg_host: '', pg_port: 5026, pg_name: '', pg_user: '', pg_password: '',
    usar_tunnel: false, tunnel_port: '',
}

export default function Empresas() {
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<EmpresaForm>(emptyForm)
    const [error, setError] = useState('')
    const [connTested, setConnTested] = useState(false)
    const [connResult, setConnResult] = useState<{ ok: boolean; message: string } | null>(null)
    const [connTesting, setConnTesting] = useState(false)
    const [downloading, setDownloading] = useState<number | null>(null)

    const fetchEmpresas = async () => {
        setLoading(true)
        try {
            const { data } = await api.get<Empresa[]>('/api/admin/empresas')
            setEmpresas(data)
        } catch { setError('Error cargando empresas') }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchEmpresas() }, [])

    const openNew = () => {
        setEditId(null); setForm(emptyForm); setShowModal(true)
        setError(''); setConnTested(false); setConnResult(null)
    }
    const openEdit = (e: Empresa) => {
        setEditId(e.id)
        setForm({
            nombre: e.nombre, plan: e.plan,
            pg_host: e.pg_host || '', pg_port: e.pg_port,
            pg_name: e.pg_name || '', pg_user: e.pg_user || '', pg_password: '',
            usar_tunnel: e.usar_tunnel,
            tunnel_port: e.tunnel_port ?? '',
        })
        setShowModal(true); setError(''); setConnTested(true); setConnResult(null)
    }

    // When tunnel toggled on, auto-suggest next available port
    const handleTunnelToggle = (val: boolean) => {
        if (val && !form.tunnel_port) {
            const usedPorts = empresas.map(e => e.tunnel_port).filter(Boolean) as number[]
            let port = 15001
            while (usedPorts.includes(port)) port++
            setForm(f => ({ ...f, usar_tunnel: true, tunnel_port: port, pg_host: 'localhost' }))
        } else if (!val) {
            setForm(f => ({ ...f, usar_tunnel: false }))
        } else {
            setForm(f => ({ ...f, usar_tunnel: val }))
        }
    }

    const save = async () => {
        setError('')
        if (!editId && !connTested && !form.usar_tunnel) {
            setError('Primero debes probar la conexión a la base de datos')
            return
        }
        try {
            const payload: Record<string, unknown> = { ...form }
            if (!payload.pg_password) delete payload.pg_password
            if (payload.tunnel_port === '') payload.tunnel_port = null
            if (editId) {
                await api.put(`/api/admin/empresas/${editId}`, payload)
            } else {
                await api.post('/api/admin/empresas', payload)
            }
            setShowModal(false)
            fetchEmpresas()
        } catch (e: any) { setError(e.response?.data?.detail || 'Error guardando') }
    }

    const testConnection = async () => {
        setConnTesting(true); setConnResult(null)
        try {
            const { data } = await api.post<{ ok: boolean; message: string }>('/api/admin/empresas/test-connection', {
                pg_host: form.pg_host, pg_port: form.pg_port,
                pg_name: form.pg_name, pg_user: form.pg_user, pg_password: form.pg_password,
            })
            setConnResult(data); setConnTested(data.ok)
        } catch {
            setConnResult({ ok: false, message: 'Error al probar conexión' }); setConnTested(false)
        } finally { setConnTesting(false) }
    }

    const toggle = async (id: number) => { await api.patch(`/api/admin/empresas/${id}/toggle`); fetchEmpresas() }
    const remove = async (id: number) => {
        if (!confirm('¿Eliminar esta empresa?')) return
        try { await api.delete(`/api/admin/empresas/${id}`); fetchEmpresas() }
        catch (e: any) { alert(e.response?.data?.detail || 'Error eliminando') }
    }

    const downloadFrpc = async (empresa: Empresa) => {
        setDownloading(empresa.id)
        try {
            const resp = await api.get(`/api/admin/empresas/${empresa.id}/frpc-download`, { responseType: 'blob' })
            const url = URL.createObjectURL(resp.data)
            const a = document.createElement('a')
            a.href = url
            a.download = `tunel_frp_${empresa.nombre.replace(/\s+/g, '_')}.zip`
            a.click()
            URL.revokeObjectURL(url)
        } catch { alert('Error descargando el instalador') }
        finally { setDownloading(null) }
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
                                <th className="py-2.5 px-3">Conexión BD</th>
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
                                    <td className="py-2 px-3 text-xs text-slate-500">
                                        {e.usar_tunnel ? (
                                            <span className="flex items-center gap-1.5 text-violet-600 font-medium">
                                                <Network className="w-3.5 h-3.5" />
                                                Túnel FRP · puerto {e.tunnel_port}
                                            </span>
                                        ) : (
                                            <span>{e.pg_host || '—'} {e.pg_name ? `/ ${e.pg_name}` : ''}</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3">
                                        <span className={`badge ${e.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {e.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {e.usar_tunnel && e.tunnel_port && (
                                                <button
                                                    onClick={() => downloadFrpc(e)}
                                                    disabled={downloading === e.id}
                                                    className="p-1.5 rounded hover:bg-violet-50 text-violet-600 disabled:opacity-50"
                                                    title="Descargar instalador túnel FRP"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-slate-100" title="Editar"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => toggle(e.id)} className="p-1.5 rounded hover:bg-slate-100" title="Activar/Desactivar"><Power className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => remove(e.id)} className="p-1.5 rounded hover:bg-red-50" title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {empresas.length === 0 && (
                                <tr><td colSpan={6} className="py-8 text-center text-slate-400">No hay empresas</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
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

                            {/* Tunnel toggle */}
                            <div className="flex items-center justify-between p-3 bg-violet-50 rounded-lg border border-violet-100">
                                <div className="flex items-center gap-2">
                                    <Network className="w-4 h-4 text-violet-600" />
                                    <div>
                                        <p className="text-sm font-medium text-violet-800">Usar túnel FRP</p>
                                        <p className="text-xs text-violet-500">Para bases de datos en red local del cliente</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleTunnelToggle(!form.usar_tunnel)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.usar_tunnel ? 'bg-violet-600' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.usar_tunnel ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {form.usar_tunnel ? (
                                /* Tunnel mode */
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Puerto remoto asignado</label>
                                            <input className="input" type="number" value={form.tunnel_port}
                                                onChange={e => setForm({ ...form, tunnel_port: e.target.value ? +e.target.value : '' })}
                                                placeholder="15001" />
                                            <p className="text-[10px] text-slate-400 mt-0.5">Único por empresa (15001–15020)</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Puerto BD local del cliente</label>
                                            <input className="input" type="number" value={form.pg_port}
                                                onChange={e => setForm({ ...form, pg_port: +e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Base de datos</label>
                                            <input className="input" value={form.pg_name} onChange={e => setForm({ ...form, pg_name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Usuario BD</label>
                                            <input className="input" value={form.pg_user} onChange={e => setForm({ ...form, pg_user: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Contraseña BD {editId && '(dejar vacío para no cambiar)'}</label>
                                        <input className="input" type="password" value={form.pg_password} onChange={e => setForm({ ...form, pg_password: e.target.value })} />
                                    </div>
                                    <div className="text-xs text-violet-600 bg-violet-50 rounded p-2 flex items-start gap-1.5">
                                        <Network className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>El host se configurará automáticamente como <strong>localhost:{form.tunnel_port || '?'}</strong> en el servidor.</span>
                                    </div>
                                </div>
                            ) : (
                                /* Direct connection mode */
                                <div className="space-y-3">
                                    <p className="text-xs text-slate-500 font-medium">Conexión PostgreSQL directa</p>
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
                                        <input className="input" type="password" value={form.pg_password}
                                            onChange={e => { setForm({ ...form, pg_password: e.target.value }); if (!editId) { setConnTested(false); setConnResult(null) } }} />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={testConnection}
                                            disabled={connTesting || !form.pg_host || !form.pg_name || !form.pg_user || (!form.pg_password && !editId)}
                                            className="btn-primary !py-1.5 !px-4 text-xs flex items-center gap-1.5 disabled:opacity-50">
                                            <PlugZap className="w-3.5 h-3.5" />
                                            {connTesting ? 'Probando...' : 'Probar Conexión'}
                                        </button>
                                        {connResult && (
                                            <span className={`text-xs font-medium ${connResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                                                {connResult.ok ? '✓ Conexión exitosa' : `✗ ${connResult.message}`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowModal(false)} className="btn-ghost">Cancelar</button>
                            <button onClick={save}
                                disabled={!editId && !connTested && !form.usar_tunnel}
                                className="btn-primary disabled:opacity-50">
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
