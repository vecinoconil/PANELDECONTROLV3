import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InformesVentas from './pages/informes/InformesVentas'
import LibroIVA from './pages/contabilidad/LibroIVA'
import Empresas from './pages/admin/Empresas'
import Locales from './pages/admin/Locales'
import Usuarios from './pages/admin/Usuarios'

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<ProtectedRoute />}>
                        <Route element={<Layout />}>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/informes/comparativa-ventas" element={<InformesVentas />} />
                            <Route path="/contabilidad/libro-iva" element={<LibroIVA />} />
                            <Route path="/admin/empresas" element={<Empresas />} />
                            <Route path="/admin/locales" element={<Locales />} />
                            <Route path="/admin/usuarios" element={<Usuarios />} />
                        </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
