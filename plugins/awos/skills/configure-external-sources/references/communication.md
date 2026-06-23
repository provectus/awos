# Communication Platform Setup Guides

Reference for setting up access to chat, messaging, and email platforms. Read the section for the user's selected platform and follow the setup instructions in order: MCP server first (recommended), CLI alternative if MCP is not viable, manual export as a last resort.

**Privacy and data safety apply to every platform in this file.** Accessing message history may include sensitive or personal data. Confirm the user has authorization before proceeding. Focus retrieval on public/project channels and relevant threads — not private messages or DMs unless the user explicitly requests it.

---

## Slack

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Slack)
- URL: `https://mcp.slack.com/mcp`
- Setup: Clone https://github.com/slackapi/slack-mcp-plugin and run `claude --plugin-dir ./` to register. Connects to Slack's hosted server.
- Auth: OAuth 2.0 via Slack. Workspace admin approval is required before the integration can be used.
- Capabilities: Search messages/files/channels, send messages, retrieve channel history, access member info.
- Verify: Search for a known channel or message.

**CLI Alternative — Slackdump**

- Tool: `slackdump` — https://github.com/rusq/slackdump
- Open-source CLI for exporting Slack messages, threads, files, and users.
- No admin privileges needed. Uses browser cookie-based auth (d-cookie + token).
- Can create Slack Export archives and incremental backups.
- Also functions as a local MCP server for STDIO.

**Manual Export Fallback**

- Workspace owners: Workspace Settings → Import/Export Data → Export
- Public channel exports available on all plans; private channel exports require Business+ and owner request.

**Privacy Notes**

- Workspace admin approval is required for the official MCP server.
- All data access is scoped to what the authenticated user can see.
- Slack is GDPR-compliant. The workspace Primary Owner is the data controller.

---

## Microsoft Teams

**MCP Server (Recommended) — @floriscornel/teams-mcp**

- Type: Local (npm)
- Install: `npx -y @floriscornel/teams-mcp@latest`
- Auth: Microsoft OAuth 2.0 via Azure App Registration. Run `npx @floriscornel/teams-mcp@latest authenticate` for the OAuth flow (add `--read-only` for read-only scopes).
- Capabilities: Teams messaging, user management, search, chats, files, organizational data via Microsoft Graph API.
- Verify: List recent chats or channels.

**MCP Server — Broad Microsoft 365 Coverage**

- Package: `@softeria/ms-365-mcp-server`
- Install: `npx -y @softeria/ms-365-mcp-server --preset teams`
- 200+ tools covering Teams, Email, Calendar, SharePoint, OneDrive, and more.

**Manual Export Fallback**

- Teams: channel messages can be exported via Microsoft Graph API or eDiscovery (requires admin).
- Individual chat history can be exported from Teams settings → Manage Account.

**Privacy Notes**

- Admin consent required for third-party apps accessing Teams via Graph API.
- Resource-Specific Consent (RSC) limits app access to specific teams/chats.
- Microsoft 365 has comprehensive compliance tools (DLP, eDiscovery, audit logs).

---

## Google Chat

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Google)
- URL: `https://chatmcp.googleapis.com/mcp/v1`
- Auth: OAuth 2.0. Requires a Google Cloud project with the Chat API enabled, plus an OAuth client ID and secret. Scopes starting with `https://www.googleapis.com/auth/chat.app.*` require one-time admin approval.
- Capabilities: List and search conversations, read messages.
- Verify: List recent conversations.

**MCP Server — Community**

- `google-chat-mcp-server` — https://github.com/pueteam/google-chat-mcp-server
- Comprehensive Google Chat API integration via Streamable HTTP transport.

**Privacy Notes**

- Inherits the same permissions and data governance as the authenticated user.
- Admin approval required for certain scopes.
- Data residency controls available in Google Workspace Enterprise editions.

---

## Discord

**MCP Server (Recommended) — @iqai/mcp-discord**

- Type: Local (npm)
- Install: `npx -y @iqai/mcp-discord --config YOUR_DISCORD_TOKEN`
- Auth: Discord bot token. The bot must be explicitly added to each server you want to access. Create a bot at https://discord.com/developers/applications.
- Capabilities: Messaging, channel management, forum operations, reactions, webhook management.
- Verify: List channels in a known server.

**Privacy Notes**

- Discord Developer Policy prohibits profiling users or using data for advertising.
- Message Content Intent must be explicitly enabled in the bot settings to read message text.
- Discord is a consumer/community platform — not typically used for corporate-confidential data.

---

## Telegram

**MCP Server — Community (MTProto, full access)**

- Package: `mcp-telegram` — https://github.com/tacticlaunch/mcp-telegram (TypeScript + MTProto)
- Alternative: https://github.com/sparfenyuk/mcp-telegram (Python + MTProto)
- Auth: MTProto protocol. Requires API ID and API hash from https://my.telegram.org. These are user-level credentials — the MCP server can access anything the user can see, including private chats.

**MCP Server — Community (Bot API, limited)**

- Package: `@xingyuchen/telegram-mcp` (npm)
- Alternative: https://github.com/IQAIcom/mcp-telegram
- Auth: Telegram Bot Token from @BotFather. Limited to channels/groups where the bot is a member.

**Privacy Notes**

- MTProto-based servers use full user credentials and can access private chats. Use with extreme caution.
- Telegram does NOT publish a Data Processing Agreement (DPA), making it unsuitable for enterprises requiring documented GDPR processing.
- Telegram is a B2C service with limited compliance tooling for corporate use.
- Prefer Bot API over MTProto for project documentation retrieval — it limits scope to channels where the bot was explicitly added.

---

## Mattermost

**MCP Server — Community**

- Package: `@kakehashi-inc/mcp-server-mattermost` (npm)
- Install: `npx -y @kakehashi-inc/mcp-server-mattermost`
- Auth: Mattermost personal access token or bot account token + server URL. Generate tokens in Account Settings → Security → Personal Access Tokens.
- Transport: stdio (default), SSE, HTTP-stream.
- Alternative: `cloud-ru-tech/mcp-server-mattermost` (38 tools for channels, messages, threads, files, users)
- Verify: List channels or search messages.

**Privacy Notes**

- Mattermost is self-hosted — all data remains on your infrastructure. Strong data sovereignty.
- Access controlled by the Mattermost admin via personal access tokens and bot accounts.
- Enterprise features: compliance exports, audit logging, data retention policies.

---

## Rocket.Chat

**MCP Server — Community**

- Package: `rocketchat-mcp` — https://github.com/enyonee/rocketchat-mcp
- 28 tools for channels, messages, threads, DMs, files, users, reactions, search.
- Auth: Set `ROCKETCHAT_URL`, `ROCKETCHAT_AUTH_TOKEN`, `ROCKETCHAT_USER_ID` environment variables.
- Write safety: controlled by `ROCKETCHAT_WRITE_ENABLED=true` with channel whitelist/blacklist.
- Verify: List channels or search messages.

**Privacy Notes**

- Self-hosted — full data sovereignty.
- Auth tokens scoped to individual users.
- Enterprise features: end-to-end encryption, data retention, audit logging.

---

## Zulip

**MCP Server — Community**

- Package: `@modelcontextprotocol/server-zulip` (npm)
- Install: `npx -y @modelcontextprotocol/server-zulip`
- Auth: Set `ZULIP_EMAIL` (bot email), `ZULIP_API_KEY`, `ZULIP_URL` environment variables. Create a bot at Settings → Your Bots.
- Capabilities: Post messages, add reactions, retrieve channel history.
- Verify: Retrieve recent messages from a known stream.

**Privacy Notes**

- Can be self-hosted. Bot API keys are scoped and revocable.
- Bots must be subscribed to channels/streams to access them.
- Built-in data export tools for compliance.

---

## Element / Matrix

**MCP Server — Community**

- Package: `matrix-mcp-server` — https://github.com/mjknowles/matrix-mcp-server
- Install: Clone → `npm install` → `npm run build`
- Auth: Matrix access token + homeserver URL, or OAuth 2.0 (with `ENABLE_OAUTH=true`). Set `matrix_homeserver_url`, `matrix_user_id`, `matrix_access_token` in `.env`.
- 15 tools covering rooms, messages, users. Multi-homeserver support.
- Verify: List joined rooms or retrieve messages from a known room.

**Privacy Notes**

- Matrix is federated and can be fully self-hosted (Synapse, Dendrite, Conduit homeservers).
- End-to-end encryption (Megolm/Olm) is supported — MCP access may require unencrypted rooms or appropriate key access.
- Used by governments and defense organizations for secure communications.
- Full data sovereignty when self-hosted.

---

## Webex

**MCP Server (Recommended) — Official**

- Type: Remote (cloud-hosted by Cisco)
- URL: `https://mcp.webexapis.com/mcp/webex-meeting` (meetings) + messaging endpoints
- Auth: Must be enabled by org admin in Webex Control Hub. Centralized authentication with granular permissions.
- Capabilities: 29 tools covering video, content, engagement, analytics, messaging.
- Verify: List recent messages or rooms.

**MCP Server — Community**

- `webex-messaging-mcp-server` — https://github.com/WebexSamples/webex-messaging-mcp-server
- 52 messaging tools. Auth: Webex Bearer token (12-hour expiry).

**Privacy Notes**

- Enterprise-grade with centralized admin controls in Control Hub.
- Complete audit trails for all MCP interactions.
- Supports data residency, DLP, and compliance archiving.

---

## Twist

**MCP Server (Recommended) — Official**

- Type: Local (npm, by Doist)
- Package: `@doist/twist-ai`
- Install: `npx -y @doist/twist-ai`
- Auth: Set `TWIST_API_KEY` environment variable.
- Capabilities: `userInfo`, `fetchInbox`, `reply`, `loadThread`, `loadConversation`.
- Verify: Fetch inbox or load a known thread.

**CLI Alternative**

- Tool: Twist CLI — https://github.com/Doist/twist-cli
- Usage: Inbox, conversations, search, groups.

**Privacy Notes**

- Doist is a privacy-focused company. Data access scoped to the authenticated user.

---

## Gmail

**MCP Server (Recommended) — Official Remote**

- Type: Remote (cloud-hosted by Google)
- URL: `https://gmailmcp.googleapis.com/mcp/v1`
- Auth: OAuth 2.0. Requires a Google Cloud project with the Gmail API enabled, plus an OAuth client ID and secret. Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`.
- Capabilities: Search emails, read messages, manage labels.
- Verify: Search for emails matching a known subject.

**MCP Server — Community**

- `@gongrzhe/server-gmail-autoauth-mcp` — https://github.com/GongRzhe/Gmail-MCP-Server
- Place `gcp-oauth.keys.json` in `~/.gmail-mcp/` and run `npx @gongrzhe/server-gmail-autoauth-mcp auth`.

**Privacy Notes**

- OAuth scopes are granular — request only what you need.
- Google Workspace admins control data access policies.
- The official MCP server inherits the user's permissions — it can see any email the user can see.

---

## Outlook / Exchange

**MCP Server (Recommended) — @softeria/ms-365-mcp-server**

- Type: Local (npm)
- Install: `npx -y @softeria/ms-365-mcp-server --preset outlook` (or `--preset mail`)
- Auth: OAuth 2.0 via Microsoft Graph.
- Capabilities: 200+ tools including `list-mail-messages`, `send-mail`, `create-calendar-event`.
- Verify: List recent emails.

**MCP Server — Community**

- `outlook-mcp` — https://github.com/ryaker/outlook-mcp (Microsoft Graph + Power Automate API)
- `outlook-assistant` — https://github.com/littlebearapps/outlook-assistant (email, calendar, contacts)

**Privacy Notes**

- Microsoft requires admin consent for Graph API access.
- DLP, eDiscovery, and compliance features apply to programmatic access.

---

## Generic IMAP / SMTP (Provider-Agnostic)

**MCP Server — Community**

- Package: `@codefuturist/email-mcp` (npm)
- Install: `npx @codefuturist/email-mcp setup` (guided setup wizard)
- Requires: Node.js 22+
- 47 tools, full IMAP + SMTP support. Works with Gmail, Outlook, Yahoo, and any IMAP/SMTP provider.
- Auth: IMAP/SMTP host, port, username, password via environment variables or setup wizard.
- Verify: List recent emails from inbox.

**Privacy Notes**

- Credentials stored locally in environment variables or config files. Never commit to version control.
- No third-party cloud involvement — data flows through the local server only.
- Use app-specific passwords rather than primary account credentials where possible.
