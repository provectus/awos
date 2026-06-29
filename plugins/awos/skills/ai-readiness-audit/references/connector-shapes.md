# Connector Shapes Reference

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

| Field         | Type      | Required | Meaning                                                               |
| ------------- | --------- | -------- | --------------------------------------------------------------------- |
| `id`          | `string`  | yes      | Unique ticket identifier (e.g. Jira issue key "PROJ-123")             |
| `type`        | `string`  | no       | Issue type label (e.g. "bug", "feature", "story", "task")             |
| `status`      | `string`  | no       | Current status label (e.g. "Done", "In Progress", "Open")             |
| `created_at`  | `string`  | no       | ISO 8601 creation timestamp                                           |
| `resolved_at` | `string`  | no       | ISO 8601 timestamp when the ticket was resolved/closed                |
| _(any)_       | `unknown` | no       | Additional fields from the source system are passed through unchanged |

The `resolved_count` helper treats a ticket as resolved when `status` (lowercased) equals `"done"` **or** `resolved_at` is non-null. Map whichever field your source exposes.

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

### TrackerRaw

The computed artifact the engine derives from `TrackerConnector`. The orchestrator does not need to produce this directly — the collector builds it. Included here for reference when inspecting `collected/tracker.json` output.

| Field             | Type                     | Meaning                                                                     |
| ----------------- | ------------------------ | --------------------------------------------------------------------------- |
| `tickets`         | `TicketRecord[]`         | All ticket records from the connector                                       |
| `type_counts`     | `Record<string, number>` | Breakdown of tickets by lowercase type (e.g. `{ "bug": 3, "feature": 12 }`) |
| `resolved_count`  | `number`                 | Total tickets resolved during the period (throughput, ADP-I2)               |
| `incident_source` | `string \| null`         | Passed through from the connector                                           |

### Worked example — Jira issue-search → `collected/tracker.json`

A Jira MCP call like `searchJiraIssuesUsingJql({ jql: "project = PROJ AND updated >= -180d", maxResults: 200 })` returns an array of issue objects. Map each to a `TicketRecord`:

```
Jira field          → TicketRecord field
-----------           -----------------
issue.key           → id            ("PROJ-123")
issue.fields.issuetype.name → type  ("Bug")
issue.fields.status.name    → status ("Done")
issue.fields.created        → created_at (ISO 8601 string)
issue.fields.resolutiondate → resolved_at (ISO 8601 string or null → omit)
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
  "period": {
    "lookback_days": 180,
    "source_label": "Jira via Atlassian MCP"
  }
}
```

| `period` field  | Type     | Meaning                                                                                                                                                                                 |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lookback_days` | `number` | The actual query window in days (e.g. 180 for a `updated >= -180d` Jira query). The renderer converts ≥60 days to months in the tooltip. Default for tracker is 180 days ("~6 months"). |
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

| Field                    | Type        | Meaning                                                                                       |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `pages`                  | `DocPage[]` | All page records from the connector                                                           |
| `page_count`             | `number`    | Total number of pages returned                                                                |
| `recently_updated_count` | `number`    | Pages whose `updated_at` falls within the audit lookback period (freshness indicator, ADP-D1) |

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
    "lookback_days": 180,
    "source_label": "Confluence via Atlassian MCP"
  }
}
```

The `period.lookback_days` and `period.source_label` fields follow the same schema as for the tracker artifact (see above).

---

## Turnkey enrichment recipe

When a tracker or docs MCP is reachable, enriching it is a small, bounded operation — not a 730-day data migration. The engine buckets whatever you provide; a recent window is enough. Mapping reachable data into the shapes above is expected, not fabrication, and it is not gated on a `sources.toml`.

Tracker (Jira) → `collected/tracker.json`:

```
# 1. Fetch a bounded recent window (e.g. issues updated in the last ~180 days).
#    Jira MCP: searchJiraIssuesUsingJql, jql = "updated >= -180d ORDER BY updated DESC"
# 2. Map each issue to a TicketRecord {id, type, status, created_at, resolved_at}
#    and wrap as a TrackerConnector {tickets: [...], incident_source: null}.
# 3. Write it:
#    context/audits/YYYY-MM-DD/collected/tracker.json
# 4. Re-run the tracker metrics, then re-aggregate:
node "${CLAUDE_SKILL_DIR}/dist/cli.js" metric adp_i1 "<repoPath>" "context/audits/YYYY-MM-DD/collected"
node "${CLAUDE_SKILL_DIR}/dist/cli.js" metric adp_i2 "<repoPath>" "context/audits/YYYY-MM-DD/collected"
node "${CLAUDE_SKILL_DIR}/dist/cli.js" metric adp_i3 "<repoPath>" "context/audits/YYYY-MM-DD/collected"
node "${CLAUDE_SKILL_DIR}/dist/cli.js" aggregate "context/audits/YYYY-MM-DD"
```

Docs (Confluence) → `collected/docs.json`:

```
# 1. List recent space pages (e.g. Confluence MCP: getPagesInConfluenceSpace, or
#    searchConfluenceUsingCql with cql = "lastmodified >= now('-180d')").
# 2. Map each page to a DocPage {title, url, updated_at} and wrap as a
#    DocsConnector {pages: [...]}.
# 3. Write context/audits/YYYY-MM-DD/collected/docs.json, then:
node "${CLAUDE_SKILL_DIR}/dist/cli.js" metric adp_d1 "<repoPath>" "context/audits/YYYY-MM-DD/collected"
node "${CLAUDE_SKILL_DIR}/dist/cli.js" aggregate "context/audits/YYYY-MM-DD"
```

## Data-source resolution protocol

A reachable tracker/docs/incident MCP is enriched by default — fetching and mapping it is part of the audit, not optional, and not gated on a `sources.toml`. For every non-git source (tracker, docs, incident, and any reachable MCP/integration that maps to a collector):

1. **Attempt to fetch.** Try the MCP call or API request. If it is reachable, fetch it — do not pre-decide it is out of scope.
2. **On success** — map each returned record into the shape above, write the `TrackerConnector` or `DocsConnector` JSON to `collected/<source>.json`, then run the affected metric:
   ```
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" metric <id> "<repoPath>" "context/audits/YYYY-MM-DD/collected"
   ```
   Mapping reachable data into the documented shape is not fabrication.
3. **On failure or unclear mapping** (auth error, unfamiliar schema, broken dependency, empty result, closed port) — do not silently skip. In interactive mode, use `AskUserQuestion` with three options: mark unavailable (record the reason) / retry with guidance / show how to fix (link to this document). In headless `claude -p` runs (no interactive user), default to marking the source unavailable and record the _actual_ failure reason plus a remediation hint in the report's `missed_sources` list — the real cause (e.g. "Jira MCP returned 401"), never "no connector provided" when an MCP was in fact reachable.

Never drop a reachable source without a recorded reason.
