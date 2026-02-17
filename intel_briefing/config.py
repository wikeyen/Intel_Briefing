# ABOUTME: Application configuration loader for Intel Briefing.
# ABOUTME: Provides settings loading with priority: env vars > .env file > settings.json > defaults.
import json
import logging
import sys
from pathlib import Path
from typing import Any

from pydantic.fields import FieldInfo
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource

from intel_briefing.models import ConfigSettings

logger = logging.getLogger(__name__)

# Default paths
DEFAULT_SETTINGS_PATH = Path("config/settings.json")

# Logging format constants
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# API endpoint constants (used by utils until sensor migration in task 3.0)
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-2.5-flash-lite"
GITHUB_API_URL = "https://api.github.com/graphql"
JINA_READER_URL = "https://r.jina.ai/"

# Timeout constants (seconds)
DEFAULT_TIMEOUT = 15
GEMINI_TIMEOUT = 60
JINA_TIMEOUT = 30
GROK_TIMEOUT = 60

# Content limit constants
CONTENT_TRUNCATE_LIMIT = 3000
JINA_MAX_CHARS = 15000
PH_HYDRATION_TRUNCATE = 5000
GEMINI_MAX_OUTPUT_TOKENS = 1024
GEMINI_SUMMARY_MAX_TOKENS = 256
GEMINI_DETAIL_MAX_TOKENS = 1024

# Rate limiting constants
GEMINI_RATE_LIMIT_DELAY = 1.5
GEMINI_MAX_RETRIES = 3

# Fetch limits
MAX_BLOGS_TO_FETCH = 20
MAX_ARTICLES_PER_BLOG = 2
RSS_FETCH_TIMEOUT = 10


def setup_logging(level: str = "INFO", log_file: str | None = None) -> None:
    """Configure global logging with optional file output."""
    log_level = getattr(logging, level.upper(), logging.INFO)
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if log_file:
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    logging.basicConfig(
        level=log_level,
        format=LOG_FORMAT,
        datefmt=LOG_DATE_FORMAT,
        handlers=handlers,
        force=True,
    )


class _JsonSettingsSource(PydanticBaseSettingsSource):
    """Low-priority settings source that reads from a JSON file.

    Sits below env vars and .env file in the source chain, so env vars
    always take precedence over values stored in settings.json.
    """

    def __init__(self, settings_cls: type[BaseSettings], path: Path) -> None:
        super().__init__(settings_cls)
        self._path = path

    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to read settings JSON at %s: %s", self._path, exc)
            return {}

    def get_field_value(
        self, field: FieldInfo, field_name: str
    ) -> tuple[Any, str, bool]:
        data = self._load()
        value = data.get(field_name)
        return value, field_name, value is not None

    def __call__(self) -> dict[str, Any]:
        return self._load()


def load_settings_json(path: Path = DEFAULT_SETTINGS_PATH) -> dict[str, Any]:
    """Read raw settings from a JSON file and return as a dict.

    Returns an empty dict if the file does not exist or cannot be parsed.
    """
    path = Path(path)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Failed to read settings JSON at %s: %s", path, exc)
        return {}


def load_settings(settings_path: Path = DEFAULT_SETTINGS_PATH) -> ConfigSettings:
    """Load application settings with the full source priority chain.

    Priority (highest to lowest):
        1. Environment variables
        2. .env file
        3. settings.json at settings_path
        4. Field defaults

    Args:
        settings_path: Path to the JSON settings file. Defaults to
            config/settings.json relative to the working directory.

    Returns:
        A fully populated ConfigSettings instance.
    """
    # Dynamically subclass ConfigSettings to inject the JSON source at
    # the correct priority position (below env vars, above defaults).
    json_path = Path(settings_path)

    class _SettingsWithJson(ConfigSettings):
        @classmethod
        def settings_customise_sources(
            cls,
            settings_cls: type[BaseSettings],
            init_settings: PydanticBaseSettingsSource,
            env_settings: PydanticBaseSettingsSource,
            dotenv_settings: PydanticBaseSettingsSource,
            file_secret_settings: PydanticBaseSettingsSource,
        ) -> tuple[PydanticBaseSettingsSource, ...]:
            return (
                init_settings,
                env_settings,
                dotenv_settings,
                _JsonSettingsSource(settings_cls, json_path),
                file_secret_settings,
            )

    instance = _SettingsWithJson()
    # Return as plain ConfigSettings to avoid carrying the dynamic subclass
    return ConfigSettings.model_validate(instance.model_dump())
