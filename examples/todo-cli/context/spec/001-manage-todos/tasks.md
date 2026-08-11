# Tasks: Manage Todos

_Vertical slices — after each slice the app is runnable and a new piece of user-visible value works. Task agent markers use `general-purpose` because this example installs no specialist agents (a real project would run `/awos:hire` first; see the Recommendations note). All tasks are `[x]`: this plan was executed by `/awos:implement` and confirmed by `/awos:verify`._

- [x] **Slice 1: Add a task and see it persisted**
  - [x] Scaffold the package: `package.json` (`type: module`, `bin` → `bin/todo.js`, `test` script) and empty `src/`, `bin/`, `test/` layout. **[Agent: general-purpose]**
  - [x] Implement `src/store.js` — `load(file)` (empty array when the file is absent), `save(file, tasks)`, path resolution from `TODO_FILE` or `.todo.json`. **[Agent: general-purpose]**
  - [x] Implement `addTask`/`nextId`/`formatTask` in `src/todo.js` and wire the `add` verb in `bin/todo.js` (load → add → save → print `Added #<id>: <text>`; empty text → `Error: task text required`, exit 1). **[Agent: general-purpose]**
  - [x] Verify: run `todo add "buy milk"` twice against a temp `TODO_FILE`, confirm both are saved with ids #1 and #2 and the confirmation lines print; confirm empty text exits non-zero. Delete any scratch files produced. **[Agent: general-purpose]**

- [x] **Slice 2: List tasks**
  - [x] Implement `formatList` in `src/todo.js` and wire the `list` verb in `bin/todo.js` (one line per task `#<id> [ ]/[x] <text>`; `No tasks yet.` when empty). **[Agent: general-purpose]**
  - [x] Verify: with a seeded `TODO_FILE`, run `todo list` and confirm each task renders with id, marker, and text; run against an empty file and confirm `No tasks yet.` with exit 0. Delete scratch files. **[Agent: general-purpose]**

- [x] **Slice 3: Complete a task**
  - [x] Implement `completeTask(tasks, id)` (throws `NotFoundError` on a missing id) and wire the `done` verb (`Completed #<id>: <text>`; missing id → `Error: no task #<id>`, exit 1). **[Agent: general-purpose]**
  - [x] Verify: mark a seeded task done, confirm a subsequent `list` shows `[x]`; confirm `done 999` exits non-zero and changes nothing. Delete scratch files. **[Agent: general-purpose]**

- [x] **Slice 4: Remove a task (ids not reused)**
  - [x] Implement `removeTask(tasks, id)` (throws `NotFoundError` on a missing id); confirm `nextId` derives from max id so a new id never collides with a still-present task after a middle removal. Wire the `remove` verb (`Removed #<id>: <text>`; missing id → `Error: no task #<id>`, exit 1). **[Agent: general-purpose]**
  - [x] Verify: with tasks `#1 #2 #3`, remove the middle one, confirm it disappears from `list`; add a new task and confirm it gets `#4` (max + 1) and collides with nothing; confirm `remove 999` exits non-zero. Delete scratch files. **[Agent: general-purpose]**

- [x] **Slice 5: Usage / help and unknown-command handling**
  - [x] In `bin/todo.js`, print a usage message listing the verbs when invoked with no args or an unknown verb, and exit 1. **[Agent: general-purpose]**
  - [x] Verify: run `todo` and `todo bogus`, confirm usage text on stderr and non-zero exit. Delete scratch files. **[Agent: general-purpose]**

- [x] **Slice 6: Feature Testing & Regression**

  > Verifies the whole feature end-to-end against functional-spec.md, run after all implementation slices are complete.
  - [x] Read functional-spec.md acceptance criteria in full. Generate acceptance-level tests that verify the entire feature as a whole — not individual slices. Cover unit (pure domain in `src/todo.js`) and integration/e2e (drive `bin/todo.js` as a child process against a temp `TODO_FILE`). Write tests with RED validation (must fail before implementation is confirmed done). Annotate each test with `@spec: 001-manage-todos` and `@regression`. **[Agent: general-purpose]**
  - [x] Run all generated tests. All must pass. Fix any failures before proceeding. **[Agent: general-purpose]**

---

## Recommendations

- **No specialist / QA agent installed:** This example is intentionally self-contained, so every task is assigned to the built-in `general-purpose` agent and the Feature Testing & Regression slice uses it too. In a real project you would run `/awos:hire` first to add a stack specialist (e.g. a Node/JS engineer) and a `testing-expert`, and `/awos:tasks` would assign those instead.
