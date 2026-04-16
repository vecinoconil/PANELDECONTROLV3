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


class Local(SQLModel, table=True):
    __tablename__ = "locales"

    id: Optional[int] = Field(default=None, primary_key=True)
    empresa_id: int = Field(foreign_key="empresas.id")
    nombre: str = Field(max_length=200)
    activo: bool = Field(default=True)


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


class UsuarioLocal(SQLModel, table=True):
    __tablename__ = "usuario_locales"

    usuario_id: int = Field(foreign_key="usuarios.id", primary_key=True)
    local_id: int = Field(foreign_key="locales.id", primary_key=True)
