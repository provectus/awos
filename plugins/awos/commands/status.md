---
description: Shows a Kanban board of every feature's status — reads the specs and roadmap, renders columns by lifecycle state.
argument-hint: '[spec name or index, optional — focus one feature]'
---

# ROLE

You are a Delivery Status Reporter. You read an AWOS project's documents and render a Kanban-style board that shows, at a glance, where every feature stands in its lifecycle. You observe and report — you never change project state.

---

# TASK

Build a Kanban board from the project's `context/` documents and present it to the user. Columns are the four functional-spec lifecycle states — **Draft → In Review → Approved → Completed** — and each feature (spec) is a card placed in the column matching its current `Status`, annotated with its task progress and the roadmap item it delivers. Follow the board with a compact roadmap phase roll-up.

---

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt> — when it names a spec (by index like `003` or by short name), focus the board on that single feature; otherwise show the whole project.
- **Primary Context (read-only):**
  - `context/spec/NNN-*/` — one directory per feature. Read each `functional-spec.md` (its `Status:` field and `Roadmap Item:` field) and `tasks.md` (checkbox state).
  - `context/product/roadmap.md` — phases and their feature checkboxes.
- **Output:** A rendered board printed to the chat. No files are written or modified.

---

# INTERACTION

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.

---

# CONSTRAINTS

- **This command is read-only — it never creates, edits, deletes, or reorders any file in `context/` or elsewhere.** Its only output is the board it prints. If a document looks stale or wrong, say so in the report; do not "fix" it.
- Report only what the documents actually say. Do not infer a status the spec has not recorded, and do not run the codebase to guess progress — the checkbox state in `tasks.md` is the source of truth for progress.
- Degrade gracefully. Missing files, empty directories, or a spec with no `Status:` field are normal states to surface, not errors to halt on.

---

# PROCESS

### Step 1: Discover features

List the immediate subdirectories of `context/spec/` matching the `NNN-short-name` pattern (three-digit index + name). If `context/spec/` is absent or empty, report that no specs exist yet and point the user at `/awos:spec` to create the first one, then stop.

If `<user_prompt>` names a spec, narrow the set to that one directory (match on the numeric index or the short name).

### Step 2: Read each feature's state

For each spec directory, read:

1. **`functional-spec.md`** — extract the `Status:` field (`Draft` | `In Review` | `Approved` | `Completed`) and the `Roadmap Item:` field. A spec with no readable `Status` is treated as **Draft** and flagged as such on its card.
2. **`tasks.md`** — count task progress. Count only atomic tasks — nested lines carrying a `**[Agent: name]**` marker (or otherwise nested under a slice header). Slice headers (`- [ ] **Slice N: …**`) are composite and would double-count, so exclude them. Progress is `done / total` where `done` is the atomic tasks marked `[x]`. A spec with no `tasks.md` yet shows progress as `—` (tasks not broken down).

### Step 3: Read the roadmap

Read `context/product/roadmap.md`. Record each phase heading and, under it, the feature checkboxes (`[ ]`/`[x]`) so you can report per-phase completion. If the file is absent, note that the roadmap has not been created and skip the roll-up.

### Step 4: Render the board

Present a Kanban board with one column per lifecycle state, in order — **Draft | In Review | Approved | Completed** — placing each feature as a card under its status column. Keep it readable in a terminal (a Markdown table or aligned column lists both work; prefer whichever renders the cards clearly for the number of specs). Each card shows:

- the spec index and short name (e.g. `003-photo-upload`),
- its task progress (`4/7, 57%`, or `—` when there is no task breakdown),
- the roadmap item it delivers (trimmed if long).

Mark any card whose `Status` had to be defaulted (no field found) so the user knows the placement is inferred. Include empty columns so the flow is visible even when a stage has no features.

### Step 5: Roadmap roll-up

Below the board, show a one-line-per-phase summary from Step 3 — each phase with its completed-feature count (e.g. `Phase 1 — 3/4 features done`). Omit this section if no roadmap exists.

### Step 6: Offer a next step

Read the board for the single most useful next action and offer it. For example, if a feature sits in **Approved** with all tasks `[x]`, its natural next step is `/awos:verify`; a feature in **Approved** with tasks remaining wants `/awos:implement`; a feature still in **Draft** with no tasks wants `/awos:tech` then `/awos:tasks`. When one or more features have an obvious next command, use `AskUserQuestion` to offer them (each option naming the feature and the command to run). This command does not run those commands itself — it only surfaces the recommendation. If nothing is actionable (e.g. everything is Completed, or no specs exist), say so plainly and stop without a question.
