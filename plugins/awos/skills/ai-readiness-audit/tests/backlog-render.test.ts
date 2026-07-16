import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTicketMd, renderBacklogHtml } from '../backlog_render.ts';
import { REPORT_CSS } from '../render.ts';
import type { BacklogJson } from '../backlog.ts';

const backlog: BacklogJson = {
  date: '2026-07-15',
  project: 'demo',
  audit_total: 6,
  coverage: 0.32,
  total_applicable_weight: 19,
  total_missing_weight: 13,
  parallelizable_share: 0.8,
  engine: { generated_by: 'audit-core' },
  tickets: [
    {
      slug: 'A001-adopt-ci',
      seq: 1,
      temp_id: 'a',
      title: 'Adopt CI',
      goal: 'Faster, safer delivery',
      description: 'Add CI with test and lint gates',
      effort_dev_days: 3,
      definition_of_done: ['CI runs on every PR'],
      depends_on: [],
      checks: [
        {
          check_id: 'DF-01',
          dimension: 'delivery-flow',
          share: 0.6,
          missing_weight: 8,
          contribution: 4.8,
        },
      ],
      missing_weight_recovered: 4.8,
      coverage_delta: 4.8 / 19,
    },
    {
      slug: 'A002-harden-ci',
      seq: 2,
      temp_id: 'b',
      title: 'Harden CI',
      goal: 'Robust pipelines',
      description: 'Add flaky-test quarantine',
      effort_dev_days: 2,
      definition_of_done: ['Quarantine list wired'],
      depends_on: ['A001-adopt-ci'],
      checks: [
        {
          check_id: 'DF-01',
          dimension: 'delivery-flow',
          share: 0.4,
          missing_weight: 8,
          contribution: 3.2,
        },
      ],
      missing_weight_recovered: 3.2,
      coverage_delta: 3.2 / 19,
    },
  ],
};

test('ticket md carries all Jira-style fields', () => {
  const md = renderTicketMd(backlog, backlog.tickets[1]);
  assert.match(md, /^# A002-harden-ci — Harden CI/m, 'H1 must be slug — title');
  assert.match(md, /2 d\/dev/, 'effort in d/dev');
  assert.match(md, /\+16\.8%/, 'coverage delta as +X.X% (3.2/19)');
  assert.match(
    md,
    /\[A001-adopt-ci\]\(A001-adopt-ci\.md\)/,
    'dependency links to sibling ticket file'
  );
  assert.match(md, /DF-01 \(40%\)/, 'covered checks show share');
  assert.match(md, /## Goal\n+Robust pipelines/, 'Goal section');
  assert.match(
    md,
    /## Definition of Done\n+- \[ \] Quarantine list wired/,
    'DoD as checkboxes'
  );
  assert.match(
    md,
    /\/awos:spec/,
    'footer names the /awos:spec conversion path'
  );
});

test('ticket without dependencies renders an em dash', () => {
  const md = renderTicketMd(backlog, backlog.tickets[0]);
  assert.match(md, /Depends on.*—/, 'no-deps row shows —');
});

test('backlog.html is a self-contained interactive page', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<title>Improvement Backlog — demo — 2026-07-15<\/title>/);
  assert.ok(
    html.includes(REPORT_CSS.slice(0, 200)),
    'must embed the shared Provectus stylesheet'
  );
  assert.match(html, /id="backlog-data"/, 'embeds the backlog JSON');
  assert.match(html, /id="devs"/, 'ribbon has the developers input');
  assert.match(html, /id="rb-effort"/, 'ribbon shows effort');
  assert.match(html, /id="rb-duration"/, 'ribbon shows duration');
  assert.match(html, /id="rb-coverage"/, 'ribbon shows coverage gain');
  assert.match(html, /id="enable-all"/, 'ribbon has enable-all');
  assert.match(
    html,
    /id="rb-devs-tip"[^>]*>.*Adding developers shortens delivery sublinearly/,
    'sublinear-scaling caveat lives in a tooltip on the Developers control'
  );
  assert.doesNotMatch(
    html,
    /class="ribbon-warning"/,
    'the always-visible warning band is gone (moved into the Developers tooltip)'
  );
  assert.match(html, /Amdahl/, 'the caveat names the scaling model');
  assert.match(html, /<details class="legend"/, 'collapsible legend');
  assert.match(html, /data-slug="A001-adopt-ci"/, 'graph node per ticket');
  assert.match(html, /data-slug="A002-harden-ci"/);
  assert.match(
    html,
    /1\/\(\(1−0\.8\)\+0\.8\/n\)|1\/\(\(1-P\)\+P\/n\)/,
    'duration tooltip carries the formula'
  );
  assert.doesNotMatch(html, /src="http/, 'no external scripts');
});

test('coverage tooltip updates live inside recompute(), like the effort and duration tooltips', () => {
  const html = renderBacklogHtml(backlog);
  const recomputeBody = html.slice(
    html.indexOf('function recompute(){'),
    html.indexOf('function applyDisabled(){')
  );
  assert.match(
    recomputeBody,
    /getElementById\('rb-effort-tip'\)\.textContent/,
    'sanity: effort tip is wired inside recompute'
  );
  assert.match(
    recomputeBody,
    /getElementById\('rb-coverage-tip'\)\.textContent/,
    'rb-coverage-tip must be recomputed alongside rb-effort-tip and rb-duration-tip, not left static'
  );
});

test('graph layers follow topological depth', () => {
  // Scope to the graph region: both slugs also appear earlier in the embedded
  // JSON island, so comparing whole-document indices would pass on JSON array
  // order alone and stay green even if the layer computation were broken.
  const html = renderBacklogHtml(backlog);
  const graph = html.slice(html.indexOf('<div id="graph">'));
  const l1 = graph.indexOf('id="node-A001-adopt-ci"');
  const l2 = graph.indexOf('id="node-A002-harden-ci"');
  assert.ok(
    l1 !== -1 && l2 !== -1 && l1 < l2,
    'dependency-free ticket renders in an earlier graph layer than its dependent'
  );
});

test('embedded JSON escapes </script>', () => {
  const evil = structuredClone(backlog);
  evil.tickets[0].description = 'x</script><script>alert(1)</script>';
  const html = renderBacklogHtml(evil);
  assert.doesNotMatch(html, /x<\/script><script>alert/, 'JSON must escape </');
});

import type { OrgBacklogJson } from '../backlog.ts';

const orgBacklog: OrgBacklogJson = {
  org: true,
  date: '2026-07-15',
  project: 'acme-org',
  total_repos: 8,
  total_applicable_weight: 152,
  parallelizable_share: 0.8,
  repos: [
    {
      repo: 'alpha',
      backlog_href: 'per-repo/alpha/backlog/backlog.html',
      total_applicable_weight: 19,
      coverage: 0.32,
      ticket_count: 2,
      effort_dev_days: 5,
    },
    {
      repo: 'beta',
      backlog_href: 'per-repo/beta/backlog/backlog.html',
      total_applicable_weight: 19,
      coverage: 0.5,
      ticket_count: 1,
      effort_dev_days: 3,
    },
  ],
  engine: { generated_by: 'audit-core' },
  tickets: [
    {
      id: 'org-ci',
      seq: 1,
      title: 'Adopt CI everywhere',
      goal: 'g',
      description: 'd',
      depends_on: [],
      repos_covered: 3,
      effort_dev_days: 9,
      missing_weight_recovered: 24,
      coverage_delta: 24 / 152,
      members: [
        {
          repo: 'alpha',
          slug: 'A001-adopt-ci',
          title: 'Adopt CI',
          effort_dev_days: 3,
          coverage_delta: 8 / 19,
          missing_weight_recovered: 8,
          ticket_href: 'per-repo/alpha/backlog/tickets/A001-adopt-ci.md',
        },
        {
          repo: 'beta',
          slug: 'A001-adopt-ci',
          title: 'Adopt CI',
          effort_dev_days: 3,
          coverage_delta: 8 / 19,
          missing_weight_recovered: 8,
          ticket_href: 'per-repo/beta/backlog/tickets/A001-adopt-ci.md',
        },
      ],
    },
  ],
};

test('org backlog.html renders an audit-only fallback repo (no backlog_href) as plain text, not a 404 link', () => {
  const withFallback: OrgBacklogJson = {
    ...orgBacklog,
    repos: [
      ...orgBacklog.repos,
      {
        repo: 'gamma',
        backlog_href: null,
        total_applicable_weight: 12,
        coverage: 0.1,
        ticket_count: 0,
        effort_dev_days: 0,
      },
    ],
  };
  const html = renderBacklogHtml(withFallback);
  const repos = html.slice(html.indexOf('<section id="repos">'));
  assert.doesNotMatch(
    repos,
    /<a[^>]*>gamma<\/a>/,
    'audit-only repo (no generated backlog) must not render a link that would 404'
  );
  assert.match(
    repos,
    /<td>gamma<\/td>/,
    'audit-only repo still appears as a plain-text repository cell'
  );
  assert.match(
    repos,
    /<a class="repo-link" href="\.\.\/per-repo\/alpha\/backlog\/backlog\.html">alpha<\/a>/,
    'repos with a real backlog keep their link, resolved from the org page location (../per-repo/…)'
  );
});

test('org repo links and member ticket links resolve from the org page (../per-repo/…), not the audit-dir root', () => {
  // The org backlog.html lives at <auditDir>/backlog/backlog.html, so the
  // JSON's audit-dir-relative hrefs (per-repo/…) must be rewritten with ../.
  const html = renderBacklogHtml(orgBacklog);
  assert.match(
    html,
    /href="\.\.\/per-repo\/alpha\/backlog\/backlog\.html"/,
    'repo backlog link is prefixed with ../'
  );
  assert.match(
    html,
    /href="\.\.\/per-repo\/alpha\/backlog\/backlog\.html#node-A001-adopt-ci"/,
    'member ticket links deep-link to the node in the repo backlog graph, not the raw .md (browsers render it as plain text)'
  );
  assert.doesNotMatch(
    html,
    /href="[^"]*\.md"/,
    'no org link opens a raw markdown file'
  );
  assert.doesNotMatch(
    html,
    /href="per-repo\//,
    'no href resolves relative to the audit-dir root anymore'
  );
});

test('repo backlog page deep-link support: #node-<slug> is revealed, highlighted, and focus-pinned', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(
    html,
    /function revealFromHash\(\)/,
    'client script defines the hash-reveal handler'
  );
  assert.match(
    html,
    /location\.hash\.indexOf\('#node-'\) !== 0/,
    'handler only fires for #node-<slug> hashes'
  );
  assert.match(
    html,
    /scrollIntoView\(\{block:'center'\}\)/,
    'target node scrolls into view'
  );
  assert.match(
    html,
    /classList\.add\('hl'\)/,
    'target node gets the highlight class'
  );
  assert.match(
    html,
    /\.gnode\.hl\{outline/,
    'highlight class has a visible outline style'
  );
});

test('single-repo page renders an org backlink only when orgHref is passed', () => {
  const withLink = renderBacklogHtml(backlog, {
    orgHref: '../../../backlog/backlog.html',
  });
  assert.match(
    withLink,
    /<div class="backlink"><a href="\.\.\/\.\.\/\.\.\/backlog\/backlog\.html">← Back to org backlog<\/a><\/div>/,
    'org-mode per-repo page links back to the org backlog'
  );
  const standalone = renderBacklogHtml(backlog);
  assert.doesNotMatch(
    standalone,
    /Back to org backlog/,
    'standalone single-repo page has no org backlink'
  );
});

test('graph node tooltips are viewport-clamped: flip class, horizontal shift, and capped height', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(
    html,
    /function placeTip\(btn\)/,
    'client script defines the tooltip placement helper'
  );
  assert.match(
    html,
    /classList\.add\('above'\)/,
    'tooltip flips above the node when space below runs out'
  );
  assert.match(
    html,
    /tip\.style\.left = shift \+ 'px'/,
    'tooltip shifts horizontally to stay inside the viewport'
  );
  assert.match(
    html,
    /\.gnode>\.tipbox\.above\{top:auto;bottom:calc\(100% \+ 6px\)\}/,
    'the .above flip has matching CSS'
  );
  assert.match(
    html,
    /\.gnode>\.tipbox\{[^}]*max-height:min\(480px,70vh\);overflow-y:auto/,
    'tooltip height is capped and scrolls so it can never run off-screen'
  );
});

test('org tooltip is wide enough for the member table and lets the slug column wrap', () => {
  const html = renderBacklogHtml(orgBacklog);
  assert.match(
    html,
    /class="tipbox tipbox-org"/,
    'org node tooltip carries the wide variant class'
  );
  assert.match(
    html,
    /\.gnode>\.tipbox\.tipbox-org\{min-width:340px;max-width:min\(620px,calc\(100vw - 40px\)\)\}/,
    'wide variant widens the box but never past the viewport'
  );
  assert.doesNotMatch(
    html,
    /member-table th,\.gnode \.tipbox table\.member-table td\{[^}]*white-space:nowrap/,
    'member table cells are no longer all nowrap (the slug column may wrap instead of overflowing)'
  );
});

test('graph groups connected tickets into component boxes and separates independent tickets', () => {
  const grouped: BacklogJson = structuredClone(backlog);
  grouped.tickets.push({
    ...structuredClone(backlog.tickets[0]),
    slug: 'A003-standalone',
    seq: 3,
    temp_id: 'c',
    title: 'Standalone work',
    depends_on: [],
  });
  const html = renderBacklogHtml(grouped);
  const graph = html.slice(html.indexOf('<div id="graph">'));
  const comp = graph.slice(
    graph.indexOf('<div class="gcomps">'),
    graph.indexOf('gsingles-label')
  );
  assert.match(
    comp,
    /class="gcomp"/,
    'dependency-connected tickets render inside a component box'
  );
  assert.match(comp, /id="node-A001-adopt-ci"/, 'foundation node in the box');
  assert.match(comp, /id="node-A002-harden-ci"/, 'dependent node in the box');
  assert.doesNotMatch(
    comp,
    /id="node-A003-standalone"/,
    'independent ticket stays out of the component box'
  );
  const singles = graph.slice(graph.indexOf('gsingles-label'));
  assert.match(
    singles,
    /Independent tickets — no dependencies either way/,
    'independent section is labelled'
  );
  assert.match(
    singles,
    /class="glayer gsingles">.*id="node-A003-standalone"/s,
    'independent ticket renders in the singles grid'
  );
});

test('edges are directed: arrowhead marker at the dependent end, dot at the dependency end', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(
    html,
    /<marker id="arrow"[^>]*orient="auto-start-reverse"/,
    'arrowhead marker defined in the edge overlay'
  );
  assert.match(
    html,
    /<marker id="arrow-off"/,
    'disabled edges get a matching muted arrowhead'
  );
  assert.match(
    html,
    /marker-end="url\(#' \+ marker \+ '\)"/,
    'every edge line carries a marker-end arrowhead'
  );
  const dotDraws = (html.match(/<circle class="' \+ dot \+ '"/g) || []).length;
  assert.equal(
    dotDraws,
    1,
    'only the dependency end keeps a dot (the dependent end shows the arrow instead)'
  );
});

test('a hovered or focus-pinned tooltip lifts its stacking context above sibling graph sections', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(
    html,
    /\.gcomps:hover,\.gcomps:focus-within\{z-index:30\}/,
    'component-box area raises above the later singles grid while a tooltip is open'
  );
  assert.match(
    html,
    /\.glayer:hover,\.glayer:focus-within\{z-index:30\}/,
    'a layer raises on hover AND on focus-within (deep-link pins the tooltip via focus)'
  );
});

test('placeTip respects the sticky ribbon: flips/caps against the ribbon bottom, not the viewport top', () => {
  const html = renderBacklogHtml(backlog);
  const placeTipBody = html.slice(
    html.indexOf('function placeTip(btn){'),
    html.indexOf('function revealFromHash(){')
  );
  assert.match(
    placeTipBody,
    /querySelector\('\.ribbon'\)/,
    'available space above is measured from the sticky ribbon bottom edge'
  );
  assert.match(
    placeTipBody,
    /style\.maxHeight = Math\.max\(120, spaceAbove\)/,
    'a flipped tooltip is height-capped to the space above so it never hides under the ribbon'
  );
  assert.match(
    placeTipBody,
    /style\.maxHeight = Math\.max\(120, spaceBelow\)/,
    'a below tooltip is height-capped to the space below the node'
  );
});

test('org repos table degrades to em dashes when per-repo fields are missing (pre-upgrade backlog.json)', () => {
  const legacy = structuredClone(orgBacklog) as OrgBacklogJson;
  // Simulate an org backlog.json written before coverage/ticket_count/effort
  // existed on repo entries.
  legacy.repos = legacy.repos.map((r) => ({
    repo: r.repo,
    backlog_href: r.backlog_href,
    total_applicable_weight: r.total_applicable_weight,
  })) as typeof legacy.repos;
  const html = renderBacklogHtml(legacy);
  const repos = html.slice(html.indexOf('<section id="repos">'));
  assert.doesNotMatch(repos, /undefined/, 'no "undefined" cells');
  assert.doesNotMatch(repos, /NaN/, 'no "NaN" cells');
  assert.match(
    repos,
    /<td class="num">—<\/td><td class="num">—<\/td>/,
    'missing ticket-count and effort render as em dashes'
  );
});

test('edges redraw after web fonts load so they line up with the final layout', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(
    html,
    /document\.fonts\.ready\.then\(function\(\)\{ drawEdges\(\); \}\)/,
    'font load triggers an edge redraw (fonts reflow the nodes after first paint)'
  );
});

test('org node tooltip carries node-box info + member table, but not goal/description', () => {
  const distinctive = structuredClone(orgBacklog);
  distinctive.tickets[0].goal = 'UNIQUE_ORG_GOAL_SENTINEL';
  distinctive.tickets[0].description = 'UNIQUE_ORG_DESC_SENTINEL';
  const html = renderBacklogHtml(distinctive);
  // Scope to the rendered graph (the embedded JSON island legitimately carries
  // goal/description; the tooltip markup must not).
  const graph = html.slice(html.indexOf('<div id="graph">'));
  assert.doesNotMatch(
    graph,
    /UNIQUE_ORG_GOAL_SENTINEL/,
    'org tooltip must not repeat the goal (can differ across member repos)'
  );
  assert.doesNotMatch(
    graph,
    /UNIQUE_ORG_DESC_SENTINEL/,
    'org tooltip must not repeat the description'
  );
  assert.match(
    graph,
    /class="tip-meta">3\/8 repositories · [\d.]+ d\/dev · \+[\d.]+%/,
    'org tooltip keeps the node-box headline (repos coverage · effort · gain)'
  );
  assert.match(
    graph,
    /class="member-table"/,
    'org tooltip keeps the per-repo member table'
  );
});

test('org backlog.html shows titles, repo spread, repos table, wider warning', () => {
  const html = renderBacklogHtml(orgBacklog);
  assert.match(html, /Adopt CI everywhere/, 'org node shows the human title');
  assert.match(html, /3\/8 repositories/, 'repos coverage');
  assert.match(
    html,
    /applied once for the whole organization/,
    'org warning has the extra caveat'
  );
  assert.match(
    html,
    /Σ member recovered points/,
    'legend explains the weighted math'
  );
});

test('org repositories section is a table with per-repo coverage, tickets, and effort', () => {
  const html = renderBacklogHtml(orgBacklog);
  const repos = html.slice(html.indexOf('<section id="repos">'));
  assert.match(repos, /<table class="repos-table"/, 'repos render as a table');
  assert.match(
    repos,
    /Effort to close identified gaps/,
    'effort column is labelled as closing identified gaps, not "to 100%"'
  );
  assert.match(repos, /<th>Current coverage<\/th>/, 'coverage column present');
  assert.match(repos, /<th>Tickets<\/th>/, 'ticket-count column present');
  assert.match(repos, />50%</, 'beta coverage (0.5) rendered as a percentage');
  // applicable-weight explanation moved into an on-hover tooltip on the cov cell
  assert.match(
    repos,
    /class="tip cov-cell">32%<span class="tipbox">19 pts of standards apply to alpha/,
    'applicable weight lives in a coverage-cell tooltip, not as bare text'
  );
  assert.doesNotMatch(
    repos,
    /\(19 pts applicable\)/,
    'the bare "(N pts applicable)" text is gone'
  );
});

test('ribbon is three metric cards with the developer input inside the Duration card', () => {
  const html = renderBacklogHtml(orgBacklog);
  const cards = (html.match(/class="rb-card"/g) || []).length;
  assert.equal(
    cards,
    3,
    'exactly three ribbon cards (Effort, Coverage gain, Duration)'
  );
  // The devs input lives in the last (Duration) card: after the duration meter,
  // before the enable-all reset button that follows all three cards.
  const iDuration = html.indexOf('id="rb-duration"');
  const iDevs = html.indexOf('id="devs"');
  const iEnableAll = html.indexOf('id="enable-all"');
  assert.ok(
    iDuration !== -1 && iDevs > iDuration && iDevs < iEnableAll,
    'the Number of developers input is inside the Duration card (after the duration meter, before enable-all)'
  );
  assert.match(
    html,
    /class="rb-devs tip">Developers<input[^>]*><span class="tipbox" id="rb-devs-tip">/,
    'the Developers control carries the scaling-caveat tooltip'
  );
});

test('legend is structured: interaction bullets + a field/description/formula table', () => {
  const org = renderBacklogHtml(orgBacklog);
  assert.match(
    org,
    /<details class="legend"/,
    'legend is still a details block'
  );
  assert.match(org, /class="legend-table"/, 'legend carries a table');
  assert.match(
    org,
    /<th>Field<\/th><th>Description<\/th><th>Formula<\/th>/,
    'table columns'
  );
  assert.match(
    org,
    /<td>effort<\/td>.*Σ member efforts/s,
    'effort formula row'
  );
  assert.match(
    org,
    /<li>.*Foundation tickets.*sit at the top/s,
    'interaction bullet'
  );

  const single = renderBacklogHtml(backlog);
  assert.match(
    single,
    /class="legend-table"/,
    'single-repo legend also structured'
  );
  assert.match(
    single,
    /<td>coverage Δ<\/td>.*Σ recovered points ÷ total applicable weight/s,
    'single coverage formula'
  );
});

test('graph orientation: foundation (depended-upon) nodes render above their dependents in both variants', () => {
  // single-repo: A001 (no deps) is depended on by A002 → A001 must be earlier in the graph DOM
  const single = renderBacklogHtml(backlog);
  const sg = single.slice(single.indexOf('<div id="graph">'));
  assert.ok(
    sg.indexOf('id="node-A001-adopt-ci"') <
      sg.indexOf('id="node-A002-harden-ci"'),
    'single-repo foundation node renders above its dependent'
  );

  // org: give org-ci a dependent and confirm org-ci renders first (top)
  const withDep = structuredClone(orgBacklog);
  withDep.tickets.push({
    ...structuredClone(orgBacklog.tickets[0]),
    id: 'org-followup',
    title: 'Follow-up work',
    depends_on: ['org-ci'],
  });
  const org = renderBacklogHtml(withDep);
  const og = org.slice(org.indexOf('<div id="graph">'));
  assert.ok(
    og.indexOf('id="node-org-ci"') < og.indexOf('id="node-org-followup"'),
    'org foundation node renders above its dependent'
  );
});

test('graph edges carry endpoint markers and the click handler blurs the node', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(
    html,
    /class="' \+ dot \+ '"/,
    'edge endpoints drawn as circle markers'
  );
  assert.match(html, /<circle class="/, 'circle endpoint template present');
  assert.match(
    html,
    /toggle\(btn\.dataset\.slug\); if\(e\.detail > 0 && btn\.blur\)\{ btn\.blur\(\); \}/,
    'a pointer click (e.detail > 0) blurs the node so the hover tooltip does not stay pinned, while keyboard activation (Enter/Space, detail 0) keeps focus so keyboard users do not lose their tab position'
  );
});

test('disabled nodes get a distinct background, member table and node tooltips are styled for the dark tipbox and lifted above siblings', () => {
  const html = renderBacklogHtml(orgBacklog);
  assert.match(
    html,
    /\.gnode\.off\{background:#ECEAE6/,
    'disabled node has a distinct background colour'
  );
  assert.match(
    html,
    /\.gnode \.tipbox table\.member-table th,\.gnode \.tipbox table\.member-table td\{[^}]*color:var\(--eyebrow-band\)/,
    'member table text is light for the dark tooltip'
  );
  assert.match(
    html,
    /\.gnode>\.tipbox\{[^}]*z-index:200/,
    'node tooltip is lifted above other nodes'
  );
  assert.match(html, /-webkit-line-clamp:3/, 'node titles clamp to 3 lines');
});
