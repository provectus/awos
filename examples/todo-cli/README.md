# Golden-Path Example: Todo CLI

This is a **complete, runnable walk-through of the entire AWOS spec-driven development (SDD) cycle** on one small-but-real project: a zero-dependency terminal todo list. Every document under [`context/`](./context) is a real artifact of the corresponding `/awos:*` command — not a hand-written stand-in — and the code under [`src/`](./src), [`bin/`](./bin), and [`test/`](./test) is what the flow actually produced and verified.

Read it top to bottom to see how a vision becomes a verified feature, then reproduce it yourself.

---

## The app in 20 seconds

```console
$ todo add "write release notes"
Added #1: write release notes
$ todo add "fix flaky test"
Added #2: fix flaky test
$ todo list
#1 [ ] write release notes
#2 [ ] fix flaky test
$ todo done 1
Completed #1: write release notes
$ todo remove 2
Removed #2: fix flaky test
$ todo list
#1 [x] write release notes
```

Tasks persist automatically to `$TODO_FILE` (default `./.todo.json`). No dependencies, no config, no network — `node bin/todo.js <verb>`.

Run it here:

```bash
cd examples/todo-cli
node bin/todo.js add "try AWOS"
node bin/todo.js list
npm test   # 15 tests, all green
```

---

## The AWOS flow, stage by stage

Each stage below names the command that produced the artifact, what the command does, and the file it wrote. This is the exact order a newcomer runs them.

### Foundation (run once)

| #   | Command              | What it produced                                                  | Artifact                                                                           |
| --- | -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `/awos:product`      | The non-technical product definition — what, why, for whom.       | [`context/product/product-definition.md`](./context/product/product-definition.md) |
| 2   | `/awos:roadmap`      | Features grouped into sequential phases. Phase 1 is this feature. | [`context/product/roadmap.md`](./context/product/roadmap.md)                       |
| 3   | `/awos:architecture` | The stack & persistence decisions (Node, zero-dep, JSON file).    | [`context/product/architecture.md`](./context/product/architecture.md)             |

> A real project would also run `/awos:hire` here to install specialist agents. This example stays self-contained and uses the built-in `general-purpose` agent, so `/awos:hire` is intentionally skipped — see the note at the bottom of [`tasks.md`](./context/spec/001-manage-todos/tasks.md).

### Feature cycle (once per roadmap feature)

| #   | Command           | What it produced                                                                                                   | Artifact                                                                                                                   |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 4   | `/awos:spec`      | Functional spec — user-facing behavior + **testable acceptance criteria**.                                         | [`context/spec/001-manage-todos/functional-spec.md`](./context/spec/001-manage-todos/functional-spec.md)                   |
| 5   | `/awos:tech`      | Technical spec — module breakdown, data model, CLI contract, risks.                                                | [`context/spec/001-manage-todos/technical-considerations.md`](./context/spec/001-manage-todos/technical-considerations.md) |
| 6   | `/awos:tasks`     | Vertical **slices** of atomic tasks, each ending in a verify step.                                                 | [`context/spec/001-manage-todos/tasks.md`](./context/spec/001-manage-todos/tasks.md)                                       |
| 7   | `/awos:implement` | The actual code — delegated per task, ticking `tasks.md` as it goes.                                               | [`src/`](./src), [`bin/`](./bin), [`test/`](./test)                                                                        |
| 8   | `/awos:verify`    | Checked every acceptance criterion against the running app, marked them `[x]`, set the spec **Status: Completed**. | (updates the spec)                                                                                                         |

The final states you can see in this folder are the _output_ of the whole run: every acceptance criterion in `functional-spec.md` is `[x]`, every task in `tasks.md` is `[x]`, and the spec is `Completed`.

---

## How the code maps to the tech spec

The tech spec's core decision was a clean split between pure logic and I/O — that is exactly the shape of the code:

- [`src/todo.js`](./src/todo.js) — **pure domain**: `addTask`, `completeTask`, `removeTask`, `nextId`, `formatList`. No filesystem access, so it is trivially unit-testable.
- [`src/store.js`](./src/store.js) — **persistence edge**: `load`/`save` the JSON file, resolve `TODO_FILE`.
- [`bin/todo.js`](./bin/todo.js) — **CLI edge**: parse argv → load → domain op → save → print; usage/errors to stderr with exit code 1.
- [`test/todo.test.js`](./test/todo.test.js) — unit tests over the domain plus one acceptance test per criterion, driving `bin/todo.js` as a child process.

One design subtlety worth calling out (the tech spec does too): `nextId` is `max(existing id) + 1`, **not** `length + 1`. Removing a middle task from `#1 #2 #3` leaves `#1 #3`; a length-based scheme would reissue `#3` and collide, while `max + 1` correctly yields `#4`. The test `next id stays unique after a middle removal` locks this in — revert `nextId` to length-based and it fails (that's the RED check the flow ran).

---

## Reproduce it yourself

You do **not** need this folder's files to reproduce the flow — that's the point. Start empty and let the commands regenerate everything:

```bash
# 1. In an empty directory, install AWOS (sets up .awos/, .claude/commands/awos/, context/)
mkdir my-todo && cd my-todo
npx @provectusinc/awos

# 2. Open the directory in Claude Code, then run the commands in order.
#    Give /awos:product the same seed idea this example used:
/awos:product a zero-config terminal todo list for developers who live in the shell
/awos:roadmap
/awos:architecture
/awos:spec        # picks the first incomplete roadmap item: Manage Todos
/awos:tech
/awos:tasks
/awos:implement
/awos:verify
```

Compare each document the commands write under your `context/` to the committed artifacts here. They won't be byte-identical (the AI drafts prose fresh each run), but the **structure, the acceptance criteria, the slice breakdown, and the verified end state** will line up with what you see in this folder.

> Tip: the commands are designed to run unattended — a skipped question falls back to a documented default and the deliverable is still written. So you can drive the whole chain even in a headless `claude -p` session.

---

## What this example demonstrates

- A full, honest SDD loop: **product → roadmap → architecture → functional spec → technical spec → tasks → implementation → verification.**
- Real artifacts at every stage, coherent with each other (the roadmap item, the spec, and the tests all describe the same feature).
- A verification stage that **actually runs the software** and passes against the stated acceptance criteria (15/15 tests green, plus a demonstrated RED check).
- The AWOS conventions in practice: vertical slices, `**[Agent: …]**` task markers, a Feature Testing & Regression slice, and `Status: Completed`.
