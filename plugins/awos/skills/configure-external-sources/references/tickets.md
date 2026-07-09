# Ticket System Setup Guides

Known tools and access methods for ticket and project management platforms. The skill uses this as a knowledge base when presenting tool options to the user.

---

## Jira

**MCP Server — Atlassian Remote MCP**

- Type: Remote (cloud-hosted by Atlassian)
- Install: `claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp`
- Auth: OAuth 2.1 — a browser window opens for consent on first use. Alternatively, use API token auth (generate at https://id.atlassian.com/manage-profile/security/api-tokens).
- Covers: Jira and Confluence from the same MCP server. If Confluence is also configured, the same server handles both.
- Verify: Search for issues in a known project using JQL.

**MCP Server — Community (mcp-atlassian)**

- Type: Local (Python/pip)
- Install: `pip install mcp-atlassian` then run with `uvx mcp-atlassian`
- Auth: Set environment variables `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`.
- Supports both Jira Cloud and Server/Data Center.

**CLI Alternative**

- Tool: `jira-cli` (Go binary) — https://github.com/ankitpokhrel/jira-cli
- Install: `brew install ankitpokhrel/jira-cli/jira-cli` or `go install github.com/ankitpokhrel/jira-cli/cmd/jira@latest`
- Usage: `jira issue list -q "project = PROJ AND type = Story" --plain`

**Manual Export Fallback**

- Jira Cloud: Filters → search → Export → CSV (all fields)
- Jira REST API supports full programmatic extraction.

---

## Linear

**MCP Server — Official Remote**

- Type: Remote (cloud-hosted by Linear)
- URL: `https://mcp.linear.app/sse`
- Auth: OAuth — opens browser for consent on first use.
- Verify: List issues in a known team or project.

**MCP Server — Community**

- Package: `@tacticlaunch/mcp-linear` (npm)
- Install: `npm install -g @tacticlaunch/mcp-linear`
- Auth: Set `LINEAR_API_KEY` environment variable (generate at Linear → Settings → API).

**CLI Alternative**

- Tool: `linearis` — `npx linearis`
- JSON output optimized for LLM agents.
- Alternative: `@linear/cli` (official) — `lin new`, `lin checkout`.

**Manual Export Fallback**

- Linear supports CSV export.
- The GraphQL API provides full programmatic access.

---

## GitHub Issues

**MCP Server — Official**

- Type: Local (Go binary)
- Install: Download from https://github.com/github/github-mcp-server/releases
- Run: `github-mcp-server stdio`
- Auth: Set `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable (generate at https://github.com/settings/tokens).
- Covers: Issues, PRs, repository management, code search, and more.
- Verify: List issues in a known repository.

**CLI Alternative (Often Sufficient)**

- Tool: `gh` (GitHub CLI) — likely already installed in most dev environments
- Usage: `gh issue list --repo owner/repo --json number,title,body,labels --limit 100`
- Supports JSON output, filtering by labels/milestones/assignees.
- If `gh` is already available and functional, MCP setup may be unnecessary.

**Manual Export Fallback**

- GitHub REST/GraphQL APIs provide full access.
- `gh` CLI supports `--json` output for scripting.

---

## GitLab Issues

**MCP Server — Official**

- Type: Remote (built into GitLab instances)
- Auth: OAuth 2.0 Dynamic Client Registration or personal access tokens.
- Docs: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/
- Verify: List issues in a known project.

**MCP Server — Community**

- Package: `@zereight/mcp-gitlab` (npm)
- Install: `npx -y @zereight/mcp-gitlab`
- Auth: Set `GITLAB_TOKEN` and `GITLAB_API_URL` environment variables.

**CLI Alternative**

- Tool: `glab` (GitLab CLI) — official CLI from GitLab
- Install: `brew install glab` or download from https://gitlab.com/gitlab-org/cli
- Usage: `glab issue list --repo group/project --output json`

**Manual Export Fallback**

- GitLab REST API provides full export.
- `glab` supports JSON output.

---

## Asana

**MCP Server — Official Remote**

- Type: Remote (cloud-hosted by Asana)
- URL: `https://mcp.asana.com/v2/mcp`
- Auth: OAuth — opens browser for consent on first use.
- Verify: List tasks in a known project.

**MCP Server — Community**

- Package: `@roychri/mcp-server-asana` (npm)
- Install: `npm i @roychri/mcp-server-asana`
- Auth: Set `ASANA_ACCESS_TOKEN` environment variable (generate in Asana → My Settings → Apps → Developer Apps).

**Manual Export Fallback**

- Asana supports CSV export of projects from the project menu.
- The REST API is comprehensive.

---

## Trello

**MCP Server — Community**

- Package: `mcp-server-trello` — https://github.com/delorenj/mcp-server-trello
- Auth: Trello API Key + Token via environment variables (get at https://trello.com/power-ups/admin).
- No official Trello MCP server exists. Trello is an Atlassian product, but the Atlassian Remote MCP does not cover Trello.

**CLI Alternative**

- Tool: `trello-cli`
- Install: `npm install -g trello-cli`
- Usage: Manage boards, lists, and cards.

**Manual Export Fallback**

- Board Menu → Print and Export → Export as JSON.
- The REST API provides full access.

---

## Monday.com

**MCP Server — Official**

- Type: Local (npm)
- Package: `@mondaydotcomorg/monday-api-mcp`
- Install: `npx @mondaydotcomorg/monday-api-mcp@latest`
- Auth: Set `MONDAY_TOKEN` environment variable (API token from Monday.com account settings).
- Also offers a hosted MCP service requiring no local setup.
- Verify: List boards in your workspace.

**Manual Export Fallback**

- Monday.com supports Excel/CSV export from views.
- The GraphQL API provides full programmatic access.

---

## ClickUp

**MCP Server — Community**

- Package: `clickup-mcp-server` — https://github.com/taazkareem/clickup-mcp-server
- Install: `npx clickup-mcp-server`
- Auth: Set `CLICKUP_API_TOKEN` environment variable (generate in ClickUp → Settings → Apps).
- No official ClickUp MCP server exists.

**CLI Alternative**

- Tool: `clickup-cli`
- Install: `npm install -g clickup-cli`
- Usage: Create, update, and delete tasks.

**Manual Export Fallback**

- ClickUp supports CSV/Excel export from spaces.
- The REST API v2 provides full access.

---

## Shortcut

**MCP Server — Official**

- Type: Local (npm) + Hosted (OAuth)
- Package: `@shortcut/mcp` (npm)
- Install: `npx -y @shortcut/mcp`
- Auth: `SHORTCUT_API_TOKEN` environment variable (local) or OAuth (hosted, no token needed).
- Hosted variant: available as a remote OAuth-based server.
- Capabilities: Stories, epics, iterations, objectives, docs, custom fields.
- Supports read-only mode.
- Verify: List stories in a known project.

**CLI Alternative**

- Tool: `@shortcut-cli/shortcut-cli`
- Install: `npm install -g @shortcut-cli/shortcut-cli`
- Usage: Story search, updates, teams, labels, epics.

**Manual Export Fallback**

- Shortcut supports CSV export.
- The REST API v3 provides full access.

---

## Azure DevOps / Azure Boards

**MCP Server — Official (Preview)**

- Source: https://github.com/microsoft/azure-devops-mcp
- Auth: Azure AD / Personal Access Token.
- Capabilities: Work items, code repositories, boards, sprints.
- Verify: Query work items in a known project.

**MCP Server — Community**

- `Tiberriver256/mcp-server-azure-devops` — good for on-premises Azure DevOps Server.
- `danielealbano/mcp-for-azure-devops-boards` — Rust implementation focused on Boards/Work Items.

**CLI Alternative**

- Tool: `az boards` (Azure CLI extension)
- Install: `az extension add --name azure-devops`
- Usage: `az boards work-item list --project MyProject --query "[System.State] = 'Active'"`

**Manual Export Fallback**

- Azure DevOps REST API provides full data access.
- Analytics views and OData feeds available for BI export.

---

## YouTrack

**MCP Server — Built-in (YouTrack 2025.3+)**

- Type: Remote (built into YouTrack instances)
- Auth: Bearer token (user permanent token, generate in YouTrack → Profile → Authentication).
- Capabilities: Issues (search, create, update, link, comment), articles, projects.
- Verify: Search for issues in a known project.

**MCP Server — Community**

- `youtrack-mcp-server` — https://github.com/abdullahtas0/youtrack-mcp-server (44 tools)
- `youtrack-mcp` — https://github.com/tonyzorin/youtrack-mcp

**CLI Alternative**

- Tool: `youtrack-cli` (npm)
- Install: `npm install -g youtrack-cli`
- Usage: `youtrack setup` then manage issues and projects.

**Manual Export Fallback**

- YouTrack supports CSV/Excel export of issues.
- The REST API provides full access.

---

## Plane

**MCP Server — Official**

- Source: https://github.com/makeplane/plane-mcp-server
- Docs: https://developers.plane.so/dev-tools/mcp-server
- Auth: Set `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, `PLANE_BASE_URL` environment variables. Also supports OAuth for cloud deployments.
- Transport: stdio, SSE, and streamable HTTP.
- Capabilities: 30+ tools — issues, cycles, modules, projects, work logs.
- Verify: List issues in a known project.

**CLI Alternative**

- Tool: `plane-cli`
- Install: `bun install plane-cli`
- Usage: Lightweight wrapper around Plane REST API. Supports `--json` output.

**Manual Export Fallback**

- Plane REST API provides full data access.
- For self-hosted instances, direct database access is also possible.

---

## Redmine

**MCP Server — Community**

- Package: `@onozaty/redmine-mcp-server` (npm) — comprehensive Redmine REST API access
- Alternatives: `mcp-server-redmine` (https://github.com/yonaka15/mcp-server-redmine), `redmine-mcp` (https://github.com/snowild/redmine-mcp)
- Auth: Redmine API key + instance URL.
- Verify: List issues in a known project.

**CLI Alternative**

- Tool: `Redmine-CLI` (Python) — `pip install Redmine-CLI`
- Alternative: `redmine-cli` (Go) — available via Homebrew

**Manual Export Fallback**

- Redmine supports CSV/PDF export of issues natively.
- Enable REST API in Administration → Settings → API.

---

## Basecamp

**MCP Server — Community**

- Multiple options: `stefanoverna/basecamp-mcp`, `jhliberty/basecamp-mcp-server` (46 tools, NPX installable), `georgeantonopoulos/Basecamp-MCP-Server` (79 tools, Python/FastMCP)
- Auth: OAuth with Basecamp 3.
- No official Basecamp MCP server exists.

**CLI Alternative**

- Tool: Official Basecamp CLI
- Install: `curl -fsSL https://basecamp.com/install-cli | bash`
- Usage: Manage projects, todos, messages from terminal.

**Manual Export Fallback**

- Basecamp supports full account data export (HTML format).
- The REST API provides programmatic access.

---

## Teamwork

**MCP Server — Official**

- Source: https://github.com/teamwork/mcp
- Auth: Bearer token or OAuth2.
- Transport: HTTP and STDIO.
- Capabilities: Projects, tickets, customers, companies. Read-only mode available.
- Verify: List projects in your workspace.

**Manual Export Fallback**

- Teamwork supports CSV/Excel export.
- The REST API provides full access.

---

## Wrike

**MCP Server — Official Remote**

- Type: Remote
- URL: `https://wrike.com/app/mcp/sse` (US), `https://app-eu.wrike.com/app/mcp/sse` (EU)
- Auth: Native OAuth.
- Docs: https://developers.wrike.com/docs/setup-claude-code-with-wrike-mcp
- Capabilities: Query projects, manage tasks, navigate folders.
- Verify: List folders in your workspace.

**MCP Server — Community**

- `johntoups/mcp-wrike` — https://github.com/johntoups/mcp-wrike
- Full CRUD for tasks, folders, attachments, custom fields.

**Manual Export Fallback**

- Wrike REST API `/data-export` endpoint.
- BI Export available in paid plans.

---

## Taiga

**MCP Server — Community**

- Package: `taiga-mcp` — https://github.com/illodev/taiga-mcp
- Comprehensive access: projects, epics, user stories, tasks, issues, sprints, wiki, memberships.
- Alternatives: `pytaiga-mcp` (Python), `taigaMcpServer` (Node.js)
- Auth: Taiga username/password or API token.
- No official Taiga MCP server exists.

**CLI Alternative**

- Tool: `python-taiga` (Python library)
- Install: `pip install python-taiga`
- Usage: Scriptable Taiga REST API client.

**Manual Export Fallback**

- Taiga supports project export (JSON) natively.
- The REST API provides full access.
