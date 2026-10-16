#!/usr/bin/env node
// Mermaid flowchart -> deterministic edge-list text.
//
// This is what makes eval arm C (prose-equivalent) mechanically derivable from
// arm B (diagrams): every ```mermaid fence in a markdown document is replaced
// by sentences carrying the same nodes/edges/labels, so information
// equivalence between the arms is checkable by reading this file, not by
// trusting anyone's prose. See docs/2.0/c4-diagram-eval-plan.md.
//
// Supported syntax is the proposal's C4-styling convention subset:
//   flowchart LR|TD, subgraph id["Label"] ... end,
//   node defs: id([L]):::person  id["L"]:::container  id[("L")]:::datastore  id[/"L"/]:::external
//   edges:     a --> b   a -->|label| b
//   classDef lines are ignored.
//
// CLI: node mermaid-edges.mjs <file.md>   (transformed markdown on stdout)

'use strict';

// Ordered: the specific bracket shapes before the generic [..] one.
const NODE_SHAPES = [
  {
    re: /^([A-Za-z0-9_-]+)\(\[\s*"?(.*?)"?\s*\]\)(?::::([A-Za-z0-9_-]+))?$/,
    kind: 'person',
  },
  {
    re: /^([A-Za-z0-9_-]+)\[\(\s*"?(.*?)"?\s*\)\](?::::([A-Za-z0-9_-]+))?$/,
    kind: 'datastore',
  },
  {
    re: /^([A-Za-z0-9_-]+)\[\/\s*"?(.*?)"?\s*\/\](?::::([A-Za-z0-9_-]+))?$/,
    kind: 'external',
  },
  {
    re: /^([A-Za-z0-9_-]+)\[\s*"?(.*?)"?\s*\](?::::([A-Za-z0-9_-]+))?$/,
    kind: 'node',
  },
];
const EDGE_RE =
  /^\s*([A-Za-z0-9_-]+)\s*-->(?:\|([^|]*)\|)?\s*([A-Za-z0-9_-]+)\s*$/;
const SUBGRAPH_RE =
  /^\s*subgraph\s+([A-Za-z0-9_-]+)\s*(?:\[\s*"?([^\]"]+?)"?\s*\])?\s*$/;

function stripHtml(label) {
  return label
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMermaid(source) {
  const nodes = new Map(); // id -> { label, kind, group }
  const edges = []; // { from, to, label }
  const groups = new Map(); // id -> label
  let currentGroup = null;

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (
      line === '' ||
      line.startsWith('%%') ||
      line.startsWith('classDef') ||
      line.startsWith('flowchart') ||
      line.startsWith('graph')
    ) {
      continue;
    }
    if (line === 'end') {
      currentGroup = null;
      continue;
    }
    const sub = SUBGRAPH_RE.exec(line);
    if (sub) {
      currentGroup = sub[1];
      groups.set(sub[1], stripHtml(sub[2] || sub[1]));
      continue;
    }
    const edge = EDGE_RE.exec(line);
    if (edge) {
      edges.push({
        from: edge[1],
        to: edge[3],
        label: edge[2] ? stripHtml(edge[2]) : null,
      });
      continue;
    }
    for (const shape of NODE_SHAPES) {
      const node = shape.re.exec(line);
      if (node) {
        const [, id, label, klass] = node;
        nodes.set(id, {
          label: stripHtml(label),
          kind: klass || shape.kind,
          group: currentGroup,
        });
        break;
      }
    }
  }
  return { nodes, edges, groups };
}

function describe(id, parsed) {
  const node = parsed.nodes.get(id);
  if (!node) return id;
  const where = node.group ? `, inside ${parsed.groups.get(node.group)}` : '';
  return `${node.label} (${node.kind}${where})`;
}

export function renderEdgeList(parsed) {
  const lines = [];
  if (parsed.groups.size > 0) {
    for (const [, label] of parsed.groups) {
      const members = [...parsed.nodes.values()]
        .filter(
          (n) =>
            parsed.groups.has(n.group) && parsed.groups.get(n.group) === label
        )
        .map((n) => `${n.label} (${n.kind})`);
      lines.push(
        `- System boundary **${label}** contains: ${members.join(', ')}.`
      );
    }
  }
  const outside = [...parsed.nodes.values()].filter((n) => !n.group);
  for (const n of outside) {
    lines.push(`- ${n.label} is a ${n.kind} outside the system boundary.`);
  }
  for (const e of parsed.edges) {
    const via = e.label ? ` — ${e.label}` : '';
    lines.push(
      `- ${describe(e.from, parsed)} → ${describe(e.to, parsed)}${via}.`
    );
  }
  return lines.join('\n');
}

const FENCE_RE = /```mermaid\n([\s\S]*?)```/g;

export function transformMarkdown(markdown) {
  return markdown.replace(FENCE_RE, (_match, source) => {
    const parsed = parseMermaid(source);
    return (
      'The structure, stated explicitly (derived from the same model as the diagram variant):\n\n' +
      renderEdgeList(parsed)
    );
  });
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const { readFileSync } = await import('node:fs');
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node mermaid-edges.mjs <file.md>');
    process.exit(1);
  }
  process.stdout.write(transformMarkdown(readFileSync(file, 'utf8')));
}
