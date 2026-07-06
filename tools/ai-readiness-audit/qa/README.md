# Audit skill test harness

Repeatable, provenance-tagged test runs of the `/awos:ai-readiness-audit` skill against real local repos. A developer/QA aid — not shipped product (the installer only copies `commands/`, `templates/`, `scripts/`, `claude/commands/`, so this `tools/` dir never reaches a user's project).

- `run_audit_test.ts` — deploy worktree skill → prepare target → run headless (with a live progress log) → guard engine compliance (retry/salvage) → measure tokens → archive → print a final summary.
- `compare_audit_runs.ts` — diff two archived runs (per-dimension score deltas + tokens/cost).
- `harness_lib.ts` — the pure helpers both scripts share (compliance counting, token aggregation, report-path collection), unit-tested by `harness.test.ts` (`npm run test:harness`, part of `npm test`).

The harness is TypeScript, run under `node --import tsx`; `tsx` is a devDependency, so run `npm ci` in the awos checkout once before first use.

**Where things live.** The scripts are committed here (`tools/ai-readiness-audit/qa/`). The run archive stays at `<awos main checkout>/tmp/audit-runs/` (gitignored). Both scripts resolve that path automatically from the `awos-marketplace` directory source (falling back to the script's own repo root), so runs accumulate in one place no matter which checkout — main or a worktree — you invoke the harness from. `--worktree` defaults to the checkout the script lives in.

## The four traps it neutralizes

1. **`claude -p` does not read your worktree.** `awos-marketplace` is a _directory_ source, and `claude` serves the plugin **live from its `installLocation`** (the main checkout) — **not** from the version caches under `~/.claude/plugins/cache/awos-marketplace/awos/<version>/`. (Deploying to those caches, which an earlier version of this harness did, was never loaded — every test silently ran the main checkout's old plugin.) So the harness repoints the marketplace's `source.path` + `installLocation` (in `known_marketplaces.json` and `settings.json`) at the worktree and runs `claude plugin marketplace update`, then **restores the originals in a `finally` block** — a failed or interrupted run still restores. The repoint affects any project using `awos` for the duration of the run. `--no-deploy` skips it (use whatever the marketplace currently serves).
2. **The output dir is a hardcoded date** (`context/audits/YYYY-MM-DD/`). Same-day re-runs overwrite, and `SKILL.md` Step 4 reads _other_ date-folders as a "previous audit" delta baseline. The harness controls this via `--phase` (below) and archives output elsewhere; comparison is done from the archive.
3. **The skill never reports tokens.** Measured by the harness from the final `stream-json` `result` event (`total_cost_usd`, `usage`, `duration_ms`, `num_turns`) into `run-meta.json`. Sub-agent usage rolls into that one session total.
4. **A regressed run silently reports green.** Under headless `claude -p`, the model stochastically rebuilds the removed per-dimension fan-out (spawning `dimension-auditor` subagents) instead of calling `audit-core` — producing `.md` letter-grade files and **no `audit.json`**, in a different, non-comparable scoring universe. rc was still 0 and an output dir existed, so it passed. The harness now **guards compliance**: after each run it asserts `audit.json` exists _and_ an `audit-core` Bash invocation appears in the transcript (echoed marker text never counts). On failure it relaunches `claude` up to `--retries` times (default 2), each retry carrying a corrective `--append-system-prompt` that tells the model there is no pre-run and any leftover `context/audits/` content is stale — a bare relaunch was shown (barley, 2026-07-03) to re-confabulate the same skip from leftover artifacts. If every attempt skips the engine, it **salvages** by running `audit-core` itself so the archive still holds a correct `audit.json`, then **exits non-zero** and records `compliance` (with `model_complied`, `audit_core_calls`, `fanout_agent_spawns`, `engine_seeded_by_harness`) in `run-meta.json` — the regression is caught and recovered, never silently green. `--no-engine-guard` records the signals only (no retry/salvage). The engine itself is the last line of defense: `audit-core` stamps `audit.json` with an engine-provenance marker, and `patch-judgment`/`render`/`rollup` refuse audits without it, so a hand-assembled audit cannot become a report.

## --phase first | second (empty vs. previous-audit-exists)

- `--phase first` — blank `context/audits/`, **no previous audit**. Cold/empty case.
- `--phase second` — **seed a previous audit** from the archive under a non-today date, then run, so the skill's delta logic fires. `--seed-from auto` (default) picks the newest prior archived run for this target; or pass `--seed-from <run-dir | context/audits/<date>>`. `--seed-date YYYY-MM-DD` overrides the folder date (defaults to the seed's own date, forced ≠ today).

Whatever is already in the target's `context/audits/` is **stashed into the run's `_preexisting/` first** (moved, never deleted) before blanking.

## Usage

```sh
# From the awos checkout whose skill is under test (npm ci once beforehand):

# Cold run (empty). --build only when you changed engine .ts (rebuilds dist/ before deploy).
npm run audit:test -- --target ~/code/onex-discovery-api --phase first --label baseline

# After changing the skill, run the warm case seeded from that baseline:
npm run audit:test -- --target ~/code/onex-discovery-api --phase second --label "tweaked QA-05" --build

# Compare the two newest runs (or pass two run dirs):
npm run audit:compare -- --target onex-discovery-api

# Preview without launching claude or touching the target or the marketplace:
npm run audit:test -- --target ~/code/onex-discovery-api --dry-run

# Equivalent direct form (any checkout):
node --import tsx <awos>/tools/ai-readiness-audit/qa/run_audit_test.ts --target ~/code/onex-discovery-api --dry-run
```

Other flags: `--worktree <path>` (skill under test; default = the checkout this script lives in), `--no-deploy` (don't repoint the marketplace — use whatever it currently serves), `--claude-flags "<flags>"` (default `--dangerously-skip-permissions`), `--model <name>` (model for the audit session and its subagents, passed to `claude -p --model`; default `sonnet` — the unpinned best-Sonnet alias), `--allow-user-mcp` (skip `--strict-mcp-config`, letting the session see the operator's user-scope MCP servers — real Jira, Slack, …; default is strict isolation so a test audit can never pull live connector data), `--quiet` (suppress the live log and progress output; only the final summary is printed).

## Live log + final summary

While the run is in flight, a concise live log streams to stderr, each line prefixed with the elapsed wall time `[MmSSs]`: every `Bash` tool call (first ~80 chars — so `audit-core`, `enrich`, `patch-judgment`, `render` invocations are visible), every `Agent`/`Task` subagent spawn, any assistant text matching the skill's progress emissions (`[Audit]` / `pct` / `eta_seconds`), per-segment result summaries, and a heartbeat after every 60s without stream events. `--quiet` suppresses it.

After archiving, a delimited **run summary** block is always printed (even with `--quiet`): wall time as `NmSSs`, tokens (in / out / cache-read / cache-write), cost as `$X.XXXX`, turns, the engine-compliance verdict, the judgments-patched verdict, the headline score, and the **absolute archived path(s) to `report.html`** (org mode lists the org report plus each `per-repo/<repo>/report.html`; a missing report is called out explicitly). The same `report_html` paths array is persisted into `run-meta.json`.

## Org mode — pin nothing

Left to the skill. `--target` also accepts a non-git parent folder of git repos — the skill then runs in org mode over its top-level git subdirectories. And if exploration finds the repo depends on another repo (e.g. via a symlink pointing outside the repo, like onex-discovery-api's `.awos`/`context/product`), the skill audits that repo too — **this is desired**. The harness does not create or rely on `sources.toml`. Output then gains `per-repo/<repo>/` — a full per-repo audit each (`audit.json`, `report.md`, `report.html`, `collected/`) — plus `org-portfolio.json`; `run-meta.json` summarizes `portfolio_metrics` and repo count instead of a single `audit_total`.

## Measuring tokens manually (fallback)

The script is the primary measure. If you instead run the audit **interactively** (in the Claude Code TUI rather than via this harness):

- Type **`/cost`** in that session for a running token + USD total.
- Or capture the same way the script does: run with `--output-format stream-json --verbose`, tee to a file, and read the final line: `tail -1 run.jsonl | node -e "let s='';process.stdin.on('data',(d)=>(s+=d)).on('end',()=>{const r=JSON.parse(s);console.log(r.total_cost_usd, JSON.stringify(r.usage))})"`.
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
node -p "JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/plugins/known_marketplaces.json', 'utf8'))['awos-marketplace'].installLocation"
# if it shows a worktree, repoint by hand then refresh:
#   edit ~/.claude/plugins/known_marketplaces.json + ~/.claude/settings.json back to the main checkout, then:
claude plugin marketplace update awos-marketplace
```

## Security note

The audit must run `node`, write files, and spawn sub-agents, so the harness passes `--dangerously-skip-permissions` to `claude`. Acceptable here because every target is one of your own local repos being read for analysis. Override via `--claude-flags`.
