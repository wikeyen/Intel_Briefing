# ABOUTME: Abstract Sensor protocol for Intel Briefing.
# ABOUTME: All sensors must implement fetch(config, limit) -> list[IntelItem].
from typing import Protocol, runtime_checkable

from intel_briefing.models import IntelItem, ConfigSettings


@runtime_checkable
class Sensor(Protocol):
    """Protocol that all Intel Briefing sensors must satisfy.

    A sensor is responsible for fetching intel from a single data source
    and returning a list of IntelItem objects. Sensors must degrade
    gracefully (return an empty list, not raise) when their source is
    unavailable or their API key is absent.
    """

    #: Unique identifier used in sources_ok / sources_failed arrays.
    sensor_name: str

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch intel items from the sensor's data source.

        Args:
            config: Full application settings including API keys.
            limit: Maximum number of items to return.

        Returns:
            List of IntelItem objects. Returns an empty list on any failure.
        """
        ...
