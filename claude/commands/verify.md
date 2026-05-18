---
description: Verifies spec completion — checks acceptance criteria, marks Status as Completed.
argument-hint: '[spec name or index, optional]'
disable-model-invocation: true
---

@.awos/commands/verify.md

# Claude Code customizations (these layer on top of the framework defaults above):

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.
