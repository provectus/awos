---
name: configure-external-sources
description: >-
  Detect and configure external documentation sources (wikis, ticket systems,
  chats, email). Guides MCP/CLI tool setup, handles editor restart-resume,
  and writes structured source configuration to context/sources/sources.md.
  Called by onboarding commands when a brownfield project has external docs.
disable-model-invocation: true
argument-hint: ''
---

# External Sources — Setup Orchestrator

You configure access to external documentation platforms so that onboarding commands can retrieve project knowledge from wikis, ticket systems, chats, and email. Your only output is the structured source manifest at `context/sources/sources.md`. You do not retrieve content from the sources — the calling command handles retrieval after you finish.

## Step 1 — Check Existing State

Read `context/sources/sources.md` if it exists.

- If the file contains `## Status: configured` → sources are already set up. Stop — nothing to do.
- If the file contains `## Status: restart-pending` → a previous run was interrupted for an editor restart. Skip to **Step 6** (tool verification).
- If the file contains `## Status: verifying` → a previous run was interrupted during tool verification. Skip to **Step 6** (tool verification).
- If the file contains `## Status: verified` → tools were verified but scope was not yet collected. Skip to **Step 7** (scope collection).
- If the file contains `## Status: none` → the user previously indicated no external sources. Stop.
- If the file does not exist → continue to Step 2.

## Step 2 — Identify Sources

Use `AskUserQuestion` with `multiSelect: true` to ask: "Does your project have external documentation in any of these?" with options:

- **Documentation / Wiki** — "Confluence, Notion, Google Docs, SharePoint, etc."
- **Ticket System** — "Jira, Linear, GitHub Issues, GitLab Issues, etc."
- **Chat / Messaging** — "Slack, Teams, Google Chat, etc."
- **Email** — "Gmail, Outlook, etc."
- **None of the above** — "No external documentation to import"

If the user selects "None", write `context/sources/sources.md` with `## Status: none` and stop.

For each selected category, use `AskUserQuestion` to identify the specific platform(s):

- **Documentation:** Confluence, Notion, Google Docs/Drive, SharePoint, Other
- **Tickets:** Jira, Linear, GitHub Issues, GitLab Issues, Other
- **Chat:** Slack, Microsoft Teams, Google Chat, Other
- **Email:** Gmail, Outlook, Other

If the user selects "Other" for any category, read the full reference file at `references/{documentation,tickets,communication}.md` (relative to this SKILL.md) and present the additional platforms listed there as follow-up options.

## Step 3 — Privacy Gate

If the user selected any chat or email source, use `AskUserQuestion` to confirm: "Accessing message history may include sensitive or personal data. Do you have authorization to access this data for project documentation?" with options **Yes, I have authorization** and **Skip communication sources**. If skipped, remove all chat and email sources from the list. If the filtered list is now empty, write `context/sources/sources.md` with `## Status: none` and stop.

## Step 4 — Tool Setup

For each selected platform:

1. Read `references/{documentation,tickets,communication}.md` (relative to this SKILL.md) and use the section matching the user's chosen platform.
2. Present setup options in priority order: **MCP server** (recommended) → **CLI alternative** → **manual export fallback**.
3. Guide the user through installation and authentication using the exact commands and instructions from the reference file.
4. Track the access method chosen (mcp, cli, or manual) and the tool name for each source.

## Step 5 — Restart Check

If any MCP servers were added during Step 4, write `context/sources/sources.md` with `## Status: restart-pending` and a `## Source:` section for each configured source (category, platform, access method, tool name — scope left blank for now). Then tell the user:

> MCP servers have been configured. Resume this conversation (or restart your editor and run `/awos:product` again). Source setup will resume automatically.

Stop here. When the session resumes or `/awos:product` re-invokes this skill, Step 1 will route to Step 6.

If no MCP restart is needed (tools were already available, CLI was chosen, or manual export selected), continue to Step 6.

## Step 6 — Tool Verification

Update the status in `context/sources/sources.md` to `verifying`. If the file already exists (from a restart-pending state), update in place; otherwise write a new file with the current source list.

For each configured MCP or CLI tool, attempt a simple read operation (e.g., search for a known term, list projects, or list channels) to confirm the tool responds. If verification fails, read the matching section from the reference file and help troubleshoot authentication or configuration.

Once all tools are verified, update the status in `context/sources/sources.md` to `verified`.

## Step 7 — Scope Collection

Use `AskUserQuestion` per source to collect the specific scope to query:

- **Wiki/Docs:** page URLs, space keys, or search terms for relevant documentation
- **Tickets:** project keys, filter URLs, labels/tags, or epic links covering the project
- **Chat:** channel names or URLs (public/project channels, not DMs)
- **Email:** search queries, thread subjects, or label names

## Step 8 — Write Source Manifest

Write the final `context/sources/sources.md` with `## Status: configured` and all sources. Use this format:

```markdown
# External Sources

## Status: configured

## Source: {id}

- Category: {documentation|tickets|communication}
- Platform: {platform name}
- Access: {mcp|cli|manual}
- Tool: {MCP server name or CLI tool name, or 'n/a' for manual}
- Path: {file path to exported content, only for manual access}
- Scope: {user-provided scope from Step 7}
```

One `## Source:` section per configured source. The `{id}` is a kebab-case slug derived from the platform name (e.g., `confluence`, `github-issues`, `slack`). If the same platform appears twice, add a disambiguating suffix.
