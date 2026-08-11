# Product Definition: Todo CLI

- **Version:** 1.0
- **Status:** Proposed

---

## 1. The Big Picture (The "Why")

### 1.1. Project Vision & Purpose

To let a developer capture, track, and clear personal to-dos without ever leaving the terminal — no app to open, no account to create, no network round-trip. A task is one keystroke away and lives in a plain file the user owns.

### 1.2. Target Audience

Individual developers and terminal-native power users who already live in a shell and want a frictionless, offline task list for their own work — not teams, not project management.

### 1.3. User Personas

- **Persona 1: "Dana the Developer"**
  - **Role:** Backend engineer who spends the day in a terminal and an editor.
  - **Goal:** Jot down "fix the flaky test" mid-flow and check it off later, without breaking focus or reaching for a GUI.
  - **Frustration:** Web/desktop todo apps demand context-switching, sign-ins, and sync; sticky notes and scratch files get lost.

### 1.4. Success Metrics

- A user can add a task and see it listed in under 2 seconds from a cold shell.
- Every command is fully usable offline with zero configuration on first run.
- 100% of the Phase 1 CLI behaviors are covered by automated acceptance tests that pass.

---

## 2. The Product Experience (The "What")

### 2.1. Core Features

- Add a task from the command line.
- List all tasks with their completion status and an id.
- Mark a task complete by id.
- Remove a task by id.
- Automatic, zero-config local persistence between commands.

### 2.2. User Journey

Dana opens a terminal, runs `todo add "write the release notes"`, and sees it confirmed with an id. Later she runs `todo list` to see everything outstanding, marks the finished item with `todo done 1`, and removes a stale one with `todo remove 2`. The list survives across sessions because it is saved to a local file automatically — she never configured anything.

---

## 3. Project Boundaries

### 3.1. What's In-Scope for this Version

- Adding, listing, completing, and removing tasks from the command line.
- Automatic local persistence to a single JSON file on disk.
- Clear, human-readable output and error messages with correct exit codes.

### 3.2. What's Out-of-Scope (Non-Goals)

- Due dates, priorities, tags, or sub-tasks _(candidates for a later phase)_.
- Multi-user, sharing, or cloud sync.
- Editing a task's text after creation.
- A TUI, GUI, or web interface.
- Configuration files or command-line flags beyond the four core verbs.
