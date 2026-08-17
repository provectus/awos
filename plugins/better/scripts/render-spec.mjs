#!/usr/bin/env node
/**
 * render-spec.mjs — deterministic review-page renderer for /better:spec.
 *
 * Usage:
 *   node render-spec.mjs <spec-dir> <view-model.json>
 *
 * Reads <spec-dir>/functional-spec.md (the canonical, model-facing contract)
 * plus an LLM-authored view-model JSON (an ephemeral file — authored in-session,
 * never stored in the project), and writes <spec-dir>/functional-spec.html,
 * the human-facing review lens. All requirement prose and acceptance criteria
 * are extracted verbatim from the markdown — this script composes and styles,
 * it never rewrites contract text.
 *
 * Parsing is syntax-driven, not template-driven: headings become sections,
 * checkbox lists become criteria, and anything unrecognized renders as a plain
 * section. A missing or empty view-model degrades to a generic render; it
 * never fails the page.
 *
 * View-model schema (all fields optional):
 * {
 *   "at_a_glance": ["plain-language bullet", ...],
 *   "decisions": [{ "decision", "choice", "why", "sources": ["interview"|"code"|"web"|"kb"] }],
 *   "diagram": { "svg": "<svg …>", "note": "caption" },
 *   "findings": {
 *     "code": [{ "text", "impact", "anchor": "#r21" }], "web": [...], "kb": [...],
 *     "kb_note": "shown when the kb list is empty"
 *   },
 *   "requirements": [{ "match": "2.1", "one_liner", "sources": [...], "criteria_names": ["...", ...] }]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SOURCE_LABELS = {
  interview: 'Interview',
  code: 'Codebase',
  web: 'Web',
  kb: 'KB',
};

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Minimal inline markdown: bold, code, emphasis. Applied after escaping.
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}

function badge(src) {
  const key = String(src).toLowerCase();
  const label = SOURCE_LABELS[key] || esc(src);
  const cls = SOURCE_LABELS[key] ? key : 'kb';
  return `<span class="src ${cls}">${label}</span>`;
}

function anchorFor(heading) {
  const num = heading.match(/^(\d+)\.(\d+)/);
  if (num) return `r${num[1]}${num[2]}`;
  return (
    'r-' +
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
  );
}

// ---------------------------------------------------------------------------
// Markdown parsing (line-based, syntax-driven)
// ---------------------------------------------------------------------------

function parseSpec(md) {
  const lines = md.split('\n');
  const spec = { title: '', meta: {}, sections: [] };
  let current = null; // current level-2 section
  let sub = null; // current level-3 subsection

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const h1 = line.match(/^# (.+)$/);
    if (h1 && !spec.title) {
      spec.title = h1[1].replace(/^Functional Specification:\s*/i, '').trim();
      continue;
    }

    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      current = { title: h2[1].trim(), subs: [], body: [] };
      sub = null;
      spec.sections.push(current);
      continue;
    }

    const h3 = line.match(/^### (.+)$/);
    if (h3 && current) {
      sub = { title: h3[1].trim(), body: [] };
      current.subs.push(sub);
      continue;
    }

    // Metadata bullets before the first section: - **Key:** value
    if (!current) {
      const meta = line.match(/^- \*\*(.+?):\*\*\s*(.+)$/);
      if (meta) spec.meta[meta[1].trim()] = meta[2].trim();
      continue;
    }

    (sub ? sub.body : current.body).push(line);
  }
  return spec;
}

// From a body (array of lines), extract checkbox criteria (joining wrapped
// continuation lines) and top-level prose bullets / paragraphs.
function parseBody(body) {
  const criteria = [];
  const prose = [];
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    const check = line.match(/^(\s*)- \[( |x|X)\]\s*(.*)$/);
    if (check) {
      const indent = check[1].length;
      let text = check[3];
      i++;
      while (i < body.length) {
        const next = body[i];
        if (!next.trim()) break;
        if (/^#{1,6} /.test(next)) break;
        const bullet = next.match(/^(\s*)- /);
        if (bullet && bullet[1].length <= indent) break;
        if (bullet && next.match(/^\s*- \[( |x|X)\]/)) break;
        text += ' ' + next.trim();
        i++;
      }
      criteria.push({ text, checked: check[2].toLowerCase() === 'x' });
      continue;
    }

    const bullet = line.match(/^- (.+)$/);
    if (bullet) {
      let text = bullet[1];
      i++;
      while (i < body.length) {
        const next = body[i];
        if (!next.trim()) break;
        if (/^\s*- /.test(next) || /^#{1,6} /.test(next)) break;
        text += ' ' + next.trim();
        i++;
      }
      if (!/^\*\*Acceptance Criteria:?\*\*/i.test(text.trim())) {
        prose.push(text);
      }
      continue;
    }

    if (line.trim() && !/^---\s*$/.test(line) && !/^\s*- /.test(line)) {
      let text = line.trim();
      i++;
      while (i < body.length) {
        const next = body[i];
        if (!next.trim() || /^\s*- /.test(next) || /^#{1,6} /.test(next)) break;
        text += ' ' + next.trim();
        i++;
      }
      prose.push(text);
      continue;
    }
    i++;
  }
  return { criteria, prose };
}

function listItems(body) {
  return parseBody(body).prose;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function findVmRequirement(vm, heading) {
  const reqs = (vm && vm.requirements) || [];
  return reqs.find((r) => r.match && heading.includes(r.match)) || null;
}

function renderCriteria(parsed, vmReq) {
  const names = (vmReq && vmReq.criteria_names) || [];
  const done = parsed.criteria.filter((c) => c.checked).length;
  const items = parsed.criteria
    .map((c, idx) => {
      const name = names[idx] ? `<b>${inline(names[idx])}</b>` : '';
      return `<li class="${c.checked ? 'done' : ''}">${name}${inline(c.text)}</li>`;
    })
    .join('\n');
  return `<details class="ac"><summary>Acceptance criteria — ${parsed.criteria.length} (${done} verified)</summary><ul>
${items}
</ul></details>`;
}

function renderRequirement(sub, vm) {
  const parsed = parseBody(sub.body);
  const vmReq = findVmRequirement(vm, sub.title);
  const id = anchorFor(sub.title);
  const badges = ((vmReq && vmReq.sources) || []).map(badge).join(' ');
  const oneLiner =
    vmReq && vmReq.one_liner
      ? `<p class="oneliner">${inline(vmReq.one_liner)}</p>`
      : '';
  const prose = parsed.prose
    .map((p) => `<p class="prose">${inline(p)}</p>`)
    .join('\n');
  return `<section class="req" id="${id}">
  <h3><span>${inline(sub.title)}</span><span class="provrow">${badges}</span></h3>
  ${oneLiner}
  ${prose}
  ${parsed.criteria.length ? renderCriteria(parsed, vmReq) : ''}
</section>`;
}

function renderGenericSection(section) {
  const own = parseBody(section.body);
  const parts = [`<h2>${inline(section.title)}</h2>`];
  if (own.prose.length || own.criteria.length) {
    parts.push(own.prose.map((p) => `<p>${inline(p)}</p>`).join('\n'));
    if (own.criteria.length) parts.push(renderCriteria(own, null));
  }
  for (const sub of section.subs) {
    parts.push(`<h4>${inline(sub.title)}</h4>`);
    const parsed = parseBody(sub.body);
    if (parsed.prose.length) {
      parts.push(
        `<ul>${parsed.prose.map((p) => `<li>${inline(p)}</li>`).join('\n')}</ul>`
      );
    }
    if (parsed.criteria.length) parts.push(renderCriteria(parsed, null));
  }
  return parts.filter(Boolean).join('\n');
}

function renderScope(section) {
  const cols = section.subs
    .map((sub) => {
      const items = listItems(sub.body)
        .map((p) => `<li>${inline(p)}</li>`)
        .join('\n');
      return `<div><h4>${inline(sub.title)}</h4><ul>${items}</ul></div>`;
    })
    .join('\n');
  if (!cols) return renderGenericSection(section);
  return `<h2 id="scope">${inline(section.title)}</h2>\n<div class="cols">${cols}</div>`;
}

function renderDecisions(vm) {
  const decisions = (vm && vm.decisions) || [];
  if (!decisions.length) return '';
  const rows = decisions
    .map(
      (d) => `<tr>
    <td>${inline(d.decision || '')}</td>
    <td>${inline(d.choice || '')}${d.why ? `<span class="why">${inline(d.why)}</span>` : ''}</td>
    <td>${((d.sources || []).map(badge) || []).join(' ')}</td>
  </tr>`
    )
    .join('\n');
  return `<h2 id="decisions">Decisions to approve</h2>
<p class="meta">These are the judgment calls in this spec — the things a reviewer might want to challenge. Everything else follows from them.</p>
<table class="decisions">
  <tr><th>Decision</th><th>Choice</th><th>Source</th></tr>
${rows}
</table>`;
}

function renderFindings(vm, knownAnchors) {
  const groups = [
    ['code', 'Codebase exploration'],
    ['web', 'Web research'],
    ['kb', 'Knowledge base'],
  ];
  const findings = (vm && vm.findings) || {};
  const hasAny = groups.some((g) => (findings[g[0]] || []).length);
  if (!hasAny && !findings.kb_note) return '';

  const tabs = groups
    .map(([key, label], idx) => {
      const n = (findings[key] || []).length;
      return `<button class="${idx === 0 ? 'active' : ''}" role="tab" onclick="tab(${idx}, this)">${label} <span class="count">· ${n}</span></button>`;
    })
    .join('\n');

  const panels = groups
    .map(([key], idx) => {
      const items = findings[key] || [];
      let inner;
      if (!items.length) {
        const note =
          key === 'kb' && findings.kb_note
            ? findings.kb_note
            : 'This lane produced no findings for this spec.';
        inner = `<div class="empty">${inline(note)}</div>`;
      } else {
        inner = `<ul class="findings">${items
          .map((f) => {
            const anchor =
              f.anchor && knownAnchors.has(String(f.anchor).replace('#', ''))
                ? `<a href="${esc(f.anchor)}">`
                : null;
            const impact = f.impact
              ? `<span class="impact">→ ${anchor ? anchor + inline(f.impact) + '</a>' : inline(f.impact)}</span>`
              : '';
            return `<li>${inline(f.text || '')}${impact}</li>`;
          })
          .join('\n')}</ul>`;
      }
      return `<div class="tabpanel ${idx === 0 ? 'active' : ''}">${inner}</div>`;
    })
    .join('\n');

  return `<h2 id="findings">Findings that shaped this spec</h2>
<p class="meta">What the research phase discovered and where it landed. The technical detail behind each finding lives in <code>research-notes.md</code>.</p>
<div class="tabs">
  <div class="tabbar" role="tablist">
${tabs}
  </div>
${panels}
</div>`;
}

function renderDiagram(vm) {
  const d = vm && vm.diagram;
  if (!d || !d.svg || !/^\s*<svg[\s>]/i.test(d.svg)) return '';
  return `<h2 id="lifecycle">${inline(d.title || 'Overview diagram')}</h2>
<div class="diagram-wrap">${d.svg}</div>
${d.note ? `<div class="diagram-note">${inline(d.note)}</div>` : ''}`;
}

const CSS = `
  :root {
    --bg: #ffffff; --panel: #f6f7f9; --ink: #1c2430; --muted: #5b6572;
    --line: #e3e7ec; --accent: #2563eb;
    --src-interview: #2563eb; --src-code: #7c3aed; --src-web: #0f766e; --src-kb: #b45309;
    --ok: #15803d; --pending: #9aa3ad; --warn: #b45309; --chip-ink: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #10151c; --panel: #171e27; --ink: #e8edf3; --muted: #9aa7b5;
      --line: #26303c; --accent: #60a5fa;
      --src-interview: #60a5fa; --src-code: #bda6f5; --src-web: #4fd1c0; --src-kb: #f0b26b;
      --ok: #4ade80; --pending: #64748b; --warn: #f0b26b; --chip-ink: #10151c;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 36px 28px 80px; }
  @media (max-width: 700px) { main { padding: 20px 16px 60px; } }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; }
  h2 { font-size: 20px; margin: 42px 0 12px; }
  h4 { margin: 14px 0 6px; font-size: 14px; }
  .meta { color: var(--muted); font-size: 14px; margin-bottom: 4px; }
  .statusbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 14px 0 6px; }
  .status-chip { font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--warn); color: var(--chip-ink); }
  .progress { font-size: 13px; color: var(--muted); }
  .bar { display: inline-block; width: 140px; height: 7px; border-radius: 4px; background: var(--line); vertical-align: middle; margin: 0 6px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: var(--ok); }
  .src { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; color: var(--chip-ink); white-space: nowrap; }
  .src.interview { background: var(--src-interview); }
  .src.code { background: var(--src-code); }
  .src.web { background: var(--src-web); }
  .src.kb { background: var(--src-kb); }
  .glance { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px 22px; margin-top: 14px; }
  .glance ul { margin: 8px 0 0; padding-left: 20px; }
  .glance li { margin: 6px 0; }
  table.decisions { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px; }
  table.decisions th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); padding: 8px 10px; border-bottom: 2px solid var(--line); }
  table.decisions td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.decisions td:first-child { font-weight: 600; width: 26%; }
  .why { color: var(--muted); font-size: 13px; display: block; margin-top: 2px; }
  .diagram-wrap { overflow-x: auto; margin-top: 12px; }
  .diagram-note { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
  .tabs { margin-top: 12px; }
  .tabbar { display: flex; gap: 4px; border-bottom: 2px solid var(--line); }
  .tabbar button { appearance: none; border: none; background: none; color: var(--muted); font: 600 14px/1.4 inherit; padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tabbar button.active { color: var(--ink); border-bottom-color: var(--accent); }
  .tabbar button .count { font-weight: 400; color: var(--muted); font-size: 12.5px; }
  .tabpanel { display: none; padding: 6px 2px 0; }
  .tabpanel.active { display: block; }
  ul.findings { list-style: none; margin: 10px 0 0; padding: 0; }
  ul.findings li { margin: 0; padding: 12px 4px; border-bottom: 1px solid var(--line); font-size: 14.5px; }
  ul.findings li:last-child { border-bottom: none; }
  .impact { display: block; font-size: 13px; color: var(--muted); margin-top: 3px; }
  .impact a { color: var(--accent); text-decoration: none; }
  .impact a:hover { text-decoration: underline; }
  .empty { color: var(--muted); font-size: 14px; padding: 16px 4px; }
  .req { border: 1px solid var(--line); border-radius: 10px; padding: 18px 22px; margin: 16px 0; }
  .req h3 { margin: 0 0 4px; font-size: 16.5px; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: space-between; }
  .req h3 .provrow { display: flex; gap: 5px; }
  .req .oneliner { margin: 2px 0 6px; }
  .req .prose { color: var(--muted); font-size: 14px; margin: 0 0 4px; }
  details.ac { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
  details.ac summary { cursor: pointer; font-size: 13.5px; color: var(--accent); font-weight: 600; }
  details.ac ul { list-style: none; padding-left: 4px; margin: 10px 0 2px; }
  details.ac li { margin: 10px 0; padding-left: 26px; position: relative; font-size: 14.5px; }
  details.ac li::before { content: "☐"; position: absolute; left: 2px; top: 0; color: var(--pending); font-size: 15px; }
  details.ac li.done::before { content: "☑"; color: var(--ok); }
  details.ac li b { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 10px; }
  @media (max-width: 700px) { .cols { grid-template-columns: 1fr; } }
  .cols h4 { margin: 0 0 6px; }
  .cols ul { margin: 0; padding-left: 20px; font-size: 14px; }
  .cols li { margin: 5px 0; }
  footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--muted); }
  code { background: var(--panel); border-radius: 4px; padding: 1px 5px; font-size: .92em; }
`;

const TAB_JS = `
  function tab(i, el) {
    document.querySelectorAll('.tabbar button').forEach(function (b, j) { b.classList.toggle('active', j === i); });
    document.querySelectorAll('.tabpanel').forEach(function (p, j) { p.classList.toggle('active', j === i); });
  }
`;

function render(md, vm, pluginVersion) {
  const spec = parseSpec(md);

  const isRequirementSection = (section) =>
    /requirement/i.test(section.title) ||
    section.subs.some((sub) => parseBody(sub.body).criteria.length > 0);

  const requirementSubs = [];
  const genericSections = [];
  let scopeSection = null;
  for (const section of spec.sections) {
    if (/scope/i.test(section.title) && section.subs.length) {
      scopeSection = section;
    } else if (isRequirementSection(section)) {
      requirementSubs.push(...section.subs);
    } else if (
      /overview/i.test(section.title) &&
      vm &&
      (vm.at_a_glance || []).length
    ) {
      // Represented by the At-a-glance block; skip the long form.
    } else {
      genericSections.push(section);
    }
  }

  const knownAnchors = new Set(requirementSubs.map((s) => anchorFor(s.title)));

  let total = 0;
  let done = 0;
  for (const section of spec.sections) {
    for (const body of [section.body, ...section.subs.map((s) => s.body)]) {
      for (const c of parseBody(body).criteria) {
        total++;
        if (c.checked) done++;
      }
    }
  }
  const pct = total ? Math.round((done / total) * 100) : 0;

  const status = spec.meta['Status'] || '';
  const metaBits = Object.entries(spec.meta)
    .filter(([k]) => k !== 'Status')
    .map(([k, v]) => `${inline(k)}: ${inline(v)}`)
    .join(' &nbsp;·&nbsp; ');

  const glance =
    vm && (vm.at_a_glance || []).length
      ? `<h2 id="glance">At a glance</h2>
<div class="glance"><ul>${vm.at_a_glance.map((b) => `<li>${inline(b)}</li>`).join('\n')}</ul></div>`
      : '';

  const hash = crypto
    .createHash('sha256')
    .update(md)
    .digest('hex')
    .slice(0, 12);
  const today = new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${inline(spec.title)}</h1>
${metaBits ? `<div class="meta">${metaBits}</div>` : ''}
<div class="statusbar">
  ${status ? `<span class="status-chip">${inline(status)}</span>` : ''}
  ${total ? `<span class="progress">Verification: <span class="bar"><i style="width:${pct}%"></i></span> ${done} of ${total} criteria verified</span>` : ''}
</div>
${glance}
${renderDecisions(vm)}
${renderDiagram(vm)}
${renderFindings(vm, knownAnchors)}
${requirementSubs.length ? '<h2>Requirements</h2>' : ''}
${requirementSubs.map((sub) => renderRequirement(sub, vm)).join('\n')}
${scopeSection ? renderScope(scopeSection) : ''}
${genericSections.map((s) => renderGenericSection(s)).join('\n')}
<footer>
  This page is a <strong>review lens</strong> — the canonical, normative contract is <code>functional-spec.md</code> in this directory; approvals bind to it, and the technical detail behind the findings lives in <code>research-notes.md</code>.<br>
  Generated ${today} from functional-spec.md (${esc(hash)})${status ? `, status <em>${inline(status)}</em>` : ''}${total ? ` — ${total} criteria, ${done} verified` : ''}. Rendered by the better plugin${pluginVersion ? ` v${esc(pluginVersion)}` : ''}.
</footer>
</main>
<script>${TAB_JS}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const [specDir, vmPath] = process.argv.slice(2);
  if (!specDir) {
    console.error('Usage: node render-spec.mjs <spec-dir> [view-model.json]');
    process.exit(2);
  }
  const mdPath = path.join(specDir, 'functional-spec.md');
  const md = fs.readFileSync(mdPath, 'utf8');

  let vm = {};
  if (vmPath) {
    try {
      vm = JSON.parse(fs.readFileSync(vmPath, 'utf8'));
    } catch (err) {
      console.error(
        `view-model unreadable (${err.message}) — rendering generically`
      );
      vm = {};
    }
  }

  let pluginVersion = '';
  try {
    const selfDir = path.dirname(fileURLToPath(import.meta.url));
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(selfDir, '..', '.claude-plugin', 'plugin.json'),
        'utf8'
      )
    );
    pluginVersion = manifest.version || '';
  } catch {
    // Version is cosmetic; render without it.
  }

  const outPath = path.join(specDir, 'functional-spec.html');
  fs.writeFileSync(outPath, render(md, vm, pluginVersion));
  console.log(outPath);
}

main();
