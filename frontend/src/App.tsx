import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import { getFirstAllowedRoute } from './types'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InformesVentas from './pages/informes/InformesVentas'
import LibroIVA from './pages/contabilidad/LibroIVA'
import Empresas from './pages/admin/Empresas'
import Locales from './pages/admin/Locales'
import Usuarios from './pages/admin/Usuarios'
import Autoventa from './pages/autoventa/Autoventa'
import Inventario from './pages/inventario/Inventario'
import Expediciones from './pages/almacen/Expediciones'
import HojasCarga from './pages/almacen/HojasCarga'
import Reparto from './pages/almacen/Reparto'
import RecepcionPedidos from './pages/almacen/RecepcionPedidos'
import Contratos from './pages/contratos/Contratos'
import SeguimientoLocales from './pages/admin/SeguimientoLocales'
import BasesDatos from './pages/admin/BasesDatos'
import PortalCliente from './pages/PortalCliente'

function HomeRedirect() {
    const { user, loading } = useAuth()
    if (loading) return null
    if (!user) return <Navigate to="/login" replace />
    return <Navigate to={getFirstAllowedRoute(user)} replace />
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/portal/:token" element={<PortalCliente />} />
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
                            <Route element={<ProtectedRoute requiredPermission="inventario" action="entrar" />}>
                                <Route path="/inventario" element={<Inventario />} />
                                <Route path="/almacen/inventarios" element={<Inventario />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="expediciones" action="entrar" />}>
                                <Route path="/almacen/expediciones" element={<Expediciones />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="hojas_carga" action="entrar" />}>
                                <Route path="/almacen/hojas-carga" element={<HojasCarga />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="reparto" action="entrar" />}>
                                <Route path="/almacen/reparto" element={<Reparto />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="recepcion_pedidos" action="entrar" />}>
                                <Route path="/almacen/recepcion-pedidos" element={<RecepcionPedidos />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="contratos" action="entrar" />}>
                                <Route path="/contratos" element={<Contratos />} />
                            </Route>
                            <Route element={<ProtectedRoute requiredPermission="seguimiento_locales" action="entrar" />}>
                                <Route path="/seguimiento-locales" element={<SeguimientoLocales />} />
                            </Route>
                            <Route element={<ProtectedRoute />}>
                                <Route path="/admin/bases-datos" element={<BasesDatos />} />
                            </Route>
                        </Route>
                    </Route>
                    <Route path="*" element={<HomeRedirect />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
