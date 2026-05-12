import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useRef } from 'react'
import { MapPin, Plus, Pencil, Trash2, Power, CheckCircle, Bot, Globe, FileText, Upload, X as XIcon } from 'lucide-react'

interface Empresa { id: number; nombre: string }
interface Local {
    id: number
    empresa_id: number
    nombre: string
    activo: boolean
    tipo: string
    fecha_alta: string | null
    fecha_definitiva: string | null
    asistente_ia: boolean
    smtp_host: string | null
    smtp_port: number
    smtp_user: string | null
    smtp_from_name: string | null
    formato_doc: string
    portal_activo: boolean
    frx_factura: string | null
}
interface LocalForm {
    empresa_id: number
    nombre: string
    tipo: string
    smtp_host: string
    smtp_port: number
    smtp_user: string
    smtp_password: string
    smtp_from_name: string
    formato_doc: string
}

export default function Locales() {
    const { user, refreshUser } = useAuth()
    const isSuperadmin = (user as any)?.rol === 'superadmin'
    const isGerente = (user as any)?.rol === 'gerente'
    const [locales, setLocales] = useState<Local[]>([])
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<LocalForm>({ empresa_id: 0, nombre: '', tipo: 'prueba', smtp_host: '', smtp_port: 465, smtp_user: '', smtp_password: '', smtp_from_name: '', formato_doc: 'a4_basico_logo_izq' })
    const [filterEmpresa, setFilterEmpresa] = useState<number | 0>(0)
    const [error, setError] = useState('')

    const fetchData = async () => {
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

    useEffect(() => { fetchData() }, [])

    const empresaName = (id: number) => empresas.find(e => e.id === id)?.nombre || '—'
    const filtered = filterEmpresa ? locales.filter(l => l.empresa_id === filterEmpresa) : locales

    const diasRestantes = (l: Local) => {
        if (l.tipo !== 'prueba' || !l.fecha_alta) return null
        const alta = new Date(l.fecha_alta)
        const diff = Math.ceil((alta.getTime() + 30 * 86400000 - Date.now()) / 86400000)
        return diff
    }

    const openNew = () => { setEditId(null); setForm({ empresa_id: empresas[0]?.id || 0, nombre: '', tipo: 'prueba', smtp_host: '', smtp_port: 465, smtp_user: '', smtp_password: '', smtp_from_name: '', formato_doc: 'a4_basico_logo_izq' }); setShowModal(true); setError('') }
    const openEdit = (l: Local) => { setEditId(l.id); setForm({ empresa_id: l.empresa_id, nombre: l.nombre, tipo: l.tipo, smtp_host: l.smtp_host || '', smtp_port: l.smtp_port || 465, smtp_user: l.smtp_user || '', smtp_password: '', smtp_from_name: l.smtp_from_name || '', formato_doc: l.formato_doc || 'a4_basico_logo_izq' }); setShowModal(true); setError('') }

    const save = async () => {
        setError('')
        try {
            const payload: Record<string, unknown> = { ...form }
            if (!payload.smtp_password) delete payload.smtp_password
            if (editId) {
                await api.put(`/api/admin/locales/${editId}`, payload)
            } else {
                await api.post('/api/admin/locales', payload)
            }
            setShowModal(false)
            fetchData()
        } catch (e: any) { setError(e.response?.data?.detail || 'Error guardando') }
    }

    const pasarDefinitiva = async (id: number) => {
        if (!confirm('¿Pasar este local a definitiva? Esta acción no se puede deshacer.')) return
        try { await api.patch(`/api/admin/locales/${id}/pasar-definitiva`); fetchData() }
        catch (e: any) { alert(e.response?.data?.detail || 'Error') }
    }

    const toggle = async (id: number) => { await api.patch(`/api/admin/locales/${id}/toggle`); fetchData() }
    const toggleAsistente = async (id: number) => {
        await api.patch(`/api/admin/locales/${id}/toggle-asistente`)
        fetchData()
        await refreshUser()
    }
    const togglePortal = async (id: number) => {
        await api.patch(`/api/admin/locales/${id}/toggle-portal`)
        fetchData()
    }

    // FRX upload
    const frxInputRef = useRef<HTMLInputElement>(null)
    const [frxUploadId, setFrxUploadId] = useState<number | null>(null)
    const [frxUploading, setFrxUploading] = useState(false)

    const uploadFrx = async (id: number, file: File) => {
        setFrxUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            await api.post(`/api/admin/locales/${id}/frx`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            fetchData()
        } catch (e: any) { alert(e.response?.data?.detail || 'Error subiendo FRX') }
        finally { setFrxUploading(false); setFrxUploadId(null) }
    }

    const deleteFrx = async (id: number) => {
        if (!confirm('¿Eliminar la plantilla FRX de este local? Se usará la predeterminada.')) return
        try { await api.delete(`/api/admin/locales/${id}/frx`); fetchData() }
        catch (e: any) { alert(e.response?.data?.detail || 'Error') }
    }
    const remove = async (id: number) => {
        if (!confirm('¿Eliminar este local?')) return
        try { await api.delete(`/api/admin/locales/${id}`); fetchData() }
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
                                <th className="py-2.5 px-3">Licencia</th>
                                <th className="py-2.5 px-3">F. Alta</th>
                                <th className="py-2.5 px-3">Estado</th>
                                <th className="py-2.5 px-3 text-center">Asistente IA</th>
                                {(isSuperadmin || isGerente) && <th className="py-2.5 px-3 text-center">Portal</th>}
                                {(isSuperadmin || isGerente) && <th className="py-2.5 px-3 text-center">Plantilla FRX</th>}
                                <th className="py-2.5 px-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(l => {
                                const dias = diasRestantes(l)
                                return (
                                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="py-2 px-3 text-slate-400">{l.id}</td>
                                    <td className="py-2 px-3 font-medium">{l.nombre}</td>
                                    <td className="py-2 px-3 text-slate-500">{empresaName(l.empresa_id)}</td>
                                    <td className="py-2 px-3">
                                        {l.tipo === 'prueba' ? (
                                            <span className={`badge ${dias !== null && dias <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {dias !== null && dias <= 0 ? 'Prueba caducada' : `Prueba (${dias}d)`}
                                            </span>
                                        ) : (
                                            <span className="badge bg-green-100 text-green-700">Definitiva</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3 text-slate-500 text-xs">
                                        {l.fecha_alta ? new Date(l.fecha_alta).toLocaleDateString('es-ES') : '—'}
                                    </td>
                                    <td className="py-2 px-3">
                                        <span className={`badge ${l.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {l.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <button
                                            onClick={() => toggleAsistente(l.id)}
                                            title={l.asistente_ia ? 'Desactivar Asistente IA' : 'Activar Asistente IA'}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                                l.asistente_ia
                                                    ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                            }`}
                                        >
                                            <Bot className="w-3 h-3" />
                                            {l.asistente_ia ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </td>
                                    {(isSuperadmin || isGerente) && (
                                    <td className="py-2 px-3 text-center">
                                        <button
                                            onClick={() => togglePortal(l.id)}
                                            title={l.portal_activo ? 'Desactivar Portal de Clientes' : 'Activar Portal de Clientes'}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                                l.portal_activo
                                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                            }`}
                                        >
                                            <Globe className="w-3 h-3" />
                                            {l.portal_activo ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </td>
                                    )}
                                    {(isSuperadmin || isGerente) && (
                                    <td className="py-2 px-3 text-center">
                                        <input
                                            ref={frxUploadId === l.id ? frxInputRef : undefined}
                                            type="file" accept=".frx" className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFrx(l.id, f); e.target.value = '' }}
                                        />
                                        <div className="flex items-center justify-center gap-1">
                                            {l.frx_factura ? (
                                                <>
                                                    <span className="text-xs text-green-700 flex items-center gap-0.5" title={l.frx_factura}>
                                                        <FileText className="w-3 h-3" /> Personalizada
                                                    </span>
                                                    <button onClick={() => deleteFrx(l.id)} title="Eliminar plantilla" className="p-0.5 hover:text-red-500"><XIcon className="w-3 h-3" /></button>
                                                </>
                                            ) : (
                                                <span className="text-xs text-slate-400">Por defecto</span>
                                            )}
                                            <button
                                                onClick={() => { setFrxUploadId(l.id); setTimeout(() => frxInputRef.current?.click(), 50) }}
                                                title="Subir plantilla .frx"
                                                disabled={frxUploading}
                                                className="p-0.5 hover:text-blue-600"
                                            >
                                                <Upload className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </td>
                                    )}
                                    <td className="py-2 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {isSuperadmin && l.tipo === 'prueba' && (
                                                <button onClick={() => pasarDefinitiva(l.id)} className="p-1.5 rounded hover:bg-green-50" title="Pasar a Definitiva">
                                                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                                </button>
                                            )}
                                            <button onClick={() => openEdit(l)} className="p-1.5 rounded hover:bg-slate-100" title="Editar"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => toggle(l.id)} className="p-1.5 rounded hover:bg-slate-100" title="Activar/Desactivar"><Power className="w-3.5 h-3.5 text-slate-500" /></button>
                                            <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-red-50" title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                        </div>
                                    </td>
                                </tr>
                                )
                            })}
                            {filtered.length === 0 && (
                                <tr><td colSpan={8} className="py-8 text-center text-slate-400">No hay locales</td></tr>
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
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                                <select className="input" value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: +e.target.value })}>
                                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de licencia</label>
                                <select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                                    <option value="prueba">Prueba (30 días)</option>
                                    <option value="definitiva">Definitiva</option>
                                </select>
                            </div>
                        </div>

                        {/* Sección SMTP */}
                        <hr className="border-slate-200 mt-4" />
                        <div className="mt-3">
                            <p className="text-xs text-slate-500 font-medium mb-2">Configuración de email (SMTP)</p>
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs text-slate-500 mb-1">Servidor SMTP</label>
                                        <input className="input" value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.ionos.es" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Puerto</label>
                                        <input className="input" type="number" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: +e.target.value })} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Usuario (from)</label>
                                        <input className="input" value={form.smtp_user} onChange={e => setForm({ ...form, smtp_user: e.target.value })} placeholder="correo@empresa.com" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Nombre remitente</label>
                                        <input className="input" value={form.smtp_from_name} onChange={e => setForm({ ...form, smtp_from_name: e.target.value })} placeholder="Mi Empresa" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Contraseña SMTP {editId && '(dejar vacío para no cambiar)'}</label>
                                    <input className="input" type="password" value={form.smtp_password} onChange={e => setForm({ ...form, smtp_password: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* Formato de documentos */}
                        <hr className="border-slate-200 mt-4" />
                        <div className="mt-3">
                            <p className="text-xs text-slate-500 font-medium mb-2">Formato de documentos para email</p>
                            <select className="input" value={form.formato_doc} onChange={e => setForm({ ...form, formato_doc: e.target.value })}>
                                <option value="a4_basico_logo_izq">A4 básico logo izquierda</option>
                            </select>
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
