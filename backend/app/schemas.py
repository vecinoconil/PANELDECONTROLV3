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


class UserMe(BaseModel):
    id: int
    email: str
    nombre: str
    rol: str

    class Config:
        from_attributes = True
