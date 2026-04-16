export interface UserMe {
    id: number
    email: string
    nombre: string
    rol: string
}

export interface TokenResponse {
    access_token: string
    refresh_token: string
    token_type: string
}
