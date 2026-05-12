from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Empresa(SQLModel, table=True):
    __tablename__ = "empresas"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str = Field(max_length=200)
    plan: str = Field(default="basic", max_length=50)
    activo: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # PostgreSQL connection for business data
    pg_host: Optional[str] = Field(default=None, max_length=200)
    pg_port: int = Field(default=5026)
    pg_name: Optional[str] = Field(default=None, max_length=200)
    pg_user: Optional[str] = Field(default=None, max_length=100)
    pg_password: Optional[str] = Field(default=None, max_length=200)
    usar_tunnel: bool = Field(default=False)
    tunnel_port: Optional[int] = Field(default=None)
    # SMTP outgoing mail config
    smtp_host: Optional[str] = Field(default=None, max_length=200)
    smtp_port: int = Field(default=465)
    smtp_user: Optional[str] = Field(default=None, max_length=200)
    smtp_password: Optional[str] = Field(default=None, max_length=200)
    smtp_from_name: Optional[str] = Field(default=None, max_length=200)


class Local(SQLModel, table=True):
    __tablename__ = "locales"

    id: Optional[int] = Field(default=None, primary_key=True)
    empresa_id: int = Field(foreign_key="empresas.id")
    nombre: str = Field(max_length=200)
    activo: bool = Field(default=True)
    tipo: str = Field(default="definitiva", max_length=20)  # prueba | definitiva
    fecha_alta: Optional[datetime] = Field(default_factory=datetime.utcnow)
    fecha_definitiva: Optional[datetime] = Field(default=None)
    asistente_ia: bool = Field(default=False)
    # SMTP outgoing mail config
    smtp_host: Optional[str] = Field(default=None, max_length=200)
    smtp_port: int = Field(default=465)
    smtp_user: Optional[str] = Field(default=None, max_length=200)
    smtp_password: Optional[str] = Field(default=None, max_length=200)
    smtp_from_name: Optional[str] = Field(default=None, max_length=200)
    # Document format for email attachments
    formato_doc: str = Field(default='a4_basico_logo_izq', max_length=50)
    # Customer invoice portal
    portal_activo: bool = Field(default=False)
    # Custom FastReport template (.frx) path for this local
    frx_factura: Optional[str] = Field(default=None, max_length=500)


class Usuario(SQLModel, table=True):
    __tablename__ = "usuarios"

    id: Optional[int] = Field(default=None, primary_key=True)
    empresa_id: Optional[int] = Field(default=None, foreign_key="empresas.id")
    email: str = Field(unique=True, max_length=200)
    nombre: str = Field(max_length=200)
    hashed_password: str
    plain_password: Optional[str] = Field(default=None, max_length=200)
    rol: str = Field(max_length=20)  # superadmin | gerente | encargado | usuario
    activo: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    permisos: str = Field(default='[]', max_length=2000)  # JSON array of permission keys
    # Autoventa config
    agente_autoventa: Optional[int] = Field(default=None)
    serie_autoventa: Optional[str] = Field(default=None, max_length=20)
    autoventa_modifica_precio: bool = Field(default=False)
    tipodocs_autoventa: str = Field(default='[]', max_length=100)  # JSON array: [2,4,8]
    caja_autoventa: Optional[int] = Field(default=None)  # caja donde va el efectivo de autoventa
    almacen_autoventa: Optional[int] = Field(default=None)  # almacen por defecto para documentos autoventa
    fpago_autoventa: Optional[int] = Field(default=None)  # forma de pago predeterminada en cobros autoventa
    solo_clientes_agente: bool = Field(default=False)  # ver solo clientes asignados a su agente
    precargar_historial_autoventa: bool = Field(default=True)  # precargar ventas 90 días al seleccionar cliente
    caja_reparto: Optional[int] = Field(default=None)  # caja donde van cobros del reparto
    paper_width_impresora: int = Field(default=80)  # ancho papel impresora térmica: 80 o 100 mm
    # Expediciones config (JSON array: ["CI 26", "CI 27"])
    serie_expediciones: str = Field(default='[]', max_length=500)


class UsuarioLocal(SQLModel, table=True):
    __tablename__ = "usuario_locales"

    usuario_id: int = Field(foreign_key="usuarios.id", primary_key=True)
    local_id: int = Field(foreign_key="locales.id", primary_key=True)


class Visita(SQLModel, table=True):
    __tablename__ = "visitas"

    id: Optional[int] = Field(default=None, primary_key=True)
    empresa_id: Optional[int] = Field(default=None, foreign_key="empresas.id")
    usuario_id: int = Field(foreign_key="usuarios.id")
    agente_codigo: Optional[int] = Field(default=None)
    cli_codigo: int
    cli_nombre: str = Field(max_length=300)
    fecha: datetime = Field(default_factory=datetime.utcnow)
    motivo: str = Field(max_length=100)
    resultado: str = Field(default='', max_length=2000)
