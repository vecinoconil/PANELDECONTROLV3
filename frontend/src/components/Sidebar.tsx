import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasPermiso } from '../types'
import {
    LayoutDashboard, Users2,
    Building2, MapPin, Users, LogOut, BarChart3, BookText, ShoppingCart, Package, Package2, Truck, ClipboardList, X, FileText, MonitorCheck, Database
} from 'lucide-react'

declare const __BUILD_TIME__: string

const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
        ? 'bg-brand text-white font-medium'
        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
    }`

type SidebarProps = {
    mobileOpen: boolean
    onClose: () => void
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
    const { user, logout, selectedLocal, setSelectedLocal } = useAuth()

    const can = (key: string, action: 'ver' | 'entrar' = 'ver') => {
        if (!user) return false
        if (user.rol === 'superadmin') return true
        // Gerente: acceso completo si no tiene permisos configurados;
        // si tiene al menos un permiso definido, se comprueba estrictamente.
        if (user.rol === 'gerente') {
            const hasAnyPermiso = Object.keys(user.permisos || {}).length > 0
            if (!hasAnyPermiso) return true
            const p = user.permisos[key]
            if (p === undefined) return false
            return action === 'ver' ? !!p.ver : !!p.entrar
        }
        return hasPermiso(user.permisos, key, action)
    }

    const showAdmin = can('admin_empresas', 'ver') || can('admin_locales', 'ver') || can('admin_usuarios', 'ver')

    return (
        <>
            {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={onClose} />}

            <aside className={`group/sb fixed inset-y-0 left-0 bg-sidebar flex flex-col z-50 transition-all duration-300 overflow-hidden w-64 lg:w-16 lg:hover:w-60 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
                {/* Logo */}
                <div className="flex items-center justify-between gap-2.5 px-4 py-4 border-b border-white/10 min-w-[15rem]">
                    <div className="flex items-center gap-2.5">
                        <BarChart3 className="w-7 h-7 text-brand-light flex-shrink-0" />
                        <div className="opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            <span className="text-white font-bold text-lg whitespace-nowrap">SOLBA PANEL V3</span>
                            <p className="text-sidebar-text text-[10px] leading-tight">
                                Build: {new Date(__BUILD_TIME__).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="lg:hidden p-1.5 rounded-md text-white hover:bg-sidebar-hover" aria-label="Cerrar menu">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* User info */}
                <div className="px-4 py-3 border-b border-white/10 min-w-[15rem]">
                    <p className="text-white text-sm font-semibold truncate opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">{user?.nombre}</p>
                    <p className="text-sidebar-text text-xs truncate opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">{user?.email}</p>
                    {user?.empresa_nombre && (
                        <p className="text-sidebar-text text-xs truncate opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300 mt-0.5">
                            {user.empresa_nombre}
                        </p>
                    )}
                    <span className="mt-1 inline-block bg-brand text-white text-[10px] font-semibold px-2 py-0.5 rounded-full opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                        {user?.rol}
                    </span>
                </div>

                {/* Selector de local (solo si hay más de uno) */}
                {user && user.locales && user.locales.length > 1 && (
                    <div className="px-4 py-2 border-b border-white/10 min-w-[15rem] opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                        <label className="block text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider mb-1">
                            Local activo
                        </label>
                        <select
                            value={selectedLocal?.id ?? ''}
                            onChange={e => {
                                const local = user.locales.find(l => l.id === Number(e.target.value))
                                if (local) {
                                    setSelectedLocal(local)
                                    window.location.reload()
                                }
                            }}
                            className="w-full bg-sidebar-hover text-white text-xs rounded px-2 py-1.5 border border-white/20 focus:outline-none focus:border-brand-light cursor-pointer"
                        >
                            {user.locales.map(l => (
                                <option key={l.id} value={l.id}>{l.nombre}</option>
                            ))}
                        </select>
                    </div>
                )}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 min-w-[15rem]">
                {/* Principal */}
                {can('dashboard', 'ver') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Principal
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Dashboard</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Informes */}
                {can('comparativa_ventas', 'ver') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Informes
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/informes/comparativa-ventas" className={linkClass} onClick={onClose}>
                                <Users2 className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Comparativa Ventas</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Contabilidad */}
                {can('contabilidad', 'ver') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Contabilidad
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/contabilidad/libro-iva" className={linkClass} onClick={onClose}>
                                <BookText className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Contabilidad</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Autoventa */}
                {can('autoventa', 'ver') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Autoventa
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/autoventa" className={linkClass} onClick={onClose}>
                                <ShoppingCart className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Autoventa</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Almacén */}
                {(can('expediciones', 'ver') || can('hojas_carga', 'ver') || can('reparto', 'ver') || can('recepcion_pedidos', 'ver') || can('inventario', 'ver')) && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Almacén
                        </h3>
                        <div className="space-y-0.5">
                            {can('expediciones', 'ver') && (
                                <NavLink to="/almacen/expediciones" className={linkClass} onClick={onClose}>
                                    <Truck className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Expediciones</span>
                                </NavLink>
                            )}
                            {can('hojas_carga', 'ver') && (
                                <NavLink to="/almacen/hojas-carga" className={linkClass} onClick={onClose}>
                                    <FileText className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Hojas de Carga</span>
                                </NavLink>
                            )}
                            {can('reparto', 'ver') && (
                                <NavLink to="/almacen/reparto" className={linkClass} onClick={onClose}>
                                    <Package className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Reparto</span>
                                </NavLink>
                            )}
                            {can('recepcion_pedidos', 'ver') && (
                                <NavLink to="/almacen/recepcion-pedidos" className={linkClass} onClick={onClose}>
                                    <ClipboardList className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Recepción de Pedidos</span>
                                </NavLink>
                            )}
                            {can('inventario', 'ver') && (
                                <NavLink to="/almacen/inventarios" className={linkClass} onClick={onClose}>
                                    <Package2 className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Inventarios</span>
                                </NavLink>
                            )}
                        </div>
                    </div>
                )}

                {/* Contratos */}
                {can('contratos', 'ver') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Contratos
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/contratos" className={linkClass} onClick={onClose}>
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Gestión Contratos</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Seguimiento Locales – solo superadmin */}
                {user?.rol === 'superadmin' && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Control
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/seguimiento-locales" className={linkClass} onClick={onClose}>
                                <MonitorCheck className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Seguimiento Locales</span>
                            </NavLink>
                            <NavLink to="/admin/bases-datos" className={linkClass} onClick={onClose}>
                                <Database className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Bases de Datos</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Administración */}
                {showAdmin && (                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">
                            Administración
                        </h3>
                        <div className="space-y-0.5">
                            {[
                                { to: '/admin/empresas', label: 'Empresas', icon: Building2, key: 'admin_empresas' },
                                { to: '/admin/locales', label: 'Locales', icon: MapPin, key: 'admin_locales' },
                                { to: '/admin/usuarios', label: 'Usuarios', icon: Users, key: 'admin_usuarios' },
                            ].filter(item => can(item.key, 'ver')).map(item => (
                                <NavLink key={item.to} to={item.to} className={linkClass} onClick={onClose}>
                                    <item.icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    </div>
                )}
                </nav>

                {/* Logout */}
                <div className="px-3 py-3 border-t border-white/10 min-w-[15rem]">
                    <button
                        onClick={() => {
                            onClose()
                            logout()
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors w-full"
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0" />
                        <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">Cerrar sesión</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

