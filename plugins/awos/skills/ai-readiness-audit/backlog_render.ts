/**
 * backlog_render.ts — Jira-style per-ticket markdown renderer plus the
 * interactive `backlog.html` effort-profit graph.
 *
 * Pure string building from an already-validated BacklogJson/BacklogTicket
 * (see backlog.ts). No I/O — the caller decides where each ticket's file
 * lands (one file per ticket, named `<slug>.md`, siblings so dependency
 * links resolve relative to the same directory).
 */
import type {
  BacklogJson,
  BacklogTicket,
  OrgBacklogJson,
  OrgBacklogTicket,
} from './backlog.ts';
import { REPORT_CSS, esc } from './render.ts';
import { PROVECTUS_LOGO_SVG } from './logo.ts';

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

// ---------------------------------------------------------------------------
// Interactive backlog.html — effort-profit dependency graph
// ---------------------------------------------------------------------------

/** Round to at most one decimal and drop a trailing ".0". */
function fmtDays(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

/**
 * Topological depth per ticket: 0 when it has no dependencies, else one more
 * than the deepest dependency. Tickets arrive topo-sorted (see backlog.ts), so
 * every dependency's depth is already known on a single forward pass.
 *
 * Layer 0 (foundation tickets — the ones others depend on) is emitted first, so
 * it renders at the TOP of the graph, with dependents in deeper layers below.
 */
function layerTickets(backlog: BacklogJson): BacklogTicket[][] {
  const depth = new Map<string, number>();
  for (const t of backlog.tickets) {
    const d =
      t.depends_on.length === 0
        ? 0
        : 1 + Math.max(...t.depends_on.map((s) => depth.get(s) ?? 0));
    depth.set(t.slug, d);
  }
  const maxDepth = Math.max(0, ...depth.values());
  const layers: BacklogTicket[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push(backlog.tickets.filter((t) => (depth.get(t.slug) ?? 0) === d));
  }
  return layers;
}

/** The hover tooltip body for a graph node: full ticket detail, all escaped. */
function nodeTip(ticket: BacklogTicket): string {
  const dod = ticket.definition_of_done.map((d) => esc(d)).join('; ') || '—';
  const deps =
    ticket.depends_on.length > 0
      ? ticket.depends_on.map((s) => esc(s)).join(', ')
      : '—';
  const checks = ticket.checks
    .map(
      (c) =>
        `${esc(c.check_id)} (${esc(c.dimension)}, ${Math.round(c.share * 100)}%)`
    )
    .join(', ');
  return `<span class="tipbox">\
<b>${esc(ticket.title)}</b>\
<span class="tip-goal"><em>Goal:</em> ${esc(ticket.goal)}</span>\
<span class="tip-desc">${esc(ticket.description)}</span>\
<span class="tip-dod"><em>Definition of done:</em> ${dod}</span>\
<span class="tip-deps"><em>Depends on:</em> ${deps}</span>\
<span class="tip-checks"><em>Checks:</em> ${checks}</span>\
</span>`;
}

/** One clickable graph node — slug · effort · coverage delta + hover detail. */
function renderNode(ticket: BacklogTicket): string {
  const covPct = (ticket.coverage_delta * 100).toFixed(1);
  return `<button class="gnode tip" data-slug="${esc(ticket.slug)}" id="node-${esc(ticket.slug)}">\
<span class="gnode-slug">${esc(ticket.slug)}</span>\
<span class="gnode-meta">${fmtDays(ticket.effort_dev_days)} d/dev · +${covPct}%</span>\
${nodeTip(ticket)}\
</button>`;
}

/** Backlog-only CSS, layered on top of the shared REPORT_CSS. */
const BACKLOG_CSS = `
/* ── backlog: ribbon (three centered metric cards) ───────────────────────── */
.ribbon{position:sticky;top:0;z-index:50;background:var(--ink-900);padding:16px 32px;box-shadow:var(--shadow-md);display:flex;flex-direction:column;align-items:center;gap:14px}
.rb-cards{display:flex;flex-wrap:wrap;justify-content:center;align-items:stretch;gap:14px}
.rb-card{background:var(--ink-800);border-radius:8px;padding:12px 22px;min-width:150px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center}
.rb-card .rb-meter{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px}
.rb-label{font-family:var(--font-mono);font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--label-band)}
.rb-num{display:flex;align-items:baseline;gap:5px}
.rb-val{font-size:30px;font-weight:700;line-height:1.05;color:var(--stat-number);letter-spacing:-.01em}
.rb-unit{font-size:12px;color:var(--stat-caption)}
.rb-devs{display:flex;align-items:center;gap:8px;margin-top:4px;font-family:var(--font-mono);font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--label-band)}
.rb-devs input[type=number]{width:58px;padding:5px 8px;border:1px solid var(--ink-700);border-radius:6px;background:var(--ink-900);color:#fff;font-family:var(--font-mono);font-size:13px;text-align:center}
.ribbon .tipbox{background:var(--ink-950);border:1px solid var(--ink-700)}
.ribbon button#enable-all{font-family:var(--font-sans);padding:7px 16px;border:1px solid var(--indigo);border-radius:8px;background:var(--indigo);color:#fff;cursor:pointer;font-size:13px;font-weight:600}
.ribbon button#enable-all:hover{filter:brightness(1.08)}
.ribbon-warning{background:#F3C3B5;color:var(--ink-950);font-size:12.5px;padding:9px 32px;line-height:1.5;border-bottom:1px solid var(--divider)}
.ribbon-warning strong{font-weight:700}
/* ── backlog: legend (bullets + field/description/formula table) ──────────── */
.legend{background:var(--cream);border:1px solid var(--divider);border-radius:12px;padding:12px 18px;margin:22px 0}
.legend summary{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-400);font-weight:600;cursor:pointer}
.legend .legend-body{font-size:13px;color:var(--charcoal-700);margin-top:12px}
.legend ul{margin:0 0 14px;padding-left:20px}
.legend li{margin:4px 0}
.legend code{font-family:var(--font-mono);font-size:12px;background:#fff;border:1px solid var(--divider);border-radius:4px;padding:1px 5px}
table.legend-table{border-collapse:collapse;width:100%;font-size:12.5px}
table.legend-table th,table.legend-table td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--divider);vertical-align:top}
table.legend-table th{font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-300)}
table.legend-table td:first-child{font-family:var(--font-mono);color:var(--ink-700);white-space:nowrap}
table.legend-table td.formula{font-family:var(--font-mono);color:var(--ink-400)}
/* ── backlog: graph ──────────────────────────────────────────────────────── */
#graph{position:relative;padding:16px 0 48px}
#edges{position:absolute;top:0;left:0;z-index:0;pointer-events:none;overflow:visible}
#edges .edge{stroke:var(--sage-400);stroke-width:1.6}
#edges .edge.off{stroke:#D9C3BC;stroke-dasharray:4 4}
#edges .edot{fill:var(--sage-400)}
#edges .edot.off{fill:#D9C3BC}
.glayer{position:relative;z-index:1;display:flex;flex-wrap:wrap;justify-content:center;gap:20px;margin-bottom:52px}
.glayer:last-child{margin-bottom:0}
.glayer:hover{z-index:30}
.gnode{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:190px;text-align:left;background:#fff;border:1px solid var(--divider);border-left:4px solid var(--sage-400);border-radius:10px;box-shadow:var(--shadow-sm);padding:12px 14px;cursor:pointer;font-family:var(--font-sans)}
.gnode:hover{box-shadow:var(--shadow-md);z-index:40}
.gnode .gnode-slug{font-family:var(--font-mono);font-size:12.5px;font-weight:600;color:var(--ink-900);line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden}
.gnode .gnode-meta{font-size:11.5px;color:var(--ink-400);line-height:1.35}
.gnode.off{background:#ECEAE6;border-left-color:var(--ink-300);opacity:.78}
.gnode.off .gnode-slug{text-decoration:line-through;color:var(--ink-400)}
/* hover-only tooltips for graph nodes: blur-after-click (see BACKLOG_JS) drops
   focus so a clicked node never pins its tipbox; z-index lifts it over siblings. */
.gnode>.tipbox{left:0;top:calc(100% + 6px);min-width:280px;max-width:360px;z-index:200}
.gnode:not(:hover):not(:focus)>.tipbox{display:none}
.gnode .tipbox em{color:var(--label-band);font-style:normal;font-weight:600}
.gnode .tip-goal,.gnode .tip-desc,.gnode .tip-dod,.gnode .tip-deps,.gnode .tip-checks,.gnode .tip-meta{display:block;margin-top:5px}
/* ── backlog: org member table inside the dark tooltip ───────────────────── */
.gnode .tipbox table.member-table{margin-top:10px;border-collapse:collapse;width:100%;font-size:11.5px}
.gnode .tipbox table.member-table th,.gnode .tipbox table.member-table td{padding:4px 8px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--ink-700);color:var(--eyebrow-band)}
.gnode .tipbox table.member-table th{color:var(--label-band);font-weight:600;font-family:var(--font-mono);text-transform:uppercase;font-size:9.5px;letter-spacing:.05em}
.gnode .tipbox table.member-table a{color:var(--sage-200);text-decoration:underline}
.gnode .tipbox table.member-table tr:last-child td{border-bottom:none}
/* ── backlog: org repositories table ─────────────────────────────────────── */
#repos{margin-top:36px;padding-top:20px;border-top:1px solid var(--divider)}
#repos h2{font-size:15px;margin:0 0 12px}
table.repos-table{border-collapse:collapse;width:100%;font-size:13px}
table.repos-table th{font-family:var(--font-mono);font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-300);text-align:left;padding:9px 12px;border-bottom:1px solid var(--divider)}
table.repos-table td{padding:9px 12px;border-bottom:1px solid var(--divider);color:var(--charcoal-700)}
table.repos-table td.num{text-align:right;font-family:var(--font-mono)}
table.repos-table a.repo-link{color:var(--sage-600);font-weight:600}
table.repos-table .cov-cell{border-bottom:1px dotted var(--ink-300)}
@media (max-width:720px){.ribbon,.ribbon-warning{padding-left:20px;padding-right:20px}.rb-cards{gap:10px}table.repos-table{font-size:12px}}
`;

/**
 * Client-side behaviour. Written without JS template literals or `${...}` so
 * it survives verbatim inside the outer TS template literal. Drives everything
 * from the embedded backlog JSON: disable-cascade, ribbon recompute (Amdahl
 * speedup), and the SVG edge overlay laid out from getBoundingClientRect().
 */
const BACKLOG_JS = `
(function(){
  var data = JSON.parse(document.getElementById('backlog-data').textContent);
  var P = data.parallelizable_share;
  var tickets = data.tickets;
  var dependents = {};
  tickets.forEach(function(t){
    (t.depends_on || []).forEach(function(dep){
      (dependents[dep] = dependents[dep] || []).push(t.slug);
    });
  });
  var disabled = {};
  var devs = document.getElementById('devs');
  var graph = document.getElementById('graph');
  var svg = document.getElementById('edges');

  function transitiveDependents(slug){
    var out = [], stack = (dependents[slug] || []).slice();
    while(stack.length){
      var s = stack.pop();
      if(out.indexOf(s) < 0){
        out.push(s);
        (dependents[s] || []).forEach(function(d){ stack.push(d); });
      }
    }
    return out;
  }
  function fmtDays(x){ return (Math.round(x * 10) / 10).toString(); }
  function recompute(){
    var n = Math.max(1, parseInt(devs.value, 10) || 1);
    var effort = 0, coverage = 0, recovered = 0;
    tickets.forEach(function(t){
      if(!disabled[t.slug]){ effort += t.effort_dev_days; coverage += t.coverage_delta; recovered += t.missing_weight_recovered; }
    });
    var speedup = 1 / ((1 - P) + P / n);
    var duration = effort / speedup;
    document.getElementById('rb-effort').textContent = fmtDays(effort);
    document.getElementById('rb-duration').textContent = duration.toFixed(1);
    document.getElementById('rb-coverage').textContent = '+' + (coverage * 100).toFixed(1) + '%';
    document.getElementById('rb-effort-tip').textContent =
      'Σ effort of enabled tickets = ' + fmtDays(effort) + ' d/dev';
    document.getElementById('rb-duration-tip').textContent =
      'duration = effort ÷ speedup(n); speedup(n) = 1/((1−' + P + ')+' + P + '/n); at n=' + n + ' → ' + duration.toFixed(1) + ' cal-days';
    document.getElementById('rb-coverage-tip').textContent =
      'Σ coverage_delta of enabled tickets = ' + recovered.toFixed(1) + ' ÷ ' + data.total_applicable_weight + ' applicable weight = +' + (coverage * 100).toFixed(1) + '%';
  }
  function applyDisabled(){
    tickets.forEach(function(t){
      var el = document.getElementById('node-' + t.slug);
      if(el){ el.classList.toggle('off', !!disabled[t.slug]); }
    });
  }
  function toggle(slug){
    if(disabled[slug]){
      delete disabled[slug];
    } else {
      disabled[slug] = true;
      transitiveDependents(slug).forEach(function(d){ disabled[d] = true; });
    }
    applyDisabled(); recompute(); drawEdges();
  }
  function drawEdges(){
    var gb = graph.getBoundingClientRect();
    svg.setAttribute('width', gb.width);
    svg.setAttribute('height', gb.height);
    svg.setAttribute('viewBox', '0 0 ' + gb.width + ' ' + gb.height);
    var lines = '';
    tickets.forEach(function(t){
      var to = document.getElementById('node-' + t.slug);
      if(!to){ return; }
      var tb = to.getBoundingClientRect();
      (t.depends_on || []).forEach(function(dep){
        var from = document.getElementById('node-' + dep);
        if(!from){ return; }
        var fb = from.getBoundingClientRect();
        // bottom-center of the upper (dependency) node → top-center of the lower (dependent) node
        var x1 = fb.left + fb.width / 2 - gb.left, y1 = fb.bottom - gb.top;
        var x2 = tb.left + tb.width / 2 - gb.left, y2 = tb.top - gb.top;
        var off = (disabled[t.slug] || disabled[dep]);
        var cls = off ? 'edge off' : 'edge';
        var dot = off ? 'edot off' : 'edot';
        lines += '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"></line>';
        lines += '<circle class="' + dot + '" cx="' + x1 + '" cy="' + y1 + '" r="3.5"></circle>';
        lines += '<circle class="' + dot + '" cx="' + x2 + '" cy="' + y2 + '" r="3.5"></circle>';
      });
    });
    svg.innerHTML = lines;
  }
  graph.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.gnode') : null;
    if(btn && btn.dataset.slug){ toggle(btn.dataset.slug); if(btn.blur){ btn.blur(); } }
  });
  devs.addEventListener('input', recompute);
  document.getElementById('enable-all').addEventListener('click', function(){
    disabled = {}; applyDisabled(); recompute(); drawEdges();
  });
  window.addEventListener('resize', drawEdges);
  applyDisabled(); recompute();
  if(window.requestAnimationFrame){ requestAnimationFrame(drawEdges); } else { drawEdges(); }
})();
`;

// ---------------------------------------------------------------------------
// Shared page chrome
// ---------------------------------------------------------------------------

function pageHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>${REPORT_CSS}${BACKLOG_CSS}</style>
</head>`;
}

/**
 * The sticky ribbon: three centered metric cards (Effort, Coverage gain,
 * Duration), the developer-count input nested inside the Duration card because
 * it drives duration, the enable-all reset button, and live hover tooltips
 * whose text `recompute()` keeps in sync.
 */
function renderRibbon(
  effortAll: number,
  coverageAll: number,
  recoveredAll: number,
  totalApplicableWeight: number,
  P: number
): string {
  const durationAll = effortAll; // speedup(1) = 1, so duration at n=1 equals effort
  const speedupFormula = `1/((1−${P})+${P}/n)`;
  return `<div class="ribbon">
  <div class="rb-cards">
    <div class="rb-card">
      <span class="rb-meter tip">
        <span class="rb-label">Effort</span>
        <span class="rb-num"><span id="rb-effort" class="rb-val">${fmtDays(effortAll)}</span><span class="rb-unit">d/dev</span></span>
        <span class="tipbox" id="rb-effort-tip">Σ effort of enabled tickets = ${fmtDays(effortAll)} d/dev</span>
      </span>
    </div>
    <div class="rb-card">
      <span class="rb-meter tip">
        <span class="rb-label">Coverage gain</span>
        <span class="rb-num"><span id="rb-coverage" class="rb-val">+${coverageAll.toFixed(1)}%</span></span>
        <span class="tipbox" id="rb-coverage-tip">Σ coverage_delta of enabled tickets = ${recoveredAll.toFixed(1)} ÷ ${totalApplicableWeight} applicable weight = +${coverageAll.toFixed(1)}%</span>
      </span>
    </div>
    <div class="rb-card">
      <span class="rb-meter tip">
        <span class="rb-label">Duration</span>
        <span class="rb-num"><span id="rb-duration" class="rb-val">${durationAll.toFixed(1)}</span><span class="rb-unit">cal-days</span></span>
        <span class="tipbox" id="rb-duration-tip">duration = effort ÷ speedup(n); speedup(n) = ${speedupFormula}; at n=1 → ${durationAll.toFixed(1)} cal-days</span>
      </span>
      <label class="rb-devs">Developers<input type="number" id="devs" min="1" value="1"></label>
    </div>
  </div>
  <button id="enable-all">Enable all nodes</button>
</div>`;
}

/** The always-visible sublinear-scaling caveat under the ribbon. */
function renderWarning(P: number, org: boolean): string {
  const orgExtra = org
    ? ' Some tasks are applied once for the whole organization — their effort is not multiplied per repository, so totals are rough.'
    : '';
  return `<div class="ribbon-warning">
  <strong>Adding developers shortens delivery sublinearly.</strong> Communication and coordination overhead grow with team size, and part of this work is inherently sequential (dependencies must land in order). Duration therefore follows Amdahl's law with a parallelizable share of ${P}, not a straight division by head-count.${orgExtra}
</div>`;
}

/** Hardcoded legend for the single-repo backlog. */
const LEGEND_SINGLE = `<details class="legend">
<summary>Legend</summary>
<div class="legend-body">
<ul>
<li><strong>Layers run top to bottom by dependency depth.</strong> Foundation tickets — the ones others depend on — sit at the top; each edge drops from a ticket to the ones that depend on it.</li>
<li><strong>Hover</strong> a node for its full detail: goal, description, definition of done, dependencies, and covered checks.</li>
<li><strong>Click</strong> a node to disable it; every ticket that transitively depends on it is disabled too. Re-enabling a node leaves its dependents disabled until you re-enable them or press <strong>Enable all nodes</strong>.</li>
<li>The ribbon totals reflect only the enabled tickets.</li>
</ul>
<table class="legend-table">
<thead><tr><th>Field</th><th>Description</th><th>Formula</th></tr></thead>
<tbody>
<tr><td>slug</td><td>Ticket identifier shown on the node</td><td class="formula">A&lt;seq&gt;-&lt;kebab(title)&gt;, seq in topological order</td></tr>
<tr><td>effort</td><td>Estimated developer-days for the ticket</td><td class="formula">author estimate</td></tr>
<tr><td>coverage Δ</td><td>Standards coverage this ticket adds</td><td class="formula">Σ recovered points ÷ total applicable weight</td></tr>
</tbody>
</table>
</div>
</details>`;

/** Hardcoded legend for the org backlog. */
const LEGEND_ORG = `<details class="legend">
<summary>Legend</summary>
<div class="legend-body">
<ul>
<li><strong>Layers run top to bottom by dependency depth.</strong> Foundation tickets — the ones others depend on — sit at the top; each edge drops from a ticket to the ones that depend on it.</li>
<li><strong>Hover</strong> a node for its per-repo table of member tickets, each linking to that repo's ticket file.</li>
<li><strong>Click</strong> a node to disable it (and everything that depends on it); use <strong>Enable all nodes</strong> to reset. The ribbon totals reflect only the enabled tickets.</li>
<li>Some tickets are applied once for the whole organization, so their effort is not multiplied per repository — portfolio totals are approximate.</li>
</ul>
<table class="legend-table">
<thead><tr><th>Field</th><th>Description</th><th>Formula</th></tr></thead>
<tbody>
<tr><td>effort</td><td>Total dev-days across repos</td><td class="formula">Σ member efforts</td></tr>
<tr><td>coverage gain</td><td>Portfolio standards coverage this ticket adds</td><td class="formula">Σ member recovered points ÷ Σ all repos' applicable weight</td></tr>
<tr><td>repositories</td><td>How many of the portfolio's repos the ticket touches</td><td class="formula">distinct member repos ÷ total repos</td></tr>
</tbody>
</table>
</div>
</details>`;

// ---------------------------------------------------------------------------
// Interactive backlog.html — org variant
// ---------------------------------------------------------------------------

/** Topological depth per org ticket, same rule as `layerTickets` but keyed by id. */
function layerOrgTickets(backlog: OrgBacklogJson): OrgBacklogTicket[][] {
  const depth = new Map<string, number>();
  for (const t of backlog.tickets) {
    const d =
      t.depends_on.length === 0
        ? 0
        : 1 + Math.max(...t.depends_on.map((id) => depth.get(id) ?? 0));
    depth.set(t.id, d);
  }
  const maxDepth = Math.max(0, ...depth.values());
  const layers: OrgBacklogTicket[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push(backlog.tickets.filter((t) => (depth.get(t.id) ?? 0) === d));
  }
  return layers;
}

/**
 * The org node tooltip: exactly the node-box info (title, repos coverage,
 * effort, coverage gain) plus the per-member table with links. It deliberately
 * omits goal/description, which can differ across a ticket's member repos and
 * confuses at the org level. Member `ticket_href`s are stored relative to the
 * audit-dir root; the org page lives one level deeper (`<auditDir>/backlog/`),
 * so they are prefixed with `../` here.
 */
function orgNodeTip(ticket: OrgBacklogTicket, totalRepos: number): string {
  const covPct = (ticket.coverage_delta * 100).toFixed(1);
  const memberRows = ticket.members
    .map((m) => {
      const mCovPct = (m.coverage_delta * 100).toFixed(1);
      return `<tr><td>${esc(m.repo)}</td><td><a href="${esc('../' + m.ticket_href)}">${esc(m.slug)}</a></td><td>${fmtDays(m.effort_dev_days)} d/dev</td><td>+${mCovPct}%</td></tr>`;
    })
    .join('');
  return `<span class="tipbox">\
<b>${esc(ticket.title)}</b>\
<span class="tip-meta">${ticket.repos_covered}/${totalRepos} repositories · ${fmtDays(ticket.effort_dev_days)} d/dev · +${covPct}%</span>\
<table class="member-table">\
<thead><tr><th>Repo</th><th>Ticket</th><th>Effort</th><th>Coverage Δ</th></tr></thead>\
<tbody>${memberRows}</tbody>\
</table>\
</span>`;
}

/** One clickable graph node — title · N/M repositories · effort · coverage delta. */
function renderOrgNode(ticket: OrgBacklogTicket, totalRepos: number): string {
  const covPct = (ticket.coverage_delta * 100).toFixed(1);
  return `<button class="gnode tip" data-slug="${esc(ticket.id)}" id="node-${esc(ticket.id)}">\
<span class="gnode-slug">${esc(ticket.title)}</span>\
<span class="gnode-meta">${ticket.repos_covered}/${totalRepos} repositories · ${fmtDays(ticket.effort_dev_days)} d/dev · +${covPct}%</span>\
${orgNodeTip(ticket, totalRepos)}\
</button>`;
}

/**
 * The bottom repositories table: one row per repo with a linked name (when it
 * has a generated backlog), its current coverage (with the applicable-weight
 * explanation on hover), ticket count, and the effort to close its identified
 * gaps. Member `backlog_href`s are stored relative to the audit-dir root and
 * prefixed with `../` because the org page lives in `<auditDir>/backlog/`.
 */
function renderReposTable(backlog: OrgBacklogJson): string {
  const rows = backlog.repos
    .map((r) => {
      const name = r.backlog_href
        ? `<a class="repo-link" href="${esc('../' + r.backlog_href)}">${esc(r.repo)}</a>`
        : esc(r.repo);
      const covPct =
        r.coverage != null ? `${(r.coverage * 100).toFixed(0)}%` : '—';
      const covCell = `<span class="tip cov-cell">${covPct}<span class="tipbox">${r.total_applicable_weight} pts of standards apply to ${esc(r.repo)}; current coverage is the share already in place.</span></span>`;
      return `<tr><td>${name}</td><td class="num">${covCell}</td><td class="num">${r.ticket_count}</td><td class="num">${fmtDays(r.effort_dev_days)} d/dev</td></tr>`;
    })
    .join('');
  return `<section id="repos">
<h2>Repositories</h2>
<table class="repos-table">
<thead><tr><th>Repository</th><th>Current coverage</th><th>Tickets</th><th>Effort to close identified gaps</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * Render the org backlog: same ribbon/graph/toggle mechanics as the
 * single-repo page (the client script keys off a `slug` field, so each
 * embedded ticket carries `slug: id` purely for that reuse), with nodes
 * showing the org ticket's human title and repo spread, a per-member numbers
 * table in the tooltip, and a bottom repositories table.
 */
function renderOrgBacklogHtml(backlog: OrgBacklogJson): string {
  const P = backlog.parallelizable_share;
  const effortAll = backlog.tickets.reduce((s, t) => s + t.effort_dev_days, 0);
  const recoveredAll = backlog.tickets.reduce(
    (s, t) => s + t.missing_weight_recovered,
    0
  );
  const coverageAll =
    backlog.tickets.reduce((s, t) => s + t.coverage_delta, 0) * 100;

  const layers = layerOrgTickets(backlog);
  const graphLayers = layers
    .map(
      (layer) =>
        `<div class="glayer">${layer.map((t) => renderOrgNode(t, backlog.total_repos)).join('')}</div>`
    )
    .join('\n');

  // The client script (BACKLOG_JS) keys nodes/edges/disable-state off `slug`;
  // org tickets have no slug, so alias `id` as `slug` in the embedded copy
  // only — OrgBacklogJson itself (and the object returned to callers) never
  // gains this field.
  const embeddedTickets = backlog.tickets.map((t) => ({ ...t, slug: t.id }));
  const embeddedJson = JSON.stringify({
    ...backlog,
    tickets: embeddedTickets,
  }).replaceAll('</', '<\\/');

  return `${pageHead(`Improvement Backlog — ${esc(backlog.project)} — ${esc(backlog.date)}`)}
<body>
<script type="application/json" id="backlog-data">${embeddedJson}</script>
<header class="brand">
<div class="container brand-inner">
<span class="brand-logo">${PROVECTUS_LOGO_SVG}</span>
<div class="brand-title">
  <h1>Improvement Backlog</h1>
  <span class="brand-kicker">Agentic SDLC · Org Effort-Profit Plan</span>
</div>
<div class="meta">
  <span><strong>Date:</strong> ${esc(backlog.date)}</span>
  <span><strong>Project:</strong> ${esc(backlog.project)}</span>
  <span><strong>Repositories:</strong> ${backlog.total_repos}</span>
  <span><strong>Tickets:</strong> ${backlog.tickets.length}</span>
</div>
</div>
</header>

${renderRibbon(effortAll, coverageAll, recoveredAll, backlog.total_applicable_weight, P)}
${renderWarning(P, true)}

<main class="container">
${LEGEND_ORG}

<div id="graph">
<svg id="edges" xmlns="http://www.w3.org/2000/svg"></svg>
${graphLayers}
</div>

${renderReposTable(backlog)}
</main>
<script>${BACKLOG_JS}</script>
</body>
</html>`;
}

/**
 * Render the single-repo backlog as a self-contained interactive HTML page: a
 * sticky ribbon that recomputes team effort/duration/coverage under Amdahl
 * scaling, and an effort-profit dependency graph whose nodes toggle a
 * transitive-dependent disable-cascade. Everything is inlined except the same
 * Google Fonts <link>s report.html uses. Org backlogs (`backlog.org === true`)
 * dispatch to `renderOrgBacklogHtml` instead.
 */
function isOrgBacklog(
  backlog: BacklogJson | OrgBacklogJson
): backlog is OrgBacklogJson {
  return (backlog as OrgBacklogJson).org === true;
}

export function renderBacklogHtml(
  backlog: BacklogJson | OrgBacklogJson
): string {
  if (isOrgBacklog(backlog)) {
    return renderOrgBacklogHtml(backlog);
  }
  const P = backlog.parallelizable_share;
  const effortAll = backlog.tickets.reduce((s, t) => s + t.effort_dev_days, 0);
  const recoveredAll = backlog.tickets.reduce(
    (s, t) => s + t.missing_weight_recovered,
    0
  );
  const coverageAll =
    backlog.tickets.reduce((s, t) => s + t.coverage_delta, 0) * 100;

  const layers = layerTickets(backlog);
  const graphLayers = layers
    .map(
      (layer) => `<div class="glayer">${layer.map(renderNode).join('')}</div>`
    )
    .join('\n');

  const embeddedJson = JSON.stringify(backlog).replaceAll('</', '<\\/');

  return `${pageHead(`Improvement Backlog — ${esc(backlog.project)} — ${esc(backlog.date)}`)}
<body>
<script type="application/json" id="backlog-data">${embeddedJson}</script>
<header class="brand">
<div class="container brand-inner">
<span class="brand-logo">${PROVECTUS_LOGO_SVG}</span>
<div class="brand-title">
  <h1>Improvement Backlog</h1>
  <span class="brand-kicker">Agentic SDLC · Effort-Profit Plan</span>
</div>
<div class="meta">
  <span><strong>Date:</strong> ${esc(backlog.date)}</span>
  <span><strong>Project:</strong> ${esc(backlog.project)}</span>
  <span><strong>Tickets:</strong> ${backlog.tickets.length}</span>
</div>
</div>
</header>

${renderRibbon(effortAll, coverageAll, recoveredAll, backlog.total_applicable_weight, P)}
${renderWarning(P, false)}

<main class="container">
${LEGEND_SINGLE}

<div id="graph">
<svg id="edges" xmlns="http://www.w3.org/2000/svg"></svg>
${graphLayers}
</div>
</main>
<script>${BACKLOG_JS}</script>
</body>
</html>`;
}
