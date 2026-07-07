# Connector Shapes Reference

**The `<lookback>` placeholder.** Every windowed query below writes `<lookback>` where a day count belongs (e.g. `updated >= -<lookback>d`). Substitute the audit window in days — the `lookback_days` field of the `audit-core`/`enrich` summary, which carries `[meta].max_lookback_days` from `standards.toml` (90 by default). Never hardcode a day count: the recipes must follow the configured window.

This document specifies the exact JSON shapes the orchestrator must produce when it maps MCP or integration data into collector artifacts. Shapes are copied verbatim from `collectors/tracker.ts` and `collectors/docs.ts`.

Producing these artifacts is not fabrication — it is straightforward field mapping from a live, reachable data source. The [data-source resolution protocol](#data-source-resolution-protocol) at the bottom of this document describes when and how to attempt each source.

---

## Tracker (`collected/tracker.json`)

### TicketRecord

Represents a single work item returned by a project tracker (Jira, Linear, GitHub Issues, etc.).

```json
{
  "id": "PROJ-123",
  "type": "bug",
  "status": "Done",
  "created_at": "2024-11-01T09:00:00Z",
  "resolved_at": "2024-11-03T14:30:00Z"
}
```

| Field                     | Type           | Required | Meaning                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | `string`       | yes      | Unique ticket identifier (e.g. Jira issue key "PROJ-123")                                                                                                                                                                                                                                                                                                                     |
| `type`                    | `string`       | no       | Issue type label (e.g. "bug", "feature", "story", "task")                                                                                                                                                                                                                                                                                                                     |
| `status`                  | `string`       | no       | Current status label (e.g. "Done", "In Progress", "Open")                                                                                                                                                                                                                                                                                                                     |
| `created_at`              | `string`       | no       | ISO 8601 creation timestamp                                                                                                                                                                                                                                                                                                                                                   |
| `resolved_at`             | `string`       | no       | ISO 8601 timestamp when the ticket was resolved/closed                                                                                                                                                                                                                                                                                                                        |
| `in_progress_at`          | `string`       | no       | ISO 8601 timestamp when work started (first transition into an in-progress state, captured from the tracker's changelog/status history). Optional. When present alongside `resolved_at`, cycle time is computed from real workflow history: it feeds the cycle-time headline row AND the `pr_cycle_time` metric (which otherwise falls back to its git branch-lifetime proxy) |
| `subtask_count`           | `number`       | no       | Count of direct sub-tasks (used by ADP-12 sub-task split metric)                                                                                                                                                                                                                                                                                                              |
| `parent`                  | `string\|null` | no       | Parent ticket key (used by ADP-12 to identify sub-task relationships)                                                                                                                                                                                                                                                                                                         |
| `description_length`      | `number`       | no       | Character count of the ticket description (size/structure signal — **no raw text**; used by ADP-13)                                                                                                                                                                                                                                                                           |
| `has_acceptance_criteria` | `boolean`      | no       | Whether the ticket body contains acceptance criteria (structure signal — **no raw text**; used by ADP-13)                                                                                                                                                                                                                                                                     |
| _(any)_                   | `unknown`      | no       | Additional fields from the source system are passed through unchanged                                                                                                                                                                                                                                                                                                         |

**Systems vary — normalize into this shape.** Field names and state labels differ across trackers, so map each system's own vocabulary onto the canonical fields; the metrics never see the vendor terms. `status` is a free-text label from the source (Jira `fields.status.name`, Linear `state.name`, GitHub Projects column, Asana section). A ticket counts toward `resolved_count` when it is in any **terminal / completed** state — `done`, `closed`, `resolved`, `completed`, `shipped`, `merged` (case-insensitive) — **or** when `resolved_at` is non-null. Likewise the in-progress→done cycle-time headline uses whichever states the system calls "in progress" and "done". When in doubt, set `resolved_at` from the source's completion timestamp so throughput does not depend on state-name matching at all. Set `in_progress_at` from real status-transition history — Jira search results never include changelogs, so this takes a per-ticket changelog pass over the resolved tickets (see the worked example below); omit the field for tickets whose history was not fetched.

### TrackerConnector

The connector object the orchestrator assembles and passes to the collector. Written to `collected/tracker.json`.

```json
{
  "tickets": [
    {
      "id": "PROJ-123",
      "type": "bug",
      "status": "Done",
      "created_at": "2024-11-01T09:00:00Z",
      "resolved_at": "2024-11-03T14:30:00Z"
    },
    {
      "id": "PROJ-124",
      "type": "feature",
      "status": "In Progress",
      "created_at": "2024-11-05T10:00:00Z"
    }
  ],
  "incident_source": "pagerduty"
}
```

| Field             | Type             | Required | Meaning                                                                                                                                                                                                                                |
| ----------------- | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tickets`         | `TicketRecord[]` | no       | Work items within the audit period; omit or use `[]` if none                                                                                                                                                                           |
| `incident_source` | `string \| null` | no       | Identifier for the incident-management system feeding MTTR (e.g. `"pagerduty"`, `"opsgenie"`). When present, MTTR reliability upgrades from `"git-proxy"` to first-class. Omit or set `null` when no dedicated incident source exists. |
| `fetch_meta`      | `FetchMeta`      | yes\*    | Honest accounting of how much of the source was actually fetched (see [FetchMeta](#fetchmeta) below). \*Required whenever the source paginates — never write a paginated tracker artifact without it.                                  |

### FetchMeta

The engine reads this block (passed through into the computed `raw` artifact) and annotates affected metrics with a partial-fetch reliability note when `complete` is false. A partial fetch is data, not a failure — write the artifact with an honest `fetch_meta` rather than dropping the source.

```json
{
  "tickets_fetched": 437,
  "tickets_total": 437,
  "complete": true,
  "pages_fetched": 5,
  "changelog_fetched_for": 50
}
```

| Field                   | Type      | Required | Meaning                                                                                                                                                                                  |
| ----------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tickets_fetched`       | `number`  | yes      | Tickets actually accumulated into `tickets[]`                                                                                                                                            |
| `tickets_total`         | `number`  | yes      | The query total (Jira: from the one `computeIssueCount: true` call); equal to `tickets_fetched` when the source exposes no count                                                         |
| `complete`              | `boolean` | yes      | `false` whenever pagination stopped early or `tickets_total > tickets_fetched`                                                                                                           |
| `pages_fetched`         | `number`  | yes      | Search pages actually retrieved                                                                                                                                                          |
| `changelog_fetched_for` | `number`  | yes      | Resolved tickets whose per-ticket changelog pass succeeded (0 = cycle time cannot compute)                                                                                               |
| `note`                  | `string`  | no       | The real cause whenever anything was partial — e.g. `"stopped at page 1"`, `"rate-limited after page 3"`, `"changelog fetch failed for 4 tickets"`. Never a generic "connector missing". |

### TrackerRaw

The computed artifact the engine derives from `TrackerConnector`. The orchestrator does not need to produce this directly — the collector builds it. Included here for reference when inspecting `collected/tracker.json` output.

| Field             | Type                     | Meaning                                                                     |
| ----------------- | ------------------------ | --------------------------------------------------------------------------- |
| `tickets`         | `TicketRecord[]`         | All ticket records from the connector                                       |
| `type_counts`     | `Record<string, number>` | Breakdown of tickets by lowercase type (e.g. `{ "bug": 3, "feature": 12 }`) |
| `resolved_count`  | `number`                 | Total tickets resolved during the period (throughput, issue_throughput)     |
| `incident_source` | `string \| null`         | Passed through from the connector                                           |

### Worked example — Jira issue-search → `collected/tracker.json`

Jira hard-caps `maxResults` at 100 regardless of what you pass, so a single call silently under-samples any long-lived project — and because default ordering is unstable, the sampled 100 differ run to run. Page through all results and accumulate into one `tickets[]` before writing the artifact:

1. First call: `searchJiraIssuesUsingJql({ jql: "project = PROJ AND updated >= -<lookback>d ORDER BY created DESC", maxResults: 100, computeIssueCount: true, fields: ["issuetype", "status", "created", "resolutiondate", "parent", "subtasks", "description"] })`. `ORDER BY created DESC` keeps ordering stable across pages; `computeIssueCount: true` (once, on this call only) returns the query total, so `fetch_meta.tickets_total` and completeness are known. **Request `description` and `subtasks` explicitly** — compact/default field sets omit them, and every ticket then lacks `description_length`/`subtask_count`, silently SKIPping ADP-13 and ADP-12 on an otherwise-connected tracker (observed in the wild). Map `description` to its character count immediately and discard the raw text — it never enters the artifact.
2. Loop: pass each response's `nextPageToken` back as a parameter in the next call; stop when `isLast: true`, when no token is returned, or at the ~2000-ticket cap. (Classic on-prem JQL paginates with `startAt += page_size` until a short/empty page instead.)

Write `collected/tracker.json` once after all pages are accumulated — not per page — and record what happened in `fetch_meta` (pages fetched, tickets fetched vs. total, `complete: false` with the real cause in `note` if the loop stopped early). Linear paginates via `pageInfo.hasNextPage` + `endCursor` (GraphQL cursor); GitHub Issues via the `Link: rel="next"` header or `page` query param.

#### Changelog pass — `in_progress_at` for cycle time

Jira search results never include changelogs and search has no expand parameter, so status-transition history takes one extra call per ticket: `getJiraIssue(cloudId, issueIdOrKey, expand: "changelog", fields: ["status"])`. The response's `changelog.histories[]` entries each carry a `created` timestamp and `items[]`; items with `field: "status"` carry `fromString`/`toString`.

After pagination, take the resolved tickets — cap at ~50, most recently resolved — and fetch each one's changelog. The per-ticket calls are independent: issue them as parallel tool calls in batched messages, never one per turn.

Set `in_progress_at` to the `created` timestamp of the first transition into an in-progress-category status. Match by category, not the literal name — real workflows skip a status literally named "In Progress" entirely (observed: Backlog → To Do → In Review → Done). When the search results carry `status.statusCategory`, an in-progress status is any whose statusCategory key is `indeterminate`; otherwise match `toString` against `/in progress|in review|in development|development|doing|started|coding/i`. Omit the field for tickets with no such transition, and record how many changelogs were fetched in `fetch_meta.changelog_fetched_for` (with the failure cause in `note` if some fetches failed).

Map each collected issue to a `TicketRecord`:

```
Jira field                         → TicketRecord field
-----------                          -----------------
issue.key                          → id            ("PROJ-123")
issue.fields.issuetype.name        → type          ("Bug")
issue.fields.status.name           → status        ("Done")
issue.fields.created               → created_at    (ISO 8601 string)
issue.fields.resolutiondate        → resolved_at   (ISO 8601 string or null → omit)
changelog pass: first transition
  into an in-progress-category
  status                           → in_progress_at (ISO 8601 string; from the per-ticket getJiraIssue changelog pass above — omit when transition history was not fetched)
issue.fields.subtasks.length       → subtask_count           (number; omit when 0 or absent)
issue.fields.parent?.key           → parent                  (string or null → omit when null)
issue.fields.description?.length   → description_length      (number; char count only — never include raw text; omit when absent)
/acceptance.criteria/i.test(desc)  → has_acceptance_criteria (boolean; regex match on description — no raw text stored; omit when absent)
```

Write the assembled `TrackerConnector` to `collected/tracker.json`. Include a `period` block that records the actual window queried — the engine uses this to populate the **Sources** column tooltip in the report:

```json
{
  "tickets": [
    {
      "id": "PROJ-123",
      "type": "Bug",
      "status": "Done",
      "created_at": "2024-10-15T08:22:00Z",
      "resolved_at": "2024-10-17T16:45:00Z"
    },
    {
      "id": "PROJ-124",
      "type": "Story",
      "status": "In Progress",
      "created_at": "2024-11-01T09:00:00Z"
    }
  ],
  "incident_source": null,
  "fetch_meta": {
    "tickets_fetched": 437,
    "tickets_total": 437,
    "complete": true,
    "pages_fetched": 5,
    "changelog_fetched_for": 50
  },
  "period": {
    "lookback_days": 90,
    "source_label": "Jira via Atlassian MCP"
  }
}
```

| `period` field  | Type     | Meaning                                                                                                                                                                                 |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lookback_days` | `number` | The actual query window in days — normally the `<lookback>` value you substituted (the audit-wide `[meta].max_lookback_days`). The renderer converts ≥60 days to months in the tooltip. |
| `source_label`  | `string` | Human-readable name shown in the Sources tooltip, e.g. `"Jira via Atlassian MCP"`, `"GitHub Issues"`, `"Linear"`.                                                                       |

---

## Docs (`collected/docs.json`)

### DocPage

Represents a single documentation page from an external wiki or docs system (Confluence, Coda, Notion, GitBook, etc.).

```json
{
  "title": "Architecture Overview",
  "url": "https://wiki.example.com/pages/12345",
  "updated_at": "2024-10-20T11:00:00Z"
}
```

| Field        | Type      | Required | Meaning                                                                         |
| ------------ | --------- | -------- | ------------------------------------------------------------------------------- |
| `title`      | `string`  | no       | Human-readable page title                                                       |
| `url`        | `string`  | no       | Canonical URL of the page                                                       |
| `updated_at` | `string`  | no       | ISO 8601 timestamp of the last update; used to compute `recently_updated_count` |
| _(any)_      | `unknown` | no       | Additional fields from the source system are passed through unchanged           |

### DocsConnector

The connector object the orchestrator assembles and passes to the collector. Written to `collected/docs.json`.

```json
{
  "pages": [
    {
      "title": "Architecture Overview",
      "url": "https://wiki.example.com/pages/12345",
      "updated_at": "2024-10-20T11:00:00Z"
    },
    {
      "title": "Runbook: On-Call Playbook",
      "url": "https://wiki.example.com/pages/12346",
      "updated_at": "2024-09-01T08:00:00Z"
    }
  ]
}
```

| Field   | Type        | Required | Meaning                                                                |
| ------- | ----------- | -------- | ---------------------------------------------------------------------- |
| `pages` | `DocPage[]` | no       | Documentation pages from the external system; omit or use `[]` if none |

### DocsRaw

The computed artifact the engine derives from `DocsConnector`. The orchestrator does not need to produce this directly — the collector builds it.

| Field                    | Type        | Meaning                                                                                                       |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `pages`                  | `DocPage[]` | All page records from the connector                                                                           |
| `page_count`             | `number`    | Total number of pages returned                                                                                |
| `recently_updated_count` | `number`    | Pages whose `updated_at` falls within the audit lookback period (freshness indicator, external_spec_coverage) |

### Worked example — Confluence page list → `collected/docs.json`

A Confluence MCP call like `getPagesInConfluenceSpace({ spaceKey: "ENG", limit: 100 })` returns an array of page objects. Map each to a `DocPage`:

```
Confluence field        → DocPage field
----------------          ------------
page.title              → title
page._links.webui       → url  (prepend base URL if relative)
page.version.when       → updated_at (ISO 8601 string)
```

Write the assembled `DocsConnector` to `collected/docs.json`. Include a `period` block so the Sources tooltip names the actual connector and window:

```json
{
  "pages": [
    {
      "title": "Engineering Handbook",
      "url": "https://wiki.example.com/display/ENG/Engineering+Handbook",
      "updated_at": "2024-11-10T14:00:00Z"
    },
    {
      "title": "API Reference",
      "url": "https://wiki.example.com/display/ENG/API+Reference",
      "updated_at": "2024-08-05T09:30:00Z"
    }
  ],
  "period": {
    "lookback_days": 90,
    "source_label": "Confluence via Atlassian MCP"
  }
}
```

The `period.lookback_days` and `period.source_label` fields follow the same schema as for the tracker artifact (see above).

---

## Code host (`collected/code_host.json`)

Merged-PR records from the code host (GitHub via `gh`, GitLab via `glab`, or a code-host MCP). This is the real source for PR timings on squash-merge repos, where git history alone cannot reconstruct branch lifetimes — it feeds DF-02 lead time (`first_commit_at → merged_at`), DF-03 PR cycle time (`created_at → merged_at`), and DF-05 review rework (`commit_count`). Whenever `gh`/`glab` is reachable for the repo's remote, fetching this artifact is part of doing the audit, not an optional extra.

### PrRecord

```json
{
  "number": 310,
  "created_at": "2026-06-28T09:12:00Z",
  "merged_at": "2026-07-02T10:45:52Z",
  "first_commit_at": "2026-06-27T16:03:11Z",
  "commit_count": 7
}
```

| Field             | Type     | Required | Meaning                                                                                  |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------------- |
| `number`          | `number` | no       | PR/MR number, for traceability                                                           |
| `created_at`      | `string` | yes      | ISO 8601 PR open time — with `merged_at`, the literal DF-03 PR cycle time                |
| `merged_at`       | `string` | yes      | ISO 8601 merge time                                                                      |
| `first_commit_at` | `string` | no       | Earliest commit authored on the PR — with `merged_at`, the DF-02 lead-time approximation |
| `commit_count`    | `number` | no       | Commits on the PR at merge time — feeds the DF-05 review-rework proxy                    |

### CodeHostRaw

Written by the orchestrator directly (no engine collector transforms it):

```json
{
  "source": "code_host",
  "available": true,
  "reason_if_absent": null,
  "period": {
    "bucket_days": 30,
    "lookback_days": 90,
    "history_available_days": 90,
    "source_label": "GitHub PRs via gh"
  },
  "raw": {
    "prs": [],
    "fetch_meta": { "prs_fetched": 200, "complete": true }
  }
}
```

Fetch only PRs merged inside the audit window (`<lookback>` days) — the metrics use every record in the artifact and rely on the fetch window, and record the window actually used in `period.lookback_days`.

### Worked example — GitHub → `collected/code_host.json`

Do NOT use `gh pr list --json commits` — that field expands every commit's author list and exceeds GitHub's GraphQL node budget even at `--limit 50`. PR commits are ordered oldest-first, so `commits(first: 1)` + `totalCount` gives everything the metrics need at trivial cost:

```
gh api graphql -f owner=<owner> -f repo=<repo> -f query='
  query($owner:String!,$repo:String!,$cursor:String){
    repository(owner:$owner,name:$repo){
      pullRequests(states:MERGED,first:100,after:$cursor,
                   orderBy:{field:UPDATED_AT,direction:DESC}){
        pageInfo{hasNextPage endCursor}
        nodes{number createdAt mergedAt
              commits(first:1){totalCount nodes{commit{authoredDate}}}}}}}'

# Paginate on pageInfo.endCursor until a page's oldest mergedAt predates the
# audit window (UPDATED_AT ordering is not merge order — expect a small
# overshoot and filter by mergedAt when mapping). Map each node:
#   number                              → number
#   createdAt                           → created_at
#   mergedAt                            → merged_at
#   commits.nodes[0].commit.authoredDate → first_commit_at
#   commits.totalCount                  → commit_count
# Drop PRs whose mergedAt is older than the audit window.
```

Fallback when GraphQL is unavailable: `gh pr list --state merged --limit 200 --json number,createdAt,mergedAt` (no `commits`) — DF-03 still computes exactly; DF-02/DF-05 fall back to their git proxies. GitLab equivalent: `glab mr list --state merged` (MR `sha`/commit counts via `glab api projects/:id/merge_requests/:iid/commits` when cheap).

---

## Turnkey enrichment recipe

When a tracker or docs MCP is reachable, enriching it is a small, bounded operation — not a bulk data migration. Query the audit window (`<lookback>` days); the engine clamps records to it regardless. Mapping reachable data into the shapes above is expected, not fabrication. Reachability is decided by attempting the call, not by any config file.

Tracker (Jira) → `collected/tracker.json`:

```
# 1. Fetch the audit window (issues updated in the last <lookback> days).
#    maxResults is hard-capped at 100, so a single call under-samples. Page to completion:
#      Cloud MCP:   loop on nextPageToken until isLast: true or no token returned;
#                   first call adds computeIssueCount: true to learn the query total.
#      Classic JQL: loop on startAt (increment by page size) until a short/empty page.
#    jql = "updated >= -<lookback>d ORDER BY created DESC", cap at ~2000 tickets.
#    Accumulate all pages into one tickets[], then proceed to step 2.
# 2. Changelog pass (cycle time): for the ~50 most recently resolved tickets, call
#    getJiraIssue(cloudId, key, expand: "changelog", fields: ["status"]) as parallel
#    tool calls in batched messages; set in_progress_at from the first transition
#    into an in-progress-category status (see the worked example above).
# 3. Map each issue to a TicketRecord {id, type, status, created_at, resolved_at,
#    in_progress_at?} and wrap as a TrackerConnector {tickets: [...],
#    incident_source: null, fetch_meta: {...}} — fetch_meta is required for any
#    paginated source; set complete: false with the real cause in note when
#    pagination or the changelog pass stopped early.
# 4. Write it once (after all pages are accumulated):
#    context/audits/YYYY-MM-DD_HH-MM-SS/collected/tracker.json
# 5. After ALL reachable sources' artifacts are written, one enrich pass
#    re-scores everything (never a metric call per source):
node "${CLAUDE_SKILL_DIR}/dist/cli.js" enrich "<repoPath>" "context/audits/YYYY-MM-DD_HH-MM-SS"
```

Docs (Confluence) → `collected/docs.json`:

```
# 1. List recent space pages (e.g. Confluence MCP: getPagesInConfluenceSpace, or
#    searchConfluenceUsingCql with cql = "lastmodified >= now('-<lookback>d')").
# 2. Map each page to a DocPage {title, url, updated_at} and wrap as a
#    DocsConnector {pages: [...]}.
# 3. Write context/audits/YYYY-MM-DD_HH-MM-SS/collected/docs.json. The same single
#    enrich pass (see the tracker recipe) re-scores it — no per-metric calls.
```

## Data-source resolution protocol

A reachable tracker/docs/incident MCP is enriched by default — fetching and mapping it is part of the audit, not optional. Reachability is decided by attempting the call, not by any config file. The sources are independent, so **fetch them concurrently** — issue the tracker/docs/incident calls in a single message (parallel tool calls); only pagination _within_ a source is sequential. For every non-git source (tracker, docs, incident, and any reachable MCP/integration that maps to a collector):

1. **Attempt to fetch.** Try the MCP call or API request. If it is reachable, fetch it — do not pre-decide it is out of scope.
2. **On success** — map each returned record into the shape above and write the `TrackerConnector` or `DocsConnector` JSON to `collected/<source>.json`. Mapping reachable data into the documented shape is not fabrication. Do **not** re-run a metric per source here — once every reachable source's artifact is written, the orchestrator re-scores them all in one pass:
   ```
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" enrich "<repoPath>" "context/audits/YYYY-MM-DD_HH-MM-SS"
   ```
3. **On failure or unclear mapping** (auth error, unfamiliar schema, broken dependency, empty result, closed port) — do not silently skip. In interactive mode, use `AskUserQuestion` with three options: mark unavailable (record the reason) / retry with guidance / show how to fix (link to this document). In headless `claude -p` runs (no interactive user), default to marking the source unavailable and record the _actual_ failure in the source's `source_probes` entry (authored into `report-blocks.json`) — the real cause (e.g. "atlassian MCP (401 unauthorized)"), never "no connector provided" when a channel was in fact reachable.

Never drop a reachable source without a recorded reason.

## CLI channels

When no MCP server in the session covers a source, CLI tools on PATH are the sanctioned fallback channel. MCP servers count only when the project declares them (the audit assesses the project, not the auditor's environment); CLIs are excused because a repo cannot ship them — they are measurement channels, not project capability. Label the artifact honestly (`period.source_label`: `"Jira via acli"`, `"GitHub Actions via gh"`) so the report shows the real channel. Probe each CLI with a cheap auth check before use, and log every probe (hit or miss) into the source's `source_probes` entry.

### Identity discovery — what to query

- **GitHub / GitLab project**: `git remote get-url origin` → `owner/repo` (works for both hosts; strip `.git`). No further discovery needed — `gh`/`glab` commands below take it from the working directory.
- **Jira project key**: scan the repo's own history — `git log --format='%s' -500` plus branch names — for ticket references matching `\b[A-Z][A-Z0-9]{1,9}-[0-9]+\b`; the dominant prefix is the project key (e.g. `IGAL`). Verify it before trusting it: `acli jira project view <KEY>` must succeed. No dominant prefix or verification failure → record "no Jira project key derivable from history" in the probe log and stop; never guess a key.

### CI runs → `collected/ci.json` (gh / glab)

```
# Probe: gh auth status   (or: glab auth status)
# Fetch a bounded recent run history:
gh run list --limit 200 --json databaseId,status,conclusion,createdAt,updatedAt,workflowName
# (GitLab: glab ci list --per-page 100 --output json)
# Map into the CiConnector shape: runs[] entries pass through opaquely;
# set period.source_label: "GitHub Actions via gh" (or "GitLab CI via glab").
```

This alone upgrades the CI source from "config detected but no run history" to scored pipeline metrics — no MCP required.

Pass every fetched run through with its `conclusion` string **verbatim** — do not pre-filter or re-label. The engine classifies conclusions itself (pass / fail / no-verdict) across the major providers' vocabularies, computes the pass rate over decided runs only, and discloses what it excluded. Chatty trigger-style workflows can fill the fetch window with `skipped` runs (observed: 456 of 500), leaving few decided runs — if the fetched sample looks skip-dominated, raise `--limit` (500–1000) so enough decided runs land in the artifact.

### Tracker via acli (Jira) → `collected/tracker.json`

```
# Probe: acli jira auth status   (any non-error output = authenticated)
# 1. Derive + verify the project key (see identity discovery above).
# 2. Fetch a bounded resolved window:
acli jira workitem search --jql "project = <KEY> AND statusCategory = Done AND resolved >= -<lookback>d ORDER BY resolved DESC" --json
#    plus a second query without the statusCategory filter for open work-mix.
# 3. Changelog pass for cycle time: fetch per-issue status history for the ~50
#    most recently resolved issues (acli jira workitem view <KEY-N> --json — if
#    the installed acli version exposes no changelog/history field, leave
#    in_progress_at unset; the engine then reports "connected — per-ticket
#    status history not fetched" honestly).
# 4. Map to TicketRecord[] exactly as the MCP recipe above; source_label: "Jira via acli".
```

### Tracker via gh/glab issues → `collected/tracker.json`

Code-host issues are a legitimate tracker when nothing richer exists:

```
gh issue list --state all --limit 500 --json number,title,state,createdAt,closedAt,labels
# (GitLab: glab issue list --output json)
# Map: id ← number, created_at ← createdAt, resolved_at ← closedAt (closed only),
# type ← from labels when present (bug/feature), in_progress_at ← omit (issues
# carry no status transitions) — work-mix and throughput score; cycle time
# stays gated with the engine's honest note. source_label: "GitHub Issues via gh".
```

Prefer richer sources when several are reachable: tracker MCP > acli > code-host issues. One tracker artifact only — never merge channels.
