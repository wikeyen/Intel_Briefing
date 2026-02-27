# ABOUTME: Tests for the NLP sidecar entry point configuration.
# ABOUTME: Validates host binding, port, and app module importability.
import ast
from pathlib import Path

from nlp_sidecar.config import PORT


def test_host_binds_to_localhost_only():
    """The sidecar is internal-only and must not bind to all interfaces."""
    source = Path(__file__).resolve().parent.parent / "run.py"
    tree = ast.parse(source.read_text())

    uvicorn_calls = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "run"
    ]
    assert len(uvicorn_calls) == 1

    call = uvicorn_calls[0]
    host_kw = next(kw for kw in call.keywords if kw.arg == "host")
    assert isinstance(host_kw.value, ast.Constant)
    assert host_kw.value.value == "127.0.0.1", (
        f"Sidecar must bind to 127.0.0.1, got {host_kw.value.value!r}"
    )


def test_port_matches_config():
    """run.py should use the PORT from config, not a hardcoded value."""
    source = Path(__file__).resolve().parent.parent / "run.py"
    tree = ast.parse(source.read_text())

    uvicorn_calls = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "run"
    ]
    call = uvicorn_calls[0]
    port_kw = next(kw for kw in call.keywords if kw.arg == "port")

    # Should reference PORT variable, not a hardcoded int
    assert isinstance(port_kw.value, ast.Name), "port should be a variable reference, not a literal"
    assert port_kw.value.id == "PORT"


def test_configured_port_value():
    """PORT should be 8001 to avoid conflicting with the frontend on 8000."""
    assert PORT == 8001


def test_app_module_is_importable():
    """The app module referenced in run.py must be importable."""
    from nlp_sidecar.app import app  # noqa: F401
