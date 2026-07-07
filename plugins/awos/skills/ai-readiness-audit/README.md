# ai-readiness-audit — maintainer README

This file is for people working **on** the skill (in the AWOS repo). The runtime entry point that Claude follows is [SKILL.md](SKILL.md); users invoke it as `/awos:ai-readiness-audit`. Nothing here is loaded during an audit.

## What the skill does

It measures how ready a codebase (or a whole portfolio of repos) is for AI-assisted development, and renders the result as a report (`report.md` + a self-contained `report.html`) backed by JSON artifacts under `context/audits/YYYY-MM-DD_HH-MM-SS/` in the audited project.

The design premise: **scoring must be deterministic and repeatable**, so almost none of it is done by the model — and the engine enforces this with a provenance circuit-breaker: only `audit-core` stamps `audit.json` (`engine.generated_by`), and `patch-judgment`/`render`/`rollup` refuse an unstamped audit, so a hand-assembled score can never become a report. The split is:

- **The engine** (`dist/cli.js`, bundled from the TypeScript in this directory) does the measurement. One command — `audit-core <repo> <outDir>` — evaluates project-topology flags, runs every `detected`/`computed` category across all dimensions in a single pass, and writes one `<dimension>.json` per dimension plus the aggregated `audit.json`. Layers inside the engine: `collectors/` (git/ci/tracker/docs → one JSON artifact each), `detectors/` (per-category filesystem/grep checks), `metrics/` (DORA-style computations over collector artifacts, complexity/scale via bundled tree-sitter grammars), `render.ts` (JSON → both report formats), `metrics/org_rollup.ts` (portfolio aggregation).
- **The orchestrator** (the model, following SKILL.md) fills only the slice the engine cannot compute: it fetches reachable connector sources (Jira/Confluence/… via MCP, per [references/connector-shapes.md](references/connector-shapes.md)), re-scores them with one `enrich` pass, decides the 5 `judgment` categories against fixed rubrics and applies them with one `patch-judgment` call, authors the narrative report blocks (headline/insights/recommendations), and renders with one `render --format both` call.

In **org mode** (the target is a non-git folder of repos, or a GitHub org) the orchestrator dispatches one `awos:repo-auditor` subagent per repo — each runs the same single-repo flow into `per-repo/<repo>/` — then aggregates with `rollup` into `org-portfolio.json` and an org-level report.

Flow, end to end: scope discovery + one `AskUserQuestion` → `audit-core` → connector fetch + `enrich` → `patch-judgment` → author blocks → `render`. Scoring semantics (additive weighted points, uncapped total, coverage ratio, reliability tags) are specified in [scoring.md](scoring.md); the JSON-to-report contract in [output-format.md](output-format.md).

## The role of standards.toml

[references/standards.toml](references/standards.toml) is the **scoring model as data**. Every capability category the audit can award lives there as a `[category.*]` record:

- `code` (numeric id) and `check_id` (the `ADP-01`/`DF-02`/`QA-07`-style id that appears in reports and dimension docs);
- `weight` — the points awarded when present; a dimension's score is the sum of its awarded weights, the audit total is the sum across dimensions, nothing is capped;
- `method` — who evaluates it: `detected` (a detector in `detectors/`), `computed` (a metric in `metrics/`), or `judgment` (the orchestrator, against the rubric in the dimension file);
- `applies_when` — a project-topology expression (e.g. `topology.is_monorepo`, `topology.has_tracker`) that gates whether the category counts toward the applicable weight at all;
- `source`, `url`, `date`, `last_verified` — the external authority (DORA, OWASP, SLSA, …) that justifies _why_ the capability matters; the report surfaces the citation next to the check;
- `reliability_default` and band definitions where the metric is banded.

The engine reads this file at run time — **adding or re-weighting a category is a data change, not a code change**, unless it also needs a new detector/metric function. Dimension membership and per-check prose live in [dimensions/](dimensions/) (one `.md` per dimension; the frontmatter and `**Category:**` codes must agree with standards.toml — the Layer-1 lint and the engine's `detector-coverage` test enforce this).

## How to test it headless

Behavioral testing runs the real skill through headless `claude -p` via the TypeScript harness in [`tools/ai-readiness-audit/qa/`](../../../../tools/ai-readiness-audit/qa/README.md) (repo-relative: `tools/ai-readiness-audit/qa/`; run via `npm run audit:test`, needs `npm ci` once for `tsx`). It deploys **your worktree's** version of the plugin by repointing the local marketplace (and restores it afterward), blanks the target's `context/audits/` for isolation, guards against the known engine-skipping regression, measures tokens/cost, and archives everything under `<awos main checkout>/tmp/audit-runs/<target>/<timestamp>__<sha>/`.

```sh
# Single-repo run. --build rebuilds dist/ first — use it whenever engine .ts changed.
npm run audit:test -- --target ~/code/some-repo --label "my change" --build

# Org mode — point at a non-git parent folder of git repos:
npm run audit:test -- --target ~/code/some-org-folder --label "org run"

# Compare the two newest archived runs for a target (scores per dimension + tokens/cost):
npm run audit:compare -- --target some-repo
```

Flags worth knowing: `--model` (default `sonnet`), `--dry-run` (preview, touches nothing), `--no-deploy` (test whatever the marketplace currently serves), `--allow-user-mcp` (let the session see your real MCP servers — required for testing live Jira/Confluence connector fetches; the default is strict isolation), `--retries` (engine-compliance retry count), `--quiet` (only the final summary). While in flight the harness streams a `[MmSSs]`-prefixed live log (engine Bash calls, subagent spawns, progress emissions, a 60s heartbeat) and finishes with a summary block: wall time, tokens, cost, compliance/judgment verdicts, and the absolute archived `report.html` path(s). Each run's `run-meta.json` records provenance (worktree SHA, model), token usage, `compliance` (did the model actually call `audit-core`), `partial`, `judgments_patched`, and `report_html` — a run that died mid-flight or skipped the engine exits non-zero instead of looking green.

Deterministic unit/integration tests for the engine itself don't need the harness: `npm run test:engine` (needs `npm ci` once), `npm run typecheck`. After any engine `.ts` edit, `npm run build:engine` and commit the regenerated `dist/` — CI fails on a stale bundle.

## How to update it over time

- **standards.toml (the scoring model)** — run the maintainer skill [`/standards-refresh`](../../../../.claude/skills/standards-refresh/SKILL.md) once per major AWOS release, or whenever a cited standard publishes a new edition. It re-verifies every `source`/`url` (dead links, redirects-to-home, self-references to the AWOS repo), proposes replacement authorities, and re-evaluates weights against current practice — emitting a cited proposal document plus a ready-to-paste `standards-refresh-patch.toml`. Review the proposal, apply the patch to `standards.toml`, and update `last_verified`. `tools/ai-readiness-audit/standards-linkcheck.mjs` is the quick mechanical subset (link liveness only).
- **Adding a dimension** — drop a new `dimensions/<name>.md` with frontmatter and per-check sections, add its `[category.*]` records to standards.toml, and (for `detected`/`computed` categories) register the detector/metric functions. The `detector-coverage` test fails until every non-judgment category has an implementation; `[meta].dimension_order` controls report order.
- **Adding or tuning a metric** — implement in `metrics/`, map it to a category code, and keep the fixture contract: every scored metric must reach 0 on a worst-case repo and its max on a best-case one, and must SKIP (with a reason) rather than FAIL when its data source is absent or unreadable.
- **Prompt changes** (SKILL.md, dimension docs, connector-shapes) — the Layer-1 lint (`npm run test:lint`) pins the load-bearing phrases; after behavioral edits, validate with a harness run rather than trusting a read-through, and compare against the previous archive with `npm run audit:compare`.
- **Versioning** — when skill behavior changes, bump the version in both `.claude-plugin/marketplace.json` and `plugins/awos/.claude-plugin/plugin.json` (release-drafter drives the actual release from PR labels).
