# Documentation Platform Setup Guides

Reference for setting up access to wiki and documentation platforms. Read the section for the user's selected platform and follow the setup instructions in order: MCP server first (recommended), CLI alternative if MCP is not viable, manual export as a last resort.

---

## Confluence

**MCP Server (Recommended) — Atlassian Remote MCP**

- Type: Remote (cloud-hosted by Atlassian)
- Install: `claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp`
- Auth: OAuth 2.1 — a browser window opens for consent on first use. Alternatively, use API token auth with a base64-encoded `email:api-token` pair (generate tokens at https://id.atlassian.com/manage-profile/security/api-tokens).
- Covers: Confluence and Jira from the same MCP server.
- Verify: Search for a known page title using the Confluence search tool.

**MCP Server — Community (mcp-atlassian)**

- Type: Local (Python/pip)
- Install: `pip install mcp-atlassian` then run with `uvx mcp-atlassian`
- Auth: Set environment variables `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_API_TOKEN` (Cloud) or use a Personal Access Token for Server/Data Center.
- Supports both Confluence Cloud and Server/Data Center deployments.

**CLI Alternative**

- Tool: `confluence-export` (pip)
- Install: `pip install confluence-export`
- Usage: `confluence-export --url https://yoursite.atlassian.net/wiki --username email@example.com --token YOUR_TOKEN --space SPACEKEY --output ./exported-docs`
- Exports pages recursively as Markdown with child pages and attachments.

**Manual Export Fallback**

- In Confluence: Space Settings → Content Tools → Export
- Choose HTML or PDF format, select pages to include
- Download the archive and place in project directory for local reading

---

## Notion

**MCP Server (Recommended) — Official**

- Type: Local (npm)
- Package: `@notionhq/notion-mcp-server`
- Install: `npx -y @notionhq/notion-mcp-server`
- Auth: Set `NOTION_TOKEN` environment variable. Create an internal integration at https://www.notion.so/profile/integrations, then share the specific pages/databases with the integration.
- Verify: Search for a known page title.

**CLI Alternative**

- Tool: `notion-exporter`
- Install: `pip install notion-exporter` or use https://github.com/yannbolliger/notion-exporter
- Usage: Exports `.md` and `.csv` files from any Notion page.

**Manual Export Fallback**

- Open any page → click `...` → Export → Markdown & CSV (with optional sub-pages)
- Downloads as a zip file

---

## Google Docs / Drive

**MCP Server (Recommended) — Official Google Drive Remote MCP**

- Type: Remote (cloud-hosted by Google)
- URL: `https://drivemcp.googleapis.com/mcp/v1`
- Auth: OAuth 2.0. Requires a Google Cloud project with `drivemcp.googleapis.com` enabled, plus an OAuth client ID and secret.
- Setup: Configure as a custom connector in editor settings with the remote MCP server URL.
- Capabilities: Search files, retrieve metadata, read file content, download. Inherits user permissions.
- Verify: Search for a known document title.

**MCP Server — Community**

- Package: `google-drive-mcp` — https://github.com/piotr-agier/google-drive-mcp
- Covers Drive, Docs, Sheets, Slides, and Calendar.

**CLI Alternative**

- Tool: `gdrive` (open-source Go tool)
- Install: Download from https://github.com/glotlabs/gdrive
- Usage: `gdrive files list`, `gdrive files download <file-id>`

**Manual Export Fallback**

- Google Takeout (https://takeout.google.com/) exports all Docs/Sheets/Slides
- Individual docs: File → Download → choose format (docx, pdf, txt, md)

---

## SharePoint / OneDrive

**MCP Server (Recommended) — @softeria/ms-365-mcp-server**

- Type: Local (npm)
- Install: `npx -y @softeria/ms-365-mcp-server --org-mode`
- Auth: OAuth 2.0 via Microsoft Graph API. The `--org-mode` flag is needed for SharePoint/Teams access. Set `MS365_MCP_OAUTH_TOKEN` environment variable or use the built-in OAuth flow.
- Covers: SharePoint, OneDrive, Teams, Outlook, Planner, and more.
- Verify: List files in a known SharePoint site.

**MCP Server — Microsoft Official (Preview)**

- Microsoft Agent 365 Work IQ MCP servers (pre-certified). See https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview

**CLI Alternative**

- Tool: `@pnp/cli-microsoft365`
- Install: `npm install -g @pnp/cli-microsoft365`
- Usage: `m365 spo page list --webUrl https://contoso.sharepoint.com/sites/project`
- Comprehensive CLI for all of Microsoft 365.

**Manual Export Fallback**

- SharePoint: Site Contents → select files → Download
- OneDrive: Select files → Download as zip

**Privacy Notes**

- Requires Azure AD admin consent for third-party app access.
- Microsoft 365 has comprehensive compliance tools (DLP, eDiscovery, audit logs).

---

## Coda

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Coda)
- URL: `https://coda.io/apis/mcp`
- Install: `claude mcp add --transport http Coda https://coda.io/apis/mcp`
- Auth: OAuth — opens a browser for consent on first use.
- Verify: List documents in your workspace.

**MCP Server — Community**

- Package: `coda-mcp` (npm) — `npx -y coda-mcp@latest`
- Auth: Set `CODA_API_KEY` environment variable (generate at https://coda.io/account under API settings).

**Manual Export Fallback**

- Open doc → Share → Export → CSV or PDF
- Coda REST API (https://coda.io/developers/apis/v1) supports reading docs, pages, tables, and rows.

---

## GitBook

**MCP Server — Community**

- Package: `gitbook-mcp` — https://github.com/rickysullivan/gitbook-mcp
- Auth: Set `GITBOOK_API_TOKEN` (generate at https://app.gitbook.com/account/developer). Requires Organization ID and optional Space ID.
- Alternative: `mcpbook` (https://github.com/tcsenpai/mcpbook) — scrapes and indexes any public GitBook site.

**CLI Alternative**

- Tool: `gitbook-scraper` (pip)
- Install: `pip install gitbook-scraper`
- Usage: `gitbook-scraper https://docs.example.com --output docs.md`
- Structures GitBook docs into a single organized markdown file.

**Manual Export Fallback**

- Use GitHub/GitLab Sync to get content as Markdown in a Git repo.
- The GitBook API also provides content access.

---

## Slite

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Slite)
- URL: `https://api.slite.com/mcp`
- Auth: Slite API key in the Authorization header.
- Verify: Search for a known document.

**MCP Server — Community**

- Package: `slite-mcp` — https://github.com/fajarmf/slite-mcp
- Install: Clone → `npm install` → `npm run build`
- Auth: Set `SLITE_API_KEY` environment variable.

**Manual Export Fallback**

- Slite supports bulk export of workspace content from the web UI.

---

## Slab

**MCP Server — Community**

- Package: `@russwyte/slabby`
- Install: `npm install -g @russwyte/slabby`
- Auth: Slab API token and team domain via environment variables. Slab API is only available on premium plans.
- Capabilities: Read posts, update posts, search, list by topic/tag. Converts Quill Delta content to Markdown.

**Manual Export Fallback**

- Slab admins can export all published posts and topics as Markdown or Docx from the admin UI.
- Individual posts: post menu → Export.

---

## Tettra

**No MCP server exists.** Tettra has a limited, experimental public API (https://support.tettra.com/api-overview) that supports creating pages, searching, and asking questions. API keys require Scaling or Enterprise plans.

**Manual Export Fallback**

- Tettra supports exporting content to clean HTML from the web UI.
- The REST API can retrieve pages, categories, and metadata.

---

## Guru

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Guru)
- Source: https://github.com/guruhq/remote-mcp-server
- Auth: OAuth or API tokens.
- Capabilities: Ask questions, search, draft knowledge using governed company context.
- Verify: Search for a known card title.

**CLI Alternative**

- Tool: Guru CLI (official)
- Docs: https://developer.getguru.com/docs/command-line-interface-cli
- Full-featured API client for terminal use.

**Manual Export Fallback**

- Export all workspace content in HTML format from the web UI.

---

## Nuclino

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Nuclino)
- URL: `https://api.nuclino.com/mcp`
- Auth: OAuth (prompted on first interaction) or API key (create in profile settings).
- Capabilities: Search workspaces, read page content, create items and collections.
- Verify: Search for a known item.

**MCP Server — Community**

- Package: `@marijnnn/mcp-nuclino` (npm)
- Auth: Nuclino API key.

**Manual Export Fallback**

- Nuclino supports exporting content as Markdown or HTML from the web UI.

---

## Outline

**MCP Server (Recommended) — Official**

- Type: Remote (self-hosted URL)
- Install: `claude mcp add --transport http outline https://<yoursubdomain>.getoutline.com/mcp`
- Auth: OAuth (automatic login window) or `OUTLINE_API_KEY` environment variable for stdio mode.
- Verify: Search for a known document.

**MCP Server — Community**

- Package: `outline-mcp-server` (npm) — `npx -y outline-mcp-server@latest`
- Auth: `OUTLINE_API_KEY` environment variable.

**Manual Export Fallback**

- Admin settings → Export → Markdown or JSON (bulk export).
- Individual documents can be exported as Markdown.

---

## BookStack

**MCP Server — Community**

- Package: `bookstack-mcp` (npm)
- Install: `npx -y bookstack-mcp`
- Auth: Set `BOOKSTACK_BASE_URL`, `BOOKSTACK_TOKEN_ID`, `BOOKSTACK_TOKEN_SECRET` environment variables.
- 20 read-only tools by default. Set `BOOKSTACK_ENABLE_WRITE=true` for write access.
- Verify: List shelves or search for a known page.

**Manual Export Fallback**

- Per-page export: PDF, HTML, Markdown, plain text.
- BookStack has a comprehensive REST API covering all content types.

---

## Wiki.js

**MCP Server — Community**

- Package: `@cahaseler/wikijs-mcp` (npm)
- Alternatives: `wiki-js-mcp` (Python, https://github.com/talosdeus/wiki-js-mcp), `wikijs-mcp-server` (TypeScript, https://github.com/heAdz0r/wikijs-mcp-server)
- Auth: Set `WIKIJS_TOKEN` environment variable (generate in Wiki.js admin → API Access).
- Verify: Search for a known page.

**Manual Export Fallback**

- Wiki.js supports page-level export.
- Content can be synced to a Git repository for bulk access.
- The GraphQL API provides full programmatic access.

---

## MediaWiki

**MCP Server — Community**

- Package: `@professional-wiki/mediawiki-mcp-server` (npm)
- Install: `npx @professional-wiki/mediawiki-mcp-server@latest`
- Auth: Set `CONFIG` environment variable pointing to a config JSON file. Supports OAuth 2.0 or bot password. Credentials stored at `~/.config/mediawiki-mcp/credentials.json`.
- Verify: Search for a known article.

**CLI Alternative**

- Tool: `mwclient` (Python)
- Install: `pip install mwclient`
- Usage: Programmatic client for MediaWiki API (`api.php`).

**Manual Export Fallback**

- Special:Export page in MediaWiki generates XML dumps.
- The API supports full content retrieval.

---

## DokuWiki

**MCP Server — DokuWiki Plugin**

- Type: Native plugin installed into DokuWiki itself
- Install: Install the MCP plugin from DokuWiki's plugin manager or from https://github.com/doobidoo/dokuwiki-mcp-server
- URL: `https://example.com/dokuwiki/lib/plugins/mcp/mcp.php`
- Auth: DokuWiki user credentials.
- Verify: Search for a known page.

**Manual Export Fallback**

- DokuWiki stores content as plain text files on the filesystem.
- XML export available through the admin interface.
