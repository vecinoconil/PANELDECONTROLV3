import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
    LayoutDashboard, Users2,
    Building2, MapPin, Users, LogOut, BarChart3, BookText, ShoppingCart
} from 'lucide-react'

const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
        ? 'bg-brand text-white font-medium'
        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
    }`

export default function Sidebar() {
    const { user, logout } = useAuth()

    const showAdmin = user?.rol === 'superadmin' || user?.rol === 'gerente'

    const hasPerm = (key: string) => {
        if (!user) return false
        if (user.rol === 'superadmin' || user.rol === 'gerente') return true
        return (user.permisos || []).includes(key)
    }

    return (
        <aside className="group/sb fixed inset-y-0 left-0 w-16 hover:w-60 bg-sidebar flex flex-col z-50 transition-all duration-300 overflow-hidden">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10 min-w-[15rem]">
                <BarChart3 className="w-7 h-7 text-brand-light flex-shrink-0" />
                <span className="text-white font-bold text-lg whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">SOLBA PANEL V3</span>
            </div>

            {/* User info */}
            <div className="px-4 py-3 border-b border-white/10 min-w-[15rem]">
                <p className="text-white text-sm font-semibold truncate opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">{user?.nombre}</p>
                <p className="text-sidebar-text text-xs truncate opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">{user?.email}</p>
                {user?.empresa_nombre && (
                    <p className="text-sidebar-text text-xs truncate opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300 mt-0.5">
                        {user.empresa_nombre}
                    </p>
                )}
                <span className="mt-1 inline-block bg-brand text-white text-[10px] font-semibold px-2 py-0.5 rounded-full opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">
                    {user?.rol}
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 min-w-[15rem]">
                {/* Principal */}
                {hasPerm('dashboard') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">
                            Principal
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/dashboard" className={linkClass}>
                                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">Dashboard</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Informes */}
                {hasPerm('comparativa_ventas') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">
                            Informes
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/informes/comparativa-ventas" className={linkClass}>
                                <Users2 className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">Comparativa Ventas</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Contabilidad */}
                {hasPerm('contabilidad') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">
                            Contabilidad
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/contabilidad/libro-iva" className={linkClass}>
                                <BookText className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">Contabilidad</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Autoventa */}
                {hasPerm('autoventa') && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">
                            Autoventa
                        </h3>
                        <div className="space-y-0.5">
                            <NavLink to="/autoventa" className={linkClass}>
                                <ShoppingCart className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">Autoventa</span>
                            </NavLink>
                        </div>
                    </div>
                )}

                {/* Administración */}
                {showAdmin && (
                    <div>
                        <h3 className="text-sidebar-heading text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">
                            Administración
                        </h3>
                        <div className="space-y-0.5">
                            {[
                                { to: '/admin/empresas', label: 'Empresas', icon: Building2 },
                                { to: '/admin/locales',  label: 'Locales',  icon: MapPin },
                                { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
                            ].map(item => (
                                <NavLink key={item.to} to={item.to} className={linkClass}>
                                    <item.icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* Logout */}
            <div className="px-3 py-3 border-t border-white/10 min-w-[15rem]">
                <button
                    onClick={logout}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors w-full"
                >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-300">Cerrar sesión</span>
                </button>
            </div>
        </aside>
    )
}
