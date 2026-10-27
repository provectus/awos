---
name: configure-external-sources
description: >-
  Record where a project's knowledge lives (tickets, documentation,
  communication, version control, infrastructure) in
  context/sources/sources.md, and connect the current user to every recorded
  source — pick the path, install CLIs or project-scoped MCP servers, drive
  logins, verify with a real read from the recorded scope. Run it after
  cloning a repo whose sources.md someone else wrote. Directly invocable;
  serves the /awos:spec research lanes.
argument-hint: ''
---

# Knowledge Sources — Setup and Connection

Two jobs. First, once per repository: record where the project's knowledge lives — the issue tracker, the documentation, the communication channels, the version control host, the cloud infrastructure. That record is `context/sources/sources.md`; it is committed, and everyone who clones the repository shares it. Second, per person, every run: make sure the user in front of you can reach every recorded source from this session, and prove it with a read from the recorded scope. Access is personal — a teammate who pulls the repository gets the record, not the connections — so the second job runs even when the file already exists.

You write `sources.md`, `.mcp.json` (project-scoped server definitions), and nothing else. You never write a credential anywhere. You do not retrieve project content; the commands that read the manifest do that later.

## The manifest

A source is a place knowledge lives. A role can have any number of sources — two trackers during a migration, a GitHub org and a GitLab instance, AWS and Azure side by side — each as its own record.

```markdown
# Knowledge Sources

## Status: configured

Discovery ran on [date]. This file is shared with everyone who clones the repository and holds no credentials. Access is per person: after cloning, run the `configure-external-sources` skill to connect your own session to these sources.

## Source: jira

- Role: tracker
- Platform: Jira Cloud (example.atlassian.net)
- Access: mcp
- Tool: atlassian (project-scoped, in .mcp.json)
- Requires: OAuth login through /mcp
- Scope: project key APP
- Verify: fetch one issue with JQL `project = APP ORDER BY updated DESC` (limit 1)
- Use for: where feature requirements, acceptance criteria and their discussion are recorded

## Source: github

- Role: vcs
- Platform: GitHub
- Access: cli
- Tool: gh (or any path to GitHub this session has)
- Requires: a GitHub login for the `acme` organization
- Scope: the `acme` organization — the other repositories of the system live there
- Verify: list one repository in the `acme` organization
- Use for: the other repositories this service talks to — their specs, shared contracts, pull request history

## Source: aws

- Role: infra
- Platform: AWS (account 123456789012, eu-west-1)
- Access: cli
- Tool: aws (or any path to the account this session has)
- Requires: AWS credentials for account 123456789012 (SSO; `aws sso login`)
- Scope: the account above; read-only lookups
- Verify: `aws sts get-caller-identity` reports account 123456789012
- Use for: which services are deployed and in which region. Do not read secret values. Do not connect to data stores.
```

Field rules:

- `Role` is one of `tracker`, `docs`, `communication`, `vcs`, `infra`.
- `Access` is `mcp`, `cli`, or `manual`. `Tool` names the path: the MCP server as it appears in `.mcp.json`, the CLI binary, a project-local script by path, or `n/a` for manual. When the team reaches one source several ways, list them all, separated by `;` — a teammate picks whichever they have. The `Tool` line records how people reach the source; a research agent uses whichever of those paths its session has, and for a version control host it may use any path at all.
- `Requires` names what a person must have before the source answers — a login, an environment variable by name, credentials for a named account. Never a value.
- `Scope` is the part of the platform that belongs to this project: project keys, spaces, channels, the organization or group that holds the system's repositories, the account. `Verify` is the read that proves the scope is reachable, written so anyone can repeat it. A `Requires` line always has a matching `Verify` line.
- `Use for` is plain prose telling a research agent what it will find there and when to look.
- A version control record is about the system's other repositories, not this one: the checkout already says where it is hosted. The record names the host and the organization, group or workspace a research agent should look in for sister repositories; when the system is this one repository, there is nothing to record.
- An infrastructure record stays short: the provider, the account or project identifier, the region, read-only intent — identifiers that locate the project's slice of the provider, never a credential. How to read it is the agent's choice at run time, the provider's CLI or an MCP server for it. The research agent explores from there at spec time; an inventory of resources does not belong here. A system that runs nowhere beyond this repository — a library, a local tool, something not deployed yet — has no infrastructure record.
- `## Status: none` is also a valid manifest. It records that discovery ran, when, and what was checked, so the next person can tell "looked and found nothing" from "never looked". The discovery note in a `configured` manifest does the same for roles that were asked and answered with nothing — "no infrastructure beyond this repository", "no other repositories".
- The manifest never records a person's connection state. Which sources this user can reach right now is derived by probing, never written down.

## Step 1 — Inventory this session

Silently, before any question. The inventory provides defaults and candidate paths; it never decides what a source is. Only what belongs to the repository — the git remote, `.mcp.json`, project-local scripts — says anything about this project; a CLI on `PATH` or a server loaded for the user says only what this machine can reach, and a machine reaches many things that have nothing to do with the project. Do not read other repositories.

Run each check as its own plain command — `command -v aws`, `aws sts get-caller-identity`, `test -n "$JIRA_API_TOKEN" && echo set || echo unset` — never as one shell loop or script. The host's permission check reads every command before it runs; a compound command with `for` loops, indirect expansion such as `${(P)v}`, or a `timeout` wrapper is one it cannot classify, so it stops to ask the user to approve it, and an unattended run is denied outright.

- The git remote (`git remote -v`): the version control host and the organization, group or workspace — the candidate for a version control source.
- CLIs on `PATH` and their login state: the host's CLI if one is installed, the cloud CLIs (`aws sts get-caller-identity` — note the account it reports, or that the token has expired — `az account show`, `gcloud auth list`), any tracker CLI.
- MCP servers loaded in this session (their tools appear as `mcp__<server>__*`), with what each server's description says it reaches. A server that fronts several platforms at once — a company knowledge hub that reads tickets, wiki pages, chat and meeting recordings — is a path to each of those platforms, and may also be a source of its own under `communication` for what only it holds, such as meeting recordings.
- `.mcp.json` in the repository root: every server it declares, and whether its tools are loaded. Declared but not loaded means not yet approved for this project in this session, or the session predates it.
- Project-local paths: scripts under `.claude/skills/*/scripts/` and `scripts/` that talk to a tracker, a wiki, chat or a cloud, and credential files next to them (presence and path only, never contents).
- Environment variables that the manifest's `Requires` lines name, by presence only — one `test -n "$VAR"` per variable, each name written out — never by value.

## Step 2 — Route on the manifest

Read `context/sources/sources.md` if it exists.

- Absent → Step 3.
- `## Status: none` → say when discovery last ran and what it checked, then ask with `AskUserQuestion`: **Run discovery again** or **Keep as is**. Keep → stop.
- `## Status: configured` → the record exists; skip to Step 5 and connect this user. Do not re-interview. If the user asked to add or change a source, run Step 3 for that source only, then continue to Step 5.

When `AWOS_UNATTENDED` is set: run Step 1, then Step 5's probe only, report the states, write nothing, ask nothing.

## Step 3 — Interview: roles, then platforms

One `AskUserQuestion` call with two multi-select questions: "Which of these hold knowledge about this project?"

- Project knowledge: **Issue tracker**, **Documentation / wiki**, **Communication** (chat, email, meeting recordings)
- Engineering: **Version control host** (the organization that holds the system's other repositories — not this repository, which the checkout already locates), **Infrastructure** (where the running system lives, if anywhere beyond this repository)

Any combination is valid, including none. A system that is one repository and runs nowhere else leaves both engineering roles unselected; record that in the discovery note so the next person knows it was asked. If nothing at all is selected, write the manifest with `## Status: none` and the discovery note, and stop.

Then, for each selected role, settle which platforms. When evidence that belongs to the repository names exactly one platform for the role — the git remote for the version control host, a server declared in the repo's `.mcp.json` for a tracker or wiki — take it, say so in one line with the evidence, and ask nothing; the scope step confirms the details. Session evidence — a cloud CLI that is logged in, a server loaded for the user — never settles a role: it is named first in the question, with what it reaches, and the user decides. Otherwise ask which platforms — multi-select, several allowed, because a role can have more than one source — one question per role, each with that role's platforms only. Never put two roles in one question: a list that mixes GitHub with AWS cannot be answered.

- Tracker: Jira, Linear, GitHub Issues, Other
- Docs: Confluence, Notion, Google Docs / Drive, Other
- Communication: Slack, Microsoft Teams, Email, Other (Google Chat, meeting recordings, a knowledge hub)
- Version control: GitHub, GitLab, Bitbucket, Other
- Infrastructure: AWS, Google Cloud, Azure, **None** (runs locally, or no infrastructure yet), plus **Other** as the free-text entry the question always carries — Heroku, a self-managed server, a plain Linux machine, anything that hosts the running system. Whatever is named there becomes a record like any other, with the host or account as its scope. **None** writes no record and a line in the discovery note

Put the inventory to work here: when a role is asked, a platform the inventory points at (an Atlassian server is loaded; a knowledge-hub server is loaded that holds meeting recordings) is named first with its evidence in the option description. A question holds at most four options, so when a loaded server adds a platform the list did not have, it takes the place of the least likely default and the rest stay reachable through **Other**. **Other** reads the matching file under `references/` (relative to this SKILL.md: `tickets.md`, `documentation.md`, `communication.md`) and offers the platforms listed there; a version control host or a cloud provider has no reference file — the user names it, and the agent reaches it with what it has.

Every selected platform becomes one source. Ask nothing about tools or scope yet.

## Step 4 — Privacy gate

Ask once with `AskUserQuestion`: "Research agents will read these sources and send what they find to the LLM provider's API. That can include personal data in tickets, internal discussions, private messages, and the names of production hosts and accounts. The manifest itself is committed to the repository; it names hosts, accounts and secret names, never credentials. Proceed?" with the options **Yes, proceed** and **No, skip external sources**. On skip, write the manifest with `## Status: none` and stop.

## Step 5 — Connect this user to every source

Run this for every source — the ones just chosen in Step 3, or the ones recorded in the manifest when it already existed. Work through the sources one at a time, in manifest order.

### 5a. The path

A path is how this person reaches the platform from this session. Candidates come from the inventory: a loaded MCP server whose description covers the platform, a CLI on `PATH`, a project-local script, a server declared in `.mcp.json` but not loaded. When the manifest already lists a `Tool`, that comes first.

- Exactly one candidate → take it, say so in one line.
- Several, or none → `AskUserQuestion`: detected candidates first with their evidence, then the tools from the platform's `references/` entry with a one-line objective comparison each (vendor-provided or community-built, how recently updated, what it cannot do — never "recommended"), then **I have a different tool** and **Manual** (the user pastes content when a command asks). Four options per question; a second question in the same call when there are more.
- A version control host or a cloud provider takes whatever path this session already has — the host's or provider's CLI, an MCP server for it, for a host the git remote itself — and prescribes none: the record is read by agents that pick their own way in. When nothing is present, name the provider's own CLI and its login as the one thing to install; there is no comparison to make.

Install or configure what the user chose. MCP servers are added with `claude mcp add --scope project …` so the definition lands in `.mcp.json` and ships with the repository; a server that needs a token takes it as `${VAR_NAME}` in the definition, and the value stays in the user's environment. Never the user or local scope for a project source. CLIs are installed with the platform's package manager; the reference file has the command. A newly added MCP server loads on the next session start: say so, finish the remaining sources, and tell the user at the end to restart (`/exit`, then the printed `claude --resume <id>` command), approve the project servers when prompted, and run this skill again — it will pick up here.

### 5b. The scope

A path says the platform answers; the scope says which part of it is this project. Ask with `AskUserQuestion`, free text allowed, with candidates the path can list: project keys from the tracker's project list, spaces from the wiki, channels from the chat server, the entity or workspace a knowledge-hub server resolves for the repository name, the organization, group or workspace from the git remote (confirm it is where the system's other repositories live, or take the one the user names), the account the cloud CLI reports. A knowledge-hub server that fronts several platforms always needs this binding — its presence says nothing about which project it serves. Also collect `Use for` in the same call, with a suggested sentence.

Skip this for a source whose manifest record already has a `Scope`.

### 5c. The read

Verify with a read from the scope, not a liveness call. Use the `Verify:` line from the manifest, or write one now — from the platform's `Verify:` entry in the reference file where one exists, otherwise the smallest read that names the scope — applied to the scope: one issue from the project key, one page from the space, one message from the channel, one repository listed in the organization, the caller identity matching the account. Classify:

- **reachable** — the read returns data from the scope.
- **unauthenticated** — the path is present but the read fails on auth, or the login has expired.
- **absent** — the CLI is not on `PATH`, or the MCP server is not loaded in this session.

A read that answers but returns nothing from the scope — the server is live but the board is not linked, the search finds no page in the space — is not reachable. Say what came back and treat it as a failure of this path.

Fix, then re-read:

- Absent CLI → install it (reference file), then continue to login.
- Absent MCP, declared in `.mcp.json` → needs the restart described in 5a; note it and move on to the next source.
- Unauthenticated CLI → the login runs in this session when the CLI the user chose can block on a browser and return (`aws sso login --profile <name>`, a host CLI's web login such as `gh auth login --web`). A CLI whose login is interactive (`aws configure sso`, `glab auth login`) needs the user's terminal: ask them to run it as `! <command>` and tell you when done.
- Unauthenticated MCP (OAuth) → name the exact step: run `/mcp`, choose the server, choose **Authenticate**, complete the browser consent, then tell you. Re-read when they return. You cannot complete an OAuth flow yourself.
- A missing environment variable named in `Requires` → say which one, where to get its value (reference file), and that it belongs in the shell or a git-ignored `.env`, never in the repository.
- The read answers but not from the scope → go back to 5a and offer the other paths; if none reaches the scope, the failure question below.

When a source still fails, ask with `AskUserQuestion`: "Could not connect {source}. What now?" with **Skip for now** (the commands that use the manifest will report it unreachable for this session; the record stays), **Switch to manual** (edits the shared `Access:` line — confirm this is about the source, not about this user's access), and **Remove this source** (same caveat). Ask it for every failing source before Step 6; nothing is left in an undecided state.

## Step 6 — Write the manifest

Write `context/sources/sources.md` with `## Status: configured` in the format above, one record per source. When the manifest already existed, change only what this run learned about the project: a path this user connected through that the `Tool` line did not list is appended to it, a `Verify` line written in 5c is added, a switch to manual or a removal the user confirmed is applied. Nothing about which sources this user reached is written.

## Step 7 — Report

One table: source, role, state after this run, and the one action left for the user if any (a restart, a login, a skipped source). If `.mcp.json` or the manifest changed, list the files to commit. Nothing else — the commands that consume the manifest take it from here.

## Rules

- Roles and platforms come from the user; the inventory supplies defaults and paths, never sources.
- A fixed-choice ask is an `AskUserQuestion`, never a numbered list in prose. Four options per question; more questions in one call when needed.
- Never print, echo, or write a credential. Reference variables by name.
- Never look in other repositories to seed this one.
- Name no vendor in your questions that the user, the inventory, or a reference file did not name first.
