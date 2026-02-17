# ABOUTME: Atomic JSON cache read/write for Intel Briefing pipeline.
# ABOUTME: Ensures the API always serves a complete report, never a partial write.
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from intel_briefing.models import IntelReport

logger = logging.getLogger(__name__)

# Default cache file location (overridable via env / config)
DEFAULT_CACHE_PATH = Path("cache/intel_latest.json")


def write_cache(report: IntelReport, path: Path = DEFAULT_CACHE_PATH) -> None:
    """Write an IntelReport to disk using an atomic write pattern.

    Writes to a `.tmp` file first, then renames it to the target path.
    This ensures the cache file is never in a partially-written state
    even if the process is interrupted mid-write.

    Args:
        report: The IntelReport to persist.
        path: Target file path. Parent directories are created if needed.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".json.tmp")
    try:
        tmp_path.write_text(
            report.model_dump_json(indent=2),
            encoding="utf-8",
        )
        os.replace(tmp_path, path)
        logger.info("Cache written to %s", path)
    except Exception:
        # Clean up the temp file if something went wrong
        tmp_path.unlink(missing_ok=True)
        raise


def read_cache(path: Path = DEFAULT_CACHE_PATH) -> IntelReport | None:
    """Read and deserialize an IntelReport from the cache file.

    Args:
        path: Path to the cache file.

    Returns:
        The deserialized IntelReport, or None if the file does not exist
        or cannot be parsed.
    """
    path = Path(path)
    if not path.exists():
        logger.debug("Cache file not found at %s", path)
        return None
    try:
        return IntelReport.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Failed to read cache from %s: %s", path, exc)
        return None


def is_stale(report: IntelReport, ttl_hours: int = 6) -> bool:
    """Determine whether a cached report is older than the TTL.

    Args:
        report: The cached IntelReport to check.
        ttl_hours: Maximum age in hours before the report is considered stale.

    Returns:
        True if the report is older than ttl_hours, False otherwise.
    """
    try:
        fetched = datetime.fromisoformat(report.fetched_at.replace("Z", "+00:00"))
        age_hours = (datetime.now(timezone.utc) - fetched).total_seconds() / 3600
        return age_hours > ttl_hours
    except (ValueError, AttributeError) as exc:
        logger.warning("Could not parse fetched_at for staleness check: %s", exc)
        return True
