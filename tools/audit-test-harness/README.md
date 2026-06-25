# Audit skill test harness

Repeatable, provenance-tagged test runs of the `/awos:ai-readiness-audit` skill against real local repos. A developer/QA aid — not shipped product (the installer only copies `commands/`, `templates/`, `scripts/`, `claude/commands/`, so this `tools/` dir never reaches a user's project).

- `run_audit_test.py` — deploy worktree skill → prepare target → run headless → measure tokens → archive.
- `compare_audit_runs.py` — diff two archived runs (per-dimension score deltas + tokens/cost).

**Where things live.** The scripts are committed here (`tools/audit-test-harness/`). The run archive stays at `<awos main checkout>/tmp/audit-runs/` (gitignored). Both scripts resolve that path automatically from the `awos-marketplace` directory source (falling back to the script's own repo root), so runs accumulate in one place no matter which checkout — main or a worktree — you invoke the harness from. `--worktree` defaults to the checkout the script lives in.

## The three traps it neutralizes

1. **`claude -p` does not read your worktree.** `awos-marketplace` is a _directory_ source pointing at the **main checkout**; the plugin is served from a version-pinned cache `~/.claude/plugins/cache/awos-marketplace/awos/<version>/`. Worktree edits are invisible until they reach that cache. The harness deploys the worktree's `plugins/awos/` there **all-or-nothing**: stage a full copy, SHA-verify, then atomically swap it in via `os.rename` (no rsync, no half-updated cache), and SHA-verify again after the swap.
2. **The output dir is a hardcoded date** (`context/audits/YYYY-MM-DD/`). Same-day re-runs overwrite, and `SKILL.md` Step 4 reads _other_ date-folders as a "previous audit" delta baseline. The harness controls this via `--phase` (below) and archives output elsewhere; comparison is done from the archive.
3. **The skill never reports tokens.** Measured by the harness from the final `stream-json` `result` event (`total_cost_usd`, `usage`, `duration_ms`, `num_turns`) into `run-meta.json`. Sub-agent usage rolls into that one session total.

## --phase first | second (empty vs. previous-audit-exists)

- `--phase first` — blank `context/audits/`, **no previous audit**. Cold/empty case.
- `--phase second` — **seed a previous audit** from the archive under a non-today date, then run, so the skill's delta logic fires. `--seed-from auto` (default) picks the newest prior archived run for this target; or pass `--seed-from <run-dir | context/audits/<date>>`. `--seed-date YYYY-MM-DD` overrides the folder date (defaults to the seed's own date, forced ≠ today).

Whatever is already in the target's `context/audits/` is **stashed into the run's `_preexisting/` first** (moved, never deleted) before blanking.

## Usage

```sh
H=<awos>/tools/audit-test-harness   # e.g. ~/code/awos/.worktrees/feat-ai-sdlc-metrics/tools/audit-test-harness

# Cold run (empty). --build only when you changed engine .ts (rebuilds dist/ before deploy).
python3 $H/run_audit_test.py --target ~/code/onex-discovery-api --phase first --label baseline

# After changing the skill, run the warm case seeded from that baseline:
python3 $H/run_audit_test.py --target ~/code/onex-discovery-api --phase second --label "tweaked QA-03" --build

# Compare the two newest runs (or pass two run dirs):
python3 $H/compare_audit_runs.py --target onex-discovery-api

# Preview without launching claude or touching the target (still deploys the cache):
python3 $H/run_audit_test.py --target ~/code/onex-discovery-api --dry-run
```

Other flags: `--worktree <path>` (skill under test; default = the checkout this script lives in), `--no-deploy` (use the already-deployed cache), `--claude-flags "<flags>"` (default `--dangerously-skip-permissions`).

## Org mode — pin nothing

Left to the skill. If exploration finds the repo depends on another repo (e.g. via a symlink pointing outside the repo, like onex-discovery-api's `.awos`/`context/product`), the skill audits that repo too — **this is desired**. The harness does not create or rely on `sources.toml`. Output then gains `per-repo/<repo>.json` + `org-portfolio.json`; `run-meta.json` summarizes `portfolio_metrics` and repo count instead of a single `audit_total`.

## Measuring tokens manually (fallback)

The script is the primary measure. If you instead run the audit **interactively** (in the Claude Code TUI rather than via this harness):

- Type **`/cost`** in that session for a running token + USD total.
- Or capture the same way the script does: run with `--output-format stream-json --verbose`, tee to a file, and read the final line: `tail -1 run.jsonl | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['total_cost_usd'], r['usage'])"`.
- Per-model / per-turn breakdown lives in the result event's `modelUsage`; a per-sub-agent view can be reconstructed from the `assistant` events in `run.jsonl`.

## Archive layout

```
<awos main checkout>/tmp/audit-runs/<repo>/<UTCstamp>__awos-<shortsha>[-dirty]__<phase>/
  run-meta.json     provenance + tokens + cost + headline score
  run.jsonl         full claude stream-json transcript
  audit-output/     copy of context/audits/<date>/ (dimensions, reports, collected/, per-repo/)
  _preexisting/     anything stashed out of the target before blanking (safety, never deleted)
```

## Restoring the cache to the shipped plugin

The deploy overwrites the main-checkout's cached plugin with worktree code; it's self-healing — every run re-deploys, and `claude plugin marketplace update awos-marketplace` restores the main checkout's version.

## Security note

The audit must run `node`, write files, and spawn sub-agents, so the harness passes `--dangerously-skip-permissions` to `claude`. Acceptable here because every target is one of your own local repos being read for analysis. Override via `--claude-flags`.
