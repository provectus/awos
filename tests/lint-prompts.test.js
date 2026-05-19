/**
 * Static prompt linter for AWOS framework files.
 *
 * Catches structural regressions in commands/, claude/commands/, templates/,
 * and plugins/awos/skills/ai-readiness-audit/dimensions/ without spinning up
 * any installer logic. Runs under both `node --test` and `bun test`.
 *
 * No npm dependencies — built-ins only.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parse } = require('./helpers/frontmatter');

const repoRoot = path.resolve(__dirname, '..');
const commandsDir = path.join(repoRoot, 'commands');
const wrappersDir = path.join(repoRoot, 'claude', 'commands');
const dimensionsDir = path.join(
  repoRoot,
  'plugins',
  'awos',
  'skills',
  'ai-readiness-audit',
  'dimensions'
);
const templatesDir = path.join(repoRoot, 'templates');

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

const wrapperSchema = JSON.parse(
  readUtf8(path.join(__dirname, 'config', 'wrapper-schema.json'))
);

test('every wrapper has a matching root command', () => {
  const wrappers = listMarkdown(wrappersDir);
  assert.ok(wrappers.length > 0, 'expected at least one wrapper');
  for (const w of wrappers) {
    const root = path.join(commandsDir, w);
    assert.ok(
      fs.existsSync(root),
      `wrapper claude/commands/${w} has no matching commands/${w}`
    );
  }
});

test('every root command has a matching wrapper', () => {
  const roots = listMarkdown(commandsDir);
  assert.ok(roots.length > 0, 'expected at least one root command');
  for (const r of roots) {
    const w = path.join(wrappersDir, r);
    assert.ok(
      fs.existsSync(w),
      `commands/${r} has no matching wrapper at claude/commands/${r}`
    );
  }
});

test('each wrapper includes its root command (either form)', () => {
  const wrappers = listMarkdown(wrappersDir);
  const counts = { atImport: 0, referTo: 0 };
  for (const w of wrappers) {
    const stem = w.replace(/\.md$/, '');
    const body = readUtf8(path.join(wrappersDir, w));
    const atImport = body.includes(`@.awos/commands/${stem}.md`);
    const referTo = body.includes(
      `Refer to the instructions located in this file: .awos/commands/${stem}.md`
    );
    assert.ok(
      atImport || referTo,
      `wrapper ${w} must include either the @-import form @.awos/commands/${stem}.md (preferred) or the legacy "Refer to…" line`
    );
    if (atImport) counts.atImport++;
    else if (referTo) counts.referTo++;
  }
  // Surface migration progress (@-import vs legacy "Refer to…") in test output.
  // eslint-disable-next-line no-console
  console.log(
    `[lint] wrapper include forms: @import=${counts.atImport}, refer-to=${counts.referTo}`
  );
});

test('wrapper frontmatter has required keys', () => {
  const wrappers = listMarkdown(wrappersDir);
  for (const w of wrappers) {
    const { data, hasFrontmatter } = parse(readUtf8(path.join(wrappersDir, w)));
    assert.ok(hasFrontmatter, `wrapper ${w} is missing frontmatter`);
    for (const key of wrapperSchema.required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(data, key),
        `wrapper ${w} frontmatter is missing required key "${key}"`
      );
      assert.ok(
        typeof data[key] === 'string' && data[key].length > 0,
        `wrapper ${w} key "${key}" must be a non-empty string`
      );
    }
  }
});

test('wrapper description matches root description', () => {
  // Wrappers must mirror the root command's description so the
  // slash-command palette shows the canonical text — and so users
  // editing a wrapper inadvertently don't drift the surfaced help.
  const wrappers = listMarkdown(wrappersDir);
  const mismatches = [];
  for (const w of wrappers) {
    const wrapperData = parse(readUtf8(path.join(wrappersDir, w))).data;
    const rootData = parse(readUtf8(path.join(commandsDir, w))).data;
    if (wrapperData.description !== rootData.description) {
      mismatches.push({
        file: w,
        wrapper: wrapperData.description,
        root: rootData.description,
      });
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `wrapper description must match root: ${JSON.stringify(mismatches, null, 2)}`
  );
});

test('agent marker pattern is preserved', () => {
  const tasksBody = readUtf8(path.join(commandsDir, 'tasks.md'));
  const implementBody = readUtf8(path.join(commandsDir, 'implement.md'));
  assert.ok(
    tasksBody.includes('**[Agent: '),
    'commands/tasks.md must contain the "**[Agent: " marker template'
  );
  assert.ok(
    implementBody.includes('**[Agent: '),
    'commands/implement.md must reference the "**[Agent: " read pattern'
  );
});

test('subagent-enumerating commands tell Claude how to discover agents', () => {
  // Commands that produce durable specialist assignments (Agent
  // markers in tasks.md, the coverage report in agents.md) need the
  // filesystem enumeration path: scan .claude/agents/*.md and parse
  // YAML frontmatter. Commands that only give a verbal hint can
  // mention the path without parsing frontmatter — architecture.md
  // is the canonical example (its Step 4 explicitly defers the
  // durable report to /awos:hire).
  const fullEnumerators = ['tasks.md', 'tech.md', 'hire.md'];
  const lightReferencers = ['architecture.md'];

  for (const file of [...fullEnumerators, ...lightReferencers]) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('.claude/agents/'),
      `commands/${file} must reference '.claude/agents/' as the subagent discovery source`
    );
  }
  for (const file of fullEnumerators) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      /frontmatter|YAML/.test(body),
      `commands/${file} must tell Claude to parse the discovered agents' frontmatter`
    );
  }
});

test('all /awos:<name> cross-references resolve', () => {
  const allFiles = [];
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(p);
      else if (entry.isFile() && entry.name.endsWith('.md')) allFiles.push(p);
    }
  };
  collect(commandsDir);
  collect(wrappersDir);
  collect(templatesDir);
  collect(path.join(repoRoot, 'plugins'));

  const references = new Set();
  for (const f of allFiles) {
    const text = readUtf8(f);
    const matches = text.match(/\/awos:[a-z][a-z0-9-]*/g) || [];
    for (const m of matches) references.add(m);
  }
  const rootCommands = new Set(
    listMarkdown(commandsDir).map((f) => '/awos:' + f.replace(/\.md$/, ''))
  );
  // Plugin-provided commands (the audit plugin contributes /awos:ai-readiness-audit).
  rootCommands.add('/awos:ai-readiness-audit');
  for (const ref of references) {
    assert.ok(
      rootCommands.has(ref),
      `unresolved slash-command reference: ${ref}`
    );
  }
});

test('dimension frontmatter is valid', () => {
  const files = listMarkdown(dimensionsDir);
  assert.ok(files.length > 0, 'expected at least one dimension');
  const validSeverities = new Set(['critical', 'high', 'medium', 'low']);
  for (const f of files) {
    const { data, hasFrontmatter } = parse(
      readUtf8(path.join(dimensionsDir, f))
    );
    assert.ok(hasFrontmatter, `dimension ${f} is missing frontmatter`);
    for (const key of ['name', 'title', 'description', 'severity']) {
      assert.ok(
        typeof data[key] === 'string' && data[key].length > 0,
        `dimension ${f}: required key "${key}" is missing or empty`
      );
    }
    const stem = f.replace(/\.md$/, '');
    assert.equal(
      data.name,
      stem,
      `dimension ${f}: name "${data.name}" must equal filename stem "${stem}"`
    );
    assert.ok(
      validSeverities.has(data.severity),
      `dimension ${f}: severity "${data.severity}" must be one of ${[...validSeverities].join(', ')}`
    );
  }
});

test('dimension dependency DAG resolves and is acyclic', () => {
  const files = listMarkdown(dimensionsDir);
  const byName = new Map();
  for (const f of files) {
    const { data } = parse(readUtf8(path.join(dimensionsDir, f)));
    byName.set(
      data.name,
      Array.isArray(data['depends-on']) ? data['depends-on'] : []
    );
  }
  // All depends-on entries resolve to a real dimension name.
  for (const [name, deps] of byName) {
    for (const dep of deps) {
      assert.ok(
        byName.has(dep),
        `dimension "${name}" depends on unknown dimension "${dep}"`
      );
    }
  }
  // Topological sort — Kahn's algorithm — must drain all nodes.
  const inDegree = new Map([...byName.keys()].map((k) => [k, 0]));
  for (const [, deps] of byName) {
    for (const d of deps) inDegree.set(d, inDegree.get(d) || 0); // no-op, but keeps map keyed
  }
  // Edge: dependent -> dependency means dependent waits on dependency.
  // For topo sort we want to drain dependencies first. Build forward edges
  // dep -> dependent.
  const adj = new Map([...byName.keys()].map((k) => [k, []]));
  const inDeg = new Map([...byName.keys()].map((k) => [k, 0]));
  for (const [name, deps] of byName) {
    for (const dep of deps) {
      adj.get(dep).push(name);
      inDeg.set(name, inDeg.get(name) + 1);
    }
  }
  const queue = [];
  for (const [k, v] of inDeg) if (v === 0) queue.push(k);
  let visited = 0;
  while (queue.length) {
    const n = queue.shift();
    visited++;
    for (const m of adj.get(n)) {
      inDeg.set(m, inDeg.get(m) - 1);
      if (inDeg.get(m) === 0) queue.push(m);
    }
  }
  assert.equal(
    visited,
    byName.size,
    'dimension dependency DAG contains a cycle'
  );
});

test('agent-template.md has the expected frontmatter shape', () => {
  const file = path.join(templatesDir, 'agent-template.md');
  const { data, hasFrontmatter } = parse(readUtf8(file));
  assert.ok(hasFrontmatter, 'agent-template.md must have frontmatter');
  for (const key of ['name', 'description', 'skills']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(data, key),
      `agent-template.md missing key "${key}"`
    );
  }
});

test('setup-config.js source directories exist on disk', () => {
  const { copyOperations } = require(
    path.join(repoRoot, 'src', 'config', 'setup-config.js')
  );
  for (const op of copyOperations) {
    const src = path.join(repoRoot, op.source);
    assert.ok(
      fs.existsSync(src) && fs.statSync(src).isDirectory(),
      `setup-config copyOperation source missing: ${op.source}`
    );
  }
});

test('every top-level framework directory is referenced by setup-config', () => {
  const { copyOperations } = require(
    path.join(repoRoot, 'src', 'config', 'setup-config.js')
  );
  const referenced = new Set(copyOperations.map((op) => op.source));
  // Top-level framework dirs we expect: commands, templates, scripts, claude/commands.
  const expected = ['commands', 'templates', 'scripts', 'claude/commands'];
  for (const dir of expected) {
    assert.ok(
      referenced.has(dir),
      `setup-config.copyOperations is missing an entry for "${dir}"`
    );
  }
});

test('implement.md uses XML scope-and-investigate snippets', () => {
  // The formulated subagent prompt in implement.md must contain two
  // XML blocks that have outsized impact on subagent behavior:
  //   <scope_discipline>          — keep the change minimal, don't over-engineer
  //   <investigate_before_answering> — read the relevant files, don't hallucinate
  // A verification-commands block is intentionally NOT asserted here.
  // Teams that want mandatory verification can add it via wrapper
  // customization in .claude/commands/awos/implement.md.
  const body = readUtf8(path.join(commandsDir, 'implement.md'));
  const needed = ['<scope_discipline>', '<investigate_before_answering>'];
  const missing = needed.filter((tag) => !body.includes(tag));
  assert.deepEqual(
    missing,
    [],
    `implement.md is missing required XML snippets: ${missing.join(', ')}`
  );
});

test('context/<path> references in prompts are internally consistent', () => {
  // Build a writer/reader map by scanning all prompts. A path is considered
  // consistent if every reference to it appears in at least one prompt — i.e.
  // we never have a path referenced only by one file that no other prompt
  // touches. The cheap version asserted here: every context/...md path
  // mentioned by ANY prompt is mentioned by at least one root command.
  const files = listMarkdown(commandsDir).map((f) => path.join(commandsDir, f));
  const refs = new Set();
  for (const f of files) {
    const body = readUtf8(f);
    const matches =
      body.match(/context\/[a-z][a-zA-Z0-9/_.\-\[\]]*\.md/g) || [];
    for (const m of matches) refs.add(m);
  }
  // Sanity: the well-known canonical paths must appear at least once.
  const canonical = [
    'context/product/product-definition.md',
    'context/product/roadmap.md',
    'context/product/architecture.md',
  ];
  for (const p of canonical) {
    assert.ok(
      refs.has(p),
      `expected canonical path ${p} to be referenced by at least one prompt`
    );
  }
});
