import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
    return (
        <div className="min-h-screen bg-slate-100">
            <Sidebar />
            <main className="ml-16">
                <Outlet />
            </main>
        </div>
    )
}
