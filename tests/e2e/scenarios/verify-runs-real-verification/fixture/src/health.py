"""Health-check entry point.

Single pure function reporting the service is alive. Intentionally has
no side effects, no dependencies, and no I/O — it exists so monitoring
tools can match on a stable string.
"""

from __future__ import annotations


def health_check() -> str:
    """Return ``'ok'`` so callers can confirm the process is alive."""
    return "ok"
