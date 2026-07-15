/**
 * backlog_render.ts — Jira-style per-ticket markdown renderer.
 *
 * Pure string building from an already-validated BacklogJson/BacklogTicket
 * (see backlog.ts). No I/O — the caller decides where each ticket's file
 * lands (one file per ticket, named `<slug>.md`, siblings so dependency
 * links resolve relative to the same directory).
 */
import type { BacklogJson, BacklogTicket } from './backlog.ts';

function renderDependsOn(ticket: BacklogTicket): string {
  if (ticket.depends_on.length === 0) return '—';
  return ticket.depends_on.map((slug) => `[${slug}](${slug}.md)`).join(', ');
}

function renderCoveredChecks(ticket: BacklogTicket): string {
  return ticket.checks
    .map((c) => `${c.check_id} (${Math.round(c.share * 100)}%)`)
    .join(', ');
}

export function renderTicketMd(
  backlog: BacklogJson,
  ticket: BacklogTicket
): string {
  const coverageDeltaPct = (ticket.coverage_delta * 100).toFixed(1);
  const dod = ticket.definition_of_done
    .map((item) => `- [ ] ${item}`)
    .join('\n');

  return `# ${ticket.slug} — ${ticket.title}

| | |
| --- | --- |
| Effort | ${ticket.effort_dev_days} d/dev |
| Coverage delta | +${coverageDeltaPct}% |
| Depends on | ${renderDependsOn(ticket)} |
| Covered checks | ${renderCoveredChecks(ticket)} |

## Goal

${ticket.goal}

## Description

${ticket.description}

## Definition of Done

${dod}

> To turn this ticket into an AWOS functional spec, run /awos:spec pointing at this file.
`;
}
