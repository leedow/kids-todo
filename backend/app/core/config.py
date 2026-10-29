from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent if BACKEND_ROOT.name == "backend" else BACKEND_ROOT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(PROJECT_ROOT / ".env", BACKEND_ROOT / ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://kids:kids@localhost:5432/kidstodo"
    secret_key: str = "development-only-change-this-to-a-random-64-character-secret"
    app_env: str = "development"
    app_origin: str = "http://localhost:5173"
    media_root: Path = PROJECT_ROOT / "data/media"
    cookie_secure: bool = False

    @model_validator(mode="after")
    def production_safety(self):
        if not self.media_root.is_absolute():
            self.media_root = PROJECT_ROOT / self.media_root
        if not self.database_url.startswith("postgresql"):
            raise ValueError("本应用要求使用 PostgreSQL")
        if self.app_env == "production":
            if len(self.secret_key) < 32 or "change-this" in self.secret_key:
                raise ValueError("生产环境必须配置至少32位的随机 SECRET_KEY")
            if not self.cookie_secure or not self.app_origin.startswith("https://"):
                raise ValueError("生产环境必须启用 HTTPS 和 Secure Cookie")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
