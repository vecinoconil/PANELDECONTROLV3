import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { hasPermiso } from '../types'

interface ProtectedRouteProps {
    requiredPermission?: string
    action?: 'ver' | 'entrar'
}

export default function ProtectedRoute({ requiredPermission, action = 'entrar' }: ProtectedRouteProps = {}) {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100">
                <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />

    if (requiredPermission && user.rol !== 'superadmin') {
        let ok: boolean
        if (user.rol === 'gerente') {
            // Gerente: acceso completo si no tiene permisos configurados;
            // si tiene alguno definido, se comprueba estrictamente.
            const hasAnyPermiso = Object.keys(user.permisos || {}).length > 0
            if (!hasAnyPermiso) {
                ok = true
            } else {
                const p = user.permisos[requiredPermission]
                ok = p !== undefined && (action === 'ver' ? !!p.ver : !!p.entrar)
            }
        } else {
            ok = hasPermiso(user.permisos, requiredPermission, action)
        }
        if (!ok) return <Navigate to="/dashboard" replace />
    }

    return <Outlet />
}
