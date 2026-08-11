# AWOS Examples

Reference projects that show the AWOS spec-driven development (SDD) cycle end to end, with **real artifacts at every stage** — the documents under each example's `context/` are what the `/awos:*` commands actually produce, not hand-written stand-ins.

| Example                    | What it shows                                                                                                                                    | Stack                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| [`todo-cli/`](./todo-cli/) | The full golden path — product → roadmap → architecture → spec → tech → tasks → implement → verify — on a tiny, runnable, verified terminal app. | Node.js, zero-dep, CLI |

## How to use these

1. Read the example's `README.md` — it walks the flow stage by stage and links each artifact to the command that produced it.
2. Skim `context/` to see how one stage feeds the next (the roadmap item becomes the spec, the spec's acceptance criteria become the tests, and so on).
3. Follow the **Reproduce it yourself** section to run the same `/awos:*` chain in an empty directory and compare your output to the committed artifacts.

Each example is self-contained and runnable. `todo-cli` needs only Node.js (`npm test` from its folder runs the verified suite).
