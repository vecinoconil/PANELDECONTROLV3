from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://SOLBA:solba2012@core.solba.com:3306/PANELDEGESTION"
    secret_key: str = "change-this-secret-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    superadmin_email: str = "admin@solba.com"
    superadmin_password: str = "padrino75"
    frontend_url: str = "http://localhost:4000"

    class Config:
        env_file = ".env"


settings = Settings()
