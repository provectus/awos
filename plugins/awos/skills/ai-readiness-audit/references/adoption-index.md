# AI-SDLC Adoption Index

The **AI-SDLC Adoption Index** is a standalone composite score in the range **0–100** that quantifies how deeply AI tooling has been integrated into a team's software-delivery lifecycle. It is reported **alongside** the A–F readiness grade and is **never merged into** that grade. The two outputs answer different questions: the A–F grade rates readiness potential across all audit dimensions; the Adoption Index measures the observed AI-delivery trajectory in isolation.

The index mirrors the Provectus board framing of **baseline → current → target** without expressing any values in money or currency.

---

## Sub-scores

The index is composed of three sub-scores, each scored 0–100, and then combined via weighted average.

### Adoption (weight: 30%)

Measures current-state coverage of AI tooling across the repository set, drawing primarily from **ADP-G1** and, when Tier D data is present, **ADP-D1** as a supporting signal. Because tooling adoption starts at zero by definition, this sub-score reports the **ramp** (current coverage fraction), not a before/after delta.

A score of 100 means AI tooling signals are detected across all configured layers in all linked repositories. Partial coverage and single-repo presence score proportionally lower.

### Delivery (weight: 50%)

Measures the impact of AI adoption on delivery flow. It draws on **ADP-G3 through ADP-G8** as the primary evidence set, and on **ADP-C1 / ADP-C2** when Tier C is available. The sub-score primarily rewards **measured improvement versus the before-AI baseline** (delta capped so a single outlier period cannot inflate the score). It also incorporates the current DORA performance band for stability (change failure rate, ADP-G7) to prevent a scenario where throughput rises but quality collapses.

Improvement is evaluated over a before/after window of equal length; the before window ends at the `adoption_start` date resolved during data-source discovery.

### Allocation (weight: 20%)

Measures work-mix shift toward growth and innovation work, using **ADP-I1** as the primary input. **This sub-score is computed only when Tier I (issue-tracker) data is available.** When Tier I is absent the sub-score is dropped entirely and the remaining two sub-scores are re-weighted.

---

## Re-weighting when Tier I is absent

When Tier I data is unavailable and the Allocation sub-score cannot be computed, the index is re-weighted to:

| Sub-score  | Default weight | Adjusted weight (no Tier I) |
| ---------- | -------------- | --------------------------- |
| Adoption   | 30%            | 35%                         |
| Delivery   | 50%            | 65%                         |
| Allocation | 20%            | — (dropped)                 |

The adjusted weights preserve the intent that delivery evidence carries more weight than tooling coverage alone, while keeping the index well-defined at any data tier.

---

## Confidence levels

Confidence is reported prominently alongside the index so that board-level numbers are not over-claimed. Missing data tiers lower the confidence label; they never silently zero a sub-score.

| Level      | Data available                   | Notes                                                                                                                                                                                                                                    |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | git + CI + issue-tracker         | All three primary source families present. Delivery and Allocation sub-scores carry full evidential weight.                                                                                                                              |
| **MEDIUM** | git + one of CI or issue-tracker | Either CI or Tier I is available but not both. At least one sub-score is approximated or re-weighted.                                                                                                                                    |
| **LOW**    | git-only                         | Tier G metrics only. Allocation sub-score is dropped; Delivery is based on git-derived DORA proxies. Index is computed at the achievable confidence; the LOW label signals that additional connectors would materially improve accuracy. |

The confidence label is determined at runtime from the data sources confirmed during discovery (see `data-sources.md`).

---

## Output format

The index report includes the following for each assessment:

- **AI-SDLC Adoption Index** — the composite 0–100 score, with the active confidence level displayed prominently (e.g., `72 / 100 [MEDIUM confidence]`).
- **Sub-score breakdown** — Adoption, Delivery, and Allocation (if computed) each shown with their 0–100 value and active weight.
- **Before/after deltas** for each Delivery metric — the baseline value, the current-window value, and the direction of change. Mirrors the Provectus board framing of baseline → current → target.
- **Confidence label** and the reason for the assigned level (e.g., "Tier I absent — Allocation dropped; Delivery re-weighted to 65%").
- **Re-weighting note** when the default weights were adjusted.

The index is always reported as a companion output next to the A–F readiness grade table, not embedded within it.
