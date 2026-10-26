# /awos:spec

> Creates the Functional Spec — what the feature does for the user.

## What it does

This command creates a detailed functional specification for a single feature. It describes what the feature does and why — from a user's perspective, with no technical implementation details. Before it asks you anything it researches the feature, writes down what it found, and makes sure you and it understand the feature the same way. It produces:

- `context/spec/[index]-[name]/functional-spec.md` — the spec itself; the only file anything downstream reads
- `context/spec/[index]-[name]/feature-brief.md` — what the feature is today, in plain language, with the understanding ledger and the dialog log
- `context/spec/[index]-[name]/research-notes.md` — the raw technical findings behind the brief
- `context/spec/[index]-[name]/functional-spec.html` — a human-facing review page, rendered from the spec

A new numbered directory is created for each spec (e.g., `001-user-auth`, `002-file-upload`).

## Prerequisites

- An AWOS installation (`npx @provectusinc/awos`) — the command uses the installed template, the spec-directory script, the renderer script and the `spec-verifier` agent.
- `context/product/product-definition.md` is read when present; its absence is noted, not fatal.
- Optional: `context/sources/sources.md`, written by the `configure-external-sources` skill (ships with the awos plugin). When present and configured, the internal-KB research lane runs against the sources it records.

## How it works

1. **Picks the topic**: Uses your prompt as the feature topic, or asks you for one when the prompt is empty. In an unattended run with no topic, it stops with a one-line re-run instruction rather than guessing. A spec number in the prompt routes elsewhere: to an in-place amendment when the spec exists, or to resuming the understanding gate when only a `Draft` brief exists.
2. **Offers to discover sources**: When `context/sources/sources.md` does not exist, it asks once whether to discover the project's knowledge sources now or skip for this spec. Suggested, never enforced.
3. **Researches before the first question**: As soon as the topic is known, research agents run in parallel — the codebase (always), the web (always; reports `SKIPPED` without web access), and the internal knowledge base (when `sources.md` is configured with a source an agent can reach). Anything the prompt references — a ticket, a URL, a file — is read first.
4. **Writes the feature brief**: From the research it writes `feature-brief.md`: the feature's vocabulary (every domain term in one sentence, most basic first), what it does today, what it depends on, what it changes, its quirks (each as "normally … here …"), and the open questions. The research notes are written alongside. Both exist before you are asked anything.
5. **Holds the understanding gate**: It points you at the brief and opens a conversation. You can ask what any term means, correct what the research got wrong, point at a ticket, page, meeting or person, or explain the feature yourself; each reply updates the brief and is logged in it. The big-picture questions (the pain point, the capability, the boundaries) come only once you are oriented. The gate closes only on your explicit confirmation, which is dated in the brief — the command never checks it on its own. Stop before that and the brief stays `Draft`; `/awos:spec <spec-number>` resumes the gate later.
6. **Drafts and self-reviews**: Uncontroversial findings (edge cases, boundary behavior, error paths) flow straight into requirements and acceptance criteria. Findings that raise a real question — a conflict with what you said, or a choice you have not made — are drafted on the research-backed answer and marked `[NEEDS CLARIFICATION: …]`. Technical findings are translated to user-facing language. The draft is checked for vague wording and for every requirement carrying a when/then criterion.
7. **Saves the spec**: Runs the script to create the directory and writes `functional-spec.md` without waiting for approval.
8. **Verifies it blind**: A second agent, `spec-verifier`, is given nothing but the spec's path. It reads the file cold — `Read` is its only tool — and reports terms never defined, behavior implied but not described, and acceptance criteria a tester could not run from the text alone. Mechanical fixes are folded in; judgment calls are put to you.
9. **Resolves the open questions**: Now that the spec exists, it asks you about the markers — conflicts first, then discovered decisions, then anything the review raised — and folds each answer into the requirement and its criteria. Unanswered markers stay in the file for `/awos:tech` to resolve.
10. **Renders the review page**: Writes `functional-spec.html` — an at-a-glance summary, the decisions a reviewer might challenge, what each research lane changed, and every requirement with named, collapsible acceptance criteria and provenance badges. Needs `node` on PATH; skipped, never fatal, without it. It then offers to publish the page as a private Claude artifact — strictly opt-in; an unanswered question means no.

The ordering is deliberate: a written artifact precedes every question. The brief exists before the gate's first question, the spec before the final-review questions, so a conversation that ends early leaves something to resume from. In a headless `claude -p` run a question nobody answers ends the turn, so unattended runs (`AWOS_UNATTENDED=1`, with a topic) skip the sources offer, the topic question and the gate, never publish, and still produce every file — the spec is marked as drafted from research alone.

## Amending an existing spec

`/awos:spec 014: <what changed>` amends spec 014 in place: the affected criteria are edited, a dated entry is appended under `## Change Log`, and no new directory is allocated. A spec amended after an already-verified fix stays `Completed`. The review page is a snapshot of the pre-amendment content; ask for a re-render if you want it refreshed.

## Key behaviors

- **One feature per spec.** Each spec covers exactly one topic. Anything adjacent belongs in a separate spec.
- **Research first, questions second.** Every question you get is informed by what the codebase, the web and your knowledge sources already say. Questions whose answers are documented are never asked.
- **You confirm the understanding, not the agent.** The gate is a conversation that ends only when you say the brief is right.
- **Non-technical language.** Describes what users can do, not how the system implements it. The "how" comes in `/awos:tech`. Technical evidence lives in `research-notes.md`, never in the spec.
- **Thinks like a tester.** Boundary and error behavior — limits, failure messages, what happens when an action fails — gets its own acceptance criteria.
- **[NEEDS CLARIFICATION] tags.** If something can't be confirmed, it's drafted on the best-evidenced assumption and flagged explicitly rather than assumed silently.
- **Testable acceptance criteria.** Every requirement is turned into concrete, verifiable criteria in Given/When/Then form, each one carrying `when` and `then` in a single sentence.
- **A blind second reader.** The verifier proves the spec stands on its own — for a designer, a tester, or the next model session.

## Common misconceptions

- **"I should include implementation details."** No. "Use PostgreSQL for storage" is a technical decision. "The user can save their progress" is a functional requirement. Stick to the latter.
- **"I should be vague to keep options open."** Vague specs produce vague code. Be specific about what the user experiences — exact behaviors, error messages, edge cases.
- **"I can cover multiple features in one spec."** Each spec is scoped to one topic. This keeps specs focused and manageable.
- **"The HTML page is the spec."** It is a snapshot for reviewers. Approvals bind to `functional-spec.md`; the page does not update when the markdown is later edited.

## Example usage

```bash
# Good — no topic given; the command asks you for one:
> /awos:spec

# Good — name the feature to specify:
> /awos:spec Feature: Face Detection - System detects faces in uploaded image, highlights detected area with bounding box.

# Good — resume the understanding gate of a spec whose brief is still Draft:
> /awos:spec 014

# Good — amend an existing spec after a behavior-changing fix:
> /awos:spec amend spec 014: the export limit is now 10,000 rows

# Bad — implementation details, not user-facing functionality:
> /awos:spec Implement multipart/form-data POST to /api/upload with JWT auth.

# Bad — too generic to implement:
> /awos:spec Feature: Make the app work well.
```

## What happens next

Run `/awos:tech` to create the technical specification for how to build this feature.
