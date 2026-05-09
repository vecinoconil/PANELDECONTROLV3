import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from '../api/client'
import type { UserMe, LocalInfo } from '../types'

interface AuthState {
    user: UserMe | null
    loading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
    selectedLocal: LocalInfo | null
    setSelectedLocal: (local: LocalInfo | null) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserMe | null>(null)
    const [loading, setLoading] = useState(true)
    const [selectedLocal, setSelectedLocalState] = useState<LocalInfo | null>(() => {
        try {
            const stored = sessionStorage.getItem('selected_local')
            return stored ? JSON.parse(stored) : null
        } catch { return null }
    })

    const setSelectedLocal = (local: LocalInfo | null) => {
        setSelectedLocalState(local)
        if (local) {
            sessionStorage.setItem('selected_local', JSON.stringify(local))
        } else {
            sessionStorage.removeItem('selected_local')
        }
    }

    useEffect(() => {
        const token = sessionStorage.getItem('access_token')
        if (token) {
            api.get<UserMe>('/api/auth/me')
                .then(({ data }) => setUser(data))
                .catch(() => {
                    sessionStorage.removeItem('access_token')
                    sessionStorage.removeItem('refresh_token')
                })
                .finally(() => setLoading(false))
        } else {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (user?.locales?.length && !selectedLocal) {
            // Si hay un local guardado que sea valido para este usuario, usarlo
            const stored = sessionStorage.getItem('selected_local')
            if (stored) {
                try {
                    const parsed: LocalInfo = JSON.parse(stored)
                    const valid = user.locales.find(l => l.id === parsed.id)
                    if (valid) { setSelectedLocal(valid); return }
                } catch { /* ignore */ }
            }
            setSelectedLocal(user.locales[0])
        }
    }, [user])

    async function login(email: string, password: string) {
        const { data } = await api.post('/api/auth/login', { email, password })
        sessionStorage.setItem('access_token', data.access_token)
        sessionStorage.setItem('refresh_token', data.refresh_token)
        const me = await api.get<UserMe>('/api/auth/me')
        setUser(me.data)
    }

    function logout() {
        sessionStorage.removeItem('access_token')
        sessionStorage.removeItem('refresh_token')
        sessionStorage.removeItem('selected_local')
        setUser(null)
        setSelectedLocal(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, selectedLocal, setSelectedLocal }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
