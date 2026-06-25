# AI-SDLC Audit Report — Redesign (single-page, drill-down, plain insights)

Status: design / approved direction. Supersedes the report-presentation portions of `ai-sdlc-exec-deliverable.md` (which this design also updates to remove an internal contradiction — see "Reconciliation with the original deliverable doc").

## Motivation

The rendered report (`context/audits/YYYY-MM-DD/report.html`) drifted from what makes a board-credible deliverable. Five concrete problems, from review of a real single-repo run (`onex-discovery-api`, 2026-06-25):

1. **Audience tabs are too thin to justify a tab each.** Three tabs — `Board / CEO`, `Head of Engineering`, `Drill-down` — split a small amount of content. The CEO should see the headline at the top of one page, not behind a tab.
2. **Drill-down is a separate tab** rather than something you enter from any row, as sub-pages, with the browser Back button returning you to where you started.
3. **Hover hints are slow and written for specialists.** Native `title=` has a ~1.5 s delay; the text is the dense five-part string (`definition · derivation · reliability (confidence) · source · method`) — readable by a specialist, not a non-technical stakeholder.
4. **No actionable insights.** The HTML report has no recommendations section at all (`renderHtml` never renders one). The rich, plain-language content lives only in a separate `recommendations.md`, never surfaced in the report.
5. **Drill-down table is poorly proportioned.** The `Evidence` column holds more text than all other columns combined yet shares their narrow width.

### Why the original deliverable doc was deviated (root cause)

`docs/design/ai-sdlc-exec-deliverable.md` already specified the layout and content. The build followed its **structure and hard constraints** faithfully (three tabs, two audiences, five-part hover hint, pure deterministic renderer, no money / no names / no single grade, Repositories & Connections view) but **hollowed out the CEO content**:

- The doc's CEO one-pager ends with a synthesized narrative "READ" paragraph (_"adoption is broad… delivery sits in DORA's higher bands… Next lever: connect CI…"_). The renderer produces nothing like it. That is the missing #4.
- The doc's Tab 1 carries DELIVERY-vs-DORA bands, CODE SCALE & COMPLEXITY, PORTFOLIO REACH. For a **single-repo** run, `renderHtml` Tab 1 shows only the capability-score headline plus date/project. The underlying data exists in `audit.json` (`ADP-G3` deploy freq, `ADP-G4` lead time, `ADP-G7` change-fail, `ADP-I3` MTTR, `ADP-G10` complexity, `ADP-G11` LOC + per-language, `ADP-G2` contributors) but is never surfaced on the CEO page.

Root cause: the doc demands **both** a synthesized narrative READ **and** "report generation is deterministic … no LLM calls … never hand-written." A pure renderer cannot author a narrative. The implementer honored the hard constraint and cut the narrative. Secondary cause: most of the doc's Tab-1 richness is drawn as an **org** mock-up; the single-repo path was never given an equivalent CEO composition and fell back to a near-empty headline.

This design resolves the contradiction rather than choosing a side: **the renderer stays pure; narrative authorship moves upstream into the JSON, written by the LLM orchestrator.**

## Principles carried over (unchanged)

From `ai-sdlc-exec-deliverable.md`, still in force: current-state read against benchmarks; no money; no individual names; per-metric reliability/confidence; reproducible-by-construction (the **renderer** is deterministic with no clocks and no LLM calls); gaps explained not hidden; no single blended grade — additive uncapped capability score + coverage ratio + separate confidence.

## Architecture

Two layers, same as today, with the authorship boundary made explicit:

- **Engine / orchestrator (may use the LLM)** — produces `audit.json`. New: the orchestrator authors plain-language `insights[]`, `recommendations[]`, and a structured `headline` block into the JSON; each `dimension-auditor` emits a one-sentence `plain` per check.
- **Renderer (`render.ts`, pure & deterministic)** — consumes `audit.json` only; no clocks, no LLM. Renders a single self-contained HTML page (inline CSS+JS) and the mirrored Markdown.

`audit.json` remains the single source of truth. All new fields are **optional**: when absent, the renderer degrades to current behavior (so older audits and partial runs still render).

### Data model — additions to `audit.json`

```jsonc
{
  // ... existing top-level fields (date, project, audit_total, coverage, dimensions, org fields) ...

  "headline": {
    // optional; structured CEO blocks (orchestrator-authored)
    "delivery": [
      // DORA-banded delivery metrics
      {
        "label": "Deployment frequency",
        "display_value": "1.9 / wk",
        "band": "High",
        "reliability": "maximal",
        "check_id": "ADP-G3",
      },
      // lead time (ADP-G4), change-fail (ADP-G7), MTTR (ADP-I3) ...
    ],
    "scale": [
      // code scale & complexity
      {
        "label": "Source size",
        "display_value": "30,058 LOC · 1 language",
        "check_id": "ADP-G11",
      },
      {
        "label": "Avg complexity",
        "display_value": "CCN 1.66 (healthy)",
        "check_id": "ADP-G10",
      },
    ],
    "reach": {
      // adoption reach
      "ai_tooling": "AI agent config present (partial)",
      "contributors": "5.3 active contributors / month",
    },
  },

  "insights": [
    // optional; the narrative "READ", 3-6 cards
    {
      "theme": "Secrets & supply-chain hygiene",
      "severity": "high",
      "weak_areas": ["Security Guardrails", "Supply Chain Security"],
      "so_what": "AI agents can read .env and there is no CVE scan in CI, so a leaked or vulnerable dependency could ship unnoticed.",
      "improves": "Adding a deny-hook and a pip-audit step closes the biggest low-effort gap and raises measurement confidence.",
    },
  ],

  "recommendations": [
    // optional; structured form of recommendations.md
    {
      "id": 1,
      "priority": "P0",
      "title": "Add AI-agent guardrails that block reading secret files",
      "dimension": "Security Guardrails",
      "check_id": "SEC-02",
      "effort": "Low",
      "detail": "Plain-language paragraph: what to do and why it matters.",
    },
  ],
}
```

Per-check addition (in each dimension artifact and thus in `audit.json`):

```jsonc
{
  "check_id": "AS-06",
  "plain": "Checks that write/delete API endpoints require login before they run." /* ...existing fields... */,
}
```

**Authorship integrity:** `headline` values and `recommendations` MUST be transcribed verbatim from the per-dimension check data (the orchestrator cites `check_id`); bands come from the check's existing `hint` ("DORA-banded (high)"). The orchestrator does not invent numbers. This is the same trust model as today's hand-authored `recommendations.md`.

### Renderer — single page, hash-routed sub-pages

One self-contained HTML document. No audience tabs. Two view levels toggled by `location.hash`; all panes are rendered into the DOM and shown/hidden by a tiny handler, so the file stays static and offline-capable.

```
 OVERVIEW  (#)                                    DIMENSION SUB-PAGE  (#dim/security)
┌──────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│ AI-SDLC Readiness Audit · project · date  │    │ ← Back to overview                         │
│┌────────────────────────────────────────┐│    │ Security   44 pts · cov 65% · FAIL 2 WARN 1│
││ EXECUTIVE BAND          ← CEO stops here ││    │                                            │
││  306 pts   coverage 71%                  ││    │ What to improve here                       │
││  ┌Delivery────┐ ┌Scale─────┐ ┌Reach────┐││    │  [P0] Add deny-hook blocking secret reads  │
││  │Deploy 1.9/wk│ │30k LOC   │ │AI: part.│││    │       plain-language detail …              │
││  │  [High]     │ │CCN 1.66  │ │5.3 ctrs │││    │                                            │
││  │Lead ~7h[Eli]│ │          │ │         │││    │ [Show issues only]                         │
││  └────────────┘ └──────────┘ └─────────┘││    │ ┌#┬Check───┬St┬Wt┬Rel┬Val┬Evidence───────┐│
│└────────────────────────────────────────┘│    │ │1│SEC-01 ✦│PA│6/6│max│ ✓ │auth present…   ││
│ Top insights                              │    │ │2│SEC-02 ✦│FA│0/8│max│ 0 │no deny-hook;   ││
│  ▌ Secrets & supply-chain hygiene  (high) │    │ │ │  ↑tip  │  │   │   │   │.env readable…  ││
│  ▌ → fixing both closes the biggest gap   │    │ └─┴───────┴──┴───┴───┴───┴── wide ≈35% ───┘│
│ What to improve                           │    │  ✦ hover = instant plain-first tooltip      │
│  [P0] Add guardrails blocking secret reads│    └──────────────────────────────────────────┘
│  [P0] Add CVE scanning to CI              │       ▲                         │
│  [P1] Pin dependency upper bounds         │       │ click dimension row     │ browser Back
│ Dimensions  (each row → sub-page)         │       │  (sets #dim/<key>)      ▼ (hash cleared)
│  Security ............ 44pts  [→] ────────┼───────┘                  returns to OVERVIEW
│  Supply Chain ........ 31pts  [→]         │
│ Repositories & Connections                │
└──────────────────────────────────────────┘
```

**Overview (`#`, default):**

1. **Executive band** (CEO stops here):
   - Capability headline — `audit_total` pts + coverage % + overall confidence/reliability.
   - **Delivery** — `headline.delivery` as value + DORA band chips.
   - **Code scale & complexity** — `headline.scale`.
   - **Reach** — `headline.reach` (+ org portfolio cards when org mode).
   - Graceful fallback: if `headline` absent, render the capability headline alone (today's behavior).
2. **Top insights** — `insights[]` as severity-colored cards (`theme` → `so_what` → `improves`). The restored "READ".
3. **What to improve** — `recommendations[]` grouped P0/P1/P2, plain `detail`. If `recommendations` absent, fall back to the current mechanical FAIL/WARN derivation.
4. **Dimensions** — the engineering summary table; each row is an anchor to `#dim/<key>`.

**Dimension page (`#dim/<dimension>`):**

- Header: dimension title, score, coverage, aggregate reliability, and a **Back** link (anchor to `#`).
- This dimension's recommendations (filtered from `recommendations[]` by `dimension`).
- **Check table** (see formatting below) with an "Issues only" filter.

**Routing:** plain hash anchors (`<a href="#dim/x">`) — browser Back/Forward work natively because anchor navigation pushes history; no `history.pushState` needed. On `hashchange`: show the matching pane, hide others, scroll to top. Empty/unknown hash → overview.

### Tooltips — instant and plain (#3)

- Drop native `title=`. Use a `.tip` span carrying `data-tip` and small structured data attributes; pure-CSS `::after` shows the card **with no delay** on hover/focus, `max-width` with wrapping, edge-aware positioning.
- Tooltip content leads with the **plain** sentence (`check.plain`, bold), then small-print: definition · what we found (value) · confidence/source. The dense five-part string is demoted to that small print, not the headline.
- Technical columns (`code`, `source`, `method`) move **out** of the table and into the tooltip, reclaiming width.

### Drill-down table formatting (#5)

- `table-layout: fixed` with explicit column widths. With `code/source/method` folded into the tooltip, remaining columns: `#`, `Check` (id + plain one-liner), `Status`, `Weight`, `Reliability`, `Value` (+ sparkline), **`Evidence` ≈ 45%** with clean wrapping (`word-break`/`overflow-wrap`).
- Evidence list items render one per line; long paths wrap rather than truncate.

### Markdown renderer (mirror)

`renderMarkdown` mirrors the new content so `report.md` ≠ a poor cousin: add an **Insights** section and switch **Recommendations** to render from `recommendations[]` when present (else the current derivation). The five-part hint stays available in the Markdown Hint column (plain `plain` shown first where present). Markdown has no tabs/routing — it is naturally a single document.

## Components & files touched

| File                                                            | Change                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins/awos/skills/ai-readiness-audit/render.ts`              | Rewrite `renderHtml` (single page, hash routing, exec band, insights, recommendations, CSS tooltips, fixed-width table). Extend `renderMarkdown` (insights + structured recommendations). New types: `Headline`, `Insight`, `Recommendation`; optional `Check.plain`; optional `AuditJson.headline/insights/recommendations`. Update the schema doc comment. |
| `plugins/awos/skills/ai-readiness-audit/SKILL.md`               | Orchestrator authors `headline`, `insights[]`, `recommendations[]` into `audit.json` before render (both single-repo and org). `recommendations.md` continues to be written for `/awos:roadmap` input, transcribed from the same authoring pass.                                                                                                             |
| `plugins/awos/agents/dimension-auditor.md` + `output-format.md` | Each check emits a one-sentence non-technical `plain`.                                                                                                                                                                                                                                                                                                       |
| `plugins/awos/skills/ai-readiness-audit/report-template.md`     | Update the spec the report follows: single page, drill sub-pages, exec band, insights, instant plain tooltips.                                                                                                                                                                                                                                               |
| `docs/design/ai-sdlc-exec-deliverable.md`                       | Resolve the contradiction: renderer stays pure, narrative authored upstream into JSON; single-page layout; instant plain tooltips (five-part string demoted to small print); drill-down as sub-pages with Back.                                                                                                                                              |
| `plugins/awos/skills/ai-readiness-audit/tests/render.test.ts`   | Update/extend: single-page structure, hash anchors, insights/recommendations rendering, `data-tip` tooltips (no `title=`), fixed table widths, graceful degradation when new fields absent.                                                                                                                                                                  |
| `plugins/awos/skills/ai-readiness-audit/dist/**`                | Rebuild via `npm run build:engine` and commit (CI fails on stale `dist/`).                                                                                                                                                                                                                                                                                   |

## Testing

- `render.test.ts` (Node `node:test` + `tsx`): assert the overview contains exec band + insights + recommendations when those fields are present; assert dimension panes exist with `id="dim-<key>"` and Back anchors; assert tooltips use `data-tip` and the document contains no `title=` on hint spans; assert the Evidence column carries the wide style; assert graceful fallback (render an `audit.json` lacking the new fields → no throw, capability headline + mechanical recommendations still render). Each assertion message names the contract.
- `npm run build:engine` then `npm run test:engine`; full `npm test` before commit. Run with real Node (global `node` is a Bun shim that breaks `node:test`).
- Manual: open the regenerated `report.html` from a real audit, verify CEO band, click into a dimension, press browser Back, hover a value (instant plain tooltip).

## Non-goals / YAGNI

- No money/ROI, no per-developer data, no before/after-AI deltas (unchanged scope).
- No structured `band`/`unit` fields added to every metric (~20 files). Bands are transcribed by the orchestrator into `headline` from the existing `hint`. Adding structured band fields to the engine is a possible future hardening if headline determinism becomes a requirement; out of scope here.
- No JS framework, no build step for end users — the report remains a single self-contained HTML file.

## Open choices (defaults chosen; flag at review if wrong)

- `recommendations.md` stays a separate file (roadmap input) rather than being deleted; it is transcribed from the same authoring pass as `recommendations[]`.
- Exec-band insights capped at ~5 cards; remaining recommendations live in "What to improve" with a show-all expander.
