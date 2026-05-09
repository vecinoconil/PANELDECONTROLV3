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
    empresa_nombre: string | null
    locales: LocalInfo[]
    permisos: PermisosMap
    agente_autoventa: number | null
    serie_autoventa: string | null
    autoventa_modifica_precio: boolean
    fpagos_autoventa: number[]
    tipodocs_autoventa: number[]
    caja_autoventa: number | null
    caja_reparto: number | null
    serie_expediciones: string[]
}

export interface PermisoFlags {
    ver: boolean
    entrar: boolean
}

export type PermisosMap = Record<string, PermisoFlags>

export function hasPermiso(
    permisos: PermisosMap | undefined,
    key: string,
    action: 'ver' | 'entrar' = 'entrar',
): boolean {
    if (!permisos) return false
    const p = permisos[key]
    if (!p) return false
    return action === 'ver' ? !!p.ver : !!p.entrar
}

export const PERMISOS_DISPONIBLES = [
    { key: 'dashboard',          label: 'Dashboard' },
    { key: 'comparativa_ventas', label: 'Comparativa Ventas' },
    { key: 'contabilidad',       label: 'Contabilidad' },
    { key: 'contratos',          label: 'Gestión de Contratos' },
    { key: 'autoventa',          label: 'Autoventa' },
    { key: 'expediciones',       label: 'Expediciones' },
    { key: 'hojas_carga',        label: 'Hojas de Carga' },
    { key: 'reparto',            label: 'Reparto' },
    { key: 'recepcion_pedidos',  label: 'Recepción de Pedidos' },
    { key: 'inventario',         label: 'Inventarios' },
    { key: 'admin_empresas',     label: 'Admin Empresas' },
    { key: 'admin_locales',      label: 'Admin Locales' },
    { key: 'admin_usuarios',     label: 'Admin Usuarios' },
] as const

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
    total_facturas: number
    total_albaranes: number
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
    pendiente: number
}

export interface TopCliente {
    cli_codigo: number
    cli_nombre: string
    total: number
    base: number
    beneficio: number
    pendiente: number
}

export interface AgenteOption {
    codigo: number
    nombre: string
}

export interface ProductoFamilia {
    referencia: string
    descripcion: string
    unidades: number
    total_venta: number
    total_coste: number
    beneficio: number
}

export interface VencimientosResumen {
    clientes: number
    clientes_count: number
    proveedores: number
    proveedores_count: number
}

export interface FacturaDoc {
    id: number
    serie: string
    numero: number
    fecha: string
    tipo_doc?: string
    base: number
    iva: number
    total: number
    pendiente: number
}

export interface DocLinea {
    orden: number
    referencia: string | null
    descripcion: string | null
    unidades: number
    precio: number
    importe: number
    coste: number
    pdto1: number
    pdto2: number
    pdto3: number
    descuento: number
    piva: number
}

export interface DocVencimiento {
    fecha: string | null
    importe: number
    situacion: number
}

export interface DocDetalle {
    cabecera: {
        id: number
        tipodoc: number
        serie: string
        numero: number
        fecha: string
        fechafin: string | null
        codigo_tercero: number
        nombre_tercero: string
        baseimpo1: number
        baseimpo2: number
        baseimpo3: number
        piva1: number
        piva2: number
        piva3: number
        iva1: number
        iva2: number
        iva3: number
        rec1: number
        rec2: number
        rec3: number
        irpf: number
        total: number
        descripcion: string
        observaciones: string
        fpago: number
    }
    lineas: DocLinea[]
    vencimientos: DocVencimiento[]
}

export interface FraPteCobro {
    id: number
    serie: string
    numero: number
    fecha: string
    cli_nombre: string
    total: number
    pendiente: number
}

export interface VencimientoDetalle {
    id: number
    codigo: number
    nombre: string
    serie: string
    numero: number
    fecha: string
    total_fra: number
    pendiente: number
}

// ── Ficha Cliente types ──────────────────────────────────────────────────

export interface FichaClienteProducto {
    referencia: string
    descripcion: string
    [year: string]: string | number  // dynamic year columns
}

export interface FichaClienteFamilia {
    familia: string
    productos: FichaClienteProducto[]
    [year: string]: string | number | FichaClienteProducto[]
}

export interface FichaClienteTopProducto {
    referencia: string
    descripcion: string
    unidades: number
    total_venta: number
    beneficio: number
    margen_pct: number
}

export interface FichaClienteDocumento {
    id: number
    tipodoc: number
    serie: string
    numero: number
    fecha: string
    total: number
    pendiente: number
    tipo_doc: string
}

export interface FichaClientePresupuesto {
    id: number
    serie: string
    numero: number
    fecha: string
    total: number
    descripcion: string
}

export interface FichaClienteData {
    cliente: {
        codigo: number
        nombre: string
        alias: string | null
        cif: string
        direccion: string
        localidad: string
        cpostal: string
        telefono1: string
        email: string
        agente: number
        fpago: number
        observaciones: string
    }
    anio: number
    anios_cols: number[]
    ventas_mensuales: { anio: number; mes: number; total: number }[]
    kpis: {
        ticket_medio: number
        ventas_anio: number
        ventas_anio_anterior: number
        margen_anio: number
        margen_pct: number
        ultima_compra: string | null
        plazo_pago: number
        frecuencia: number
        saldo_pendiente: number
    }
    patron_semanal: number[]
    productos_familia: FichaClienteFamilia[]
    top_productos: Record<string, FichaClienteTopProducto[]>
    documentos_venta: FichaClienteDocumento[]
    presupuestos: FichaClientePresupuesto[]
}

export interface CuadroMandosData {
    anio: number
    mes_desde: number
    mes_hasta: number
    filtro_series: string[]
    filtro_agente: number | null
    ventas_mensuales: VentaMensual[]
    pte_cobro_mensual: Record<number, number>
    compras_mensuales: CompraMensual[]
    pte_pago_mensual: Record<number, number>
    totales: {
        ventas: number
        base_ventas: number
        num_facturas: number
        total_facturas: number
        total_albaranes_pte: number
        num_albaranes_pte: number
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
        clientes_otros_anios: number
        proveedores_otros_anios: number
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

// ── Ficha Proveedor types ────────────────────────────────────────────────

export interface FichaProveedorTopProducto {
    referencia: string
    descripcion: string
    unidades: number
    total_compra: number
}

export interface FichaProveedorDocumento {
    id: number
    tipodoc: number
    serie: string
    numero: number
    fecha: string
    total: number
    pendiente: number
    tipo_doc: string
}

export interface FichaProveedorData {
    proveedor: {
        codigo: number
        nombre: string
        alias: string | null
        cif: string
        direccion: string
        localidad: string
        cpostal: string
        telefono1: string
        email: string
        fpago: number
        observaciones: string
    }
    anio: number
    anios_cols: number[]
    compras_mensuales: { anio: number; mes: number; total: number }[]
    kpis: {
        ticket_medio: number
        compras_anio: number
        compras_anio_anterior: number
        ultima_compra: string | null
        plazo_pago: number
        frecuencia: number
        saldo_pendiente: number
    }
    productos_familia: FichaClienteFamilia[]
    top_productos: Record<string, FichaProveedorTopProducto[]>
    documentos_compra: FichaProveedorDocumento[]
}

// ── Ficha Agente types ───────────────────────────────────────────────────

export interface FichaAgenteTopProducto {
    referencia: string
    descripcion: string
    unidades: number
    total_venta: number
}

export interface FichaAgenteComision {
    id: number
    tipo_doc: string
    serie: string
    numero: number
    fecha: string
    cli_nombre: string
    total: number
    dias_pago: number
}

export interface FichaAgentePendiente {
    id: number
    tipo_doc: string
    serie: string
    numero: number
    fecha: string
    cli_nombre: string
    importe: number
    fecha_vencimiento: string
    dias: number
}

export interface FichaAgenteVisita {
    id: number
    fecha: string
    hora: string
    cli_codigo: number
    cli_nombre: string
    contacto: string
    medio: string
    motivo: string
    resultado: string
    observaciones: string
}

export interface FichaAgenteData {
    agente: {
        codigo: number
        nombre: string
        cif: string
        direccion: string
        localidad: string
        cpostal: string
        telefono1: string
        telefono2: string
        email: string
        observaciones: string
        baja: boolean
    }
    anio: number
    anios_cols: number[]
    ventas_mensuales: { anio: number; mes: number; total: number }[]
    kpis: {
        ventas_anio: number
        ventas_anio_anterior: number
        num_clientes: number
        clientes_anterior: number
        ticket_medio_cliente: number
        num_visitas: number
        valor_por_visita: number
        margen_anio: number
        margen_pct: number
        crecimiento_cartera: number
        saldo_pendiente: number
    }
    comisiones_liquidables: FichaAgenteComision[]
    pendientes_cobro: FichaAgentePendiente[]
    top_productos: Record<string, FichaAgenteTopProducto[]>
    has_visitas: boolean
    visitas: FichaAgenteVisita[]
}

// ── Contabilidad: Libro IVA ──────────────────────────────────────────────

export interface LibroIVALinea {
    id: number
    fecha: string
    serie: string
    numero: number
    codigo_tercero: number
    nombre_tercero: string
    baseimpo1: number
    piva1: number
    iva1: number
    rec1: number
    baseimpo2: number
    piva2: number
    iva2: number
    rec2: number
    baseimpo3: number
    piva3: number
    iva3: number
    rec3: number
    irpf: number
    total: number
    fpago: number
    fpago_nombre: string
    pendiente: number
}

// ── Cobros widget ────────────────────────────────────────────────────────

export interface CobroDetalle {
    cajabanco: number   // 0=Caja, 1=Banco
    tipocobro: number
    importe: number
    fechacobro: string
    cli_nombre: string
    serie: string
    numero: number
}

export interface CobrosPeriodo {
    total: number
    caja: number
    banco: number
    detalle: CobroDetalle[]
}

export interface CobrosResumen {
    hoy: CobrosPeriodo
    semana: CobrosPeriodo
    mes: CobrosPeriodo
}
