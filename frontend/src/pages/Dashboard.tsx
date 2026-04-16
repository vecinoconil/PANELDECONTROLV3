import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'
import { LayoutDashboard, LogOut } from 'lucide-react'

export default function Dashboard() {
    const { user, logout } = useAuth()
    const [summary, setSummary] = useState<any>(null)

    useEffect(() => {
        api.get('/api/dashboard/summary')
            .then(({ data }) => setSummary(data))
            .catch(() => {})
    }, [])

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <LayoutDashboard className="w-6 h-6 text-brand" />
                    <h1 className="text-lg font-semibold">Panel de Gestión V3</h1>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-600">{user?.nombre}</span>
                    <button onClick={logout} className="btn-ghost flex items-center gap-1">
                        <LogOut className="w-4 h-4" />
                        Salir
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="p-6 max-w-7xl mx-auto">
                <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

                {summary ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="card">
                            <p className="text-sm text-slate-500">Total Items</p>
                            <p className="text-3xl font-bold">{summary.stats.total_items}</p>
                        </div>
                        <div className="card">
                            <p className="text-sm text-slate-500">Pendientes</p>
                            <p className="text-3xl font-bold text-amber-600">{summary.stats.pending}</p>
                        </div>
                        <div className="card">
                            <p className="text-sm text-slate-500">Completados</p>
                            <p className="text-3xl font-bold text-green-600">{summary.stats.completed}</p>
                        </div>
                    </div>
                ) : (
                    <div className="card text-center text-slate-400 py-12">
                        Cargando...
                    </div>
                )}

                <div className="card mt-6 text-center text-slate-400 py-12">
                    <p className="text-lg">¡Bienvenido al Panel de Gestión V3!</p>
                    <p className="text-sm mt-2">Este es el punto de partida. Añade tus módulos aquí.</p>
                </div>
            </main>
        </div>
    )
}
