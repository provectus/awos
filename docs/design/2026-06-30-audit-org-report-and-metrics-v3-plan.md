# Audit Org-Report + Metrics v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is written for a **fresh CC session** with the repo + root `CLAUDE.md` available but no memory of the conversation that produced it.

**Goal:** Bring the org (multi-repo) audit report up to single-repo parity, redesign the headline delivery matrix, switch all delivery metrics from 30-day buckets to a single configurable window (default 90 days), add an "active contributor" notion, convert churn to a windowed turnover/rework rate, and add four new metrics (DORA Rework Rate + three connector metrics).

**Architecture:** The audit is a deterministic TypeScript engine (`plugins/awos/skills/ai-readiness-audit/`) bundled to `dist/cli.js`; an LLM orchestrator (`SKILL.md`) fills only the judgment/connector slice and authors the report's plain-language blocks into `audit.json`; `render.ts` is a pure JSON→MD/HTML renderer. Scoring categories live in `references/standards.toml`. The org flow runs the single-repo flow per repo, then `org_rollup.ts` summarizes. This plan keeps that shape: engine changes are deterministic + unit-tested; report-copy/connector changes are SKILL.md + connector-shapes guidance.

**Tech Stack:** TypeScript (`node:test` + `tsx`), esbuild bundle (`scripts/build-engine.mjs` → `dist/cli.js`), smol-toml for `standards.toml`, no runtime npm deps in the engine path beyond what's already bundled.

## Global Constraints

- Node toolchain: use a **real Node** (`/opt/homebrew/bin/node`), not the Bun shim, for `node:test` (`npm run test:engine`). Per repo memory.
- **`dist/` is committed and CI-gated.** After editing any engine `.ts`: `npm run build:engine` and commit the regenerated `dist/`. CI runs `git diff --exit-code` on `dist/`.
- **Do not bump the plugin version** per change — release-drafter owns versioning via PR labels.
- Every per-category source link in `standards.toml` must cite a real external authority and resolve via `node scripts/standards-linkcheck.mjs references/standards.toml` (DOI 202/403 = REACHABLE-AUTH, allowed). Never fabricate a URL.
- Prettier: `npx prettier --write` changed files before commit (single quotes, semicolons, 80-col, es5 commas). CI fails on drift.
- Markdown (`.md` prompts/docs): do **not** hard-wrap prose at 80 cols; one logical line per paragraph/bullet.
- Tests must narrate the contract they verify in the `assert` message (not "N pass").
- Contributor data stays **aggregate, no PII**. This governs collection; do not echo a privacy disclaimer into report copy.
- Test the audit harness changes with `tools/audit-test-harness/run_audit_test.py` (engine-compliance guard is already in place); a live headless run is ~$8 and stochastic — prefer engine unit tests for verification, reserve headless runs for end-to-end confirmation.

## How to verify any engine task (the standard loop)

Each engine task ends with this loop — treated as its final steps, not repeated verbatim below:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run test:engine                 # all engine unit tests green
npm run build:engine                # regenerate dist/
node scripts/standards-linkcheck.mjs plugins/awos/skills/ai-readiness-audit/references/standards.toml   # if standards.toml changed
npx prettier --write <changed files>
git add <changed .ts/.toml/.md + dist/cli.js> && git commit -m "<conventional msg>"
```

---

## Open Questions — resolve before/early (ask the user or pick the noted default)

These came from a verbal spec; resolve up front so later tasks don't churn.

- [ ] **Q1 — Sparkline series after de-bucketing.** Removing 30-day buckets removes the per-bucket `value_series` (the sparklines in dimension tables). Default decision: keep a coarse series for trend visuals by still bucketing _internally for the sparkline only_ (e.g. weekly) while the **headline number** is the whole-window aggregate. Confirm, or drop sparklines for de-bucketed metrics.
- [ ] **Q2 — "Lead time, but measure adp_g3_deploy for the whole time, not by buckets."** Interpreted as: compute **deployment frequency** and **lead time** as single whole-window aggregates (over `max_lookback_days`), not per-bucket averages. Confirm this reading.
- [ ] **Q3 — `monthly_bucket_days` removal.** Spec says it's "probably not needed — measure for max_lookback_days." Default: **remove** `monthly_bucket_days` from `[meta]` and all bucket logic; if Q1 keeps sparklines, introduce a separate `sparkline_bucket_days` instead. Confirm.
- [ ] **Q4 — Org per-repo drill-down delivery mechanism.** Embed every repo's full report as hash-routed sections inside the single org `report.html` (`#repo/<name>`), mirroring the existing `#dim/<key>` routing (self-contained, one file) — vs. emit a separate `report.html` per repo and link out. Default: **embed** (self-contained). Confirm; the org-JSON shape (Task 5.1) depends on this.
- [ ] **Q5 — New-metric weights & applicability.** The four new metrics (Rework Rate, ticket-split, description-quality, onboarding-ease) need `weight` + `applies_when`. Defaults proposed per task; confirm before they affect scores.

---

## Phase 0 — Window model: single configurable lookback, default 90 days

Foundational; later metric tasks depend on it. Today `[meta].max_lookback_days = 730` and `monthly_bucket_days = 30`; `git.ts` builds `monthly_buckets`, and `adp_g2/g3/g4/g7` average across buckets.

### Task 0.1 — Default lookback to 90 days

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (`[meta]`)
- Test: `plugins/awos/skills/ai-readiness-audit/tests/standards-meta.test.ts` (create if absent; else fold into an existing standards test)

**Approach:** Change `max_lookback_days = 730` → `90`. Per Q3, also remove `monthly_bucket_days` (or replace with `sparkline_bucket_days` if Q1 keeps sparklines). Grep every reader of these keys and update defaults: `metrics/_base.ts` (`capBucketsByHistory`), `collectors/git.ts` (`period.bucket_days`, `lookback`), `audit_core.ts`, `cli.ts`. Search: `grep -rn "max_lookback_days\|monthly_bucket_days\|730\|bucket_days" plugins/awos/skills/ai-readiness-audit --include=*.ts`.

- [ ] Write a failing test asserting the parsed `[meta].max_lookback_days === 90` and that `monthly_bucket_days` is absent (or `sparkline_bucket_days` present per Q1).
- [ ] Update `[meta]`, fix every `.ts` default fallback (`?? 730`, `?? 30`) to the new values.
- [ ] Standard verify loop. **Acceptance:** a repo's delivery metrics compute over a 90-day window; no `730`/`30` magic defaults remain except an intentional sparkline bucket.

### Task 0.2 — Collector emits whole-window aggregates, not 30-day buckets

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/collectors/git.ts` (`buildMonthlyBuckets`, `GitRaw`, `collect`)
- Test: `plugins/awos/skills/ai-readiness-audit/tests/git-collector.test.ts`

**Approach:** Replace per-bucket `monthly_buckets` with a single windowed aggregate object the metrics read. Keep `git log --all --since=<window>` (already date-anchored to newest commit, no wall-clock) but collapse to one window. New `GitRaw` field, e.g.:

```ts
// window-scoped delivery aggregates (replaces monthly_buckets)
window_stats: {
  window_days: number; // = max_lookback_days
  commits: number;
  merges: number; // first-parent merges into default branch
  authors_total: number; // distinct authors in window
  per_author: Array<{
    author: string;
    commits: number;
    merges: number;
    lines: number;
  }>; // for active-contributor filter (Task 1.x); aggregate, no PII beyond author key used transiently
}
```

Per Q1, optionally also emit `sparkline_series: Array<{ bucket_start: string; value: number }>` from a weekly internal bucketing for visuals only.

- [ ] Write failing tests on a temp repo (reuse the `git()`/`repo()` helpers in the test file): assert `window_stats.merges`, `window_stats.authors_total`, and `window_stats.per_author` are populated and correct for a crafted history.
- [ ] Implement: derive `per_author` by parsing `git log --all --since --no-merges --numstat --format=%H\t%aN` (lines per author) and `git log --first-parent --merges --since --format=%aN` (merges per author). Mind the `maxBuffer: 512*1024*1024` fix already in `run()`.
- [ ] Keep `numstat_totals`, `merge_records`, `history_available_days` as-is (still needed).
- [ ] Standard verify loop. **Acceptance:** `git.json` carries `window_stats` with per-author rows; `monthly_buckets` removed.

---

## Phase 1 — Active Contributor

Spec: an _active contributor_ is someone actually delivering code, not a PM/QA who merges 1–2× per window. Compute per-author merges and per-author LOC over the window; **exclude** anyone below the threshold (default 0.1 = 10%) on **both** metrics. New `standards.toml` param.

### Task 1.1 — `active_contributor_threshold` param + active-contributor computation

**Files:**

- Modify: `references/standards.toml` (`[meta]` add `active_contributor_threshold = 0.1`; update `[category.active_contributors]` definition + `monthly_bucket_days` references)
- Modify: `metrics/adp_g2_contributors.ts` (full rewrite)
- Test: `metrics/adp_g2_contributors.test.ts` (create; mirror existing metric test style)

**Approach — active-contributor rule (lock this so downstream metrics agree):**
Given `per_author` rows over the window: for each author compute `merge_share = author.merges / Σ merges` and `loc_share = author.lines / Σ lines`. An author is **active** iff `merge_share >= T` **OR** `loc_share >= T` is **false** for exclusion — i.e. exclude when `merge_share < T AND loc_share < T`. (Spec: "cut out those who both less than 10% for both metrics.") `active_contributors = count(authors not excluded)`.

```ts
function activeContributors(perAuthor: AuthorRow[], T: number): number {
  const totMerges = sum(perAuthor.map((a) => a.merges)) || 1;
  const totLines = sum(perAuthor.map((a) => a.lines)) || 1;
  return perAuthor.filter(
    (a) => !(a.merges / totMerges < T && a.lines / totLines < T)
  ).length;
}
```

- [ ] Failing tests: team of 6 (3 SDE heavy, 1 ML moderate, 1 PM 1 merge, 1 QA 1 merge) → `active_contributors === 4` with `T=0.1`; edge cases (single author → 1; empty → 0/SKIP); threshold read from standards, default 0.1.
- [ ] Rewrite `adp_g2_contributors.compute` to read `window_stats.per_author` + `standards.meta.active_contributor_threshold`, return the active count as `value`, `expression` like `"4 active contributors (window 90d; excluded 2 below 10% on merges & LOC)"`. Update category `definition`.
- [ ] Decide reliability: keep `not-reliable`? Active-contributor filtering is a heuristic → `minimal` is defensible; note in proposal. Default keep `not-reliable` unless Q5 says otherwise.
- [ ] Standard verify loop. **Acceptance:** `adp_g2` reports active-contributor count over the window; `active_contributor_threshold` is a documented `[meta]` param.

### Task 1.2 — Per-active-contributor delivery ratios (Merges/LOC per active contributor)

**Files:**

- Create: `metrics/adp_g2b_per_contributor.ts` (or extend `adp_g2`) — emits `merges_per_active_contributor` and `loc_per_active_contributor`
- Modify: `references/standards.toml` (new category/categories or sub-values)
- Test: `metrics/adp_g2b_per_contributor.test.ts`

**Approach:** `merges_per_active = window_stats.merges / active_contributors`; `loc_per_active = (numstat_totals.added /*or window lines*/) / active_contributors`. These feed two headline rows (Phase 4). Decide whether they are scored categories or display-only headline values (default: **display-only**, surfaced via headline authoring, so no weight churn). If display-only, they can be computed fields on the git artifact rather than scored categories — simpler. Confirm under Q5.

- [ ] Failing test: crafted history → expected ratios.
- [ ] Implement (as computed git-artifact fields if display-only, else as categories).
- [ ] Standard verify loop. **Acceptance:** both ratios available to the headline.

---

## Phase 2 — Delivery metrics over the whole window + churn→turnover + Rework Rate

### Task 2.1 — Deploy frequency & lead time as whole-window aggregates

**Files:**

- Modify: `metrics/adp_g3_deploy_frequency.ts`, `metrics/adp_g4_lead_time.ts`
- Tests: existing `tests/met-adp-g3-deploy-frequency.test.ts`, add `met-adp-g4-lead-time.test.ts` if absent

**Approach (per Q2):** Deploy frequency = `window_stats.merges / (window_days/7)` merges-per-week over the whole window (not per-bucket average). Lead time = median over all merge_records in window (already whole-set). Keep DORA banding from `[band.deploy_frequency]`/`[band.lead_time_for_change]`. Remove bucket dependence + `capBucketsByHistory`.

- [ ] Failing tests asserting whole-window values + correct band.
- [ ] Implement; drop `value_series` or replace with weekly sparkline per Q1.
- [ ] Standard verify loop. **Acceptance:** deploy-freq/lead-time are single whole-window numbers, DORA-banded.

### Task 2.2 — Change-failure rate over the whole window

**Files:** Modify `metrics/adp_g7_change_fail_rate.ts`; test `tests/det-…`/new.
**Approach:** Already a share of merges followed by revert/hotfix; ensure it sums over the window, not per-bucket. Band via `[band.change_failure_rate]`.

- [ ] Failing test → whole-window share + band. Implement. Standard verify loop.

### Task 2.3 — Convert `adp_g6_churn` → windowed turnover/rework rate

**Files:**

- Modify: `collectors/git.ts` (new computed field), `metrics/adp_g6_churn.ts` (rewrite), `references/standards.toml` (`[category.code_churn]` → turnover; add `[band.code_turnover]`)
- Tests: `metrics/adp_g6_churn.test.ts` (create), `tests/git-collector.test.ts`

**Approach (locked from spec):** Turnover = `(lines deleted/modified whose authored-age < N days) ÷ (total lines merged)` from a **single oldest→newest diff replay** bounded to the last `(window + N)` days. Band ≈ `<12% good / 12–18% watch / >18% concerning`. Reliability `minimal` (approximate attribution is industry-accepted). Pick `N` (rework horizon) as a `[meta]` param, e.g. `rework_horizon_days = 21`. The collector computes the turnover field (git-replay is collector work, not metric work); the metric just bands it.

- [ ] Failing collector test: a repo where a file is written then largely rewritten within `N` days → high turnover; stable repo → low.
- [ ] Implement git replay in `collectors/git.ts` (use `git log --reverse --numstat` over the bounded window; attribute deletions to the age of the line being deleted via `git blame`-free approximation: compare successive states; keep it bounded/fast). Document the approximation.
- [ ] Rewrite `adp_g6_churn.compute` to band the turnover ratio; update category `definition`, `source` (DX Core 4 or DORA — see Task 2.4 research), add `[band.code_turnover]`.
- [ ] Standard verify loop. **Acceptance:** `adp_g6` is a banded, directional turnover %; raw lifetime churn no longer surfaced as the value.

### Task 2.4 — New metric: DORA 2025 **Rework Rate** (research spike → implement)

**Files:**

- Create: `metrics/adp_g14_rework_rate.ts`
- Modify: `references/standards.toml` (new `[category.rework_rate]` + `[band.rework_rate]`)
- Tests: `metrics/adp_g14_rework_rate.test.ts`

**Research spike (do first, deliverable = a cited definition):**

- [ ] Confirm the **DORA 2025** "rework rate" definition + thresholds from the DORA 2025 report (`https://dora.dev/research/2025/`). Verify the URL with WebFetch; record exact definition + band thresholds. If DORA's "rework" overlaps Task 2.3 turnover, define this one at the **delivery** level (e.g. share of changes requiring unplanned follow-up work / failed-then-refixed) distinct from line-level turnover, and document the distinction in the category `definition` to avoid double-counting.
      **Implement:**
- [ ] Failing test with crafted inputs → expected rate + band.
- [ ] Implement metric from git (and tracker if richer); category `weight`/`applies_when` per Q5 (default `weight = 3`, `applies_when = "always"`); `source = "DORA State of DevOps"`, verified URL/date.
- [ ] Standard verify loop. **Acceptance:** a banded Rework Rate appears as a headline metric.

---

## Phase 3 — New connector (tracker) metrics + research spikes

All three are **tracker-connector** metrics (Jira/Linear/etc.): SKIP when no tracker reachable, computed by the orchestrator's connector step from `collected/tracker.json`. Each needs a cited industry rationale (spec: "find proofs in internet").

### Task 3.1 — Ticket sub-task split ratio (over-splitting is negative)

**Files:** `metrics/adp_t1_subtask_split.ts` (new); `references/standards.toml` (`[category.ticket_subtask_split]` + band); `references/connector-shapes.md` (extend `TicketRecord` with `parent`/`subtask_count` if needed); test.
**Research spike:**

- [ ] Find an authoritative source that over-fragmenting work items is harmful (context-switching / coordination overhead; AI auto-splitting to assign across roles is the spec's concern). Candidate search: "work fragmentation context switching cost", "too-granular user stories anti-pattern", "INVEST small but not too small". Verify a real URL; record it. If no strong source, set `weight` low and mark reliability `minimal`, and say so in the proposal.
      **Implement:**
- [ ] Extend tracker shape so the engine can compute `avg subtasks per parent ticket` (and/or share of tickets with > K subtasks). Band: low split = good; high = concerning.
- [ ] Failing test on a synthetic `tracker.json`; implement; category metadata; verify loop.
- [ ] Update `SKILL.md` Step 6.2 + `connector-shapes.md` worked example to capture parent/subtask links from Jira (`parent`, `subtasks` fields).

### Task 3.2 — Ticket description quality/richness

**Files:** `metrics/adp_t2_description_quality.ts` (new); `standards.toml` category+band; `connector-shapes.md` (ensure `TicketRecord` carries `description`/`acceptance_criteria` length/structure signals — compute size in the collector, not raw text, to avoid PII/bulk); test.
**Research spike:**

- [ ] Cite an authority for "good ticket descriptions" — INVEST criteria (Bill Wake), Definition of Ready, or Atlassian/Agile Alliance guidance on acceptance criteria. Verify URL.
      **Implement:**
- [ ] Define a deterministic proxy (e.g. share of tickets with a non-trivial description AND acceptance criteria AND a reproducible structure), banded. Reliability `minimal`.
- [ ] Failing test; implement; metadata; verify loop; SKILL.md/connector-shapes guidance to capture the needed fields.

### Task 3.3 — AI-adoption metric: onboarding ease

**Files:** `metrics/adp_o1_onboarding_ease.ts` (new) under the AI-adoption/`ai-sdlc-adoption` dimension; `standards.toml` category+band; test.
**Research spike:**

- [ ] Cite an authority linking fast onboarding to delivery health — DX Core 4 (onboarding time / "time to 10th PR"), or GitHub/Microsoft research on time-to-first-commit. Verify URL.
      **Implement:**
- [ ] Define a deterministic proxy from git + repo signals (e.g. presence of README run steps + CLAUDE.md + `.env.example` + a one-command bootstrap + low "time from first commit to first merge for new authors"). Decide git-only vs connector. Band; reliability per data available.
- [ ] Failing test; implement; metadata; verify loop.

---

## Phase 4 — Headline matrix redesign (single-repo first)

Spec's headline (top of every report, single-repo and org-avg):

1. Points + Coverage (as now)
2. Merges per active contributor (Task 1.2)
3. LOC per active contributor (Task 1.2)
4. Deployment Frequency (Task 2.1)
5. Rework Rate — DORA 2025 (Task 2.4)
6. Lead time — whole window (Task 2.1)
7. Change-failure rate (Task 2.2)
8. Cycle time — Jira In-Progress→Done — only with a real ticketing connector (gate on tracker)
9. MTTR — only with a real incident connector (gate on incident source)

### Task 4.1 — Headline schema + renderer

**Files:** Modify `render.ts` (`Headline`/`DeliveryMetric`/`ScaleMetric` types + `execBand`); test `render.test.ts`.
**Approach:** Extend `Headline` so `delivery[]` carries the new rows with `band` + `reliability` + `check_id`, and a `gated?: 'tracker'|'incident'` flag so the renderer can show "— (needs ticketing connector)" instead of a number when absent. Keep `scale`/`reach`. The renderer formats; it must not compute.

- [ ] Failing render test: given a headline JSON with all 9 rows (some gated/absent), HTML shows each labeled value or a clear "needs X connector" note, DORA bands colored.
- [ ] Implement in `execBand`. Standard verify loop (render tests only; no dist behavior change beyond render — still rebuild dist).

### Task 4.2 — SKILL.md headline authoring

**Files:** Modify `SKILL.md` Step 6.4 (headline authoring) + `output-format.md` (Headline schema).
**Approach:** Update the orchestrator instructions to transcribe the 9 rows verbatim from the new check_ids (active-contributor ratios, deploy-freq, rework-rate, lead-time, change-fail, cycle-time, MTTR), reading bands from each check's `hint`; gate cycle-time/MTTR on connector availability; never invent numbers.

- [ ] Update SKILL.md + output-format.md. No code test; validated by a headless run (Phase 8) and by `render.test.ts` fixture coverage.

---

## Phase 5 — Org (multi-repo) report overhaul

Today org `audit.json` has only `portfolio_metrics` (3) + a minimal `per_repo[]` (repo, awarded_weight, sources_reachable, has_ai_tooling); per-repo JSONs are stripped (no dimensions/headline/sources). Spec wants single-repo-parity per repo, an org-avg headline matrix, an aggregated Connections & Sources with counts, org-level "What to improve", and clickable per-repo drill-down.

### Task 5.1 — Preserve full per-repo audits in the org artifact

**Files:** Modify `SKILL.md` Step 6 org branch (write the full per-repo `audit.json` into `per-repo/<repo>.json`, not the stripped summary), and the org-JSON assembly to include `repo_audits: AuditJson[]`. Modify `metrics/org_rollup.ts` (`PerRepoInput`/`PerRepoSummary`) + `cli.ts rollup` to carry the richer rows. Tests: `tests/…org_rollup`.
**Approach:** Each per-repo file becomes the repo's full single-repo `audit.json` (already produced during the per-repo run — stop discarding it). The org `org-portfolio.json` gains `repo_audits` (full) for drill-down, while keeping `per_repo[]` summary rows (now enriched with per-repo headline values: pts, coverage, active-contributors, merges/active, loc/active, deploy-freq, lead-time, change-fail, cycle-time?, MTTR?).

- [ ] Failing test: `rollup` over rich inputs yields `per_repo[]` rows carrying the new columns; org JSON validates against renderer schema.
- [ ] Implement; update `output-format.md` org schema. Standard verify loop.

### Task 5.2 — Org headline = avg of the single-repo matrix

**Files:** Modify `metrics/org_rollup.ts` (compute org-average `headline`), `render.ts` (`execBand` already handles `isOrg`; feed it the averaged headline), `SKILL.md` org branch (author org headline). Tests.
**Approach:** Average each delivery metric across repos (mind bands: average the raw value then re-band; skip repos where a metric is absent and note coverage). Keep the 3 portfolio cards too if desired, but the **top matrix mirrors single-repo, averaged**.

- [ ] Failing test: org headline rows = mean of per-repo values, correctly banded.
- [ ] Implement; render; verify loop.

### Task 5.3 — Per-repo table with metric columns + clickable drill-down

**Files:** Modify `render.ts` (`reposSection` → rich table; add org per-repo routing `#repo/<name>` + per-repo sections reusing `dimensionSummary`/`dimensionPage` minus the org-only bits; per Q4). Tests `render.test.ts`.
**Approach (per Q4 default = embed):** Each `per_repo` row shows: Repo, Points, Coverage, Merges/active, LOC/active, Deploy-freq, Lead-time, Change-fail, MTTR (if incident), Cycle-time (if ticketing). Clicking a row routes to `#repo/<name>`, a section rendering that repo's full report **without** the org "Dimensions" cross-repo summary (which is meaningless across heterogeneous repos) — i.e. the repo's headline matrix + its dimension summary + its dimension drill-downs. Reuse existing `dimensionPage`/`dimensionSummary` against `repo_audits[i]`; extend the inline `route()` JS to handle `repo/` prefix.

- [ ] Failing render tests: org HTML contains one row per repo with all columns; a `#repo/<name>` section exists and renders that repo's dimensions; cross-repo "Dimensions" table is absent from per-repo sections.
- [ ] Implement. Standard verify loop.

### Task 5.4 — Aggregated Connections & Sources with per-item repo counts

**Files:** Modify `render.ts` (`connectionsSection` for org mode), org-JSON assembly (aggregate sources + tech-stack + linked-repos across repos with counts). Tests.
**Approach:** Org Connections shows each connected source/language/framework/MCP server with a repo count: `git history (8)`, `Jira (5)`, `Python (3)`, `Terraform (1)`, MCP servers `awos-recruitment (2)`, etc. Aggregate from each repo's `sources`, `tech_stack`, `linked_repos`. Reuse the friendly-label + grouping helpers added earlier (`sourceFullLabel`, `groupLinkedByName`).

- [ ] Failing render test: org Connections lists items with `(N)` repo counts; languages/frameworks/MCP aggregated.
- [ ] Implement; org-JSON must carry the aggregated structure (author in SKILL.md org branch or compute in `org_rollup.ts` — prefer engine compute in `org_rollup.ts`). Standard verify loop.

### Task 5.5 — Org-level "What to improve"

**Files:** Modify `SKILL.md` org branch (author org `insights[]`/`recommendations[]` at portfolio altitude) + optionally a deterministic `org_rollup.ts` helper that surfaces cross-repo patterns to seed it. Tests for any engine helper.
**Approach:** Highlight portfolio observations: "N/8 repos lack AI instruction files", "M repos have FAIL security checks", "K repos have no end-to-end delivery wiring", etc. If deterministic seeding is added (recommended for headless robustness), compute counts of repos with each FAIL/absent category in `org_rollup.ts` and expose them; the orchestrator turns them into plain-language cards.

- [ ] Failing test for the deterministic seed (counts of repos failing/absent per category).
- [ ] Implement seed + SKILL.md authoring guidance. Verify loop.

---

## Phase 6 — Jira deep fetch (beyond 100)

Spec: only 100 Jira tickets are used — that's a per-request MCP cap; dig deeper.

### Task 6.1 — Paginated tracker fetch guidance

**Files:** Modify `SKILL.md` Step 6.2 + `references/connector-shapes.md` (Jira worked example).
**Approach:** Instruct the orchestrator to **paginate**: loop `searchJiraIssuesUsingJql` with `startAt += maxResults` (or `nextPageToken`) until `startAt >= total` or a sane cap (e.g. 2000 tickets / the window), accumulating into one `tickets[]` before writing `collected/tracker.json`. Document the cap + the `period.lookback_days` it implies. Note Linear/GitHub-Issues pagination equivalents. This is prompt guidance (no engine change) — the collector already accepts an arbitrary-length array.

- [ ] Update SKILL.md + connector-shapes worked example with the pagination loop and the cap.
- [ ] Validate via a headless run against a repo with >100 tickets (Phase 8), confirming `tracker.json` ticket count > 100.

---

## Phase 7 — `collectors/git.ts` error handling (follow-up from prior review)

The `run()` `catch { return '' }` swallows **all** git errors silently; only the 1 MiB buffer case was fixed. Some calls fail legitimately (e.g. `symbolic-ref --short HEAD` on detached HEAD), so a blanket log is wrong — needs per-call judgment.

### Task 7.1 — Distinguish expected-empty from unexpected git failures

**Files:** Modify `collectors/git.ts` (`run()` + call sites); test `tests/git-collector.test.ts`.
**Approach:** Give `run()` an options arg, e.g. `run(args, cwd, { allowFailure?: boolean })`. When `allowFailure` (the calls that legitimately can fail — `symbolic-ref`, side-branch `^1..^2`), keep silent `''`. Otherwise, on a non-ENOENT/non-zero error, emit a one-line `console.error('[git collector] <subcommand> failed: <code>')` breadcrumb to **stderr** (collectors write JSON to files, so stderr is safe) and still return `''` so the collector degrades. Do **not** log on "command produced no output" (that's valid empty).

- [ ] Failing test: a `run()` of a bogus git subcommand without `allowFailure` writes a stderr breadcrumb (capture via spawning), while an `allowFailure` call stays silent. (Or unit-test a small extracted helper that decides "should log".)
- [ ] Implement; audit each call site and tag the legitimately-empty ones `allowFailure: true`.
- [ ] Standard verify loop. **Acceptance:** unexpected git failures leave a breadcrumb; expected-empty calls stay quiet.

---

## Phase 8 — End-to-end validation

### Task 8.1 — Headless org + single-repo runs

**Files:** none (uses `tools/audit-test-harness/run_audit_test.py`).

- [ ] Single-repo headless run against `onex-discovery-api`; confirm the new 9-row headline, active-contributor count, turnover %, and that the engine-compliance guard passes.
- [ ] Org headless run against the sample org set (`tmp/audit-runs/_sample_org_ORG` targets); confirm per-repo drill-down, org-avg headline, aggregated Connections with counts, org "What to improve", and Jira ticket count > 100 where applicable.
- [ ] Eyeball `report.html` for both; file any follow-ups.

---

## Self-Review (run before handing off / after each phase)

- **Spec coverage:** org details parity (5.1–5.4) ✓ · per-repo clickable drill-down (5.3) ✓ · per-repo columns incl. merges/LOC-per-active, deploy, lead, change-fail, MTTR, cycle (5.3) ✓ · org-avg top matrix (5.2) ✓ · aggregated Connections w/ counts (5.4) ✓ · org "What to improve" (5.5) ✓ · Jira >100 (6.1) ✓ · lookback→90 (0.1) ✓ · active contributor + 0.1 param (1.1) ✓ · drop `monthly_bucket_days`/measure over window (0.x, Q3) ✓ · headline matrix redesign (Phase 4) ✓ · churn→windowed turnover (2.3) ✓ · DORA Rework Rate (2.4) ✓ · Jira subtask-split (3.1) ✓ · Jira description quality (3.2) ✓ · onboarding-ease AI metric (3.3) ✓ · git silent-catch per-call judgment (7.1) ✓.
- **Placeholder scan:** the research spikes (2.4, 3.1, 3.2, 3.3) intentionally carry "find + verify a source" as their first deliverable — these are bounded research tasks with a defined output contract (cited URL + band thresholds + category schema), not TODO placeholders. Every other task has concrete files, signatures, and tests.
- **Type consistency:** lock these names across tasks — `window_stats` (git artifact), `per_author`/`AuthorRow{author,commits,merges,lines}`, `active_contributor_threshold` ([meta]), `rework_horizon_days` ([meta]), `repo_audits` (org JSON), `#repo/<name>` (org routing). Reconcile if any task renames.

## Execution Handoff

Recommended order: **Phase 0 → 1 → 2 → 3 → 4 → 5 → 6/7 (parallel) → 8.** Phases 0–2 are the deterministic engine spine everything else reads; Phase 5 (org) depends on Phase 4 (headline) which depends on Phases 1–2. Phases 6 and 7 are independent and can run anytime.

This spec spans several subsystems; if executing with subagents, treat each Phase as a reviewable unit (a fresh subagent per task, two-stage review between tasks).
