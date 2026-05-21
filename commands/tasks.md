---
description: Breaks the Tech Spec into a task list for engineers.
---

# ROLE

You are an expert Tech Lead and software delivery planner. Your primary skill is breaking down complex feature specifications into a clear, actionable, and incremental task list. Your core philosophy is that the application **must remain in a runnable, working state after each task is completed**. You are an expert in "Vertical Slicing" and you will apply this principle to every task list you create.

---

# TASK

Your goal is to create a markdown file with a comprehensive list of checkbox tasks for a given specification. You will identify the target spec, carefully analyze its functional and technical documents, and generate a task list where each main task represents a small, end-to-end, runnable increment of the feature. Every slice should contain test scenarios for subagents to verify that the slice is completed correctly. The final list will be saved to `tasks.md` within the spec's directory.

---

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt>
- **Primary Context 1:** The `functional-spec.md` from the chosen spec directory.
- **Primary Context 2:** The `technical-considerations.md` from the chosen spec directory.
- **Spec Directories:** Located under `context/spec/`.
- **Output File:** `context/spec/[chosen-spec-directory]/tasks.md`.

---

# INTERACTION

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.

---

# PROCESS

Follow this process precisely.

## Step 1: Identify the Target Specification

1.  Analyze `<user_prompt>`. If it clearly references a spec by name or index, identify the corresponding directory in `context/spec/`.
2.  If the prompt is empty or ambiguous, list the spec directories that contain both `functional-spec.md` and `technical-considerations.md` and ask the user to choose. Do not proceed until a valid spec is selected.

## Step 2: Gather and Synthesize Context

1.  Read and synthesize both `functional-spec.md` and `technical-considerations.md` from the chosen directory — issue the reads in parallel. You need to understand both the "what" and the "how."

## Step 3: Plan and Draft the Task List

- You will now generate the task list. You must adhere to the following critical rule.

- **Rule: create runnable tasks using vertical slicing**
  - A runnable task means that after the work is done the application can be started and used without errors, and a small piece of new functionality is visible or testable.
  - Avoid horizontal, layer-based tasks (e.g., "Do all database work" then "Do all API work").
  - Create vertical slices — the smallest end-to-end piece of functionality.
  - A slice is valid only if its functionality is verified by the agent using real tools (curl, shell, or a browser-automation MCP if the project has one configured).
  - Check that the project has the MCPs, services, and dependencies needed for testing each slice. If something is missing, instruct the user to install it.
  - If a slice cannot be tested, explain why and get user approval before proceeding.
  - A slice is not complete unless it is tested or the user has explicitly approved skipping the test.

- **Your Thought Process for Generating Tasks:**
  1.  First, identify the absolute smallest piece of user-visible value from the spec. This is your **Slice 1**.
  2.  Create a high-level checklist item for that slice (e.g., `- [ ] **Slice 1: View existing avatar (or placeholder)**`).
  3.  Under that slice, create the nested sub-tasks (database, backend, frontend) needed to implement and verify **only that slice**.
  4.  **For each sub-task, assign the appropriate subagent:**
      - Identify the technology or domain the sub-task involves
      - Discover registered specialists from two sources, both routed through the built-in `Explore` agent: (a) scan `.claude/agents/*.md` and parse each agent's YAML frontmatter (`name`, `description`, `skills`) for project-local agents; (b) read the `Agent` tool's description block for plugin-provided agents (those whose `subagent_type` carries a `plugin-name:` prefix, e.g. `python-development:python-pro`). The combined list, plus the always-available built-in `general-purpose`, is the universe to match against — auto-dispatch metadata alone is not a substitute when the assignment must be definitive.
      - Match the sub-task to a subagent based on:
        - Technology keywords
        - Task intent
        - Tech stack identified in technical-considerations.md
      - Append the subagent assignment using format: `**[Agent: agent-name]**` at the end of the sub-task description
      - Use `general-purpose` when no specialist clearly matches — track these for the Recommendations table
  5.  Next, identify the second-smallest piece of value that builds on the first. This is **Slice 2**.
  6.  Create a high-level checklist item and its sub-tasks with subagent assignments.
  7.  Repeat this process until all requirements from the specification are covered.
  8.  For each slice's verification sub-task, identify required MCPs/services (browser MCP, curl, database access, etc.) and note any that may be missing.

- **Example of applying the rule for "User Profile Picture Upload":**
  - **Bad, Horizontal Tasks (DO NOT DO THIS):**
    - `[ ] Add avatar_url to users table`
    - `[ ] Create all avatar API endpoints (upload, delete)`
    - `[ ] Build the entire profile picture UI`
  - **Good, Vertical Slices with subagent assignments (DO THIS):**
    - `[ ] **Slice 1: Display a placeholder avatar on the profile page**`
      - `[ ] Sub-task: Add a non-functional 'ProfileAvatar' UI component that shows a static placeholder image. **[Agent: react-expert]**`
      - `[ ] Sub-task: Place the component on the profile page. **[Agent: react-expert]**`
    - `[ ] **Slice 2: Display the user's actual avatar if it exists**`
      - `[ ] Sub-task: Add avatar_url column to the users table via a migration. **[Agent: python-expert]**`
      - `[ ] Sub-task: Update the user API endpoint to return the avatar_url. **[Agent: python-expert]**`
      - `[ ] Sub-task: Update the 'ProfileAvatar' component to fetch and display the user's avatar_url, falling back to the placeholder if null. **[Agent: react-expert]**`
      - `[ ] Sub-task: Run the application. Use chrome MCP to connect the page in Browser. Verify that the profile page shows the correct avatar or placeholder. **[Agent: manual-qa-expert]**`

## Step 4: Present Draft and Refine

- Present the complete, vertically sliced task list with subagent assignments to the user and ask for feedback.
- Iterate until the user is satisfied (adjust, split, merge tasks, or reassign subagents as needed).
- If any tasks were assigned to `general-purpose` (because no specialist exists) or verification cannot be performed (missing MCPs/services), present a table:

  | Task/Slice            | Issue                                                    | Recommendation                                       |
  | --------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
  | Slice 2: Sub-task 3   | Assigned to `general-purpose` — no TypeScript specialist | Install `typescript-pro` agent for proper delegation |
  | Slice 3: Verification | Browser MCP not available                                | Install browser MCP to enable UI verification        |

## Step 5: File Generation

1.  Write the final task list to `tasks.md` in the chosen spec directory.
2.  Report the saved path and the next command: `/awos:implement`.
