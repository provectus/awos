<!--
This document describes HOW to build the feature at an architectural level.
It is NOT a copy-paste implementation guide.
-->

# Technical Specification: Manage Todos

- **Functional Specification:** ./functional-spec.md
- **Status:** Completed
- **Author(s):** Founding Engineer (via `/awos:tech`)

---

## 1. High-Level Technical Approach

Implement the feature as a tiny, dependency-free Node.js package with a clean separation between three concerns: a **store** that reads/writes the JSON file, a **domain** module that holds the task operations as pure functions over an in-memory list, and a **CLI** entry point that parses argv, calls the domain, persists the result, and prints output. This keeps the domain logic trivially unit-testable without touching the filesystem, and confines all I/O to thin edges (the store and the CLI).

Affected systems: none pre-exist — this is the first feature, so it establishes the project skeleton described in `architecture.md`.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### Component Breakdown

| Path                | Responsibility                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/todo.js`       | Pure domain functions over a task array: `addTask(tasks, text)`, `completeTask(tasks, id)`, `removeTask(tasks, id)`, `nextId(tasks)`, `formatTask(task)`, `formatList(tasks)`. No I/O. Throws typed errors (`ValidationError`, `NotFoundError`) on bad input. |
| `src/store.js`      | Persistence edge: `load(file)` returns the task array (empty array if the file is absent), `save(file, tasks)` writes it. Resolves the target path from `TODO_FILE` env var or the `.todo.json` default.                                                      |
| `bin/todo.js`       | CLI edge: parse `argv`, dispatch on the verb, load → mutate via domain → save, print result to stdout, print errors to stderr with `process.exitCode = 1`. Prints usage on unknown/empty command.                                                             |
| `test/todo.test.js` | Acceptance + unit tests using `node --test`.                                                                                                                                                                                                                  |
| `package.json`      | Declares `type: module`, the `bin` mapping (`todo` → `bin/todo.js`), and the `test` script.                                                                                                                                                                   |

### Data Model

A single JSON file (path from `TODO_FILE` or `.todo.json`) containing an array of records:

| Field       | Type    | Notes                                                |
| ----------- | ------- | ---------------------------------------------------- |
| `id`        | number  | `max(existing ids) + 1`; unique among current tasks. |
| `text`      | string  | Non-empty; trimmed.                                  |
| `done`      | boolean | Defaults to `false`.                                 |
| `createdAt` | string  | ISO 8601 timestamp.                                  |

### CLI Contract

| Invocation                  | Effect          | stdout                                                       | Exit |
| --------------------------- | --------------- | ------------------------------------------------------------ | ---- |
| `todo add "<text>"`         | append task     | `Added #<id>: <text>`                                        | 0    |
| `todo add` / empty text     | none            | `Error: task text required` (stderr)                         | 1    |
| `todo list`                 | —               | one line per task `#<id> [ ]/[x] <text>`, or `No tasks yet.` | 0    |
| `todo done <id>`            | set `done=true` | `Completed #<id>: <text>`                                    | 0    |
| `todo remove <id>`          | delete          | `Removed #<id>: <text>`                                      | 0    |
| `todo done/remove <bad id>` | none            | `Error: no task #<id>` (stderr)                              | 1    |
| `todo` / unknown verb       | none            | usage text (stderr)                                          | 1    |

### Logic Notes

- `nextId` derives from the **max** existing id, not the array length. This is what keeps ids unique after a middle `remove`: with tasks `#1 #2 #3`, removing `#2` leaves `#1 #3`; length-based numbering would hand the next task `#3` and collide, whereas `max + 1` correctly yields `#4`. (Ids of the highest task _may_ be reused once it is removed — the guarantee is uniqueness among current tasks, not lifetime-uniqueness.)
- The CLI is the only place that resolves the store path and performs I/O; the domain stays pure so tests can exercise it in-memory.

---

## 3. Impact and Risk Analysis

- **System Dependencies:** Node.js runtime only. No packages, no services, no network.
- **Potential Risks & Mitigations:**
  - _Corrupt or hand-edited JSON file_ → `store.load` wraps `JSON.parse` and fails with a clear `Error: could not read task file` rather than a raw stack trace.
  - _Non-integer / missing id argument_ → treated as "no such task" and produces the standard `Error: no task #<id>` path, exit 1.
  - _Working-directory-relative default file_ could surprise users running from different directories → documented in the example README; `TODO_FILE` gives an explicit override.

---

## 4. Testing Strategy

- **Unit:** Domain functions in `src/todo.js` tested directly in-memory (add assigns ids, complete/remove by id, id uniqueness after a middle removal, validation errors).
- **Integration / acceptance:** Drive `bin/todo.js` as a child process against a temp `TODO_FILE`, asserting stdout, exit codes, and cross-command persistence — one test per acceptance criterion in the functional spec.
- **Runner:** `node --test` (built in, zero dependencies), matching the project architecture. RED validation: each acceptance test is written to fail before its behavior exists, then pass after.
