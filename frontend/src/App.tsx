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
import Autoventa from './pages/autoventa/Autoventa'

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<ProtectedRoute />}>
                        <Route element={<Layout />}>
                            <Route element={<ProtectedRoute requiredPermission="dashboard" action="entrar" />}>
                                <Route path="/dashboard" element={<Dashboard />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="comparativa_ventas" action="entrar" />}>
                                <Route path="/informes/comparativa-ventas" element={<InformesVentas />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="contabilidad" action="entrar" />}>
                                <Route path="/contabilidad/libro-iva" element={<LibroIVA />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="admin_empresas" action="entrar" />}>
                                <Route path="/admin/empresas" element={<Empresas />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="admin_locales" action="entrar" />}>
                                <Route path="/admin/locales" element={<Locales />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="admin_usuarios" action="entrar" />}>
                                <Route path="/admin/usuarios" element={<Usuarios />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="autoventa" action="entrar" />}>
                                <Route path="/autoventa" element={<Autoventa />} />
                            </Route>
                        </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
