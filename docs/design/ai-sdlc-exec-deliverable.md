# AI-SDLC Readiness — Executive Deliverable (CEO / CTO)

> **Presentation update (2026-06-25).** The report is now **one scrolling page** with hash-routed drill-down sub-pages, not three audience tabs; tooltips are **instant and plain-language** (the five-part string is demoted to small print); and the narrative "READ" + recommendations are restored. The renderer stays deterministic — the narrative is authored **upstream** by the orchestrator into `audit.json`, resolving the old "narrative vs. no-LLM-renderer" contradiction. The "Tab 1/2/3" examples below are retained as the content spec; read "Tab 1" as the **overview's executive band**, "Tab 2" as the **dimension summary**, and "Tab 3" as the **drill-down sub-pages**.
> This document defines **what the `/awos:ai-readiness-audit` organization run hands to a CEO/board and a CTO/Head of Engineering**, with concrete examples. It is the presentation layer over the metrics defined in `plugins/awos/skills/ai-readiness-audit/references/ai-sdlc-metrics-catalog.md`, scored by the additive weighted-category model in `plugins/awos/skills/ai-readiness-audit/scoring.md` against the capability standards in `plugins/awos/skills/ai-readiness-audit/references/standards.toml`. It is design-facing: the org run is a scope of the measurement (specified inline in `SKILL.md` and the report templates, not a separate skill), and the numbers below are illustrative mock-ups, not real measurements.

## Principles (what makes this board-credible)

- **One assessment, two audiences, one page.** The CEO/board gets a single headline with confidence at the **top of the page**; the CTO/Head of Engineering gets the per-dimension and per-repo diagnostics **below it**, with full detail one drill-down sub-page deeper. Same data, one scrolling page — the CEO stops reading where the engineer keeps scrolling.
- **Current-state, read against benchmarks.** Measurement is point-in-time, as of today, over a recent trailing period. Before-vs-after-AI comparison is **out of scope** (a future extension); current values are read against public industry benchmark bands (e.g. DORA performance levels), not against the repo's own past.
- **No money — for now.** No cost source is assumed, so no currency is rendered. Metrics are designed to be **convertible to money given a rate source** (e.g. capacity allocation × loaded rate); that conversion is a future extension, not a principle.
- **No individual names.** Granularity is repository and organization; people appear only as aggregate active-contributor counts.
- **Honest confidence, per-metric reliability.** Every number carries a confidence label (HIGH/MED/LOW) from which sources were reachable, and every metric carries a reliability tag — _minimal_ (true value ≥ shown), _maximal_ (true value ≤ shown), or _not-reliable_ (proxy) — with a "where it may deviate" note. In the HTML these appear as **instant tooltips** on every rendered number: the tooltip leads with a plain-language sentence (for a non-technical reader) and demotes the five-part specialist string — _definition · derivation · reliability (confidence) · source · method_ — to small print below it. The five-part string is preserved in the Markdown output. The front page stays clean but nothing is overclaimed.
- **Reproducible by construction.** Each measurement declares its _method_: _computed_ (a number derived deterministically from repository artifacts) and _detected_ (a deterministic code/config signal) yield the **same result on every run of the same repo**; only _judgment_ items rely on a model, and those are bounded by a fixed rubric and labeled as such. The hover hint names the method, so the board can tell at a glance which numbers are mechanical and which are bounded judgment — the headline does not drift between runs.
- **Gaps are explained, not hidden.** A "Repositories & Connections" view shows which repos were measured, how they were linked, and which integrations were missing and why.

## Tab 1 — Board / CEO one-pager (example)

```text
┌────────────────────────────────────────────────────────────────────┐
│  AI-SDLC CAPABILITY (portfolio)                                      │
│                                    confidence: MEDIUM (git + tracker;│
│                                    no CI connector linked)           │
├────────────────────────────────────────────────────────────────────┤
│  THREE PORTFOLIO METRICS                                             │
│   • AI-tooling coverage ......... 67%   (18 / 27 active repos)       │
│   • Capability score ............ 1,840 pts   (Σ weighted           │
│       capabilities present; uncapped — rises as the standard grows)  │
│   • Measurement coverage ........ 58%   (sources reachable across    │
│       the portfolio; the confidence behind every number above)      │
│  Coverage % is read relative to today's standards.toml, not a grade.│
├────────────────────────────────────────────────────────────────────┤
│  PORTFOLIO REACH                                                     │
│   • 18 / 27 active repos have AI tooling configured                  │
│   • avg active contributors / repo / month: 6.3                      │
├────────────────────────────────────────────────────────────────────┤
│  DELIVERY — current, vs DORA benchmark bands   (hover for caveats)   │
│   • Lead time for change ......... ~1 day      High band             │
│   • Deployment frequency ......... 4.2 / wk    High band             │
│   • Change failure rate .......... 9%*         High band   *min.     │
│   • Maintenance (KTLO) share ..... 41%         healthy split         │
├────────────────────────────────────────────────────────────────────┤
│  CODE SCALE & COMPLEXITY                                             │
│   • 412 KLOC across 6 languages, 27 repos                            │
│   • Avg cyclomatic complexity 4.1 (healthy)                          │
│   • High-complexity hotspots: 138 (refactor backlog)                 │
├────────────────────────────────────────────────────────────────────┤
│  READ: adoption is broad (tooling in 2/3 of repos) and current       │
│  delivery sits in DORA's higher bands while complexity stays         │
│  healthy. Next lever: connect CI to raise confidence from MEDIUM,    │
│  and close the 9 AI-dark repos. (*change-fail is a lower bound —     │
│  keyword-detected, so true rate may be higher.)                      │
└────────────────────────────────────────────────────────────────────┘
```

The board one-pager answers three questions: _Is adoption real and broad?_ _Where does delivery sit against industry benchmarks?_ _Where is the next lever?_ Everything else lives further down the page or one drill-down sub-page deeper. The `*` and "hover for caveats" point to the per-metric reliability tooltips. The "READ" paragraph above is the synthesized narrative the orchestrator authors into `audit.insights`; the renderer formats it.

## Tab 2 — Head of Engineering view (example)

Per-repo diagnostic table (sorted by capability score; low-band and low-confidence cells flagged). The capability column shows awarded weighted points and coverage % relative to today's standard — not a grade and not a fixed-ceiling index. Values are current-state; each cell's reliability shows on hover.

| Repo             | Capability (pts / cov) | Lead time    | Deploy freq    | Change-fail   | Complexity (avg CCN / hotspots) | Tooling depth                        | Confidence  |
| ---------------- | ---------------------- | ------------ | -------------- | ------------- | ------------------------------- | ------------------------------------ | ----------- |
| service-checkout | 96 pts / 84%           | ~1d (High)   | 4.6/wk (High)  | 7%\* (High)   | 3.8 / 22                        | full (CLAUDE.md, skills, MCP, hooks) | HIGH        |
| service-catalog  | 71 pts / 62%           | ~2d (High)   | 2.1/wk (Med)   | 11%\* (Med)   | 4.4 / 31                        | partial (CLAUDE.md only)             | MEDIUM      |
| platform-iac     | 44 pts / 39% ⚠         | ~6d (Low) ⚠  | 0.6/wk (Low) ⚠ | n/a (no CI)   | 6.9 / 48 ⚠                      | partial                              | LOW (no CI) |
| legacy-billing   | 22 pts / 19% ⚠         | ~14d (Low) ⚠ | 0.2/wk (Low) ⚠ | 18%\* (Low) ⚠ | 8.1 / 73 ⚠                      | none ⚠ AI-dark                       | LOW         |

Diagnostics surfaced alongside the table:

- **AI-dark repos** — active repos with no AI tooling (here: `legacy-billing` + 8 others). The adoption ceiling.
- **Partial-measurement repos** — which connectors are missing per repo and what metric that suppresses (e.g. `platform-iac` has no CI link ⇒ no CI pass-rate, and change-fail is git-proxy only).
- **Low-band / low-reliability flags** — cells in DORA's Low band or carrying a not-reliable/low-confidence tag are marked, so engineering investigates rather than the board reading a portfolio average that hides them.
- **Complexity hotspots** — top high-CCN functions/files per repo (from the complexity scan), as the concrete refactor backlog.
- **Security posture (two lenses)** — _agent-safety_ (is it safe to run agents here: guardrails blocking secret reads, hook/MCP trust) and _application-security_ (OWASP ASVS baseline: authz, injection, transport, secrets-in-code). These gate how much autonomy can be granted to AI agents and how safely AI-speed output can be absorbed; a weak posture caps adoption regardless of tooling coverage.

## Tab 3 — Drill-down (example)

Every metric, every repo, fully attributed: metric · current value · reliability tag · confidence · source tier. Plus the **Repositories & Connections** map:

```text
service-checkout      linked: current repo
  code host: GitHub (gh) ✓   CI: GitHub Actions ✓   tracker: Jira ✓   docs: Confluence ✓   → HIGH
platform-iac          linked: git submodule
  code host: GitHub (gh) ✓   CI: — (not detected)   tracker: Jira ✓   docs: —              → LOW
awos-spec             linked: symlink → ../awos   (orchestrating repo; spec source)
```

This is where "why was X measured without integration Y?" and "why don't I see values from Z?" get answered: the missing connector and its consequence are printed next to the repo, and each metric value carries its reliability/deviation note on hover.

## What we deliberately do NOT show

- No money, cost, or ROI dollar figures (out of scope until a rate source is provided — the metrics are built to be convertible then).
- No per-developer rankings or named-individual productivity.
- No before/after-AI deltas (out of scope) — current-state read against benchmarks instead.
- No raw vanity counts presented as outcomes (commit counts, lines written) — these appear only as normalized, contextualized signals.
- No single blended grade and no fixed-ceiling score. Capability is an additive, **uncapped** weighted-category score — you can always earn more as the standard grows — shown with a coverage % relative to today's standard; delivery health is read as benchmark bands; measurement confidence is reported separately. None of the three is collapsed into a letter grade or a 0–100 index, so "the repo is capable," "the team is delivering well," and "we can trust the numbers" never mask one another.

## How it is produced (summary; org behavior specified inline in `SKILL.md` + the report templates)

The organization run is a scope of the measurement: it executes the per-repo `ai-sdlc-adoption` dimension across every in-scope repo (a GitHub/GitLab org, a folder of repos, or a `sources.toml` list), then aggregates the per-repo results into **at most three** portfolio metrics — AI-tooling coverage, capability score, and measurement coverage — contributor-weighted when contributor counts are available, with equal-weight fallback otherwise, without rolling up the full per-repo metric set. Per-repo detail stays in the drill-down tab.

**Report generation is deterministic — narrative is authored upstream.** The audit engine writes a single `audit.json` file, into which the orchestrator authors the plain-language report blocks (`headline`, `insights`, `recommendations`, and per-check `plain`) — this is where the synthesized "READ" and the next-lever narrative come from. The command `node dist/cli.js render audit.json --format html` (or `--format md`) then converts the JSON to the single-page HTML or Markdown report — pure and deterministic: no clocks, no LLM calls **in the renderer**. The JSON is the single source of truth; the HTML/Markdown are derived output. The report is never hand-written. This split is deliberate: it keeps the renderer reproducible while still giving the board a synthesized narrative, instead of forcing a choice between the two.

Where a metric tracks monthly history, its `value_series` field carries one data point per 30-day bucket over the lookback window. The HTML renderer shows these as an inline sparkline alongside the current value; the Markdown renderer appends the sparkline character sequence in brackets. MTTR (`adp_i3_mttr`) is a normal git-proxy metric in this series: it computes the median merge-to-first-commit interval for revert/hotfix/rollback branches, labeled `not-reliable` (git-proxy), and emits monthly buckets in `value_series` when the window contains sufficient merge records.

Code scale/complexity comes from a static scan (languages/LOC, cyclomatic complexity, dependency footprint) per repo, rolled up.

## Consulting conversation — talking points this enables

- "Your AI adoption is real and broad (coverage + tooling depth), not a few enthusiasts" — or the opposite, with the AI-dark list as the engagement scope.
- "Your current delivery sits in DORA's higher bands, with complexity healthy" — current-state read against industry benchmarks, confidence stated.
- "Capacity split is healthy / skewed to maintenance" — the work-mix allocation, in FTE share, convertible to money once a rate source is provided.
- "Here is the next lever" — connect CI to raise confidence, close the AI-dark repos, refactor the named complexity hotspots.
- "Security sets your autonomy ceiling" — agent-safety guardrails plus an OWASP-ASVS application-security baseline determine how much you can safely hand to AI agents. AI velocity multiplies whatever security debt already exists, so the gates (CI vulnerability scanning, the ASVS floor, agent guardrails) are what let adoption scale without scaling risk.
