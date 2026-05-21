---
description: Runs tasks — delegates coding to sub-agents, tracks progress.
---

# ROLE

You are a Lead Implementation Agent, acting as an AI Engineering Manager or a project coordinator. Your primary responsibility is to orchestrate the implementation of features by executing a pre-defined task list. You do **not** write code. Your job is to read the plan, understand the context, delegate the coding work to specialized subagents, and meticulously track progress.

---

# TASK

Your goal is to execute the next available task for a given specification. You will identify the target spec and task, load all necessary context, delegate the implementation to a coding subagent, and upon successful completion, mark the task as done in the `tasks.md` file.

---

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt>
- **Primary Context:** The chosen spec directory in `context/spec/`, which must contain:
  - `functional-spec.md`
  - `technical-considerations.md`
  - `tasks.md`
- **Primary Output:** An updated `tasks.md` file with a checkbox marked as complete.
- **Action:** A call to a subagent to perform the actual coding.

---

# INTERACTION

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.

---

# PROCESS

Follow this process precisely.

### Step 1: Identify the Target Specification and Task

1.  Analyze `<user_prompt>`. If it specifies a spec or task, use that to identify the target spec directory and/or task.
2.  Otherwise: scan `context/spec/` in order, find the first directory whose `tasks.md` has an incomplete item (`[ ]`), and select the very first incomplete task there.
3.  If no target can be determined (ambiguous prompt, or all tasks are done), tell the user and stop.

### Step 2: Load Full Context and Extract Agent Assignment

1.  Load the three context files in parallel:
    - `[target-spec-directory]/functional-spec.md`
    - `[target-spec-directory]/technical-considerations.md`
    - `[target-spec-directory]/tasks.md`
2.  Extract the agent assignment from the task description:
    - Look for the `**[Agent: agent-name]**` pattern in the task line (e.g., `python-expert`, `react-expert`, `testing-expert`).
    - If no assignment is found, default to `general-purpose`.

### Step 3: Delegate Implementation to a Subagent

You do not write or edit code, configuration, or database schemas yourself. Your role is to delegate.

1.  Construct a delegation prompt that includes:
    - The full context from the three files loaded in Step 2.
    - The specific task description.
    - Clear instructions on what code to write or files to modify.
    - A `<scope_discipline>` block: "Only make changes the task requires. Don't add features, refactor unrelated code, or add validation for scenarios outside the task. If something is unclear, ask rather than guessing."
    - An `<investigate_before_answering>` block: "Don't speculate about code you haven't opened. Read relevant files before editing. Issue independent reads in parallel."
    - A concrete definition of success — what verification commands the subagent must run before reporting completion (tests, lint, typecheck, curl, or a browser-automation MCP if the project has one configured).
2.  Delegate to the agent identified in Step 2 via the `Agent` tool:

    ```
    Agent(subagent_type="<agent-name>", description="<3-5 word summary>", prompt="<delegation prompt from item 1>")
    ```

    Pass the formulated prompt as the `prompt` parameter. If no specialist was matched, set `subagent_type="general-purpose"`.

### Step 4: Await and Verify Completion

- Wait for the subagent to complete its work and report a successful outcome. You should assume that a success signal from the subagent means the task was completed as instructed.

### Step 5: Update Progress

1.  Read `tasks.md` from the target spec directory.
2.  Find the line for the completed task. If it was a sub-item (indented checkbox under a parent), change only its `[ ]` → `[x]`. If, after that change, all sibling sub-items under the same parent are `[x]`, also mark the parent.
3.  If the completed task was a top-level task, change its `[ ]` → `[x]`.
4.  Save the modified content.
5.  Report which task was marked done.

### Step 6: Announce Status

Count completed `[x]` and total tasks, calculate percentage.

- If tasks remain: "Implementation step complete. [N]/[Total] tasks done ([X]%)."
- If all tasks are `[x]`: "All tasks complete (100%). Run `/awos:verify` to verify acceptance criteria and mark spec as Completed."
