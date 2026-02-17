# ABOUTME: APScheduler-based daily pipeline scheduler for Intel Briefing.
# ABOUTME: Reloads config from disk on each run so schedule changes take effect without restart.
import logging
import time
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from intel_briefing.models import ConfigSettings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _run_pipeline(settings_path: Path) -> None:
    """Execute the collection pipeline using the latest config from disk."""
    from intel_briefing.config import load_settings
    from intel_briefing.pipeline.collector import collect

    config = load_settings(settings_path)
    start = time.monotonic()
    logger.info("Scheduled pipeline run starting...")
    try:
        report = collect(config)
        elapsed = time.monotonic() - start
        logger.info(
            "Pipeline complete in %.1fs — sources_ok=%d sources_failed=%d",
            elapsed,
            len(report.sources_ok),
            len(report.sources_failed),
        )
        if report.sources_failed:
            logger.warning("Failed sources: %s", ", ".join(report.sources_failed))
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.error("Pipeline failed after %.1fs: %s", elapsed, exc)


def start_scheduler(config: ConfigSettings, settings_path: Path) -> AsyncIOScheduler:
    """Start the APScheduler and schedule the daily pipeline job.

    Args:
        config: Used only to read fetch_time and fetch_timezone for the trigger.
        settings_path: Path passed to each job run so it always loads the latest config.

    Returns:
        The running AsyncIOScheduler instance.
    """
    global _scheduler

    hour, minute = _parse_time(config.fetch_time)
    trigger = CronTrigger(
        hour=hour,
        minute=minute,
        timezone=config.fetch_timezone,
    )

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _run_pipeline,
        trigger=trigger,
        args=[settings_path],
        id="daily_pipeline",
        name="Daily Intel Pipeline",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started — daily pipeline at %s (%s)",
        config.fetch_time,
        config.fetch_timezone,
    )
    return _scheduler


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler if running."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
    _scheduler = None


def _parse_time(time_str: str) -> tuple[int, int]:
    """Parse HH:MM string into (hour, minute) ints. Defaults to 07:30 on error."""
    try:
        parts = time_str.split(":")
        return int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        logger.warning("Invalid fetch_time %r; defaulting to 07:30", time_str)
        return 7, 30
