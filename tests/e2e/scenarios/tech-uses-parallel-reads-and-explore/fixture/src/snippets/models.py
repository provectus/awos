"""Snippet ORM models.

A single user's snippet records live in the ``snippets`` table. This module
intentionally stays small — model definitions only; persistence helpers
belong in the repository module.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, Text
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()


class Snippet(Base):
    """A single code snippet record."""

    __tablename__ = "snippets"

    id = Column(Integer, primary_key=True)
    title = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
