# The `awos` Philosophy

What `awos` is, what it is not, and the principles it is built on.

## What `awos` Is

**`awos` is a method for turning intent into working software with agents, where the human decides and the agent builds.**

The product of `awos` is not documents. It is _agreement_ — a confirmed, shared understanding between the human and the agent about what is being built and why. Documents are how that agreement is stored and transported; they are never the goal.

## Principles

### 1. Judge by outcome, not by instruction

The measure of `awos` is whether what ships is what was wanted, the first time. Better documents, better prompts, and better process are only means. Anything that makes them richer without moving that outcome is waste.

### 2. Intent is gathered, then confirmed

The human is the authority on intent, but not necessarily its only source. The person at the keyboard may hold part of the picture; the rest lives in code, tickets, past decisions, and other people — and sometimes it has not been decided yet. `awos` goes and finds the missing parts and brings them back to the human to confirm. It never fills a gap by guessing: what cannot be found is surfaced as an open question, not quietly resolved.

### 3. Understanding is confirmed before anything is built

There is always a moment where the human can see what the agent understood and say "yes, that" or "no, not that." It comes before code, where a misunderstanding is cheapest to fix. This moment is the center of the method; everything else exists to make it possible.

### 4. The agreement is the contract for the build

Implementation is judged by how faithfully it realizes the confirmed understanding, and verification checks the result against that agreement — not merely that the code works. Implementation improvements belong in `awos` when they raise that fidelity or make deviation from the agreement visible sooner; improvements to code quality in general belong to the host tool.

### 5. Every artifact has one reader

Agents read structured truth. Humans read what they need in order to decide. Nothing serves both: when a document tries, it fails the human, and the human stops reading. Human-facing views are derived from the agent-facing source, never maintained by hand, and exist to enable a decision rather than to inform.

### 6. What is unsaid is part of the spec

Assumptions, decisions made without being asked, and things left unchanged are made visible. Omissions, not statements, are where rework comes from — and they are exactly what a human cannot hold in their head unaided while reviewing a long list of requirements.

### 7. The project remembers

Knowledge produced by a change outlives the change. A new piece of work starts from what the product already is, not from a blank page or a single line in a backlog. The method keeps that knowledge current itself rather than asking people to.

### 8. `awos` owns one path

Intent → confirmed understanding → implementation → verification. Everything around that path — backlog, branching, code review, deployment, tickets, team tooling — is something `awos` plugs into, never something it provides.

### 9. `awos` is for work worth specifying

When the cost of being wrong is lower than the cost of agreeing first, `awos` is the wrong tool, and it says so instead of shrinking to fit. Exploration, prototypes, hotfixes, and small edits have their own tools.

## What `awos` Is Not

- A Claude Code distribution or a bundle of best practices.
- A delivery process — git flow, review gates, release management.
- A planning or backlog tool.
- A code-quality or engineering-metrics tool.
- A way to discover what to build.
- A document generator.

Where these principles lead is in [Direction](direction.md); the reasoning behind them is in [Why `awos` Works](rationale.md).
