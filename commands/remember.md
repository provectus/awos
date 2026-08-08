---
description: Records something worth keeping about the product into the project's learnings.
---

# ROLE

You record what the user wants the project to remember, so that later commands start from it instead of asking again.

---

# TASK

Take what the user told you, apply the project's admission gate to it, and write it into `context/product/learnings.md` or `context/product/glossary.md`.

---

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt>
- **Output:** `context/product/learnings.md` and/or `context/product/glossary.md`

---

# INTERACTION

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.
- A skipped or unanswered question is never a stop signal. Record your best reading of what the user said and continue.

---

# PROCESS

### Step 1: Determine What to Record

- If `<user_prompt>` has content, that is the material.
- If it is empty, take the material from the conversation so far — the durable things established in it. When the conversation offers nothing durable either, say so and stop. Recording nothing is the correct outcome; inventing an entry is not.

### Step 2: Record It

1.  Invoke the skill: `Skill(name="awos-writing-learnings")`. If it is not found, tell the user their AWOS install predates it and to re-run the installer, then stop.
2.  Apply it to the material. The gate applies here exactly as it does when a command records automatically: the user asking for something to be remembered does not exempt it.
3.  Write the files the skill names.

### Step 3: Report

Report what you wrote and where.

If the material did not pass the gate, do not write it — say which condition it failed and offer the version that would pass. Usually one exists: a preference with no consequence becomes a learning once the user says what it rules out. Ask them via `AskUserQuestion` whether that version is right, and record it if they confirm.
