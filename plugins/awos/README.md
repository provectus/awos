# AWOS Audit Plugin

Extensible, dimension-based code quality audit for Claude Code. A deterministic TypeScript engine scores every dimension in a single pass; the model fills only a small judgment slice and authors the plain-language narrative. Run `/awos:ai-readiness-audit` and get a scored report with actionable recommendations.

## Install

If you installed AWOS (`npx @provectusinc/awos`), the marketplace is already registered. Just enable the plugin:

```
/plugin install awos@awos-marketplace
```

To register the marketplace manually:

```
/plugin marketplace add provectus/awos
```

## Usage

Full audit across all dimensions:

```
/awos:ai-readiness-audit
```

Single dimension:

```
/awos:ai-readiness-audit application-security
```

## How It Works

Each **dimension** is a self-contained `.md` file in `skills/ai-readiness-audit/dimensions/` defining its checks and their category codes. Scoring runs in the engine:

1. The orchestrator runs one deterministic command — `node dist/cli.js audit-core <repo> <out>`
2. The engine evaluates project-topology first (its flags gate other categories), then every `detected`/`computed` category across all dimensions, in one pass
3. It writes each `<dimension>.json` plus the aggregated `audit.json`
4. The orchestrator fills only the LLM-only slice (the few `judgment` categories, the tracker/docs connector metrics) and authors the plain-language report blocks
5. The renderer produces `report.md` + `report.html` from `audit.json` (additive weighted scoring — no letter grade)

### Scoring

Scoring is additive and weighted — there is no letter grade and no deduction table. Every check maps to one or more capability categories in `skills/ai-readiness-audit/references/standards.toml`, each carrying a numeric weight. A check that passes awards its categories' weights; a dimension's score is the sum of awarded weights; the audit total is the sum across dimensions, uncapped. A secondary **coverage ratio** (awarded ÷ currently-defined applicable weight) shows how much of the current industry standard is in place, and every check carries a reliability tag (`maximal`/`minimal`/`not-reliable` plus confidence) derived from which data sources were available.

## Dimensions

| Dimension                   | What it measures                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Project Topology**        | Reconnaissance — repo structure, layers, and languages; computes the flags that gate other checks (unscored) |
| **Delivery Flow**           | DORA-style delivery metrics — deployment frequency, lead time, change-failure rate, review rework, MTTR      |
| **Software Best Practices** | Code quality, architecture patterns, and engineering standards                                               |
| **Code Architecture**       | Coherent architectural pattern, clear module boundaries, SRP                                                 |
| **Quality Assurance**       | Testing pyramid structure, tooling maturity, and optional contract/ML testing readiness                      |
| **Application Security**    | Curated OWASP ASVS 5.0.0 L1 subset — TLS, headers, CORS, SQL injection, secrets, auth, input validation      |
| **Supply Chain Security**   | Lockfile integrity, version pinning, quarantine periods, vulnerability scanning, dependency bloat            |
| **AI Security**             | Malicious or suspicious content in agent definitions/skills/hooks/MCP configs, plus agent-access guardrails  |
| **Documentation**           | Documentation accuracy, completeness, and maintainability                                                    |
| **AI Development Tooling**  | AI-agent infrastructure — CLAUDE.md quality, agent configs, skills, MCP servers, hooks, commands             |
| **Spec-Driven Development** | Spec-driven workflow health — specs, product/architecture docs, task assignments                             |
| **AI-SDLC Adoption**        | Quantitative adoption — tooling depth, AI attribution, CI health, ticket work-mix, spec coverage             |
| **Descriptors**             | Informational size and activity signals — contributors, churn, complexity, scale (weight 0; context only)    |

Project Topology is evaluated first inside the engine pass — its flags decide which categories apply to this repo — and the remaining dimensions are scored in the order above (defined by `standards.toml [meta].dimension_order`).

## Outputs

Each audit run writes to `context/audits/YYYY-MM-DD/`:

```
context/audits/YYYY-MM-DD/
├── collected/                   # one JSON artifact per data source (git, ci, tracker, docs)
├── <dimension>.json             # per-dimension results, one file per dimension
├── audit.json                   # aggregated audit — the source of truth
├── report.md                    # rendered Markdown report
├── report.html                  # rendered self-contained HTML report
├── recommendations.md           # prioritized action items
└── per-repo/<repo>/             # org mode only: a full per-repo audit per repository
```

`report.md` and `report.html` are always rendered together from `audit.json` — never hand-written. In org mode each `per-repo/<repo>/` subdir holds that repo's full audit, and an `org-portfolio.json` drives the org-level report. When a previous audit exists, the report includes score deltas per dimension.

## Plugin Structure

```
plugins/awos/
├── .claude-plugin/
│   └── plugin.json              # plugin manifest
├── skills/
│   └── ai-readiness-audit/
│       ├── SKILL.md             # orchestrator skill
│       ├── dimensions/          # dimension files (checks + category codes)
│       ├── audit_core.ts        # single deterministic scoring pass
│       ├── topology.ts          # deterministic project-topology flags
│       ├── scoring.md           # scoring algorithm
│       ├── output-format.md     # artifact format spec
│       └── report-template.md   # HTML report spec
└── README.md
```

## Extending

Add a new dimension by dropping a `.md` file into `skills/ai-readiness-audit/dimensions/` and adding its category records (code, weight, definition, applicability) to `skills/ai-readiness-audit/references/standards.toml`. The engine discovers the dimension file automatically.

```markdown
---
name: my-dimension
title: My Dimension
description: What this dimension measures
severity: high
depends-on: [project-topology]
---

# My Dimension

## Checks

### CHECK-01: Descriptive check name

- **What:** What to verify
- **How:** Commands or instructions to evaluate
- **Pass:** Criteria for PASS
- **Fail:** Criteria for FAIL
- **Severity:** critical | high | medium | low
- **Category:** numeric standards.toml category code(s)
```

See `skills/ai-readiness-audit/SKILL.md` for the full frontmatter schema.
