from datetime import datetime
from typing import Optional
from pydantic import BaseModel


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
    locales: list[LocalInfo] = []

    class Config:
        from_attributes = True


# ── Admin: Empresas ───────────────────────────────────────────────────────

class EmpresaCreate(BaseModel):
    nombre: str
    plan: str = "basic"


class EmpresaUpdate(BaseModel):
    nombre: Optional[str] = None
    plan: Optional[str] = None


class EmpresaRead(BaseModel):
    id: int
    nombre: str
    plan: str
    activo: bool
    created_at: datetime

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


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    empresa_id: Optional[int] = None
    local_ids: Optional[list[int]] = None


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

    class Config:
        from_attributes = True
