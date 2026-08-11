# Functional Specification: Manage Todos

- **Roadmap Item:** Phase 1 — Manage Todos (add, list, complete, remove, automatic persistence)
- **Status:** Completed
- **Author:** Founding Engineer (via `/awos:spec`)

---

## 1. Overview and Rationale (The "Why")

Developers who live in the terminal need to capture and clear personal to-dos without breaking flow. Today they reach for web apps that demand a context switch, or scratch files that get lost. This feature delivers the core loop — add, see, complete, remove — entirely from the command line, with the list saved automatically so it survives across sessions. Success means a user can go from a cold shell to a tracked task in a single command, offline and with zero configuration.

---

## 2. Functional Requirements (The "What")

- **As a** terminal user, **I want to** add a task from the command line, **so that** I can capture work without leaving my shell.
  - **Acceptance Criteria:**
    - [x] Running `todo add "buy milk"` records the task and prints a confirmation that includes the new task's id and its text (e.g. `Added #1: buy milk`).
    - [x] Running `todo add` with no text (or empty text) does **not** create a task; it prints an error such as `Error: task text required` and exits with a non-zero status.
    - [x] Each added task receives an id that is unique among the current tasks (the next id is one greater than the largest current id), so it never collides with an existing task — even when an earlier task in the middle of the list was removed.

- **As a** terminal user, **I want to** list my tasks, **so that** I can see what is outstanding.
  - **Acceptance Criteria:**
    - [x] Running `todo list` prints every task on its own line, each showing its id, a completion marker (`[ ]` for open, `[x]` for done), and its text.
    - [x] When there are no tasks, `todo list` prints a friendly empty-state message (e.g. `No tasks yet.`) rather than nothing, and exits successfully.

- **As a** terminal user, **I want to** mark a task complete by id, **so that** I can track what I have finished.
  - **Acceptance Criteria:**
    - [x] Running `todo done 1` marks task 1 complete and prints a confirmation (e.g. `Completed #1: buy milk`); a later `todo list` shows that task with the `[x]` marker.
    - [x] Running `todo done` against an id that does not exist prints an error such as `Error: no task #<id>` and exits with a non-zero status, changing nothing.

- **As a** terminal user, **I want to** remove a task by id, **so that** I can clear things that no longer matter.
  - **Acceptance Criteria:**
    - [x] Running `todo remove 1` deletes task 1 and prints a confirmation (e.g. `Removed #1: buy milk`); a later `todo list` no longer shows it.
    - [x] Running `todo remove` against an id that does not exist prints an error such as `Error: no task #<id>` and exits with a non-zero status, changing nothing.

- **As a** terminal user, **I want** my list to persist automatically, **so that** it is still there next time.
  - **Acceptance Criteria:**
    - [x] Tasks added in one command are present when a later, separate command runs, with no save step required from the user.
    - [x] On the very first run, before any task exists, the tool behaves correctly (an empty list) without the user creating or configuring any file.

- **General command behavior:**
  - **Acceptance Criteria:**
    - [x] Running `todo` with no arguments, or with an unrecognized command, prints a usage/help message listing the available commands and exits with a non-zero status.

---

## 3. Scope and Boundaries

### In-Scope

- The four verbs `add`, `list`, `done`, `remove`, plus help/usage output.
- Automatic local persistence between commands.
- Human-readable success and error messages with correct exit codes.

### Out-of-Scope

- Editing a task's text after creation.
- Due dates, priorities, tags (Phase 2).
- Multiple named lists, export/import, sync (Phase 3).
- Any interactive prompt, TUI, or GUI.

---

## Change Log

_No amendments yet._

- [YYYY-MM-DD] — [source reference] — [what behavior changed and why]
