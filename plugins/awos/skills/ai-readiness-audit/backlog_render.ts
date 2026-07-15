/**
 * backlog_render.ts — Jira-style per-ticket markdown renderer plus the
 * interactive `backlog.html` effort-profit graph.
 *
 * Pure string building from an already-validated BacklogJson/BacklogTicket
 * (see backlog.ts). No I/O — the caller decides where each ticket's file
 * lands (one file per ticket, named `<slug>.md`, siblings so dependency
 * links resolve relative to the same directory).
 */
import type { BacklogJson, BacklogTicket } from './backlog.ts';
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
/* ── backlog: ribbon ─────────────────────────────────────────────────────── */
.ribbon{position:sticky;top:0;z-index:50;background:var(--ink-900);color:var(--stat-number);display:flex;flex-wrap:wrap;align-items:center;gap:14px 26px;padding:16px 32px;box-shadow:var(--shadow-md)}
.ribbon label{display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--label-band)}
.ribbon input[type=number]{width:64px;padding:5px 8px;border:1px solid var(--ink-700);border-radius:6px;background:var(--ink-800);color:#fff;font-family:var(--font-mono);font-size:13px}
.ribbon .rb-stat{display:inline-flex;align-items:baseline;gap:7px;font-size:13px;color:var(--stat-caption);border-bottom-color:rgba(176,212,236,.5)}
.ribbon .rb-label{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--label-band)}
.ribbon .rb-val{font-size:17px;font-weight:700;color:var(--stat-number)}
.ribbon .rb-unit{font-size:12px;color:var(--stat-caption)}
.ribbon .tipbox{background:var(--ink-950);border:1px solid var(--ink-700)}
.ribbon button#enable-all{margin-left:auto;font-family:var(--font-sans);padding:7px 16px;border:1px solid var(--indigo);border-radius:8px;background:var(--indigo);color:#fff;cursor:pointer;font-size:13px;font-weight:600}
.ribbon button#enable-all:hover{filter:brightness(1.08)}
.ribbon-warning{background:#F3C3B5;color:var(--ink-950);font-size:12.5px;padding:9px 32px;line-height:1.5;border-bottom:1px solid var(--divider)}
.ribbon-warning strong{font-weight:700}
/* ── backlog: legend ─────────────────────────────────────────────────────── */
.legend{background:var(--cream);border:1px solid var(--divider);border-radius:12px;padding:12px 18px;margin:22px 0}
.legend summary{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-400);font-weight:600}
.legend .legend-body{font-size:13px;color:var(--charcoal-700);margin-top:10px}
.legend code{font-family:var(--font-mono);font-size:12px;background:#fff;border:1px solid var(--divider);border-radius:4px;padding:1px 5px}
/* ── backlog: graph ──────────────────────────────────────────────────────── */
#graph{position:relative;padding:16px 0 48px}
#edges{position:absolute;top:0;left:0;z-index:0;pointer-events:none;overflow:visible}
#edges .edge{stroke:var(--sage-400);stroke-width:1.6}
#edges .edge.off{stroke:#D9C3BC;stroke-dasharray:4 4}
.glayer{position:relative;z-index:1;display:flex;flex-wrap:wrap;justify-content:center;gap:20px;margin-bottom:52px}
.glayer:last-child{margin-bottom:0}
.gnode{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:160px;text-align:left;background:#fff;border:1px solid var(--divider);border-left:4px solid var(--sage-400);border-radius:10px;box-shadow:var(--shadow-sm);padding:12px 14px;cursor:pointer;font-family:var(--font-sans)}
.gnode:hover{box-shadow:var(--shadow-md)}
.gnode .gnode-slug{font-family:var(--font-mono);font-size:12.5px;font-weight:600;color:var(--ink-900)}
.gnode .gnode-meta{font-size:12px;color:var(--ink-400)}
.gnode.off{opacity:.42;border-left-color:var(--ink-300);filter:grayscale(.5)}
.gnode.off .gnode-slug{text-decoration:line-through}
.gnode>.tipbox{left:0;top:calc(100% + 6px);max-width:360px}
.gnode .tipbox em{color:var(--label-band);font-style:normal;font-weight:600}
.gnode .tip-goal,.gnode .tip-desc,.gnode .tip-dod,.gnode .tip-deps,.gnode .tip-checks{display:block;margin-top:5px}
@media (max-width:720px){.ribbon,.ribbon-warning{padding-left:20px;padding-right:20px}}
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
    var effort = 0, coverage = 0;
    tickets.forEach(function(t){
      if(!disabled[t.slug]){ effort += t.effort_dev_days; coverage += t.coverage_delta; }
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
        var x1 = fb.left + fb.width / 2 - gb.left, y1 = fb.bottom - gb.top;
        var x2 = tb.left + tb.width / 2 - gb.left, y2 = tb.top - gb.top;
        var cls = (disabled[t.slug] || disabled[dep]) ? 'edge off' : 'edge';
        lines += '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"></line>';
      });
    });
    svg.innerHTML = lines;
  }
  graph.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.gnode') : null;
    if(btn && btn.dataset.slug){ toggle(btn.dataset.slug); }
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

/**
 * Render the single-repo backlog as a self-contained interactive HTML page: a
 * sticky ribbon that recomputes team effort/duration/coverage under Amdahl
 * scaling, and an effort-profit dependency graph whose nodes toggle a
 * transitive-dependent disable-cascade. Everything is inlined except the same
 * Google Fonts <link>s report.html uses.
 */
export function renderBacklogHtml(backlog: BacklogJson): string {
  const P = backlog.parallelizable_share;
  const effortAll = backlog.tickets.reduce((s, t) => s + t.effort_dev_days, 0);
  // speedup(1) = 1, so the initial single-developer duration equals total effort.
  const durationAll = effortAll;
  const coverageAll =
    backlog.tickets.reduce((s, t) => s + t.coverage_delta, 0) * 100;
  const speedupFormula = `1/((1−${P})+${P}/n)`;

  const layers = layerTickets(backlog);
  const graphLayers = layers
    .map(
      (layer) => `<div class="glayer">${layer.map(renderNode).join('')}</div>`
    )
    .join('\n');

  const embeddedJson = JSON.stringify(backlog).replaceAll('</', '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Improvement Backlog — ${esc(backlog.project)} — ${esc(backlog.date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>${REPORT_CSS}${BACKLOG_CSS}</style>
</head>
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

<div class="ribbon">
  <label>Number of developers
    <input type="number" id="devs" min="1" value="1">
  </label>
  <span class="rb-stat tip">
    <span class="rb-label">Effort</span>
    <span id="rb-effort" class="rb-val">${fmtDays(effortAll)}</span>
    <span class="rb-unit">d/dev</span>
    <span class="tipbox" id="rb-effort-tip">Σ effort of enabled tickets = ${fmtDays(effortAll)} d/dev</span>
  </span>
  <span class="rb-stat tip">
    <span class="rb-label">Duration</span>
    <span id="rb-duration" class="rb-val">${durationAll.toFixed(1)}</span>
    <span class="rb-unit">cal-days</span>
    <span class="tipbox" id="rb-duration-tip">duration = effort ÷ speedup(n); speedup(n) = ${speedupFormula}; at n=1 → ${durationAll.toFixed(1)} cal-days</span>
  </span>
  <span class="rb-stat tip">
    <span class="rb-label">Coverage gain</span>
    <span id="rb-coverage" class="rb-val">+${coverageAll.toFixed(1)}%</span>
    <span class="tipbox" id="rb-coverage-tip">Share of the currently-defined applicable weight these tickets would add.</span>
  </span>
  <button id="enable-all">Enable all nodes</button>
</div>
<div class="ribbon-warning">
  <strong>Adding developers shortens delivery sublinearly.</strong> Communication and coordination overhead grow with team size, and part of this work is inherently sequential (dependencies must land in order). Duration therefore follows Amdahl's law with a parallelizable share of ${P}, not a straight division by head-count.
</div>

<main class="container">
<details class="legend">
<summary>Legend</summary>
<div class="legend-body">
Each node is one ticket, labelled <code>slug · N d/dev · +X.X%</code> — its effort in developer-days and the coverage delta it adds. Hover a node for its full detail (goal, description, definition of done, dependencies, covered checks). Nodes are arranged in layers by dependency depth: dependency-free tickets sit in the top layer, and edges point downward from a ticket to the ones that depend on it. <strong>Click a node to disable it</strong> — disabling a node also disables every ticket that depends on it, transitively. Re-enabling a node leaves its dependents disabled until you re-enable them or press <strong>Enable all nodes</strong>. The ribbon totals reflect only the enabled tickets.
</div>
</details>

<div id="graph">
<svg id="edges" xmlns="http://www.w3.org/2000/svg"></svg>
${graphLayers}
</div>
</main>
<script>${BACKLOG_JS}</script>
</body>
</html>`;
}
