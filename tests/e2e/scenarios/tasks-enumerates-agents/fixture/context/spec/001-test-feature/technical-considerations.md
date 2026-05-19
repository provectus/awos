# Technical Considerations — User Profile Picture Upload

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x (PostgreSQL), Pydantic v2.
- **Frontend:** React 18 + TypeScript, hooks-based components, Tailwind for styling.
- **Storage:** Local filesystem under `uploads/avatars/` for development; abstracted behind a `Storage` interface so a future S3 backend is a drop-in.

## Data Model

- Extend the existing `users` table with a nullable `avatar_url: text` column. Migration handled via Alembic.

## API Surface

- `GET /api/users/me` — return current user including `avatar_url`.
- `POST /api/users/me/avatar` — multipart upload, returns the new avatar URL.
- `DELETE /api/users/me/avatar` — clear the field, return updated user.

All endpoints require an authenticated session (existing auth middleware applies).

## Frontend Architecture

- `ProfileAvatar` — pure presentational React component, props `{ src?: string, size?: number }`. Renders the placeholder silhouette if `src` is undefined.
- `AvatarUploader` — file picker + upload form, calls `POST /api/users/me/avatar`, optimistically updates `useUser()` on success.
- Plug `ProfileAvatar` into the existing `ProfilePage` and `Header` components.

## Validation

- Server-side: MIME type sniff (`python-magic`) plus extension check; max 2 MB enforced by FastAPI's `UploadFile` size check.
- Client-side: pre-flight file type + size check before submitting, surface friendly errors.

## Testing Approach

- Backend: pytest + httpx for endpoint integration tests; SQLAlchemy in-memory SQLite for unit tests.
- Frontend: React Testing Library for `ProfileAvatar` and `AvatarUploader`; Playwright MCP for end-to-end verification of each vertical slice.

## Open Questions

- None — this is a small enough feature that we have agreement on the surface area. Implementation can proceed directly to `/awos:tasks`.
