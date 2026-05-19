# Roadmap — Snippet Vault

Status: Draft

## Phase 1 — Walking skeleton (MVP)

End-to-end vertical slice: a single user can log in, save one snippet, list snippets, and view one back. The point is to land both halves of the stack — Python backend + React frontend — in a runnable state.

- [ ] User can sign in with an email + password (no SSO yet).
- [ ] User can paste a snippet into the web UI and save it.
- [ ] User can see their list of snippets in the web UI.
- [ ] User can open a single snippet to view its contents.

## Phase 2 — Tags and search

- [ ] User can tag a snippet on create / edit.
- [ ] User can filter the list by tag in the web UI.
- [ ] User can run a full-text search across all their snippets.

## Phase 3 — Polish

- [ ] Snippet editor supports syntax-highlighting per language.
- [ ] Export all snippets as a single archive.
- [ ] Keyboard shortcuts for the web UI's common actions.

Phase 1 establishes the architecture; Phase 2 exercises the search path; Phase 3 is polish on top of a working app.
