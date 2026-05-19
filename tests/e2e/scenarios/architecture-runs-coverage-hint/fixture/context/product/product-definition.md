# Product Definition — Snippet Vault

Status: Draft

## What it is

Snippet Vault is a tiny personal tool for storing, tagging, and searching code snippets you reach for repeatedly. It runs as a small self-hosted web app — a single user signs in, drops a snippet in, and finds it again later via tag or full-text search.

## Who it's for

Individual developers who keep a "snippets" folder full of half-organized files and want something marginally better than that, without the overhead of a Notion workspace or a multi-user SaaS account.

## Core problems it solves

- "I know I solved this before but I can't find where I wrote it down."
- "My snippets are scattered across gists, dotfiles, and three editors."
- "I want full-text search over my own code, not Google's."

## Key product principles

- **Self-hostable.** A single `docker compose up` should be enough to run it on a Raspberry Pi or a small VPS.
- **Web-first UI.** No native apps. The browser is the universal client.
- **Backend-driven search.** Search runs on the server with a real index, not client-side filtering.

## High-level shape

- A small backend service exposes a REST API over the snippet store.
- A web UI is the primary interaction surface — list, create, edit, tag, search.
- A single SQL database is the source of truth.

The intentional split is "backend service + frontend SPA" — they evolve on different release cadences and we'll need expertise on both sides.
