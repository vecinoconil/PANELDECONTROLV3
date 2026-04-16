import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from '../api/client'
import type { UserMe } from '../types'

interface AuthState {
    user: UserMe | null
    loading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserMe | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const token = localStorage.getItem('access_token')
        if (token) {
            api.get<UserMe>('/api/auth/me')
                .then(({ data }) => setUser(data))
                .catch(() => {
                    localStorage.removeItem('access_token')
                    localStorage.removeItem('refresh_token')
                })
                .finally(() => setLoading(false))
        } else {
            setLoading(false)
        }
    }, [])

    async function login(email: string, password: string) {
        const { data } = await api.post('/api/auth/login', { email, password })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        const me = await api.get<UserMe>('/api/auth/me')
        setUser(me.data)
    }

    function logout() {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
