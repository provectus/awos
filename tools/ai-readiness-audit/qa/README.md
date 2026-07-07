# Audit skill test harness

Repeatable, provenance-tagged test runs of the `/awos:ai-readiness-audit` skill against real local repos. A developer/QA aid — not shipped product (the installer only copies `commands/`, `templates/`, `scripts/`, `claude/commands/`, so this `tools/` dir never reaches a user's project).

- `run_audit_test.ts` — deploy worktree skill → prepare target → run headless (with a live progress log) → guard engine compliance (retry/salvage) → measure tokens → archive → print a final summary.
- `compare_audit_runs.ts` — diff two archived runs (per-dimension score deltas + tokens/cost).
- `harness_lib.ts` — the pure helpers both scripts share (compliance counting, token aggregation, report-path collection), unit-tested by `harness.test.ts` (`npm run test:harness`, part of `npm test`).

The harness is TypeScript, run under `node --import tsx`; `tsx` is a devDependency, so run `npm ci` in the awos checkout once before first use.

**Where things live.** The scripts are committed here (`tools/ai-readiness-audit/qa/`). The run archive stays at `<awos main checkout>/tmp/audit-runs/` (gitignored). Both scripts resolve that path automatically from the `awos-marketplace` directory source (falling back to the script's own repo root), so runs accumulate in one place no matter which checkout — main or a worktree — you invoke the harness from. `--worktree` defaults to the checkout the script lives in.

## The five traps it neutralizes

1. **`claude -p` does not read your worktree.** `awos-marketplace` is a _directory_ source, and `claude` serves the plugin **live from its `installLocation`** (the main checkout) — **not** from the version caches under `~/.claude/plugins/cache/awos-marketplace/awos/<version>/`. (Deploying to those caches, which an earlier version of this harness did, was never loaded — every test silently ran the main checkout's old plugin.) So the harness repoints the marketplace's `source.path` + `installLocation` (in `known_marketplaces.json` and `settings.json`) at the worktree and runs `claude plugin marketplace update`, then **restores the originals in a `finally` block** — a failed or interrupted run still restores. The repoint affects any project using `awos` for the duration of the run. `--no-deploy` skips it (use whatever the marketplace currently serves).
2. **The output dir lives in the target repo.** The skill writes into a datetime-stamped `context/audits/YYYY-MM-DD_HH-MM-SS/` under the target — there is no previous-audit or delta concept, so nothing there feeds a later run and pre-existing audits are simply left in place. The harness snapshots the dir's entries before the run, locates the run's own output by excluding that snapshot, archives it, and afterwards removes only what the run added (never a pre-existing audit; un-archived output is never deleted). Comparison is done from the archive.
3. **The skill never reports tokens.** Measured by the harness from the final `stream-json` `result` event (`total_cost_usd`, `usage`, `duration_ms`, `num_turns`) into `run-meta.json`. Sub-agent usage rolls into that one session total.
4. **A regressed run silently reports green.** Under headless `claude -p`, the model stochastically rebuilds the removed per-dimension fan-out (spawning `dimension-auditor` subagents) instead of calling `audit-core` — producing `.md` letter-grade files and **no `audit.json`**, in a different, non-comparable scoring universe. rc was still 0 and an output dir existed, so it passed. The harness now **guards compliance**: after each run it asserts `audit.json` exists _and_ an `audit-core` Bash invocation appears in the transcript (echoed marker text never counts). On failure it relaunches `claude` up to `--retries` times (default 2), each retry carrying a corrective `--append-system-prompt`. The corrective prompt is failure-mode aware: for a true engine skip it tells the model there is no pre-run and any leftover `context/audits/` content is stale (a bare relaunch was shown, barley 2026-07-03, to re-confabulate the same skip from leftover artifacts) and the leftover output dir is cleared; for an org attempt that finished its per-repo audits but ended without `rollup` (provectus-barhopping, 2026-07-06 — 8/8 per-repo audits done, no `org-portfolio.json`, full fan-out re-run cost ~$35), the engine-stamped `per-repo/<repo>/audit.json` files are PRESERVED and the prompt steers the retry to only `rollup` + `render`. Because that rollup retry is explicitly forbidden from re-running `audit-core`, its own transcript legitimately shows `audit_core_calls=0` — so the compliance gate counts the preserved earlier attempt's engine calls too (`carried_audit_core_calls` in `run-meta.json`); artifacts alone never satisfy the gate (a copied/stale `audit.json` with zero engine calls anywhere in the run stays non-compliant, so a run must actually re-run `audit-core`). The carry resets whenever a retry clears the previous output. If every attempt skips the engine, it **salvages** by running `audit-core` itself so the archive still holds a correct `audit.json`, then **exits non-zero** and records `compliance` (with `model_complied`, `audit_core_calls`, `fanout_agent_spawns`, `engine_seeded_by_harness`) in `run-meta.json` — the regression is caught and recovered, never silently green. `--no-engine-guard` records the signals only (no retry/salvage). The engine itself is the last line of defense: `audit-core` stamps `audit.json` with an engine-provenance marker, and `patch-judgment`/`render`/`rollup` refuse audits without it, so a hand-assembled audit cannot become a report.
5. **Concurrent runs corrupt each other.** Every run mutates state shared beyond its target: the marketplace repoint is a single global config, and same-target runs share the live `context/audits/`. Observed 2026-07-07 (barhopping): a second run launched 13 min into a live one — it stashed the live run's half-written output as `_preexisting`, its orchestrator adopted the other session's artifacts as "already audited" and spun ~10 min re-verifying files that kept changing under it, and its `finally`-restore left the marketplace pointing at the worktree (the "original" it had captured was the first run's repoint). The harness (and the smoke) now take a **machine-wide run lock** (`$TMPDIR/awos-audit-harness.lock`); a second launch dies immediately naming the live holder (pid, target, start time). A lock whose holder pid is dead (crash/SIGKILL) is stale and taken over automatically.

## Isolation — every run starts clean

Every run is the cold case: the audit has no previous-audit or delta concept, and its output dirs are datetime-stamped, so there is nothing to seed and nothing to blank — pre-existing audits in the target are never touched. After archiving, the run's own output is removed from the target so a test run persists no reports in a real repo.

## Usage

```sh
# From the awos checkout whose skill is under test (npm ci once beforehand):

# Run against a target. --build only when you changed engine .ts (rebuilds dist/ before deploy).
npm run audit:test -- --target ~/code/onex-discovery-api --label baseline

# After changing the skill, run again and compare the numbers:
npm run audit:test -- --target ~/code/onex-discovery-api --label "tweaked QA-05" --build

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

After archiving, a delimited **run summary** block is always printed (even with `--quiet`): wall time as `NmSSs`, tokens (in / out / cache-read / cache-write), cost as `$X.XXXX`, turns, the engine-compliance verdict, the judgments-patched verdict, the headline score, and the **absolute archived path(s) to `report.html`**. On a retried run the cost line sums every attempt (each `claude -p` launch bills separately), and `run-meta.json` records `total_cost_usd` as that sum plus `attempt_costs_usd` / `final_attempt_cost_usd` (org mode lists the org report plus each `per-repo/<repo>/report.html`; a missing report is called out explicitly). The same `report_html` paths array is persisted into `run-meta.json`.

## Org mode — pin nothing

Left to the skill. `--target` also accepts a non-git parent folder of git repos — the skill then runs in org mode over its top-level git subdirectories. And if exploration finds the repo depends on another repo (e.g. via a symlink pointing outside the repo, like onex-discovery-api's `.awos`/`context/product`), the skill audits that repo too — **this is desired**. The harness does not create or rely on `sources.toml`. Output then gains `per-repo/<repo>/` — a full per-repo audit each (`audit.json`, `report.md`, `report.html`, `collected/`) — plus `org-portfolio.json`; `run-meta.json` summarizes `portfolio_metrics` and repo count instead of a single `audit_total`.

## Measuring tokens manually (fallback)

The script is the primary measure. If you instead run the audit **interactively** (in the Claude Code TUI rather than via this harness):

- Type **`/cost`** in that session for a running token + USD total.
- Or capture the same way the script does: run with `--output-format stream-json --verbose`, tee to a file, and read the final line: `tail -1 run.jsonl | node -e "let s='';process.stdin.on('data',(d)=>(s+=d)).on('end',()=>{const r=JSON.parse(s);console.log(r.total_cost_usd, JSON.stringify(r.usage))})"`.
- Per-model / per-turn breakdown lives in the result event's `modelUsage`; a per-sub-agent view can be reconstructed from the `assistant` events in `run.jsonl`.

## Archive layout

```
<awos main checkout>/tmp/audit-runs/<repo>/<UTCstamp>__awos-<shortsha>[-dirty]/
  run-meta.json     provenance + tokens + cost + headline score
  run.jsonl         full claude stream-json transcript
  audit-output/     copy of context/audits/<stamp>/ (dimensions, reports, collected/, per-repo/)
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
