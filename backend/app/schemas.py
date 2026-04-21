import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


# ── Auth ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LocalInfo(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True


class UserMe(BaseModel):
    id: int
    email: str
    nombre: str
    rol: str
    empresa_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    locales: list[LocalInfo] = []
    permisos: list[str] = []

    class Config:
        from_attributes = True


# ── Admin: Empresas ───────────────────────────────────────────────────────

class EmpresaCreate(BaseModel):
    nombre: str
    plan: str = "basic"
    pg_host: Optional[str] = None
    pg_port: int = 5026
    pg_name: Optional[str] = None
    pg_user: Optional[str] = None
    pg_password: Optional[str] = None
    usar_tunnel: bool = False
    tunnel_port: Optional[int] = None


class EmpresaUpdate(BaseModel):
    nombre: Optional[str] = None
    plan: Optional[str] = None
    pg_host: Optional[str] = None
    pg_port: Optional[int] = None
    pg_name: Optional[str] = None
    pg_user: Optional[str] = None
    pg_password: Optional[str] = None
    usar_tunnel: Optional[bool] = None
    tunnel_port: Optional[int] = None


class EmpresaRead(BaseModel):
    id: int
    nombre: str
    plan: str
    activo: bool
    created_at: datetime
    pg_host: Optional[str] = None
    pg_port: int = 5026
    pg_name: Optional[str] = None
    pg_user: Optional[str] = None
    usar_tunnel: bool = False
    tunnel_port: Optional[int] = None

    class Config:
        from_attributes = True


# ── Admin: Locales ────────────────────────────────────────────────────────

class LocalCreate(BaseModel):
    empresa_id: int
    nombre: str


class LocalUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


class LocalRead(BaseModel):
    id: int
    empresa_id: int
    nombre: str
    activo: bool

    class Config:
        from_attributes = True


# ── Admin: Usuarios ───────────────────────────────────────────────────────

class UsuarioCreate(BaseModel):
    empresa_id: Optional[int] = None
    email: str
    nombre: str
    password: str
    rol: str
    local_ids: list[int] = []
    permisos: list[str] = []


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    empresa_id: Optional[int] = None
    local_ids: Optional[list[int]] = None
    permisos: Optional[list[str]] = None


class UsuarioRead(BaseModel):
    id: int
    empresa_id: Optional[int] = None
    email: str
    nombre: str
    rol: str
    activo: bool
    plain_password: Optional[str] = None
    created_at: datetime
    local_ids: list[int] = []
    permisos: list[str] = []

    @field_validator('permisos', mode='before')
    @classmethod
    def parse_permisos(cls, v):
        if isinstance(v, str):
            return json.loads(v or '[]')
        return v or []

    class Config:
        from_attributes = True
