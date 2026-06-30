# Audit Org-Report + Metrics v3 — Implementation Plan

> **Hand-off note (read first):** This plan is written to be executed by a **separate, fresh CC session** that has the repo + root `CLAUDE.md` but none of the conversation that produced this plan. It is self-contained: every task names exact files (with `file:line` anchors from a code survey), the change, the reasoning, and how to verify. Execute with `superpowers:subagent-driven-development` (a fresh subagent per task, review between tasks) or `superpowers:executing-plans`. On approval, this file should be saved to `docs/design/2026-06-30-audit-org-report-and-metrics-v3-plan.md` (replacing the earlier draft committed there) and the work done on branch `feat/ai-sdlc-metrics` (PR #139).

All engine paths below are under `plugins/awos/skills/ai-readiness-audit/` unless noted.

---

## Context — why this work

The single-repo audit is in good shape, but two rounds of real runs surfaced gaps:

1. **The org (multi-repo) report is a dead end.** It shows only 3 portfolio numbers and a 5-column repo table with no per-repo detail, no drill-down, no aggregated sources, and no org-level "what to improve". Users expect each repo to be openable as its own full report, the top matrix to be the org average of the same metrics, and Connections to aggregate across repos with counts.
2. **The delivery metrics are bucketed and partly the wrong shape.** Everything is averaged over 30-day buckets across a 730-day window; the team wants a single recent window (90 days), an "active contributor" notion that excludes drive-by committers (PM/QA), churn reframed as a directional windowed turnover/rework rate, the DORA 2025 "Rework Rate", and three new ticketing/adoption metrics. The headline matrix needs to become the canonical set of delivery numbers.
3. **Jira fetch silently stops at ~100 tickets** (a per-request MCP cap), so tracker metrics under-sample long-lived projects.
4. **`collectors/git.ts` `run()` swallows all git errors silently** — only the 1 MiB buffer case was fixed; unexpected failures still vanish.

The architecture stays as-is: a deterministic TypeScript engine (`dist/cli.js`) computes everything scoreable; the LLM orchestrator (`SKILL.md`) fills only the judgment/connector slice and authors plain-language blocks into `audit.json`; `render.ts` is a pure JSON→MD/HTML renderer. Engine changes get unit tests; report-copy/connector changes are SKILL.md + `connector-shapes.md` guidance.

---

## Global constraints (apply to every task)

- **Real Node toolchain.** Use `/opt/homebrew/bin/node` (the global `node` is a Bun shim that breaks `node:test`). Run engine tests with `export PATH="/opt/homebrew/bin:$PATH" && npm run test:engine`.
- **`dist/` is committed and CI-gated.** After editing any engine `.ts`: `npm run build:engine` and commit the regenerated `dist/cli.js`. CI runs `git diff --exit-code` on `dist/`.
- **Do not bump the plugin version** — release-drafter owns versioning via PR labels.
- **Contributor data stays aggregate, no PII.** This governs collection only; never echo a privacy disclaimer into report copy.
- **Markdown prose is not hard-wrapped** at 80 cols — one logical line per paragraph/bullet.
- **Tests narrate the contract** they verify in the `assert` message (not "N pass").

(Removed per maintainer: the per-category-source-link verification and the Prettier emphasis are no longer plan-level constraints. CI still runs Prettier; just `npx prettier --write` your changed files before committing.)

### Standard verify loop (the tail of every engine task)

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run test:engine          # all engine unit tests green
npm run build:engine         # regenerate dist/
npx prettier --write <changed files>
git add <changed .ts/.toml/.md + dist/cli.js> && git commit -m "<conventional msg>"
```

There is **no end-to-end validation phase** — headless `claude -p` runs are ~$8, stochastic, and mostly manual. Verify each change with engine unit tests; a maintainer will do the occasional headless run out of band (the harness already has the engine-compliance guard).

---

## Locked decisions (from maintainer feedback)

- **One window, no buckets.** Remove `monthly_bucket_days` and all 30-day bucketing. Every delivery metric is a single aggregate over `max_lookback_days`. **Remove `value_series`/sparklines entirely** (Q1/Q2/Q3).
- **`max_lookback_days = 90`** (was 730).
- **Active contributor** = author not below the 10% threshold on **both** merge-share and LOC-share over the window. Threshold is a new `[meta]` param `active_contributor_threshold = 0.1`.
- **Org per-repo drill-down = separate report files in folders.** Each repo renders its own `per-repo/<repo>/report.html`; the org report links to them. No single giant embedded HTML, no in-page `#repo/` routing (Q4).
- **Weights:** the DORA delivery metrics (deploy frequency, lead time, change-failure rate, MTTR, **Rework Rate**) get `weight = 10` — they are the important signals. Cycle time gets the default `weight = 3` (tracker-gated). The two raw per-active-contributor ratios (merges/contrib, LOC/contrib) are **display-only headline values, not scored categories** — raw output volume has no defensible good/bad direction and DX/DORA explicitly warn against rewarding it; they appear in the headline but award no weight. *(If the maintainer wants them scored, that needs banding thresholds first — flag before implementing.)*
- New metrics' `applies_when` = `"always"` for git-derived, `"topology.has_tracker"` for ticketing-derived (Q5 defaults).

---

## How the engine fits together (orientation for the executor)

- **Metric registry is explicit, not auto-discovered.** `audit_core.ts:218-224` receives a `metrics` map; it is hand-built in `cli.ts:150-170` (`METRICS`, keyed by metric-id string) with one import each at `cli.ts:87-105`. Adding a metric = new `metrics/<id>.ts` + one import + one `METRICS` entry + a `[category.*]` block in `standards.toml`.
- **A category routes to its metric by name:** `audit_core.ts:301-305` collects every `category.metric` lacking a detector; `audit_core.ts:319-324` runs `metrics[id](collectedDir, standards, topology, repoPath)`. The metric awards its codes via `awardCategories(standards, '<id>', topology)` (`metrics/_base.ts:198-226`).
- **Score → weight.** A metric returns a continuous `score ∈ [0,1]` (capability fraction). `audit_core.ts:756`: `weight_awarded = round(weight_max · score · 10)/10`, `weight_max = category.weight`. So bumping a category's `weight` to 10 scales its contribution; no other change needed.
- **Bands live in TS, not TOML.** The `[band.*]` tables in `standards.toml` are documentation-only (nothing reads them at runtime). Real DORA thresholds are TS anchors fed to `bandScore(...)` (`metrics/_score.ts:43-61`); see `metrics/adp_g3_deploy_frequency.ts:36-49,113-117` for the pattern (label fn + anchors → `score`).
- **`applies_when` gating:** `audit_core.ts:651-656` + `:687-691` — `"always"` or `"topology.<flag>"`; gated-off → SKIP, excluded from the coverage denominator.
- **Connector metrics:** the engine runs git/ci/tracker/docs collectors itself; with no connector, tracker/docs collectors return `available:false` so their metrics SKIP. The orchestrator (SKILL.md Step 6.2) fetches the live MCP, writes `collected/<source>.json` in the `connector-shapes.md` shape, re-runs `cli.js metric <id> <repo> <collectedDir>`, patches the check, then `aggregate`. Tracker metrics read `collected/tracker.json` (template: `metrics/adp_i2_throughput.ts:33,48-67`). **Name any new tracker metric `adp_i*`** so the standalone re-run path auto-collects tracker (`cli.ts:321-337`).
- **`dimensions/*.md`** is NOT read for the category list (that's `standards.toml`); the engine only reads it for the code→`check_id` fallback (`audit_core.ts:614-648`) and judgment rubrics. A new `computed` category does not strictly need a `.md` edit, but add one for human/source consistency.

---

## Phase 0 — One 90-day window, no buckets, no value_series

Foundational; Phases 1–2 read its output.

### Task 0.1 — `[meta]`: 90-day window, drop `monthly_bucket_days`

**Files:** `references/standards.toml` (`[meta]`); a test in `tests/` (create `tests/standards-meta.test.ts`).
**Why:** the team wants recent signal (last quarter), not a 2-year average, and a single window removes the bucket machinery entirely.
**Change:** set `max_lookback_days = 90`; delete `monthly_bucket_days`. Grep every consumer and fix defaults: `grep -rn "max_lookback_days\|monthly_bucket_days\|730\|bucket_days" --include=*.ts .` — expect `metrics/_base.ts` (`capBucketsByHistory`, soon removed), `collectors/git.ts` (`period.bucket_days`, `lookback`), `audit_core.ts`, `cli.ts`.

- [ ] Failing test: parse `standards.toml`, assert `meta.max_lookback_days === 90` and `meta.monthly_bucket_days === undefined`.
- [ ] Apply `[meta]` change; fix `?? 730` / `?? 30` fallbacks to drop bucketing (collapse to the single window — completed in 0.2).
- [ ] Standard verify loop.

### Task 0.2 — git collector emits one windowed aggregate with per-author rows

**Files:** `collectors/git.ts` (`buildMonthlyBuckets`→removed, `GitRaw`, `collect` at `:324-347`); `tests/git-collector.test.ts`.
**Why:** the active-contributor filter (Phase 1) and de-bucketed delivery metrics (Phase 2) need per-author merge/LOC totals over the single window, not per-bucket author counts.
**Change:** replace `monthly_buckets` with:

```ts
// GitRaw.window_stats — whole-window delivery aggregates (replaces monthly_buckets)
window_stats: {
  window_days: number;          // = meta.max_lookback_days
  commits: number;
  merges: number;               // first-parent merges into default branch, in window
  authors_total: number;        // distinct authors in window
  per_author: Array<{ author: string; commits: number; merges: number; lines: number }>;
}
```

Derive `per_author.lines` from `git log --all --since=<window> --no-merges --numstat --format=%H\t%aN` (sum added+deleted per author); `per_author.merges` from `git log --first-parent --merges --since=<window> --format=%aN`. The window is still anchored to the newest commit date (no wall-clock), as `buildMonthlyBuckets` does today (`collectors/git.ts:185-205`). Mind the existing `maxBuffer: 512*1024*1024` in `run()`. Keep `numstat_totals`, `merge_records`, `history_available_days`.

- [ ] Failing tests on a temp repo (reuse `git()`/`repo()` helpers): assert `window_stats.merges`, `authors_total`, and `per_author` rows are correct for a crafted history.
- [ ] Implement; delete `buildMonthlyBuckets` + `monthly_buckets`.
- [ ] Standard verify loop.

### Task 0.3 — Remove `value_series` end-to-end

**Files (exact, from survey):** producers `metrics/adp_g2_contributors.ts:75-92`, `adp_g3_deploy_frequency.ts:108-128`, `adp_g4_lead_time.ts:139,161,185`, `adp_g5_pr_cycle_time.ts:139,161,185`; type/param `metrics/_base.ts:61-66,87,117,146-148` (`ValueSeriesEntry`, `MetricResult.value_series`, `makeMetricResult` param); renderer `render.ts:143` (CheckRecord field), `sparkline()` `:478` (+use `:727-728`), `sparklineSvg()` `:912` (+use `:1401-1402`), doc comments `:475,998`; docs `output-format.md:51,71`, `report-template.md:30`; tests `tests/history.test.ts`, `tests/render.test.ts:52,77,178,384,614`. **No `audit_core.ts` change** — it already never carries `value_series`.
**Why:** with a single window there is no series to draw; sparklines become dead weight.

- [ ] Update the failing tests first (remove/adjust the value_series and sparkline assertions in `history.test.ts` and `render.test.ts`).
- [ ] Remove `value_series` from the 4 producers and the `_base.ts` type+param; remove `sparkline`/`sparklineSvg` + their call sites from `render.ts`; scrub the docs.
- [ ] Standard verify loop. **Acceptance:** no `value_series`/`sparkline` references remain (`grep -rn "value_series\|sparkline" --include=*.ts .` is empty).

---

## Phase 1 — Active Contributor

### Task 1.1 — `active_contributor_threshold` + active-contributor computation

**Files:** `references/standards.toml` (`[meta]` add `active_contributor_threshold = 0.1`; update `[category.active_contributors]` at `:138-152`); rewrite `metrics/adp_g2_contributors.ts`; new `metrics/adp_g2_contributors.test.ts`.
**Why:** a team of 3 SDE + 1 ML + 1 PM + 1 QA has ~4 people actually delivering code; counting raw distinct authors overstates the delivery base and distorts the per-contributor ratios.
**Rule (lock it — Phase 2 ratios reuse it):** from `window_stats.per_author`, `merge_share = merges/Σmerges`, `loc_share = lines/Σlines`; **exclude** an author iff `merge_share < T AND loc_share < T`; `active_contributors = count(not excluded)`.

```ts
function activeContributors(perAuthor: AuthorRow[], T: number): number {
  const tm = perAuthor.reduce((s, a) => s + a.merges, 0) || 1;
  const tl = perAuthor.reduce((s, a) => s + a.lines, 0) || 1;
  return perAuthor.filter(a => !((a.merges / tm < T) && (a.lines / tl < T))).length;
}
```

- [ ] Failing tests: the 6-person team → `4` with `T=0.1`; single author → `1`; empty → SKIP; `T` read from `meta.active_contributor_threshold` (default `0.1`).
- [ ] Rewrite `compute()` to read `window_stats.per_author` + the threshold; `value = active count`; `expression = "4 active contributors (90d; 2 excluded <10% on merges & LOC)"`; update the category `definition`. Keep `reliability_default = "not-reliable"` (it's a heuristic count). It still awards code `201`.
- [ ] Standard verify loop.

### Task 1.2 — Merges/LOC per active contributor (display-only headline values)

**Files:** add computed fields to the git artifact in `collectors/git.ts` (`merges_per_active`, `loc_per_active` under `window_stats`, computed once `active_contributors` is known — or compute in a tiny helper the headline authoring reads); test in `git-collector.test.ts`.
**Why:** the headline needs "throughput per delivering person", normalized so big and small teams compare. These are **display-only** (see Locked decisions) — they award no weight, so no banding needed.
**Change:** `merges_per_active = window_stats.merges / active_contributors`; `loc_per_active = window_stats.per_author.reduce(+lines) / active_contributors` (guard divide-by-zero → null). Surface them on the git artifact so SKILL.md Step 6.4 can transcribe into `headline.delivery`.

- [ ] Failing test: crafted history → expected ratios (and null when 0 active).
- [ ] Implement; standard verify loop.

---

## Phase 2 — Delivery metrics over the whole window + turnover + Rework Rate

### Task 2.1 — Deploy frequency & lead time as single whole-window aggregates

**Files:** `metrics/adp_g3_deploy_frequency.ts`, `metrics/adp_g4_lead_time.ts`; `references/standards.toml` (bump both `weight` to `10`); tests `tests/met-adp-g3-deploy-frequency.test.ts` (+ create g4 test).
**Why:** the team wants one recent number per DORA metric, not a bucket average; and these are the headline signals, hence weight 10.
**Change:** deploy frequency = `window_stats.merges / (window_days/7)` merges/week over the whole window; lead time = median of all in-window `merge_records` branch-age. Keep the existing TS band anchors + `bandScore` → `score`; drop `capBucketsByHistory`/`value_series`. Set `[category.merge_frequency].weight = 10`, `[category.lead_time_for_change].weight = 10`.

- [ ] Failing tests: whole-window value + correct band + `weight_max === 10`.
- [ ] Implement; standard verify loop.

### Task 2.2 — Change-failure rate whole-window, weight 10

**Files:** `metrics/adp_g7_change_fail_rate.ts`; `standards.toml` (`[category.change_failure_rate].weight = 10`); test.
**Change:** ensure the revert/hotfix-follows-merge share sums over the single window; keep TS band. Bump weight to 10.
- [ ] Failing test → whole-window share + band + weight 10. Implement; verify loop.

### Task 2.3 — Convert `adp_g6_churn` → windowed code-turnover (banded, directional)

**Files:** `collectors/git.ts` (new turnover computation), `metrics/adp_g6_churn.ts` (rewrite to band it), `references/standards.toml` (`[category.code_churn]` definition → turnover; add the TS band anchors in the metric module; add `[meta] rework_horizon_days = 21`); tests `metrics/adp_g6_churn.test.ts` + `git-collector.test.ts`.
**Why:** raw lifetime `added+deleted` is directionless and unbounded; turnover (recently-written lines soon rewritten) is a bounded, directional health signal.
**Definition (locked):** `turnover = (lines deleted/modified whose authored-age < rework_horizon_days) ÷ (total lines merged)`, from a single oldest→newest diff replay bounded to the last `(window + rework_horizon)` days. Bands ≈ `<12% good / 12–18% watch / >18% concerning`. `reliability_default = "minimal"` (approximate line attribution is industry-accepted). The collector does the git replay (collector work); the metric bands the ratio via `bandScore`.

- [ ] Failing collector test: a file written then largely rewritten within the horizon → high turnover; a stable repo → low.
- [ ] Implement the bounded replay in `collectors/git.ts` (walk `git log --reverse --numstat` over the bounded window; approximate deleted-line age by replaying successive states — document the approximation and keep it bounded/fast).
- [ ] Rewrite `adp_g6_churn.compute()` to band the turnover ratio (TS anchors); update `definition`; pick `source` (keep DX Core 4 or DORA per Task 2.4 research).
- [ ] Standard verify loop. **Acceptance:** `adp_g6` is a banded directional turnover %, not raw churn.

### Task 2.4 — New metric: DORA 2025 **Rework Rate** (research spike → implement)

**Files:** `metrics/adp_g14_rework_rate.ts` (new; template `metrics/adp_i2_throughput.ts`); `cli.ts` (+import `:~105`, +`METRICS` entry `:~169`); `references/standards.toml` (`[category.rework_rate]`, template `[category.issue_throughput]:338-352`, `weight = 10`, `method = "computed"`); `dimensions/ai-sdlc-adoption.md` (a `### / **Category:**` entry); test `metrics/adp_g14_rework_rate.test.ts`.
**Research spike (do first; deliverable = a cited definition):**
- [ ] Confirm the DORA 2025 "rework rate" definition + thresholds from the DORA 2025 report (`https://dora.dev/research/2025/`, verify with WebFetch; record exact definition + bands). Define it at the **delivery** level (unplanned/failed-then-refixed work) **distinct from** Task 2.3 line-level turnover, and say so in the category `definition` to avoid double-counting.
**Implement:**
- [ ] Failing test with crafted inputs → expected rate + band + `weight_max === 10`.
- [ ] Implement from git (and tracker if richer); register in `cli.ts`; TS band anchors; `applies_when = "always"`; verified `source`/`url`/`date`.
- [ ] Standard verify loop.

---

## Phase 3 — New ticketing / adoption metrics (each gated by a research spike)

All three are **tracker-connector** metrics named `adp_i*` (so the standalone re-run path auto-collects tracker, `cli.ts:321-337`); `applies_when = "topology.has_tracker"`; SKIP without a tracker. Each spike must produce a **verified** authoritative source before implementation (the maintainer asked for "proofs from the internet"); if none is found, set `weight` low + `reliability "minimal"` and say so.

### Task 3.1 — Ticket sub-task split ratio (over-splitting is negative)

**Files:** `metrics/adp_i4_subtask_split.ts` (new); `cli.ts` (+import/entry); `standards.toml` (`[category.ticket_subtask_split]` + TS band, default `weight = 3`); `references/connector-shapes.md` (extend `TicketRecord` with `parent`/`subtask_count`); `SKILL.md` Step 6.2 (capture parent/subtask links from Jira); test.
**Why:** AI auto-splitting a ticket into many sub-tasks assigned across roles fragments work and adds coordination/context-switching cost — a negative adoption signal.
**Spike:** find an authority that over-fragmentation harms flow (search: "work fragmentation context-switching cost", "too-granular stories anti-pattern", INVEST "small but not too small"). Verify a URL.
**Implement:** compute `avg subtasks per parent` and/or `share of tickets with > K subtasks`, banded (low good); `reliability "minimal"`. Failing test on a synthetic `tracker.json`; implement; verify loop.

### Task 3.2 — Ticket description quality/richness

**Files:** `metrics/adp_i5_description_quality.ts` (new); `cli.ts`; `standards.toml` (`[category.ticket_description_quality]` + band, `weight = 3`); `connector-shapes.md` (have the collector capture description/AC **size/structure signals**, not raw text — avoid PII/bulk); `SKILL.md` Step 6.2; test.
**Why:** thin tickets ("fix bug") starve both humans and AI agents of context; description quality is an AI-readiness signal.
**Spike:** cite INVEST (Bill Wake), Definition of Ready, or Atlassian/Agile-Alliance acceptance-criteria guidance. Verify a URL.
**Implement:** deterministic proxy (share of tickets with a non-trivial description AND acceptance criteria AND structure), banded; `reliability "minimal"`. Failing test; implement; verify loop.

### Task 3.3 — AI-adoption metric: onboarding ease

**Files:** `metrics/adp_g15_onboarding_ease.ts` (new, `ai-sdlc-adoption` dimension); `cli.ts`; `standards.toml` (`[category.onboarding_ease]` + band, `weight = 3`, `applies_when = "always"`); test.
**Why:** how fast a new contributor becomes productive is a core AI-SDLC outcome (good docs + bootstrap + agent context shorten it).
**Spike:** cite DX Core 4 onboarding time / "time to 10th PR", or GitHub/Microsoft time-to-first-commit research. Verify a URL.
**Implement:** git-derived proxy (e.g. README run steps + CLAUDE.md + `.env.example` + one-command bootstrap presence, plus median first-commit→first-merge for new authors in window), banded; reliability per data available. Failing test; implement; verify loop.

---

## Phase 4 — Headline matrix redesign

Headline rows (every report; org = average — Phase 5): **1** Points + Coverage · **2** Merges/active contributor · **3** LOC/active contributor · **4** Deployment frequency · **5** Rework Rate (DORA 2025) · **6** Lead time (whole window) · **7** Change-failure rate · **8** Cycle time (Jira In-Progress→Done — only with a tracker connector) · **9** MTTR (only with an incident connector).

### Task 4.1 — Headline schema + renderer

**Files:** `render.ts` (`Headline`/`DeliveryMetric` types + `execBand()` `:1102-1184`, `BAND_COLOR` `:966`); `render.test.ts`.
**Change:** extend `DeliveryMetric` with an optional `gated?: 'tracker' | 'incident'` so the renderer prints "— (needs ticketing connector)" / "— (needs incident connector)" instead of a number when the gated source is absent. Keep DORA band coloring. Renderer formats only.
- [ ] Failing render test: a headline JSON with all 9 rows (some gated/absent) renders each labeled value or a clear "needs X connector" note, DORA bands colored.
- [ ] Implement in `execBand`; standard verify loop.

### Task 4.2 — SKILL.md headline authoring

**Files:** `SKILL.md` Step 6.4 (`:126-132`); `output-format.md` (Headline schema).
**Change:** instruct the orchestrator to transcribe the 9 rows verbatim from the check_ids (active-contributor ratios from the git artifact, deploy-freq, rework-rate, lead-time, change-fail, cycle-time, MTTR), reading bands from each check's `hint`; gate cycle-time/MTTR on connector availability; never invent numbers. No code test (prompt change); covered by 4.1 fixture + a maintainer headless run.

---

## Phase 5 — Org (multi-repo) report overhaul

Today every repo's `audit-core` writes to the **shared** dated dir and is overwritten (`SKILL.md:68`); only a 5-field summary survives in `per-repo/<repo>.json` (`org_rollup.ts:35-46`). So there is no per-repo detail to render. Fix the collision, then build the org views from the preserved per-repo audits.

### Task 5.1 — Preserve each repo's full audit + render a per-repo report file

**Files:** `SKILL.md` Step 6 org branch (`:48,144-176`).
**Why:** this is the root enabler — full per-repo `audit.json` already exists momentarily; just stop overwriting it, and reuse the existing single-repo renderer per repo.
**Change (orchestration only, no engine change):** run each repo's `audit-core` into its **own** subdir `context/audits/YYYY-MM-DD/per-repo/<repo>/` (pass that as `audit-core`'s `<outDir>`, `cli.ts:501-518`). After patch/aggregate, render that repo's report into the same subdir: `cli.js render .../per-repo/<repo>/audit.json --format html > .../per-repo/<repo>/report.html` (and `.md`). Keep the 5-field summary too (or derive it from the repo's `audit.json`).
- [ ] Update SKILL.md org branch accordingly; verify by a maintainer headless org run that each `per-repo/<repo>/` has a full `audit.json` + `report.html`.

### Task 5.2 — Rollup reads full per-repo audits; org headline = average matrix

**Files:** `metrics/org_rollup.ts` (extend `PerRepoInput`/`OrgRollupResult` `:35-70`), `cli.ts rollup` (`:358-417`) to read each repo's full `audit.json` (not just the summary); tests.
**Why:** the org top matrix must mirror the single-repo headline, averaged, and the per-repo table needs each repo's delivery numbers.
**Change:** `rollup` ingests each `per-repo/<repo>/audit.json`; for each repo extract `audit_total`, `coverage`, and the 9 headline values; emit (a) an org `headline` whose `delivery[]` is the per-metric **mean** across repos (average the raw value, then re-band via the same TS band fns — extract them to a shared helper if needed; skip repos missing a metric and note coverage), and (b) an enriched `per_repo[]` carrying every column for Task 5.3. Keep the 3 portfolio cards.
- [ ] Failing tests: org headline rows = mean of per-repo values, correctly re-banded; `per_repo[]` rows carry pts/coverage/merges-per/loc-per/deploy/lead/change-fail/cycle/mttr.
- [ ] Implement; update `output-format.md` org schema; standard verify loop.

### Task 5.3 — Per-repo table with metric columns + links to per-repo reports

**Files:** `render.ts` `reposSection()` (`:1482-1508`); `render.test.ts`.
**Why:** the maintainer wants the org "Repositories" section to be the single-repo headline columns per repo, each row opening that repo's report.
**Change:** replace the 5-column table with: **Repo | Points | Coverage | Merges/active | LOC/active | Deploy freq | Lead time | Change-fail | Cycle time¹ | MTTR²** (¹ only if tracker, ² only if incident — blank/"—" otherwise). Make the repo cell a link `<a href="per-repo/<repo>/report.html">` (relative path; the file sits alongside the org `report.html` per Task 5.1). No `#repo/` in-page routing — separate files, easier to navigate, avoids one giant HTML (Q4).
- [ ] Failing render tests: one row per repo with all columns; repo cell links to `per-repo/<repo>/report.html`; gated columns blank without the connector.
- [ ] Implement; standard verify loop.

### Task 5.4 — Aggregated Connections & Sources with per-item repo counts

**Files:** `metrics/org_rollup.ts` (aggregate sources/tech-stack/linked-repos across repos with counts), `render.ts` `connectionsSection()` (`:1511-1588`) org branch; tests.
**Why:** at org altitude the useful view is "how many repos have each thing": `git history (8)`, `Jira (5)`, `Python (3)`, `Terraform (1)`, MCP `awos-recruitment (2)`.
**Change:** the rollup (engine) computes, from each repo's `audit.json` (`sources`, `tech_stack`, `linked_repos`), aggregated maps with repo counts; the renderer lists each item with `(N)`. Reuse `sourceFullLabel` and `groupLinkedByName` (already in `render.ts`).
- [ ] Failing render test: org Connections lists items with `(N)` counts across sources/languages/frameworks/MCP servers.
- [ ] Implement (compute in `org_rollup.ts`, render in `connectionsSection`); standard verify loop.

### Task 5.5 — Org-level "What to improve"

**Files:** `metrics/org_rollup.ts` (deterministic cross-repo seed); `SKILL.md` org branch (author org `insights[]`/`recommendations[]` from the seed); test.
**Why:** the org needs portfolio observations, not a per-repo dump: "N/8 repos lack an AI instruction file", "M repos have FAIL security checks", "K repos have no end-to-end delivery wiring".
**Change:** the rollup computes, per category/dimension, the count of repos where it FAILs or is absent (it already has each repo's full `audit.json` after 5.2), and exposes the top cross-repo gaps; the orchestrator turns them into plain-language cards. Deterministic seeding keeps this robust under headless runs.
- [ ] Failing test for the seed (counts of repos failing/absent per category are correct).
- [ ] Implement seed + SKILL.md authoring guidance; standard verify loop (engine part).

---

## Phase 6 — Jira deep fetch (beyond 100)

### Task 6.1 — Paginated tracker fetch guidance

**Files:** `references/connector-shapes.md` (worked example `:77-122`, recipe `:220-238`); `SKILL.md` Step 6.2 (`:115`).
**Why:** the worked example does a single `maxResults: 200` call; the MCP server caps a request at ~100, so long-lived projects are silently under-sampled. `collectors/tracker.ts:96` consumes the full `tickets[]` with **no cap**, so this is purely orchestrator-side.
**Change:** document a pagination loop — page on `startAt` (classic JQL) or `nextPageToken` (cloud `searchJiraIssuesUsingJql`), accumulate into one `tickets[]` until a short page / `isLast` / no token, up to a sane cap (e.g. 2000 tickets or the window), then write `collected/tracker.json` once. Note `maxResults` is server-capped (don't rely on 200). Add the Linear/GitHub-Issues pagination equivalents in one line. Prompt-only; no engine change.
- [ ] Update `connector-shapes.md` + `SKILL.md`; a maintainer headless run against a >100-ticket project confirms `tracker.json` ticket count > 100.

---

## Phase 7 — `collectors/git.ts` error handling (per-call judgment)

### Task 7.1 — Distinguish expected-empty from unexpected git failures

**Files:** `collectors/git.ts` (`run()` + call sites at `:53,58,152,279,299` and others); `tests/git-collector.test.ts`.
**Why:** `run()`'s `catch { return '' }` swallows **all** git errors; only the buffer case was fixed. But some calls legitimately fail (e.g. `symbolic-ref --short HEAD` on detached HEAD, side-branch `^1..^2`), so a blanket log is wrong — needs per-call intent.
**Change:** add an options arg `run(args, cwd, { allowFailure = false } = {})`. For the legitimately-failing calls, pass `allowFailure: true` → keep silent `''`. Otherwise, on a non-zero/unexpected error (not "empty output", which is valid), emit a one-line `console.error('[git collector] <subcommand> failed: <code>')` to **stderr** (collectors write JSON to files, so stderr is safe) and still return `''` so the collector degrades. Audit each call site and tag the expected-empty ones.
- [ ] Failing test: a non-`allowFailure` bogus subcommand writes a stderr breadcrumb; an `allowFailure` call stays silent (test a small extracted "shouldLog(error, allowFailure)" helper, or capture stderr from a child).
- [ ] Implement; standard verify loop.

---

## Cross-task type-name lock (keep consistent across tasks)

`window_stats`, `AuthorRow { author; commits; merges; lines }`, `per_author`, `merges_per_active`, `loc_per_active` (git artifact); `[meta].active_contributor_threshold` (0.1), `[meta].rework_horizon_days` (21); metric ids `adp_g14_rework_rate`, `adp_i4_subtask_split`, `adp_i5_description_quality`, `adp_g15_onboarding_ease`; org per-repo report path `per-repo/<repo>/report.html`; headline `DeliveryMetric.gated`.

## Self-review — spec coverage

Org parity (5.1–5.4) ✓ · per-repo report files in folders + links (5.1,5.3, Q4) ✓ · per-repo columns incl. merges/LOC-per-active, deploy, lead, change-fail, cycle, MTTR (5.3) ✓ · org-avg top matrix (5.2) ✓ · aggregated Connections w/ counts (5.4) ✓ · org "What to improve" (5.5) ✓ · Jira >100 (6.1) ✓ · 90-day window (0.1) ✓ · drop buckets + value_series (0.1,0.3, Q1/Q2/Q3) ✓ · active contributor + 0.1 param (1.1) ✓ · merges/LOC per active (1.2) ✓ · headline 9-row matrix (Phase 4) ✓ · deploy/lead/change-fail whole-window + weight 10 (2.1,2.2) ✓ · churn→turnover (2.3) ✓ · DORA Rework Rate weight 10 (2.4) ✓ · ticket subtask-split (3.1) ✓ · ticket description quality (3.2) ✓ · onboarding-ease (3.3) ✓ · git silent-catch per-call judgment (7.1) ✓ · trimmed Global Constraints + removed end-to-end phase + Prettier/source-link de-emphasized ✓.

**Research spikes (2.4, 3.1, 3.2, 3.3)** intentionally lead with "find + verify a source" — bounded research tasks with a defined output contract (verified URL + band thresholds + category schema), not TODO placeholders.

## Execution order

**0 → 1 → 2 → 3 → 4 → 5**, with **6** and **7** independent (anytime). Phase 0 is the spine (window + per-author data) every metric reads; Phase 5 (org) depends on Phase 4 (headline) which depends on Phases 1–2. Treat each Phase as a reviewable unit if running with subagents.
