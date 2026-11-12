# C4 diagram eval harness

Developer tooling (never shipped by the installer) for the pre-registered A/B/C eval of C4 diagrams in AWOS context documents. **The experimental design, metric definitions, and decision rule live in `docs/2.0/c4-diagram-eval-plan.md` — read that first; this README is only the operating manual.**

## Scripts

- `run-eval.mjs` — one run: copies the fixture to a scratch dir under `$TMPDIR/c4-eval-runs/`, swaps in the arm's context documents, installs AWOS from this checkout into the scratch (never into this repo), runs `/awos:tasks` and `/awos:implement` as two separate headless sessions (one fixed auto-continuation per session if the agent asks a question), runs the fixture's own test suite, and archives everything into gitignored `tmp/c4-eval-runs/<campaign>/run-NNN-<arm>/`. Takes a machine-wide lock; touches no global configuration.
- `grade-run.mjs` — deterministic extractors over one archived run → `metrics.json`. Pure, no API calls, unit-tested in `tests/c4-evals.test.js`.
- `compare-arms.mjs` — aggregates a campaign's runs by arm, applies the pre-registered pairwise rule and readout table, writes `campaign-summary.{json,md}` with the per-run table.
- `mermaid-edges.mjs` — Mermaid flowchart → deterministic edge-list text; generates arm C from arm B's documents (`node mermaid-edges.mjs arms/B/architecture.md`).

All scripts are plain no-dependency Node (`.mjs`), Node 22+.

## Running a campaign

Runs use the default logged-in Claude Code account (subscription — tokens, not dollars, are the cost metric). Arms must be strictly interleaved A/C/B; a usage-limit pause is fine (it delays all arms equally), but never reorder.

```sh
# one interleaved pass (repeat with --run-index 2..10):
node tools/c4-evals/run-eval.mjs --arm A --run-index 1 --campaign 2026-10-20 --model claude-sonnet-5-5
node tools/c4-evals/run-eval.mjs --arm C --run-index 1 --campaign 2026-10-20 --model claude-sonnet-5-5
node tools/c4-evals/run-eval.mjs --arm B --run-index 1 --campaign 2026-10-20 --model claude-sonnet-5-5

# after all 30 runs:
node tools/c4-evals/compare-arms.mjs tmp/c4-eval-runs/2026-10-20
```

Before run 1 of any campaign: the fixture's B-arm diagrams must carry a maintainer accuracy sign-off (recorded in `tests/fixtures/eval-c4-multiservice/README.md`), and the pinned `--model` string must be written down (currently `claude-sonnet-5-5` — the versioned ID, never the floating `sonnet` alias). Never compare runs across campaigns.
