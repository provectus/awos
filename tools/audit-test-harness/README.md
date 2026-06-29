# Audit skill test harness

Repeatable, provenance-tagged test runs of the `/awos:ai-readiness-audit` skill against real local repos. A developer/QA aid — not shipped product (the installer only copies `commands/`, `templates/`, `scripts/`, `claude/commands/`, so this `tools/` dir never reaches a user's project).

- `run_audit_test.py` — deploy worktree skill → prepare target → run headless → guard engine compliance (retry/salvage) → measure tokens → archive.
- `compare_audit_runs.py` — diff two archived runs (per-dimension score deltas + tokens/cost).

**Where things live.** The scripts are committed here (`tools/audit-test-harness/`). The run archive stays at `<awos main checkout>/tmp/audit-runs/` (gitignored). Both scripts resolve that path automatically from the `awos-marketplace` directory source (falling back to the script's own repo root), so runs accumulate in one place no matter which checkout — main or a worktree — you invoke the harness from. `--worktree` defaults to the checkout the script lives in.

## The four traps it neutralizes

1. **`claude -p` does not read your worktree.** `awos-marketplace` is a _directory_ source, and `claude` serves the plugin **live from its `installLocation`** (the main checkout) — **not** from the version caches under `~/.claude/plugins/cache/awos-marketplace/awos/<version>/`. (Deploying to those caches, which an earlier version of this harness did, was never loaded — every test silently ran the main checkout's old plugin.) So the harness repoints the marketplace's `source.path` + `installLocation` (in `known_marketplaces.json` and `settings.json`) at the worktree and runs `claude plugin marketplace update`, then **restores the originals in a `finally` block** — a failed or interrupted run still restores. The repoint affects any project using `awos` for the duration of the run. `--no-deploy` skips it (use whatever the marketplace currently serves).
2. **The output dir is a hardcoded date** (`context/audits/YYYY-MM-DD/`). Same-day re-runs overwrite, and `SKILL.md` Step 4 reads _other_ date-folders as a "previous audit" delta baseline. The harness controls this via `--phase` (below) and archives output elsewhere; comparison is done from the archive.
3. **The skill never reports tokens.** Measured by the harness from the final `stream-json` `result` event (`total_cost_usd`, `usage`, `duration_ms`, `num_turns`) into `run-meta.json`. Sub-agent usage rolls into that one session total.
4. **A regressed run silently reports green.** Under headless `claude -p`, the model stochastically rebuilds the removed per-dimension fan-out (spawning `dimension-auditor` subagents) instead of calling `audit-core` — producing `.md` letter-grade files and **no `audit.json`**, in a different, non-comparable scoring universe. rc was still 0 and an output dir existed, so it passed. The harness now **guards compliance**: after each run it asserts `audit.json` exists _and_ `audit-core` appears in the transcript. On failure it relaunches `claude` up to `--retries` times (default 2; the reversion is ~1-in-5, so a retry usually complies). If every attempt skips the engine, it **salvages** by running `audit-core` itself so the archive still holds a correct `audit.json`, then **exits non-zero** and records `compliance` (with `model_complied`, `audit_core_calls`, `fanout_agent_spawns`, `engine_seeded_by_harness`) in `run-meta.json` — the regression is caught and recovered, never silently green. `--no-engine-guard` records the signals only (no retry/salvage). Root cause is the documented "Known gap" in the repo `CLAUDE.md` (load-time `` !`…` `` injection is dead in plugin skills).

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

# Preview without launching claude or touching the target or the marketplace:
python3 $H/run_audit_test.py --target ~/code/onex-discovery-api --dry-run
```

Other flags: `--worktree <path>` (skill under test; default = the checkout this script lives in), `--no-deploy` (don't repoint the marketplace — use whatever it currently serves), `--claude-flags "<flags>"` (default `--dangerously-skip-permissions`).

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

## Marketplace repoint is auto-restored

Each run records the original `awos-marketplace` `source.path` + `installLocation`, repoints them at the worktree, and restores them in a `finally` block — so a normal or failed run leaves your marketplace pointing back at the main checkout. If a run is hard-killed (SIGKILL) mid-flight, the marketplace may be left pointing at the worktree; recover with:

```sh
# inspect — should be your main checkout, not a worktree
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.claude/plugins/known_marketplaces.json')))['awos-marketplace']['installLocation'])"
# if it shows a worktree, repoint by hand then refresh:
#   edit ~/.claude/plugins/known_marketplaces.json + ~/.claude/settings.json back to the main checkout, then:
claude plugin marketplace update awos-marketplace
```

## Security note

The audit must run `node`, write files, and spawn sub-agents, so the harness passes `--dangerously-skip-permissions` to `claude`. Acceptable here because every target is one of your own local repos being read for analysis. Override via `--claude-flags`.
