from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "SECRET_KEY_MUST_BE_CHANGED_IN_PRODUCTION"


class Settings(BaseSettings):
    # Environment variables override the .env file
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # App Constants (don't override these in production)
    PROJECT_NAME: str = "Gym 2.0 API"
    PROJECT_DESCRIPTION: str = "Backend API for Gym 2.0"
    VERSION: str = "1.0.0"
    # Sessions last at least MIN and at most MAX. In between they stay valid while the API was used within SLIDING.
    # The same for every client, iOS and web (browsers keep the cookie for at most 400 days).
    SESSION_MIN_DAYS: int = 30
    SESSION_SLIDING_DAYS: int = 7
    SESSION_MAX_DAYS: int = 730
    EMAIL_VERIFY_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_EXPIRE_MINUTES: int = 60
    IMAGE_MAX_UPLOAD_BYTES: int = 20 * 1024 * 1024
    IMAGE_MAX_PIXELS: int = 50_000_000  # Rejects decompression bombs before decoding

    # Infra Specs (should be overridden in production)
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    CORS_ORIGINS: list[str] = Field(
        default=["https://gym2.app",
                "https://www.gym2.app",
                "http://localhost:3000"],
        description="Allowed origins for cross-domain requests. Localhost origins are dropped in production."
    )
    MAILSERVER_URL: str = Field(
        default="http://localhost:5003",
        description="Base URL of the internal mailserver that sends the transactional emails."
    )
    ADMIN_HOST: str = Field(
        default="admin.localhost",
        description="Host name the admin panel is served on. Requests for other hosts never reach it."
    )
    OLLAMA_URL: str = Field(
        default="http://192.168.4.108:5000",
        description="Base URL of the internal Ollama server that answers the AI conversations."
    )
    OLLAMA_MODEL: str = Field(
        default="qwen3.5:4b-q4_K_M",
        description="Name of the Ollama model used for the AI conversations."
    )
    OLLAMA_TIMEOUT_SECONDS: int = Field(
        default=90,
        description="How long to wait for an answer of the Ollama server before giving up. Below the 100 s after "
                    "which Cloudflare gives up on gym2.app, so the client gets the backend's error instead."
    )
    IMAGE_STORAGE_PATH: str = Field(
        default="/data/images",
        description="Directory of the mounted volume the uploaded images are stored in."
    )
    NUDITY_FILTER_MODEL_PATH: str = Field(
        default="/opt/nudenet/640m.onnx",
        description="NudeNet's 640m model that checks uploaded images for nudity (core.nudity_filter), downloaded into "
                    "the backend image. Empty turns the check off, which only development allows."
    )
    NUDITY_FILTER_THREADS: int = Field(
        default=2,
        description="CPU threads one check of an image uses (about 0.9 s with one, 0.45 s with two)."
    )
    DEPRECATED_API_VERSIONS: list[str] = Field(
        default=[],
        description="API versions (e.g. [\"v1\"]) that still work, but send the header Deprecation: true, so the apps "
                    "tell the user that an update is available."
    )
    RETIRED_API_VERSIONS: list[str] = Field(
        default=[],
        description="API versions that answer every request with 410, so the apps ask the user to update."
    )

    # Secrets and Credentials (must be overridden in production)
    SECRET_KEY: str = Field( # Generate a strong key in production using: openssl rand -hex 32
        default=DEFAULT_SECRET_KEY,
        description="Key used to derive email verification tokens."
    )
    DATABASE_URL: str = ""

    @property
    def SECURE_COOKIES(self) -> bool:
        """Secure cookies are only sent over HTTPS, which local development usually doesn't use."""
        return self.ENVIRONMENT != "development"

    @model_validator(mode="after")
    def check_production_settings(self) -> "Settings":
        if self.ENVIRONMENT != "development" and not self.NUDITY_FILTER_MODEL_PATH:
            raise ValueError("NUDITY_FILTER_MODEL_PATH must be set outside of development.")
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY == DEFAULT_SECRET_KEY:
                raise ValueError("SECRET_KEY must be set in production.")
            if not self.DATABASE_URL:
                raise ValueError("DATABASE_URL must be set in production.")
            self.CORS_ORIGINS = [
                origin for origin in self.CORS_ORIGINS
                if "localhost" not in origin and "127.0.0.1" not in origin
            ]
        return self

settings = Settings()
