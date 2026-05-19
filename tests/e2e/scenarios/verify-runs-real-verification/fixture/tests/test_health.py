"""Tests for the health-check entry point."""

from __future__ import annotations

import sys
from pathlib import Path

# Make `src/` importable without packaging the project — keeps the
# fixture self-contained.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from health import health_check  # noqa: E402


def test_health_check_returns_ok() -> None:
    assert health_check() == "ok"
