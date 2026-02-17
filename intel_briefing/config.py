# ABOUTME: Application configuration loader for Intel Briefing.
# ABOUTME: settings.json is the single source of truth — no env var overrides.
import json
import logging
import sys
from pathlib import Path
from typing import Any

from intel_briefing.models import ConfigSettings

logger = logging.getLogger(__name__)

# Default paths
DEFAULT_SETTINGS_PATH = Path("config/settings.json")

# Logging format constants
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# API endpoint constants
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


def load_settings_json(path: Path = DEFAULT_SETTINGS_PATH) -> dict[str, Any]:
    """Read raw settings from settings.json and return as a dict.

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
    """Load application settings from settings.json only.

    settings.json is the single source of truth. Model field defaults apply
    for any keys not present in the file.

    Args:
        settings_path: Path to the JSON settings file. Defaults to
            config/settings.json relative to the working directory.

    Returns:
        A fully populated ConfigSettings instance.
    """
    data = load_settings_json(Path(settings_path))
    return ConfigSettings.model_validate(data)
