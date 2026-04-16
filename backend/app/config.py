from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://panel_user:panel_pass@localhost:5432/panel_gestion_v3"
    secret_key: str = "change-this-secret-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    superadmin_email: str = "admin@solba.es"
    superadmin_password: str = "admin123"
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
