# Functional Specification — Tag a Snippet

Status: Draft

## Overview

Users frequently want to label a snippet so they can find it again by category later. This feature lets them attach one or more short text tags to a snippet on create or edit, and see those tags on the snippet detail view.

## Goals

- A signed-in user can attach a list of tags to a snippet when creating it.
- A signed-in user can edit the tag list on an existing snippet.
- The tag list is shown on the snippet detail page so the user can verify what they saved.

## User Stories

1. **As a signed-in user**, I can type a comma-separated list of tags when creating a snippet so I can find it later.
2. **As a signed-in user**, I can edit the tag list of an existing snippet so I can fix typos or refine my labels.
3. **As a signed-in user**, I can see the tags rendered on the snippet detail page so I know what I saved.

## Acceptance Criteria

- The snippet record persists a list of tag strings; round-tripping a snippet returns the same tags.
- The snippet detail API response includes a `tags` field that is an array of strings.
- Creating a snippet with no tags is allowed; the API returns an empty array.
- Tags survive a logout/login cycle (they are persisted, not in-memory).

## Out of Scope

- Filtering the snippet list by tag (that lands in a follow-up slice).
- Tag autocompletion or suggestions.
- Tag color / icon customization.
