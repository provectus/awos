# AI-SDLC audit — metric issues (evidence for investigation)

This directory is an evidence dossier for the `/awos:ai-readiness-audit` deterministic engine (`plugins/awos/skills/ai-readiness-audit/`). It is meant as the input to a `superpowers` brainstorming → writing-plans → fix cycle: the findings are reproduced and evidenced here; the fix plan is to be designed from them.

## How these were found

While building an end-to-end test suite for the engine (in the sibling `awos-qa` repo, branch `feat/audit-e2e`), we deliberately constructed a **minimum-score** fixture and a **maximum-score** fixture — the classic "can every metric reach 0, and can every metric reach its max?" exercise. Three classes of problem fell out:

1. **Explicitly broken metrics** — the measurement does not match the metric's own description. A well-formed project is scored wrong. See [`01-explicit-metric-bugs.md`](./01-explicit-metric-bugs.md).
2. **Implicitly broken metrics** — metrics that _cannot_ reach 0 and/or cannot reach their max, or that **interfere** with each other so that no single project state can be extremal for both at once (one file is a good signal for metric A and simultaneously a bad signal for metric B). See [`02-metric-range-and-interference.md`](./02-metric-range-and-interference.md).
3. **Data-source blind spots** — metrics derived from git merge commits silently mis-measure on repos that squash-merge / rebase-merge PRs (no merge commits exist) or route all merges through one person or bot (merge authorship concentrates on the merger). A whole family of DORA/throughput metrics reads 0 / SKIP / one-person-only. See [`03-squash-merge-blind-spot.md`](./03-squash-merge-blind-spot.md).

Out of scope: the org/multi-repo mode not auto-triggering from a detected linked repo under `claude -p` is **by design** (linked repos are intentionally not investigated), not a bug.

## Reproducing

Everything reproduces from this worktree with the built engine bundle:

```sh
CLI="plugins/awos/skills/ai-readiness-audit/dist/cli.js"
node "$CLI" audit-core <repoPath> <outDir>          # full deterministic pass
node "$CLI" metric <metric_id> <repoPath>            # a single metric
```

The richer, composed fixtures (min/max/type/connector matrix) live in `awos-qa` at `e2e/fixtures/audit-pieces/` and are driven by `e2e/audit-compose.js`; see that repo's README section "The `audit-*` family". The `data/` dir here holds self-contained evidence captured from those runs:

- `data/self-pollution-evidence.json` — same repo scored differently by output location.
- `data/arch05-evidence.json` — standard test files read as naming violations.
- `data/doc06-evidence.json` — 100% documentation coverage scored < full.
- `data/range-analysis.txt` — per-check min/max score across the min→max fixture spectrum.

## The ask

Investigate each finding, confirm/adjust root cause, and produce a plan that (a) fixes the explicit bugs and (b) for interfering/degenerate metrics, decides how to **diverge** them (so each can independently span 0→max) or **remove/merge** the redundant one. Note where a check should become informational (a descriptor) rather than scored.
