# Why `awos` Works

What `awos` is, and is not, is defined in [Philosophy](philosophy.md); where it is heading, in [Direction](direction.md). This is the reasoning behind both.

## A Senior Engineer on Their First Day

A modern coding agent is a very senior engineer on their first day at your company. There is no stack it does not know and no pattern it has not seen. What it lacks is what any senior lacks on day one: it does not know how things are done here, and it does not know what the thing you are asking for is.

The second gap is the dangerous one, and seniority is what makes it dangerous. A junior who does not understand a task asks. A senior who does not understand a task makes a reasonable assumption, keeps going, and you find out what they assumed at review. The agent does the same: given an incomplete picture, it fills the gaps with something plausible and builds it well.

## Context Engineering Solved the First Half

"How things are done here" is a solved problem, and it is not what `awos` is for. Well-kept instruction files, architecture notes, and the codebase itself give the agent the conventions, the stack, and the shape of the system, and current models read them well. Teams that do this get code that fits.

They still get rework. We measured this across our own teams: the ones that adopted agent-driven development most heavily also had the highest rework rates. The code fits the codebase and misses what was wanted.

## The Half It Did Not Solve

The missing half is intent: what the feature is, why it exists, what it must and must not do. That knowledge usually does not live in one place, and often not in the head of the person at the keyboard. They were handed a ticket; the reasons stayed with a product manager, a customer conversation, a decision made months ago, or a behavior of the existing system that everyone assumes and nobody wrote down.

Nothing in a codebase can supply this, so the agent supplies it itself: plausibly, silently, and wrong in ways nobody notices until the feature exists. Rework comes from a confident answer to a question nobody asked.

## Making It as Known as Tetris

Ask an agent to build Tetris and it builds a good one, because it knows what Tetris is before it writes a line: every rule, every edge case, what "done" looks like. Nobody briefed it; the game is fully known.

The feature, not the codebase, has to become that known: what it is, why, and where it stops. No one person can dictate that knowledge. It is assembled from the ticket, the code, the past decisions, and the people who hold the pieces, and it is not complete until the gaps are visible and someone has said what goes in them.

## Why Agreement

`awos` follows one path: describe the change, confirm the agent understood it, build it, and check the result against what was agreed.

A specification nobody confirmed is a well-formatted guess. What produces a feature that ships right the first time is the moment where a person sees what the agent understood, including what it assumed and what it left out, and says "yes, that" or "no, not that" before any code exists. The specification is where that agreement is stored.

From there, the human decides, the agent builds, and the build is judged by how faithfully it honors the agreement rather than by whether the code works.

## When Not to Use It

Agreeing first costs time, so `awos` is for changes where being wrong costs more: a feature that touches several parts of the system, a behavior other people depend on, work that will be hard to undo. A prototype, a hotfix, or a small edit does not need it; the agent's own planning handles those well.
