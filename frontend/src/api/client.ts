import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
})

// Attach access token and selected local to every request
api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    const selectedLocal = sessionStorage.getItem('selected_local')
    if (selectedLocal) {
        try {
            const local = JSON.parse(selectedLocal)
            if (local?.id) {
                config.params = { ...(config.params ?? {}), local_id: local.id }
            }
        } catch { /* ignore */ }
    }
    return config
})

// On 401: attempt refresh, then retry original request once
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true
            const refreshToken = sessionStorage.getItem('refresh_token')
            if (refreshToken) {
                try {
                    const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
                        refresh_token: refreshToken,
                    })
                    sessionStorage.setItem('access_token', data.access_token)
                    sessionStorage.setItem('refresh_token', data.refresh_token)
                    original.headers.Authorization = `Bearer ${data.access_token}`
                    return api(original)
                } catch {
                    sessionStorage.removeItem('access_token')
                    sessionStorage.removeItem('refresh_token')
                    window.location.href = '/login'
                }
            } else {
                window.location.href = '/login'
            }
        }
        return Promise.reject(error)
    },
)
