# Direction

The directions `awos` always moves in. None of them is ever finished, since each is something the framework can always be more of, and none carries a date or a priority; those belong to the roadmap. Each follows from the principles in [Philosophy](philosophy.md).

## Toward agreement

**Does this make the human's confirmation of the agent's understanding more reliable, or cheaper?**

`awos` exists for the moment where a person sees what the agent understood and says "yes, that" or "no, not that." Everything that makes that moment more certain, faster, or possible at all for a person with little time is movement in this direction.

- **Advancing looks like:** a misunderstanding surfaces earlier than it did before; the time to a confident yes or no goes down; something a person had to hold in their head is now something they can read.
- **Regressing looks like:** more content to review without more decisions to make; a check that happens after implementation instead of before; a confirmation that is a formality because nobody could evaluate it.

Serves principles 1, 3, 5, and 6.

## Toward discovery

**Does this bring intent to the human from where it lives, instead of asking the human to produce it?**

Intent is scattered across code, tickets, documentation, past decisions, and other people. `awos` moves toward finding it there by default and asking the human only what nobody else can answer.

- **Advancing looks like:** a source of intent that `awos` reads on its own; a question the human no longer has to be asked; a gap that is surfaced as unknown instead of silently filled.
- **Regressing looks like:** a longer interview; a file the human must maintain so that the agent can read it; an agent that resolves ambiguity by picking the plausible option.

Serves principle 2; supports 3 and 6.

## Toward memory

**Does the next piece of work start from more than this one did?**

A project that remembers what it is makes every subsequent change easier to specify than the last. `awos` moves toward keeping that knowledge current as a side effect of the work, so that no piece of work begins from a blank page and "what does this leave unchanged?" can be answered.

- **Advancing looks like:** knowledge produced by a change is retained by the flow itself; a later spec reads what an earlier one established; the product's current behavior is available to the agent, not only its history of intentions.
- **Regressing looks like:** artifacts treated as disposable once implemented; upkeep of knowledge delegated to people; a document nothing in the flow keeps current.

Serves principle 7; deepens 6.

## Toward fidelity

**Does this make what gets built match the confirmed understanding more closely, or make a deviation visible sooner?**

Agreement is only worth reaching if the build honors it. `awos` moves toward implementation that stays on the agreed path without supervision and verification that checks the result against the agreement rather than against whether the code runs.

- **Advancing looks like:** fewer corrections between implementation and verification; a deviation from the agreement caught by the flow rather than by a person; an implementation that needs less supervision to stay on the agreed path.
- **Regressing looks like:** an agent improvising beyond what was agreed; verification that checks only that the code works, not that it is what was agreed; a capability that improves code in general but not its fidelity to the agreement.

Serves principles 1 and 4.

## Toward a smaller surface

**Does this make the method more visible, or the tool bigger?**

The method is a single path: intent → confirmed understanding → implementation → verification. `awos` moves toward a surface small enough that a newcomer can see that path in it, integrating with everything around it rather than absorbing it.

- **Advancing looks like:** fewer commands doing the same work; an integration in place of an owned capability; a proven experiment folded into core and its predecessor removed.
- **Regressing looks like:** a capability that sits outside the path, however useful; two ways to do the same step kept alive indefinitely; a feature that serves the host tool rather than the method.

Serves principles 8 and 10.
