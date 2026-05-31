# Change Request: [Title]

- **CR ID:** [NNN]
- **Date:** [YYYY-MM-DD]
- **Author:** [name]
- **Status:** Proposed | Accepted | Rejected | Deferred | Withdrawn | Implemented

---

## 1. Triggered By

The change was prompted by a modification to (mark all that apply):

- [ ] `context/product/product-definition.md` — section: [name]
- [ ] `context/product/roadmap.md` — phase / item: [name]
- [ ] `context/spec/[NNN-slug]/functional-spec.md` — section: [name]
- [ ] Other: [describe]

**Context (1–2 sentences):** Name the artifact and the section being changed; do not justify the change here — that goes in §3.

---

## 2. Summary of Change

A short, plain-language description of what is changing. One paragraph, no reasoning.

---

## 3. Driver (Why This Change?)

**Primary driver (pick one):**

- [ ] **User / stakeholder feedback**
- [ ] **Implementation learnings** — something discovered while building that invalidated an earlier assumption
- [ ] **New external constraint** — regulatory, vendor change, deprecation, cost, deadline
- [ ] **Strategic pivot** — product-level direction change
- [ ] **Error correction** — the earlier decision was wrong on its own terms
- [ ] **Scope adjustment** — descope or rescope based on capacity / priority
- [ ] **Other:** [describe]

**What was the previously-agreed assumption?** [one sentence — if you cannot name it, this may not be a real change request]

**What changed about that assumption?** [one sentence]

**Detailed reasoning:** [free text — what specifically led here, in the author's own words; cite the trigger if there is one]

**Could this have been anticipated earlier?** [optional — captures lessons]

---

## 4. Nature of Change

- [ ] **Additive** — adds new behaviour without altering old (rare reason for a CR; usually a fresh spec covers this instead)
- [ ] **Revisionary** — overrides or contradicts a previously-agreed requirement
- [ ] **Removal / descope** — withdraws a previously-agreed requirement

---

## 5. Impact on Existing Requirements

| Affected artifact (path + section)                                 | What changes                        | Already implemented? |
| ------------------------------------------------------------------ | ----------------------------------- | -------------------- |
| e.g., `context/spec/001-playable-skeleton/functional-spec.md §2.3` | Acceptance criterion 2.3.4 replaced | Yes / No / Partially |

**Rework / migration required (if any "Yes" or "Partially" above):**

- [describe]

---

## 6. Decision

- **Decision:** Accepted | Rejected | Deferred to [phase / date] | Withdrawn
- **Decided by:** [name]
- **Decided on:** [YYYY-MM-DD]
- **Rationale:** [one or two sentences]

---

## 7. Follow-up Actions

- [ ] Update affected `functional-spec.md` / `technical-considerations.md` / `tasks.md`
- [ ] Re-run `/awos:verify` for any spec whose acceptance criteria shifted
- [ ] Re-run `/awos:tasks` for slices whose work has to be redone
- [ ] Update `context/product/architecture.md` if any architectural assumption moved
- [ ] [other]
