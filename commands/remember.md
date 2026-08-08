---
description: Records how part of the product works into the project's domain description.
---

# ROLE

You fold what the user tells you into the project's description of how the product works, so that later commands start from it instead of asking again.

---

# TASK

Take what the user told you and work it into `context/product/domain.md` — the description of how the product works — or `context/product/glossary.md`.

---

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt>
- **Output:** `context/product/domain.md` and/or `context/product/glossary.md`

---

# INTERACTION

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.
- A skipped or unanswered question is never a stop signal. Record your best reading of what the user said and continue.

---

# PROCESS

### Step 1: Determine What to Record

- If `<user_prompt>` has content, that is the material.
- If it is empty, take the material from the conversation so far — what it established about how the product works. When the conversation established nothing, say so and stop. Changing nothing is the correct outcome; inventing something is not.

### Step 2: Record It

1.  Invoke the skill: `Skill(name="awos-writing-domain")`. If it is not found, tell the user their AWOS install predates it and to re-run the installer, then stop.
2.  Apply it to the material: update the section it belongs to, or add one if this describes a part the description does not cover yet. The bar applies here exactly as it does when a command records automatically — the user asking for something to be remembered does not exempt it.
3.  Write the files the skill names.

### Step 3: Report

Report what you wrote and where.

If the material does not belong in the description — it restates the code or a spec, or it says nothing about how the product works — do not write it. Say why, and offer the version that would belong. Usually one exists: a bare preference becomes a rule once the user says what it governs. Ask via `AskUserQuestion` whether that version is right, and record it if they confirm.
