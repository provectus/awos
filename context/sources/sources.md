# Knowledge Sources

## Status: configured

Discovery ran on 2026-10-27. This file is shared with everyone who clones the repository and holds no credentials. Access is per person: after cloning, run the `configure-external-sources` skill to connect your own session to these sources.

Asked and answered with nothing: documentation / wiki (none beyond the `docs/` folder in this repository) and infrastructure (the framework is an npm package and a Claude Code plugin; it runs nowhere beyond this repository). The private Slack channel the core team uses is deliberately not recorded here.

## Source: github-issues

- Role: tracker
- Platform: GitHub Issues
- Access: cli
- Tool: gh (or any path to GitHub this session has)
- Requires: a GitHub login with read access to the `provectus` organization
- Scope: issues of the `provectus/awos` repository
- Verify: `gh issue list -R provectus/awos -L 1 --state all` returns one issue
- Use for: where features, bugs and their discussion are recorded; issue numbers referenced in specs and pull requests resolve here

## Source: slack

- Role: communication
- Platform: Slack (provectus.slack.com)
- Access: mcp
- Tool: barley (project-scoped, in .mcp.json)
- Requires: a Barley account, OAuth login through /mcp, with a linked Slack identity
- Scope: the `#proj-awos` channel, read through the Barley public project `awos` (entity `56a8fbdd-efd4-4fa9-833b-7ea492863769`, type `community`)
- Verify: `get_recent_activity` for that entity with `include=slack` returns an item from `proj-awos`
- Use for: day-to-day discussion, decisions and action items around AWOS and the teams adopting it; threads about sister repositories surface here first

## Source: meetings

- Role: communication
- Platform: Barley meeting recordings (barley.provectus.pro)
- Access: mcp
- Tool: barley (project-scoped, in .mcp.json)
- Requires: a Barley account, OAuth login through /mcp
- Scope: calls linked to the Barley public project `awos` (entity `56a8fbdd-efd4-4fa9-833b-7ea492863769`, type `community`)
- Verify: `get_meeting_notes` in list mode for that entity returns at least one call
- Use for: call summaries, transcripts and commitments from the AWOS syncs; the only place spoken decisions are recorded

## Source: github

- Role: vcs
- Platform: GitHub
- Access: cli
- Tool: gh (or any path to GitHub this session has)
- Requires: a GitHub login with read access to the `provectus` organization
- Scope: the `provectus` organization — the sister repositories live there
- Verify: `gh repo list provectus -L 1` lists one repository
- Use for: the repositories that consume the framework, such as `awos-recruitment` and `nugs-qa-awos`; their specs, pull request history and how they use AWOS
