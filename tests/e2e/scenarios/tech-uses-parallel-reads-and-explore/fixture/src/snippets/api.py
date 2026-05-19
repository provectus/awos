"""HTTP surface for the snippet store.

Routes are mounted under ``/api/snippets``. This module deliberately
delegates persistence to ``repository``; controllers stay thin so they
read end-to-end.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/snippets", tags=["snippets"])


@router.get("/{snippet_id}")
def get_snippet(snippet_id: int) -> dict:
    """Return one snippet by id, or 404."""
    record = _fetch(snippet_id)
    if record is None:
        raise HTTPException(status_code=404, detail="snippet not found")
    return {
        "id": record["id"],
        "title": record["title"],
        "body": record["body"],
    }


def _fetch(snippet_id: int) -> dict | None:
    # Placeholder — real implementation lives in the repository module.
    return None
