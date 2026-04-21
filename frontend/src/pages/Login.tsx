import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'

export default function Login() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showRecover, setShowRecover] = useState(false)
    const [recoverEmail, setRecoverEmail] = useState('')
    const [recoverMsg, setRecoverMsg] = useState('')
    const [recoverLoading, setRecoverLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await login(email, password)
            navigate('/dashboard', { replace: true })
        } catch {
            setError('Credenciales incorrectas')
        } finally {
            setLoading(false)
        }
    }

    async function handleRecover(e: React.FormEvent) {
        e.preventDefault()
        setRecoverLoading(true)
        setRecoverMsg('')
        try {
            await api.post('/api/auth/recover-password', { email: recoverEmail })
            setRecoverMsg('Si el email está registrado, recibirás un correo con tus credenciales.')
        } catch {
            setRecoverMsg('Error al procesar la solicitud. Inténtalo más tarde.')
        } finally {
            setRecoverLoading(false)
        }
    }

    if (showRecover) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100">
                <div className="card w-full max-w-sm">
                    <h1 className="text-xl font-bold text-center mb-2">Recuperar contraseña</h1>
                    <p className="text-sm text-slate-500 text-center mb-6">Introduce tu email y te enviaremos tus credenciales.</p>
                    <form onSubmit={handleRecover} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input
                                type="email"
                                className="input"
                                value={recoverEmail}
                                onChange={e => setRecoverEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        {recoverMsg && (
                            <p className="text-sm text-center text-slate-600">{recoverMsg}</p>
                        )}
                        <button type="submit" className="btn-primary w-full" disabled={recoverLoading}>
                            {recoverLoading ? 'Enviando...' : 'Enviar credenciales'}
                        </button>
                    </form>
                    <button
                        onClick={() => { setShowRecover(false); setRecoverMsg(''); setRecoverEmail('') }}
                        className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 text-center"
                    >
                        Volver al inicio de sesión
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100">
            <div className="card w-full max-w-sm">
                <h1 className="text-xl font-bold text-center mb-6">Panel de Gestión V3</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && (
                        <p className="text-red-600 text-sm text-center">{error}</p>
                    )}
                    <button type="submit" className="btn-primary w-full" disabled={loading}>
                        {loading ? 'Entrando...' : 'Iniciar sesión'}
                    </button>
                </form>
                <button
                    onClick={() => setShowRecover(true)}
                    className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 text-center"
                >
                    ¿Olvidaste tu contraseña?
                </button>
            </div>
        </div>
    )
}
