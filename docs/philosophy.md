# The `awos` Philosophy

What `awos` is, what it is not, and the principles it is built on.

## What `awos` Is

**`awos` is a method for turning intent into working software with agents, where the human decides and the agent builds.**

The product of `awos` is agreement: a confirmed, shared understanding between the human and the agent about what is being built and why. Documents are how that agreement is stored and transported.

## Principles

### 1. Judge by outcome

The measure of `awos` is whether what ships is what was wanted, the first time. Better documents, better prompts, and better process are only means. Anything that makes them richer without moving that outcome is waste.

### 2. Intent is gathered, then confirmed

The human is the authority on intent, but not necessarily its only source. The person at the keyboard may hold part of the picture; the rest lives in code, tickets, past decisions, and other people, and sometimes it has not been decided yet. `awos` goes and finds the missing parts and brings them back to the human to confirm. It never fills a gap by guessing: what cannot be found is surfaced as an open question.

### 3. Understanding is confirmed before anything is built

There is always a moment where the human can see what the agent understood and say "yes, that" or "no, not that." It comes before code, where a misunderstanding is cheapest to fix. Everything else in the method exists to make this moment possible.

### 4. The agreement is the contract for the build

Implementation is judged by how faithfully it realizes the confirmed understanding, and verification checks the result against that agreement rather than only whether the code works. Implementation improvements belong in `awos` when they raise that fidelity or make deviation from the agreement visible sooner; improvements to code quality in general belong to the host tool.

### 5. `awos` checks its own work

`awos` does not consider work done until it has made sure of it itself. Noticing that something is incomplete, wrong, or missing is `awos`'s job, not the human's. Where it cannot make sure, it says so. Quality and the ability to check it advance together — more checks do not make the work good, and good work is not done until it can be checked. A change to `awos` that trades one for the other is not an improvement.

### 6. Write for the reader

Agents and humans need information presented differently. Keep the structured source useful for agents, and derive focused human-facing views from it whenever someone needs to review or make a decision.

### 7. Make the missing parts reviewable

What is written in a specification is easy to review. What is missing is much harder to notice, even when it is essential. `awos` looks for gaps in requirements and acceptance criteria, makes every inference explicit, and shows the evidence behind it. When there is not enough evidence, it raises an open question instead of guessing.

### 8. The project remembers

Knowledge produced by a change outlives the change. A new piece of work starts from what the product already is, not from a blank page or a single line in a backlog. The method keeps that knowledge current itself rather than asking people to.

### 9. `awos` owns one path

Intent → confirmed understanding → implementation → verification. Everything around that path — backlog, branching, code review, deployment, tickets, team tooling — is something `awos` plugs into, never something it provides.

### 10. `awos` speaks one host, natively

`awos` is built for Claude Code, by design. The method depends on what the host actually provides — subagents, structured questions to the human, hooks, skills, plugins — and it uses those primitives directly, with no abstraction layer between them and the prompts. This is a quality decision, not a convenience: every layer meant to make `awos` portable would flatten the host's capabilities to the lowest common denominator and make the behavior of the method harder to test and tune. One host means one set of behaviors to verify against, and the full depth of that host's tools available to the method.

### 11. `awos` is for work worth specifying

Reaching agreement before building takes time. Use `awos` when that effort costs less than getting the result wrong. For exploration, prototypes, hotfixes, and small edits, the agent's normal planning is usually enough.

## What `awos` Is Not

- A Claude Code distribution or a bundle of best practices.
- A delivery process — git flow, review gates, release management.
- A planning or backlog tool.
- A code-quality or engineering-metrics tool.
- A way to discover what to build.
- A document generator.

Where these principles lead is in [Direction](direction.md); the reasoning behind them is in [Why `awos` Works](rationale.md).
