export interface LocalInfo {
    id: number
    nombre: string
}

export interface UserMe {
    id: number
    email: string
    nombre: string
    rol: string
    empresa_id: number | null
    locales: LocalInfo[]
}

export interface TokenResponse {
    access_token: string
    refresh_token: string
    token_type: string
}
