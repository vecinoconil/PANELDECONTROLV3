import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import {
    Database, Server, ChevronDown, ChevronRight, Plus, Loader2,
    AlertCircle, Check, Eye, EyeOff, Users, ShieldCheck, RefreshCw, X, Trash2, Wrench, ArrowDownCircle, Search,
} from 'lucide-react'

interface ServerConfig {
    pg_host: string
    pg_port: number
    pg_user: string
    pg_password: string
}

interface DbInfo {
    datname: string
    owner: string
    encoding: string
    collate: string
}

interface RoleInfo {
    rolname: string
    superuser: boolean
    can_login: boolean
    replication: boolean
    create_role: boolean
    create_db: boolean
    bypass_rls: boolean
    conn_limit: number
    member_of: string[]
    db_acl?: string | null
}

const LS_KEY = 'basedatos_server_config'

function parseRoleDbPriv(dbAcl: string | null | undefined, rolname: string, isSuperuser: boolean) {
    if (isSuperuser) return { connect: true, create: true, temp: true }
    if (!dbAcl) return { connect: false, create: false, temp: false }
    const raw = dbAcl.replace(/^\{|\}$/g, '')
    for (const part of raw.split(',')) {
        const m = part.match(/^"?([^=]*)"?=([CTc]*)\//);
        if (m && m[1] === rolname) {
            const p = m[2]
            return { connect: p.includes('c'), create: p.includes('C'), temp: p.includes('T') }
        }
    }
    return { connect: false, create: false, temp: false }
}

export default function BasesDatos() {
    // Server config form — init from localStorage
    const _saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} } })()
    const [host, setHost] = useState<string>(_saved.pg_host || '')
    const [port, setPort] = useState<string>(String(_saved.pg_port || '5432'))
    const [pgUser, setPgUser] = useState<string>(_saved.pg_user || '')
    const [pgPass, setPgPass] = useState<string>(_saved.pg_password || '')
    const [showPass, setShowPass] = useState(false)

    // State
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [databases, setDatabases] = useState<DbInfo[] | null>(null)

    // Expanded DB → users
    const [expandedDb, setExpandedDb] = useState<string | null>(null)
    const [loadingUsers, setLoadingUsers] = useState(false)
    const [usersMap, setUsersMap] = useState<Record<string, RoleInfo[]>>({})
    const [usersError, setUsersError] = useState('')

    // Create user modal
    const [createModal, setCreateModal] = useState<string | null>(null) // dbname
    const [newUsername, setNewUsername] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [showNewPass, setShowNewPass] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [createSuccess, setCreateSuccess] = useState('')

    // Delete user confirm
    const [deleteConfirm, setDeleteConfirm] = useState<{ dbname: string; rolname: string } | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')

    // Repair permissions
    const [repairing, setRepairing] = useState<string | null>(null) // rolname
    const [repairMsg, setRepairMsg] = useState<{ rolname: string; msg: string; ok: boolean } | null>(null)

    // Búsqueda de BDs
    const [dbSearch, setDbSearch] = useState('')

    // Degradar DB version
    const [degradarModal, setDegradarModal] = useState<string | null>(null) // dbname
    const [dbVersion, setDbVersion] = useState('')
    const [dbVersionLoading, setDbVersionLoading] = useState(false)
    const [dbVersionSaving, setDbVersionSaving] = useState(false)
    const [dbVersionError, setDbVersionError] = useState('')
    const [dbVersionSuccess, setDbVersionSuccess] = useState('')

    const serverConfig: ServerConfig = {
        pg_host: host,
        pg_port: Number(port) || 5432,
        pg_user: pgUser,
        pg_password: pgPass,
    }

    const loadDatabases = async (cfg?: ServerConfig) => {
        const c = cfg ?? serverConfig
        if (!c.pg_host || !c.pg_user || !c.pg_password) {
            setError('Completa host, usuario y contraseña')
            return
        }
        setLoading(true)
        setError('')
        setDatabases(null)
        setExpandedDb(null)
        setUsersMap({})
        try {
            const r = await api.post<DbInfo[]>('/api/admin/pgserver/databases', c)
            setDatabases(r.data)
            // Guardar config en localStorage
            localStorage.setItem(LS_KEY, JSON.stringify({
                pg_host: c.pg_host,
                pg_port: c.pg_port,
                pg_user: c.pg_user,
                pg_password: c.pg_password,
            }))
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Error conectando al servidor')
        } finally {
            setLoading(false)
        }
    }

    // Auto-connect on mount if config was saved
    useEffect(() => {
        if (_saved.pg_host && _saved.pg_user && _saved.pg_password) {
            loadDatabases({
                pg_host: _saved.pg_host,
                pg_port: Number(_saved.pg_port) || 5432,
                pg_user: _saved.pg_user,
                pg_password: _saved.pg_password,
            })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const toggleDb = async (dbname: string) => {
        if (expandedDb === dbname) {
            setExpandedDb(null)
            return
        }
        setExpandedDb(dbname)
        if (usersMap[dbname]) return // ya cargado
        setLoadingUsers(true)
        setUsersError('')
        try {
            const r = await api.post<RoleInfo[]>(`/api/admin/pgserver/${encodeURIComponent(dbname)}/users`, serverConfig)
            setUsersMap(prev => ({ ...prev, [dbname]: r.data }))
        } catch (e: any) {
            setUsersError(e.response?.data?.detail || 'Error cargando usuarios')
        } finally {
            setLoadingUsers(false)
        }
    }

    const refreshUsers = async (dbname: string) => {
        setLoadingUsers(true)
        setUsersError('')
        try {
            const r = await api.post<RoleInfo[]>(`/api/admin/pgserver/${encodeURIComponent(dbname)}/users`, serverConfig)
            setUsersMap(prev => ({ ...prev, [dbname]: r.data }))
        } catch (e: any) {
            setUsersError(e.response?.data?.detail || 'Error recargando usuarios')
        } finally {
            setLoadingUsers(false)
        }
    }

    const handleDeleteUser = async () => {
        if (!deleteConfirm) return
        setDeleting(true)
        setDeleteError('')
        try {
            await api.post('/api/admin/pgserver/delete-user', {
                ...serverConfig,
                username: deleteConfirm.rolname,
            })
            setDeleteConfirm(null)
            // Refrescar lista de usuarios
            const db = deleteConfirm.dbname
            setUsersMap(prev => { const n = { ...prev }; delete n[db]; return n })
            await refreshUsers(db)
        } catch (e: any) {
            setDeleteError(e.response?.data?.detail || 'Error eliminando usuario')
        } finally {
            setDeleting(false)
        }
    }

    const handleRepairUser = async (dbname: string, rolname: string) => {
        setRepairing(rolname)
        setRepairMsg(null)
        try {
            const r = await api.post<{ ok: boolean; message: string }>('/api/admin/pgserver/repair-user', {
                ...serverConfig,
                username: rolname,
                dbname,
            })
            setRepairMsg({ rolname, msg: r.data.message, ok: true })
        } catch (e: any) {
            setRepairMsg({ rolname, msg: e.response?.data?.detail || 'Error reparando permisos', ok: false })
        } finally {
            setRepairing(null)
        }
    }

    const openDegradarModal = async (dbname: string) => {
        setDegradarModal(dbname)
        setDbVersion('')
        setDbVersionError('')
        setDbVersionSuccess('')
        setDbVersionLoading(true)
        try {
            const r = await api.post<{ version: string }>(
                `/api/admin/pgserver/${encodeURIComponent(dbname)}/get-db-version`,
                serverConfig
            )
            setDbVersion(r.data.version)
        } catch (e: any) {
            setDbVersionError(e.response?.data?.detail || 'Error leyendo db_version')
        } finally {
            setDbVersionLoading(false)
        }
    }

    const handleSaveDbVersion = async () => {
        if (!degradarModal) return
        if (!dbVersion.trim()) { setDbVersionError('La versión no puede estar vacía'); return }
        setDbVersionSaving(true)
        setDbVersionError('')
        setDbVersionSuccess('')
        try {
            const r = await api.post<{ ok: boolean; version: string }>(
                `/api/admin/pgserver/${encodeURIComponent(degradarModal)}/set-db-version`,
                { ...serverConfig, new_version: dbVersion.trim() }
            )
            setDbVersionSuccess(`Versión actualizada a: ${r.data.version}`)
        } catch (e: any) {
            setDbVersionError(e.response?.data?.detail || 'Error guardando versión')
        } finally {
            setDbVersionSaving(false)
        }
    }

    const openCreateModal = (dbname: string) => {
        setCreateModal(dbname)
        setNewUsername('')
        setNewPassword('')
        setCreateError('')
        setCreateSuccess('')
    }

    const handleCreateUser = async () => {
        if (!createModal) return
        if (!newUsername.trim()) { setCreateError('Introduce un nombre de usuario'); return }
        if (newPassword.length < 8) { setCreateError('La contraseña debe tener al menos 8 caracteres'); return }
        setCreating(true)
        setCreateError('')
        setCreateSuccess('')
        try {
            const r = await api.post<{ ok: boolean; message: string }>(
                `/api/admin/pgserver/${encodeURIComponent(createModal)}/create-user`,
                {
                    ...serverConfig,
                    new_username: newUsername.trim(),
                    new_password: newPassword,
                }
            )
            setCreateSuccess(r.data.message)
            // Refrescar la lista de usuarios de esa BD
            delete usersMap[createModal]
            setUsersMap({ ...usersMap })
            await refreshUsers(createModal)
        } catch (e: any) {
            setCreateError(e.response?.data?.detail || 'Error creando usuario')
        } finally {
            setCreating(false)
        }
    }

    const badgeAttr = (label: string, active: boolean, color = 'blue') => {
        if (!active) return null
        const colors: Record<string, string> = {
            blue: 'bg-blue-100 text-blue-700',
            red: 'bg-red-100 text-red-700',
            amber: 'bg-amber-100 text-amber-700',
            green: 'bg-green-100 text-green-700',
            purple: 'bg-purple-100 text-purple-700',
        }
        return (
            <span key={label} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[color] || colors.blue}`}>
                {label}
            </span>
        )
    }

    return (
        <div className="p-4 w-full max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-brand" />
                <h1 className="text-xl font-bold text-slate-800">Bases de Datos</h1>
            </div>

            {/* Configuración servidor */}
            <div className="card p-4">
                <p className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4" /> Configuración del servidor PostgreSQL
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="col-span-2 sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Host</label>
                        <input
                            type="text"
                            className="input text-sm"
                            placeholder="192.168.1.1 o mi.servidor.com"
                            value={host}
                            onChange={e => setHost(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Puerto</label>
                        <input
                            type="number"
                            className="input text-sm"
                            placeholder="5432"
                            value={port}
                            onChange={e => setPort(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Usuario</label>
                        <input
                            type="text"
                            className="input text-sm"
                            placeholder="postgres"
                            value={pgUser}
                            onChange={e => setPgUser(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña</label>
                        <div className="relative">
                            <input
                                type={showPass ? 'text' : 'password'}
                                className="input text-sm pr-8"
                                placeholder="••••••••"
                                value={pgPass}
                                onChange={e => setPgPass(e.target.value)}
                                autoComplete="new-password"
                                onKeyDown={e => { if (e.key === 'Enter') loadDatabases() }}
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                                onClick={() => setShowPass(v => !v)}
                            >
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
                {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm mb-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                    </div>
                )}
                <button
                    onClick={() => loadDatabases()}
                    disabled={loading}
                    className="btn-primary flex items-center gap-2"
                >
                    {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</>
                        : <><Database className="w-4 h-4" /> Conectar y listar BDs</>
                    }
                </button>
            </div>

            {/* Lista de bases de datos */}
            {databases && (
                <div className="card overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-700 flex-shrink-0">
                            {databases.filter(d => d.datname.toLowerCase().includes(dbSearch.toLowerCase())).length}
                            /{databases.length} BD
                        </p>
                        <div className="relative flex-1 max-w-xs">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                            <input
                                type="text"
                                className="input text-xs pl-7 py-1.5"
                                placeholder="Buscar base de datos..."
                                value={dbSearch}
                                onChange={e => setDbSearch(e.target.value)}
                            />
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0">{host}:{port}</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {databases.filter(d => d.datname.toLowerCase().includes(dbSearch.toLowerCase())).map(db => (
                            <div key={db.datname}>
                                {/* Fila BD */}
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                                    onClick={() => toggleDb(db.datname)}
                                >
                                    <Database className="w-4 h-4 text-brand flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-800">{db.datname}</span>
                                            <span className="text-[10px] text-slate-400 font-mono">{db.encoding}</span>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            owner: <span className="font-medium">{db.owner}</span>
                                            <span className="mx-1.5 text-slate-300">·</span>
                                            {db.encoding}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={e => { e.stopPropagation(); openCreateModal(db.datname) }}
                                            className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-2.5 py-1 rounded-lg"
                                            title="Crear nuevo usuario en esta BD"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Nuevo usuario
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); openDegradarModal(db.datname) }}
                                            className="flex items-center gap-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-1 rounded-lg"
                                            title="Ver y editar versión de la BD"
                                        >
                                            <ArrowDownCircle className="w-3.5 h-3.5" /> Degradar
                                        </button>
                                        {expandedDb === db.datname
                                            ? <ChevronDown className="w-4 h-4 text-slate-400" />
                                            : <ChevronRight className="w-4 h-4 text-slate-400" />
                                        }
                                    </div>
                                </button>

                                {/* Usuarios de la BD */}
                                {expandedDb === db.datname && (
                                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                                                <Users className="w-3.5 h-3.5" /> Roles y usuarios
                                            </p>
                                            <button
                                                onClick={() => refreshUsers(db.datname)}
                                                disabled={loadingUsers}
                                                className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                                                title="Recargar"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                        {loadingUsers && !usersMap[db.datname] ? (
                                            <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                                            </div>
                                        ) : usersError ? (
                                            <p className="text-red-500 text-xs flex items-center gap-1">
                                                <AlertCircle className="w-3.5 h-3.5" /> {usersError}
                                            </p>
                                        ) : (usersMap[db.datname] || []).length === 0 ? (
                                            <p className="text-slate-400 text-xs text-center py-3">Sin roles</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {(usersMap[db.datname] || []).map(role => (
                                                    <div
                                                        key={role.rolname}
                                                        className="flex items-start gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-sm font-semibold text-slate-800">{role.rolname}</span>
                                                                {!role.can_login && (
                                                                    <span className="text-[10px] text-slate-400 italic">grupo</span>
                                                                )}
                                                                {badgeAttr('SUPERUSER', role.superuser, 'red')}
                                                                {badgeAttr('LOGIN', role.can_login, 'green')}
                                                                {badgeAttr('REPLICATION', role.replication, 'purple')}
                                                                {badgeAttr('CREATEROLE', role.create_role, 'amber')}
                                                                {badgeAttr('CREATEDB', role.create_db, 'amber')}
                                                                {badgeAttr('BYPASSRLS', role.bypass_rls, 'amber')}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                {(() => {
                                                                    const priv = parseRoleDbPriv(role.db_acl, role.rolname, role.superuser)
                                                                    return (<>
                                                                        <span className={`text-[10px] font-mono ${priv.connect ? 'text-green-600' : 'text-slate-300'}`}>
                                                                            {priv.connect ? '✓' : '✗'} CONNECT
                                                                        </span>
                                                                        <span className={`text-[10px] font-mono ${priv.create ? 'text-green-600' : 'text-slate-300'}`}>
                                                                            {priv.create ? '✓' : '✗'} CREATE
                                                                        </span>
                                                                        <span className={`text-[10px] font-mono ${priv.temp ? 'text-green-600' : 'text-slate-300'}`}>
                                                                            {priv.temp ? '✓' : '✗'} TEMP
                                                                        </span>
                                                                    </>)
                                                                })()}
                                                                {role.member_of.length > 0 && (
                                                                    <span className="text-[10px] text-slate-500">
                                                                        miembro de: {role.member_of.join(', ')}
                                                                    </span>
                                                                )}
                                                                {repairMsg?.rolname === role.rolname && (
                                                                    <span className={`text-[10px] font-medium ${repairMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                                                                        {repairMsg.ok ? '✓' : '✗'} {repairMsg.msg}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            {role.can_login && (
                                                                <ShieldCheck className="w-4 h-4 text-green-500" />
                                                            )}
                                                            {!role.superuser && (<>
                                                                <button
                                                                    onClick={() => handleRepairUser(db.datname, role.rolname)}
                                                                    disabled={repairing === role.rolname}
                                                                    className="p-1 rounded hover:bg-amber-50 text-slate-300 hover:text-amber-500 transition-colors"
                                                                    title="Reparar permisos (pg_dump, backup)"
                                                                >
                                                                    {repairing === role.rolname
                                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                                                        : <Wrench className="w-3.5 h-3.5" />}
                                                                </button>
                                                                <button
                                                                    onClick={() => { setDeleteConfirm({ dbname: db.datname, rolname: role.rolname }); setDeleteError('') }}
                                                                    className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                                                                    title="Eliminar usuario"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal crear usuario */}
            {createModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <div>
                                <h2 className="text-base font-bold text-slate-800">Crear usuario</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    BD: <span className="font-semibold text-brand">{createModal}</span>
                                </p>
                            </div>
                            <button onClick={() => setCreateModal(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Info de permisos */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                                <p className="font-semibold">El usuario se creará con:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                                    <li>LOGIN + REPLICATION (pg_dump / backups)</li>
                                    <li>ALL PRIVILEGES ON DATABASE</li>
                                    <li>ALL en tablas, secuencias, funciones (schema public)</li>
                                    <li>DEFAULT PRIVILEGES para objetos futuros</li>
                                    <li>Acceso a ficheros del servidor (COPY)</li>
                                </ul>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre de usuario</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="panel_user"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    autoComplete="off"
                                />
                                <p className="text-[10px] text-slate-400 mt-0.5">Solo letras, números y guión bajo</p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña</label>
                                <div className="relative">
                                    <input
                                        type={showNewPass ? 'text' : 'password'}
                                        className="input pr-8"
                                        placeholder="Mínimo 8 caracteres"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreateUser() }}
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                                        onClick={() => setShowNewPass(v => !v)}
                                    >
                                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {createError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {createError}
                                </div>
                            )}
                            {createSuccess && (
                                <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                    <Check className="w-4 h-4 flex-shrink-0" /> {createSuccess}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => setCreateModal(null)}
                                    className="flex-1 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                                >
                                    Cerrar
                                </button>
                                {!createSuccess && (
                                    <button
                                        onClick={handleCreateUser}
                                        disabled={creating}
                                        className="flex-1 btn-primary flex items-center justify-center gap-2"
                                    >
                                        {creating
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</>
                                            : <><Plus className="w-4 h-4" /> Crear usuario</>
                                        }
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal confirmar borrado de usuario */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <Trash2 className="w-4 h-4 text-red-500" /> Eliminar usuario
                            </h2>
                            <button onClick={() => setDeleteConfirm(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-slate-700">
                                ¿Seguro que quieres eliminar el usuario{' '}
                                <span className="font-bold text-red-600">{deleteConfirm.rolname}</span>?
                            </p>
                            <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Se revocarán todos sus privilegios y se eliminará el rol del servidor.
                                Si posee objetos en alguna BD la operación fallará.
                            </p>
                            {deleteError && (
                                <div className="flex items-start gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {deleteError}
                                </div>
                            )}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={deleting}
                                    className="flex-1 py-2.5 text-sm rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {deleting
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Eliminando...</>
                                        : <><Trash2 className="w-4 h-4" /> Eliminar</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Degradar — editar db_version */}
            {degradarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <div>
                                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <ArrowDownCircle className="w-4 h-4 text-amber-500" /> Degradar versión
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    BD: <span className="font-semibold text-brand">{degradarModal}</span>
                                </p>
                            </div>
                            <button onClick={() => setDegradarModal(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {dbVersionLoading ? (
                                <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Leyendo versión...
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Versión (tabla <span className="font-mono">db_version</span>)
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="ej: 1.0.0"
                                        value={dbVersion}
                                        onChange={e => { setDbVersion(e.target.value); setDbVersionError(''); setDbVersionSuccess('') }}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveDbVersion() }}
                                        autoFocus
                                    />
                                </div>
                            )}

                            {dbVersionError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {dbVersionError}
                                </div>
                            )}
                            {dbVersionSuccess && (
                                <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                    <Check className="w-4 h-4 flex-shrink-0" /> {dbVersionSuccess}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => setDegradarModal(null)}
                                    className="flex-1 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                                >
                                    Cerrar
                                </button>
                                {!dbVersionLoading && (
                                    <button
                                        onClick={handleSaveDbVersion}
                                        disabled={dbVersionSaving}
                                        className="flex-1 py-2.5 text-sm rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {dbVersionSaving
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                                            : <><Check className="w-4 h-4" /> Guardar versión</>
                                        }
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
