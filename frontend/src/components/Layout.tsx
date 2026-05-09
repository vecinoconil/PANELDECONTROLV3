import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

declare const __BUILD_TIME__: string

export default function Layout() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <div className="min-h-screen bg-slate-100">
            <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-sidebar border-b border-white/10 flex items-center px-4">
                <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="p-2 rounded-md text-white hover:bg-sidebar-hover"
                    aria-label="Abrir menu"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <div className="ml-3">
                    <span className="text-sm font-semibold text-white">SOLBA PANEL V3</span>
                    <p className="text-white/50 text-[10px] leading-tight">
                        Build: {new Date(__BUILD_TIME__).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </p>
                </div>
            </header>

            <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

            <main className="lg:ml-16 pt-14 lg:pt-0">
                <Outlet />
            </main>
        </div>
    )
}

