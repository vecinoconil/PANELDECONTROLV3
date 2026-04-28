import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasPermiso } from '../types'
import {
    LayoutDashboard, Users2,
    Building2, MapPin, Users, LogOut, BarChart3, BookText, ShoppingCart, X
} from 'lucide-react'

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
    const { user, logout } = useAuth()

    const can = (key: string, action: 'ver' | 'entrar' = 'ver') => {
        if (!user) return false
        if (user.rol === 'superadmin') return true
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
                        <span className="text-white font-bold text-lg whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/sb:opacity-100 transition-opacity duration-300">SOLBA PANEL V3</span>
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

                {/* Navigation */}
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

                {/* Administración */}
                {showAdmin && (
                    <div>
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

