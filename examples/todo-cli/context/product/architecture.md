# System Architecture Overview: Todo CLI

_The guiding constraint from the product definition — "no app to open, no account, no network, zero config" — drives every choice below toward the smallest possible runtime with no external dependencies._

---

## 1. Application & Technology Stack

- **Runtime:** Node.js (>= 18). _(Assumption — chosen because it is ubiquitous on developer machines and ships a built-in test runner; alternatives considered: a POSIX shell script (harder to test) or Python (heavier startup).)_
- **Language:** Plain JavaScript (ES modules). No transpiler or build step.
- **Distribution shape:** A single executable entry point (`bin/todo.js`) plus a small `src/` core, runnable directly with `node` or via an `npm`/`npx` bin link.
- **Runtime dependencies:** None. The standard library (`node:fs`, `node:path`, `node:process`) covers everything.

---

## 2. Data & Persistence

- **Primary store:** A single JSON file on the local filesystem holding an array of task records. _(Assumption — a flat JSON file matches the "zero-config, user-owns-the-data" goal; a real database would violate the no-setup constraint.)_
- **Location:** `$TODO_FILE` when set, otherwise `.todo.json` in the current working directory.
- **Record shape:** `{ id: number, text: string, done: boolean, createdAt: string (ISO 8601) }`.
- **Id strategy:** Monotonic integer = (highest existing id) + 1, so ids stay stable and human-typeable even after removals.
- **Concurrency:** Single-user, single-process, read-modify-write per command. No locking needed for the target use case.

---

## 3. Infrastructure & Deployment

- **Packaging:** Published/consumed as a local Node package; `package.json` declares the `bin` mapping so `npm link` or `npx` exposes the `todo` command.
- **Hosting environment:** None — the tool runs entirely on the user's machine.
- **Configuration:** A single optional environment variable (`TODO_FILE`). No config files.

---

## 4. External Services & APIs

- **Authentication:** None — the tool is single-user and local.
- **Third-party services:** None. Offline by design.
- **Network:** No network access is made at any point.

---

## 5. Observability & Quality

- **User feedback:** Each command prints a one-line human-readable result to stdout; errors go to stderr with a non-zero exit code.
- **Testing:** Node's built-in test runner (`node --test`) against the `src/` domain logic and the `bin/` CLI. No external test framework. _(Consistent with AWOS's own testing approach.)_
- **Logging/Metrics:** Out of scope for a local single-user CLI.
