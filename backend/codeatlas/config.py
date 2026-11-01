from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CODEATLAS_", env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://codeatlas:codeatlas@127.0.0.1:55433/codeatlas"
    redis_url: str = "redis://127.0.0.1:56380/0"
    storage_root: Path = Path("storage/artifacts")
    max_files: int = Field(500, ge=1, le=10000)
    max_file_bytes: int = Field(2 * 1024 * 1024, ge=1, le=20 * 1024 * 1024)
    max_total_bytes: int = Field(20 * 1024 * 1024, ge=1, le=200 * 1024 * 1024)
    max_download_bytes: int = Field(25 * 1024 * 1024, ge=1, le=250 * 1024 * 1024)
    max_archive_ratio: int = Field(200, ge=1)
    max_request_bytes: int = Field(28 * 1024 * 1024, ge=1)
    max_tokens_per_file: int = Field(100000, ge=1)
    network_timeout_seconds: float = Field(15, gt=0, le=120)
    job_mode: str = "celery"
    api_key: str = ""  # Loopback development only when empty.

    @model_validator(mode="after")
    def validate_mode(self):
        if self.job_mode not in {"celery", "inline"}:
            raise ValueError("job_mode must be celery or inline")
        return self
