# ABOUTME: Parallel sensor fetch coordinator for Intel Briefing.
# ABOUTME: Runs all enabled sensors concurrently, collects results, and writes the cache.
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from datetime import datetime, timezone

from intel_briefing.models import IntelItem, IntelReport, ConfigSettings, SensorResult
from intel_briefing.pipeline.dedup import dedup_items, dedup_across_sections
from intel_briefing.pipeline.cache import write_cache, DEFAULT_CACHE_PATH

logger = logging.getLogger(__name__)

# Per-sensor fetch timeout in seconds
_SENSOR_TIMEOUT = 60


def _load_sensors(config: ConfigSettings) -> list:
    """Dynamically load all enabled sensors based on config toggles."""
    sensors = []
    enabled = config.sensors_enabled

    # Each entry: (sensor_module_path, class_or_factory_name, sensor_key)
    sensor_registry = [
        ("intel_briefing.sensors.hacker_news", "HackerNewsSensor", "hacker_news"),
        ("intel_briefing.sensors.arxiv", "ArxivSensor", "arxiv"),
        ("intel_briefing.sensors.github", "GitHubSensor", "github"),
        ("intel_briefing.sensors.product_hunt", "ProductHuntSensor", "product_hunt"),
        ("intel_briefing.sensors.v2ex", "V2EXSensor", "v2ex"),
        ("intel_briefing.sensors.hn_blogs_sensor", "HNBlogsSensor", "hn_blogs"),
        ("intel_briefing.sensors.grok", "GrokSensor", "grok"),
        ("intel_briefing.sensors.sources_36kr", "Sources36KrSensor", "sources_36kr"),
        ("intel_briefing.sensors.wallstreetcn", "WallStreetCNSensor", "wallstreetcn"),
        ("intel_briefing.sensors.politics", "PoliticsSensor", "politics"),
        ("intel_briefing.sensors.topics", "TopicsSensor", "topics"),
    ]

    for module_path, class_name, key in sensor_registry:
        if not enabled.get(key, True):
            logger.debug("Sensor %s is disabled in config", key)
            continue
        try:
            import importlib
            module = importlib.import_module(module_path)
            sensor_cls = getattr(module, class_name)
            sensors.append(sensor_cls())
        except (ImportError, AttributeError) as exc:
            logger.warning("Could not load sensor %s: %s", key, exc)

    return sensors


def _run_sensor(sensor, config: ConfigSettings, limit: int) -> SensorResult:
    """Run a single sensor's fetch method and return a SensorResult."""
    try:
        items = sensor.fetch(config, limit)
        logger.info("Sensor %s returned %d items", sensor.sensor_name, len(items))
        return SensorResult(sensor_name=sensor.sensor_name, items=items)
    except Exception as exc:
        logger.warning("Sensor %s failed: %s", sensor.sensor_name, exc)
        return SensorResult(sensor_name=sensor.sensor_name, error=str(exc))


# Section routing: maps sensor_name to report section key
_SENSOR_SECTION_MAP: dict[str, str] = {
    "hacker_news": "tech_trends",
    "github": "tech_trends",
    "grok": "tech_trends",
    "arxiv": "research",
    "hn_blogs": "insights",
    "product_hunt": "products",
    "v2ex": "community",
    "sources_36kr": "capital_flow",
    "wallstreetcn": "capital_flow",
    "politics": "politics",
    "topics": "topics",
}


def collect(config: ConfigSettings, cache_path=DEFAULT_CACHE_PATH) -> IntelReport:
    """Run the full collection pipeline and return a structured IntelReport.

    Steps:
    1. Load all enabled sensors.
    2. Fetch from all sensors concurrently with per-sensor timeouts.
    3. Deduplicate items within each section.
    4. Deduplicate across politics / topics sections.
    5. Write the result to the JSON cache.

    Args:
        config: Full application settings.
        cache_path: Where to write the cache file.

    Returns:
        The assembled IntelReport.
    """
    sensors = _load_sensors(config)
    if not sensors:
        logger.warning("No sensors loaded — check sensors_enabled config")

    limit = config.default_limit
    results: list[SensorResult] = []

    with ThreadPoolExecutor(max_workers=min(16, len(sensors) or 1)) as executor:
        future_to_sensor = {
            executor.submit(_run_sensor, sensor, config, limit): sensor
            for sensor in sensors
        }
        for future in as_completed(future_to_sensor, timeout=_SENSOR_TIMEOUT * 2):
            sensor = future_to_sensor[future]
            try:
                result = future.result(timeout=_SENSOR_TIMEOUT)
            except TimeoutError:
                logger.warning("Sensor %s timed out", sensor.sensor_name)
                result = SensorResult(sensor_name=sensor.sensor_name, error="timeout")
            except Exception as exc:
                logger.warning("Sensor %s raised unexpected error: %s", sensor.sensor_name, exc)
                result = SensorResult(sensor_name=sensor.sensor_name, error=str(exc))
            results.append(result)

    # Assemble sections
    sections: dict[str, list[IntelItem]] = {
        "tech_trends": [], "research": [], "capital_flow": [],
        "products": [], "community": [], "politics": [],
        "topics": [], "insights": [],
    }
    sources_ok: list[str] = []
    sources_failed: list[str] = []

    for result in results:
        if result.succeeded:
            sources_ok.append(result.sensor_name)
            section = _SENSOR_SECTION_MAP.get(result.sensor_name, "tech_trends")
            sections[section].extend(result.items)
        else:
            sources_failed.append(result.sensor_name)

    # Deduplicate within each section
    for key in sections:
        sections[key] = dedup_items(sections[key])

    # Deduplicate across politics / topics
    sections = dedup_across_sections(sections)

    now = datetime.now(timezone.utc)
    report = IntelReport(
        date=now.strftime("%Y-%m-%d"),
        fetched_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        stale=False,
        sources_ok=sorted(sources_ok),
        sources_failed=sorted(sources_failed),
        items=sections,
    )

    try:
        write_cache(report, cache_path)
    except Exception as exc:
        logger.error("Failed to write cache: %s", exc)

    return report
