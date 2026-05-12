from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://SOLBA:solba2012@core.solba.com:5026/PANELCONTROLV3"
    secret_key: str = "change-this-secret-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    superadmin_email: str = "admin@solba.com"
    superadmin_password: str = "padrino75"
    frontend_url: str = "http://localhost:4000"
    openai_api_key: str = ""
    anthropic_api_key: str = ""


settings = Settings()
