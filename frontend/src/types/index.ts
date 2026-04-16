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

// ── Dashboard types ──────────────────────────────────────────────────────

export interface VentaMensual {
    mes: number
    total: number
    base: number
    facturas: number
}

export interface CompraMensual {
    mes: number
    total: number
    count: number
}

export interface ConsumoFamilia {
    familia: string
    unidades: number
    total_venta: number
    total_coste: number
}

export interface SerieIVA {
    serie: string
    base1: number
    iva1: number
    base2: number
    iva2: number
    total: number
    num: number
}

export interface Proveedor {
    pro_codigo: number
    pro_nombre: string
    total_compras: number
}

export interface TopCliente {
    cli_codigo: number
    cli_nombre: string
    total: number
    base: number
}

export interface AgenteOption {
    codigo: number
    nombre: string
}

export interface CuadroMandosData {
    anio: number
    mes_desde: number
    mes_hasta: number
    filtro_serie: string | null
    filtro_agente: number | null
    ventas_mensuales: VentaMensual[]
    compras_mensuales: CompraMensual[]
    totales: {
        ventas: number
        base_ventas: number
        num_facturas: number
        compras: number
        cobros: number
        pagos: number
    }
    beneficio: {
        ventas: number
        coste: number
        beneficio: number
    }
    vencimientos: {
        proveedores: number
        clientes: number
    }
    consumo_familias: ConsumoFamilia[]
    series_iva: SerieIVA[]
    proveedores: Proveedor[]
    top_clientes: TopCliente[]
    filtros: {
        series: string[]
        agentes: AgenteOption[]
    }
}
