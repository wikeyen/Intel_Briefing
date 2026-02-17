# ABOUTME: Intel Briefing package root.
# ABOUTME: Handles stdout encoding for cross-platform compatibility.
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
