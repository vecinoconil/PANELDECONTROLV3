from typing import Optional
from sqlmodel import SQLModel, Field


class Usuario(SQLModel, table=True):
    __tablename__ = "usuarios"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    nombre: str
    hashed_password: str
    rol: str = Field(default="usuario")  # superadmin, admin, usuario
    activo: bool = Field(default=True)
