# AWOS Audit Plugin

Extensible, dimension-based code quality audit for Claude Code. Each dimension runs in its own context window for thorough analysis. Run `/awos:ai-readiness-audit` and get a scored report with actionable recommendations.

## Install

From the AWOS marketplace:

```bash
claude plugin marketplace add <org>/awos
claude plugin install awos
```

Or directly for local development:

```bash
claude --plugin-dir ./plugins/awos
```

## Usage

Full audit across all dimensions:

```
/awos:ai-readiness-audit
```

Single dimension:

```
/awos:ai-readiness-audit security
```

## How It Works

Each **dimension** is a self-contained `.md` file in `skills/audit/dimensions/` with YAML frontmatter declaring its dependencies. The orchestrator:

1. Auto-discovers all dimension files and builds a dependency DAG
2. Groups dimensions into execution phases
3. Launches each dimension as a **separate agent** with its own context window (via the `dimension-auditor` agent)
4. Within each phase, all dimensions run **in parallel**
5. Compiles results into a scored report with an overall grade

### Scoring

Every check produces a status: **PASS**, **WARN**, **FAIL**, or **SKIP**. Deductions scale by severity:

| Severity | Max Points | FAIL | WARN  |
| -------- | ---------- | ---- | ----- |
| critical | 3          | -3   | -1.5  |
| high     | 2          | -2   | -1    |
| medium   | 1          | -1   | -0.5  |
| low      | 0.5        | -0.5 | -0.25 |

Dimension scores average into an overall percentage mapped to a letter grade (A: 90-100, B: 75-89, C: 60-74, D: 40-59, F: 0-39).

## Dimensions

| Dimension                   | Severity | Dependencies     |
| --------------------------- | -------- | ---------------- |
| **Project Topology**        | medium   | —                |
| **Security Guardrails**     | critical | project-topology |
| **AI Development Tooling**  | high     | project-topology |
| **Spec-Driven Development** | critical | project-topology |
| **Documentation Quality**   | critical | project-topology |
| **Code Architecture**       | high     | project-topology |
| **Software Best Practices** | high     | project-topology |
| **End-to-End Delivery**     | high     | all others       |

**Project Topology** runs first as a reconnaissance phase — it detects the repo structure, languages, and layers so downstream dimensions can skip irrelevant checks.

**End-to-End Delivery** runs last since it depends on every other dimension's results.

## Outputs

Each audit run writes to `context/audits/YYYY-MM-DD/`:

```
context/audits/YYYY-MM-DD/
├── project-topology.md          # per-dimension artifact
├── security.md
├── ...
├── report.md                    # full audit report
├── recommendations.md           # prioritized action items
└── report.html                  # standalone HTML report (optional)
```

When a previous audit exists, the report includes score deltas per dimension.

## Plugin Structure

```
plugins/awos/
├── .claude-plugin/
│   └── plugin.json              # plugin manifest
├── skills/
│   └── ai-readiness-audit/
│       ├── SKILL.md             # orchestrator skill
│       ├── dimensions/          # auto-discovered dimension files
│       ├── scoring.md           # scoring algorithm
│       ├── output-format.md     # artifact format spec
│       └── report-template.md   # HTML report spec
├── agents/
│   └── dimension-auditor.md     # generic agent for any dimension
└── README.md
```

## Extending

Add a new dimension by dropping a `.md` file into `skills/audit/dimensions/`. No other changes needed — the orchestrator auto-discovers it.

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
```

See `skills/audit/SKILL.md` for the full frontmatter schema.
