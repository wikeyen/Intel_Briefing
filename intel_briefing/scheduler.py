# ABOUTME: APScheduler-based daily pipeline scheduler for Intel Briefing.
# ABOUTME: Schedules collector.collect() at config.fetch_time in config.fetch_timezone.
import logging
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from intel_briefing.models import ConfigSettings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _run_pipeline(config: ConfigSettings) -> None:
    """Execute the collection pipeline and log summary statistics."""
    from intel_briefing.pipeline.collector import collect

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


def start_scheduler(config: ConfigSettings) -> AsyncIOScheduler:
    """Start the APScheduler and schedule the daily pipeline job.

    Args:
        config: Application settings that define fetch_time and fetch_timezone.

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
        args=[config],
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
