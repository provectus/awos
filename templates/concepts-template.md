---
spec: NNN-<slug>
spec_title: [Human-readable spec title]
introduced_on: YYYY-MM-DD
---

# Concepts introduced in this increment

[Each entry carries both a **human-readable title** (what readers see in the tutorial) and a **kebab-case slug** (internal dedup key, parenthesised in `code` format). The title is short (3–8 words, Title Case where natural) and describes the concept in plain English. The slug never changes once assigned; the title can be rewritten freely. Group bullets under domain headings appropriate to the project's stack — e.g. "Orchestration", "Persistence", "UI", "Infrastructure", "Testing", "Observability". The agent picks domain headings based on what the spec actually exercises; not all projects will have all domains.]

## [Domain heading 1]

- **[Human-readable Title]** (`<kebab-slug>`) — One sentence describing what this concept is and why this increment uses it.
- **[Another Title]** (`<another-kebab-slug>`) — One sentence describing what this concept is and why this increment uses it.

## [Domain heading 2]

- **[Title]** (`<kebab-slug>`) — One sentence describing what this concept is and why this increment uses it.

[Add as many domain headings and bullets as needed. Keep each bullet to a single line — no file:line references, no code snippets. Detail belongs in the companion `tutorial.md`. The slug in `code` parens is what future tutorials' dedup logic looks up — do not omit it. The title is what readers see; the slug is internal.]
