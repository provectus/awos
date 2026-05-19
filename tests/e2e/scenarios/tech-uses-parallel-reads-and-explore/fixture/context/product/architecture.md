# Architecture — Snippet Vault

Status: Approved

## Overview

Self-hosted single-user code-snippet store. Backend exposes a REST API over the snippet records; the source of truth is a single SQL database.

## Components

- **API service** — Python 3.12 + FastAPI. Stateless, packaged as a Docker image. Talks to PostgreSQL via SQLAlchemy.
- **Database** — PostgreSQL 15. Schema lives under Alembic migrations.
- **Storage** — snippet bodies are stored inline as TEXT columns. No object storage in Phase 1.

## API Surface

- `GET /api/snippets` — list snippets for the signed-in user.
- `GET /api/snippets/{id}` — fetch one snippet.
- `POST /api/snippets` — create a snippet.
- `PUT /api/snippets/{id}` — update a snippet.
- `DELETE /api/snippets/{id}` — remove a snippet.

## Operational

- Single-process Docker container behind a reverse proxy. No autoscaling needed at this size.
- Backups: a nightly `pg_dump` is written to a mounted volume.

## Out of scope (for now)

- Multi-user support (single user only).
- Full-text search (Phase 2, will likely add a `tsvector` column once the row shape stabilizes).
- A separate frontend repo — the React SPA lives in this same project and ships from the same container.
