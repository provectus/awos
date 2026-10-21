# Code Host Setup Guides

Known tools and access methods for the platform that hosts the repository. A code host is a knowledge source in its own right: pull request history, review threads, issues, and the other repositories of the same organization. The skill uses this file when a code host is detected from the git remote or chosen by the user.

---

## GitHub

**CLI — `gh` (usually sufficient)**

- Install: `brew install gh` (macOS), `winget install GitHub.cli` (Windows), or the apt/dnf repositories documented at https://github.com/cli/cli#installation (Linux).
- Login: `gh auth login --web` — opens the browser, returns when consent completes. Non-interactive alternative: `GH_TOKEN` environment variable holding a fine-grained personal access token with read access to the repositories in scope.
- Verify: `gh auth status`, then `gh api user --jq .login`.
- Scope hint: the `owner/repo` from `git remote -v`; the organization for sibling repositories.
- Usage for research: `gh pr list --state merged --search "<term>" --json number,title,body,url`, `gh pr view <n> --comments`, `gh issue list --search "<term>"`, `gh search prs "<term>" --owner <org>`, `gh repo list <org> --limit 100`, `gh api repos/<owner>/<repo>/contents/<path>` for a file in another repository.
- Expired or missing login shows `You are not logged into any GitHub hosts` — re-run `gh auth login --web`.

**MCP Server — Vendor-Provided**

- Type: Remote (`https://api.githubcopilot.com/mcp/`, OAuth) or local Go binary (`github-mcp-server stdio`, `GITHUB_PERSONAL_ACCESS_TOKEN`).
- Install (remote): `claude mcp add --scope project --transport http github https://api.githubcopilot.com/mcp/`
- Covers: issues, pull requests, code search, repository contents.
- Verify: list pull requests in a known repository.
- Prefer `gh` when it is already installed — the same data, no extra server.

**Manual Export Fallback**

- Paste pull request descriptions or issue threads when asked.

---

## GitLab

**CLI — `glab`**

- Install: `brew install glab` (macOS), or the releases at https://gitlab.com/gitlab-org/cli/-/releases.
- Login: `glab auth login` (interactive; the user runs it in their terminal). Self-managed instances take `--hostname <host>`.
- Verify: `glab auth status`.
- Usage for research: `glab mr list --merged --search "<term>"`, `glab mr view <n> --comments`, `glab issue list --search "<term>"`, `glab repo list --group <group>`.

**MCP Server — Vendor-Provided (GitLab 18+)**

- Type: Remote (`https://<host>/api/v4/mcp`, OAuth 2.0 Dynamic Client Registration).
- Install: `claude mcp add --scope project --transport http gitlab https://<host>/api/v4/mcp`
- Verify: list merge requests in a known project.

**Manual Export Fallback**

- Paste merge request descriptions or issue threads when asked.

---

## Bitbucket

**MCP Server — Vendor-Provided (Atlassian Remote MCP)**

- Same server as Jira and Confluence: `claude mcp add --scope project --transport http atlassian https://mcp.atlassian.com/v1/mcp`. Bitbucket Cloud repositories appear once the Atlassian login includes the workspace.

**CLI Alternative**

- No official CLI. The REST API at `https://api.bitbucket.org/2.0/` with an app password works with `curl`; keep the password in `BITBUCKET_APP_PASSWORD` and reference it by name.

**Manual Export Fallback**

- Paste pull request descriptions when asked.
