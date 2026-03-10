# /awos:spec

> Creates the Functional Spec — what the feature does for the user.

## What it does

This command creates a detailed functional specification for a single feature. It describes what the feature does and why — from a user's perspective, with no technical implementation details. It produces:

- `context/spec/[index]-[name]/functional-spec.md`

A new numbered directory is created for each spec (e.g., `001-user-auth`, `002-file-upload`).

## Prerequisites

- `context/product/product-definition.md` must exist.
- `context/product/roadmap.md` must exist.

## How it works

1. **Picks the topic**: Either uses your prompt as the feature topic, or automatically selects the next incomplete item from the roadmap.
2. **Gathers context**: Reads the product definition and roadmap to understand what's already documented about this feature.
3. **Interactive drafting**: Presents what it already knows, then asks targeted questions to fill in the gaps — focusing on the "why" (user pain points) and the "what" (functional requirements). For every requirement, it probes for edge cases like a QA tester would.
4. **Marks ambiguities**: Anything that can't be resolved gets tagged with `[NEEDS CLARIFICATION: question]` directly in the document.
5. **Creates the spec**: Runs a script to create the directory and saves the approved spec.

## Key behaviors

- **One feature per spec.** Each spec covers exactly one roadmap item. All other roadmap items are automatically placed out-of-scope.
- **Non-technical language.** Describes what users can do, not how the system implements it. The "how" comes in `/awos:tech`.
- **Thinks like a tester.** Aggressively clarifies ambiguities — "What file formats are allowed?", "What happens on failure?", "What's the max file size?"
- **[NEEDS CLARIFICATION] tags.** If something can't be confirmed, it's flagged explicitly rather than assumed. This prevents silent assumptions from causing bugs later.
- **Testable acceptance criteria.** Every requirement is turned into a concrete, verifiable acceptance criterion (Given/When/Then style).

## Common misconceptions

- **"I should include implementation details."** No. "Use PostgreSQL for storage" is a technical decision. "The user can save their progress" is a functional requirement. Stick to the latter.
- **"I should be vague to keep options open."** Vague specs produce vague code. Be specific about what the user experiences — exact behaviors, error messages, edge cases.
- **"I can cover multiple features in one spec."** Each spec is scoped to one roadmap item. This keeps specs focused and manageable.

## Example usage

```bash
# Good — let it auto-pick the next roadmap item:
> /awos:spec

# Good — specify a feature from the roadmap:
> /awos:spec Feature: Face Detection - System detects faces in uploaded image, highlights detected area with bounding box.

# Bad — implementation details, not user-facing functionality:
> /awos:spec Implement multipart/form-data POST to /api/upload with JWT auth.

# Bad — too generic to implement:
> /awos:spec Feature: Make the app work well.
```

## What happens next

Run `/awos:tech` to create the technical specification for how to build this feature.
