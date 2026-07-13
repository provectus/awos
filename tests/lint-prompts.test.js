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
const pluginCommandsDir = path.join(repoRoot, 'plugins', 'awos', 'commands');
const pluginTemplatesDir = path.join(repoRoot, 'plugins', 'awos', 'templates');

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
  // hire.md actively consumes agent frontmatter — it builds a coverage
  // table that depends on each agent's `skills:` list, and Step 6
  // appends newly installed skills back into the file. It is the only
  // command with a real reason to Read each `.claude/agents/*.md` and
  // parse YAML frontmatter.
  //
  // tasks.md, tech.md, and architecture.md only need to know what
  // specialist agents exist and what each one covers — enough to pick
  // an assignee / draft a stack section / hint at coverage. Both
  // project-local and plugin-provided agents are listed in the Agent
  // tool's description block at runtime, so introspecting that block
  // is sufficient. Forcing them to Read the files (as earlier versions
  // of this test did) over-specified the implementation; the awos-qa
  // contract is the output (correct `**[Agent: ...]**` markers, no
  // hallucinations), not the tool sequence used to produce it.
  const frontmatterReaders = ['hire.md'];
  const lightReferencers = ['tasks.md', 'tech.md', 'architecture.md'];

  for (const file of [...frontmatterReaders, ...lightReferencers]) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('.claude/agents/'),
      `commands/${file} must reference '.claude/agents/' as the subagent discovery source`
    );
  }
  for (const file of frontmatterReaders) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      /frontmatter|YAML/.test(body),
      `commands/${file} must tell Claude to parse the discovered agents' frontmatter (it writes back to the skills: list)`
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
    const text = readUtf8(f).replace(/<!--[\s\S]*?-->/g, '');
    const matches = text.match(/\/awos:[a-z][a-z0-9-]*/g) || [];
    for (const m of matches) references.add(m);
  }
  const rootCommands = new Set(
    listMarkdown(commandsDir).map((f) => '/awos:' + f.replace(/\.md$/, ''))
  );
  // Plugin-provided commands resolve too: commands under plugins/awos/commands/
  // (e.g. /awos:flow, kept out of the core installer per review) plus the
  // audit skill /awos:ai-readiness-audit.
  for (const f of listMarkdown(pluginCommandsDir)) {
    rootCommands.add('/awos:' + f.replace(/\.md$/, ''));
  }
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

test('claude/commands operation is marked preserveOnUpdate', () => {
  // Wrappers under .claude/commands/awos/ are the user customization
  // layer — the installer must consult the user before clobbering them on
  // update. The flag is what tells the file-copier to do conflict
  // detection + prompt. If this assertion ever fails, the
  // overwrite-on-every-run regression has been reintroduced.
  const { copyOperations } = require(
    path.join(repoRoot, 'src', 'config', 'setup-config.js')
  );
  const claudeOp = copyOperations.find((op) => op.source === 'claude/commands');
  assert.ok(
    claudeOp,
    'setup-config must declare the claude/commands copy operation'
  );
  assert.equal(
    claudeOp.preserveOnUpdate,
    true,
    'claude/commands operation must set preserveOnUpdate: true so the file-copier prompts before overwriting user wrappers'
  );
});

test('implement.md uses XML scope, investigate, skills, and completion-evidence snippets', () => {
  // The formulated subagent prompt in implement.md must contain four
  // XML blocks that have outsized impact on subagent behavior:
  //   <scope_discipline>             — keep the change minimal, don't over-engineer
  //   <investigate_before_answering> — read the relevant files, don't hallucinate
  //   <use_available_skills>         — apply matching project/user/plugin skills
  //   <completion_evidence>          — cite fresh command output, no belief-based "done"
  const body = readUtf8(path.join(commandsDir, 'implement.md'));
  const needed = [
    '<scope_discipline>',
    '<investigate_before_answering>',
    '<use_available_skills>',
    '<completion_evidence>',
  ];
  const missing = needed.filter((tag) => !body.includes(tag));
  assert.deepEqual(
    missing,
    [],
    `implement.md is missing required XML snippets: ${missing.join(', ')}`
  );
});

test('every core command declares an INTERACTION section', () => {
  // The "use AskUserQuestion for multiple-choice" rule lives in core
  // commands/*.md (not the wrappers), because AWOS targets Claude Code
  // only. Every core command should declare its own INTERACTION section
  // that names the tool — so the rule is discoverable from the prompt
  // itself, not buried in a host-specific wrapper.
  const roots = listMarkdown(commandsDir);
  const missing = [];
  for (const r of roots) {
    const body = readUtf8(path.join(commandsDir, r));
    if (!body.includes('# INTERACTION') || !body.includes('AskUserQuestion')) {
      missing.push(r);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `core commands missing "# INTERACTION" + "AskUserQuestion": ${missing.join(', ')}`
  );
});

test('deliverable commands write their file on an unanswered question', () => {
  // These document-generating commands ask the user questions and then
  // write a file. In an unattended `claude -p` run those questions are
  // silently dismissed; without an explicit fallback the command narrates a
  // draft and ends the turn, so the deliverable never lands on disk. Each
  // listed command must carry the INTERACTION rule that treats a skipped or
  // unanswered question as a signal to fall back to a default and still write
  // the file — never as a stop. See commands/tasks.md for the canonical rule.
  //
  // Every command that generates a document under context/ and asks the
  // user questions on the way carries this rule. spec.md's default is its
  // own `[NEEDS CLARIFICATION: …]` marker rather than a documented value,
  // but the contract is the same: an unanswered question is never a stop —
  // record the gap and still write the deliverable.
  const deliverableCommands = [
    'product.md',
    'roadmap.md',
    'architecture.md',
    'spec.md',
    'tasks.md',
    'tech.md',
  ];
  const missing = [];
  for (const command of deliverableCommands) {
    const body = readUtf8(path.join(commandsDir, command));
    if (
      !body.includes('never a stop signal') ||
      !body.includes('including writing')
    ) {
      missing.push(command);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `deliverable commands missing the unattended-write fallback rule ("never a stop signal" + "including writing"): ${missing.join(', ')}`
  );
});

test('wrappers do not duplicate the AskUserQuestion rule', () => {
  // Counterpart to the test above: the rule moved from wrappers to
  // core. If a wrapper still mentions AskUserQuestion the contract has
  // drifted — fix the wrapper rather than relaxing this assertion.
  const wrappers = listMarkdown(wrappersDir);
  const offenders = [];
  for (const w of wrappers) {
    const body = readUtf8(path.join(wrappersDir, w));
    if (body.includes('AskUserQuestion')) offenders.push(w);
  }
  assert.deepEqual(
    offenders,
    [],
    `wrappers that still mention AskUserQuestion (should live in core): ${offenders.join(', ')}`
  );
});

test('hired-agents.md is the canonical coverage-report path', () => {
  // The /awos:hire-owned coverage report was renamed from
  // context/product/agents.md to context/product/hired-agents.md so
  // the filename carries both producer (/awos:hire) and content
  // (registered agents). Lint pins both halves of the rename: at
  // least one prompt must reference the new path, and no prompt may
  // still reference the old one.
  const promptDirs = [commandsDir, wrappersDir, templatesDir];
  let referencesNew = false;
  const stalePaths = [];
  for (const dir of promptDirs) {
    for (const f of listMarkdown(dir)) {
      const body = readUtf8(path.join(dir, f));
      if (body.includes('context/product/hired-agents.md'))
        referencesNew = true;
      if (/context\/product\/agents\.md/.test(body)) {
        stalePaths.push(path.relative(repoRoot, path.join(dir, f)));
      }
    }
  }
  assert.deepEqual(
    stalePaths,
    [],
    `prompts still reference the pre-rename path context/product/agents.md: ${stalePaths.join(', ')}`
  );
  assert.ok(
    referencesNew,
    'no prompt references context/product/hired-agents.md — the post-rename canonical path should appear in at least architecture.md and hire.md'
  );
});

test('subagent-enumerating commands cover plugin-provided agents', () => {
  // /awos:tech, /awos:hire, /awos:tasks all assign or report on
  // specialists. Each must instruct Claude to look beyond
  // .claude/agents/*.md and also enumerate plugin-provided agents
  // (recognized by the "plugin-name:" prefix on subagent_type, which
  // only appears in the Agent tool's description block). Without this,
  // plugin-shipped specialists are invisible to the orchestrator.
  const enumerators = ['tech.md', 'hire.md', 'tasks.md'];
  for (const file of enumerators) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('plugin-name:'),
      `commands/${file} must mention the "plugin-name:" prefix used to recognize plugin-provided subagents`
    );
    assert.ok(
      /`?Agent`?\s+tool[’']s\s+description\s+block/i.test(body),
      `commands/${file} must tell Claude to read the Agent tool's description block to find plugin-provided agents`
    );
  }
});

test('implement.md and tech.md show explicit Agent() invocation syntax', () => {
  // Both orchestrators delegate work to specialist subagents via the
  // built-in `Agent` tool. A concrete `Agent(subagent_type=..., ...)`
  // example in the prompt is what nudges Claude to use the tool rather
  // than just describe the delegation — and what keeps both prompts
  // aligned on the same invocation shape.
  for (const file of ['implement.md', 'tech.md']) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('Agent(subagent_type='),
      `commands/${file} must show an Agent(subagent_type=..., ...) invocation example so the subagent delegation step is concrete`
    );
  }
});

test('agent-template.md cues the spawned agent to apply its skills', () => {
  // /awos:hire writes a `skills:` list into each agent's frontmatter,
  // and Claude Code attaches those skills when the agent runs. But the
  // attachment is only useful if the agent's prompt body cues it to
  // actually apply them. The template body must therefore tell the
  // agent to consult its frontmatter `skills:` list when working.
  const body = readUtf8(path.join(templatesDir, 'agent-template.md'));
  assert.ok(
    /skills\b[^\n]*\bfrontmatter\b|\bfrontmatter\b[^\n]*\bskills\b/i.test(body),
    'templates/agent-template.md body must instruct the agent to apply skills declared in its frontmatter'
  );
});

test('commands/tasks.md emits a Feature Testing & Regression slice', () => {
  // The QA pyramid PR makes every spec end with a "Feature Testing &
  // Regression" slice (unless the user opts out). Downstream tools —
  // /awos:implement, the SDD-07 audit dimension, the awos-qa scenarios —
  // grep for this literal slice name. If the slice is renamed or
  // dropped, the assertion catches the regression before behavior tests
  // hit it.
  const body = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    body.includes('Feature Testing & Regression'),
    'commands/tasks.md must reference the literal "Feature Testing & Regression" slice name so SDD-07 and awos-qa can detect it'
  );
});

test('ai-sdlc-adoption dimension exists with correct frontmatter and required body references', () => {
  const dimFile = path.join(dimensionsDir, 'ai-sdlc-adoption.md');
  assert.ok(
    fs.existsSync(dimFile),
    'dimensions/ai-sdlc-adoption.md must exist'
  );
  const body = readUtf8(dimFile);
  const { data, hasFrontmatter } = parse(body);

  assert.ok(hasFrontmatter, 'ai-sdlc-adoption.md must have frontmatter');
  assert.equal(
    data.name,
    'ai-sdlc-adoption',
    'frontmatter name must be "ai-sdlc-adoption"'
  );
  assert.ok(
    Array.isArray(data['depends-on']),
    'frontmatter depends-on must be an array'
  );
  for (const dep of [
    'project-topology',
    'ai-development-tooling',
    'spec-driven-development',
  ]) {
    assert.ok(
      data['depends-on'].includes(dep),
      `frontmatter depends-on must include "${dep}"`
    );
  }

  // Body must instruct the orchestrator to collect via the bundled dispatcher.
  assert.ok(
    body.includes('node dist/cli.js collect') ||
      body.includes('cli.js" collect') ||
      body.includes('cli path>" collect'),
    'body must reference the collect engine command (per-source collection command)'
  );
  // Body must instruct the orchestrator to run metrics via the bundled dispatcher.
  assert.ok(
    body.includes('node dist/cli.js metric') ||
      body.includes('cli.js" metric') ||
      body.includes('cli path>" metric'),
    'body must reference the metric engine command (metric invocation command)'
  );
  // Body must describe the shared collected/ directory (query-once pattern).
  assert.ok(
    body.includes('collected/'),
    'body must reference "collected/" (the shared query-once artifact directory)'
  );
  // Body must reference the standards data file as the source of category metadata.
  assert.ok(
    body.includes('standards.toml'),
    'body must reference standards.toml as the category metadata source'
  );
  // Body must describe emission of the per-dimension .json artifact.
  assert.ok(
    body.includes('.json'),
    'body must describe emission of a .json artifact (the per-dimension source-of-truth)'
  );
});

test('commands/tasks.md picks the QA agent with a search-first rule', () => {
  // Option A: testing-expert is one option among many — not a hard
  // requirement. tasks.md must (a) instruct the agent to search for a
  // QA-coded subagent rather than naming testing-expert as required,
  // (b) offer an AskUserQuestion fallback when none is found, and
  // (c) not contain the "Requires `testing-expert` agent" hard gate
  // that the previous draft shipped with.
  const body = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    /Search for a QA-coded subagent/i.test(body),
    'commands/tasks.md must instruct a search-first QA agent selection (Step 3a)'
  );
  assert.ok(
    body.includes('AskUserQuestion'),
    'commands/tasks.md must use AskUserQuestion to offer the 3-option fallback when no QA agent is hired'
  );
  assert.ok(
    !/Requires\s+`?testing-expert`?\s+agent\.\s+If it is not present/i.test(
      body
    ),
    'commands/tasks.md must not hard-require testing-expert — the search-first rule replaces that gate'
  );
});

test('commands/tasks.md documents the skip-tests opt-out and persists it', () => {
  // /awos:verify reads tasks.md to decide whether the spec is in
  // skip-tests mode. The marker shape is part of the contract — if it
  // moves, verify.md will not detect it. Lock the shape here.
  const body = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    body.includes('<!-- skip-tests: true -->'),
    'commands/tasks.md must record SKIP_TESTS via the literal "<!-- skip-tests: true -->" marker so /awos:verify can detect it'
  );
  assert.ok(
    /SKIP_TESTS\s*=\s*true/.test(body),
    'commands/tasks.md must keep the SKIP_TESTS flag wording — Step 1 and Step 3a both gate on it'
  );
});

test('commands/tasks.md marks an unreviewed tasks.md and clears it on review', () => {
  // tasks.md is written before review (Step 4), so it starts as a
  // draft carrying a "<!-- not-user-reviewed -->" marker that Step 5
  // removes once the user reviews it. The marker shape is the contract
  // — awos-qa greps the saved file to tell a draft from a reviewed
  // plan, so a reword here would silently break that detection. Lock
  // the shape, plus the removal-on-review instruction.
  const body = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    body.includes('<!-- not-user-reviewed -->'),
    'commands/tasks.md must record the literal "<!-- not-user-reviewed -->" marker so awos-qa can detect a draft-grade tasks.md'
  );
  assert.ok(
    /remove the `<!-- not-user-reviewed -->` marker/i.test(body),
    'commands/tasks.md Step 5 must remove the not-user-reviewed marker once the plan has been reviewed'
  );
});

test('commands/implement.md gates on the not-user-reviewed marker and verifies subagent claims', () => {
  // /awos:implement is the marker's consumer: a draft-grade tasks.md
  // must not execute silently. The literal marker string is the join
  // key with commands/tasks.md. The same command must also treat a
  // subagent's success report as a claim to spot-check, not a fact —
  // the two trust gates that keep an unreviewed or unverified plan
  // from advancing on autopilot.
  const body = readUtf8(path.join(commandsDir, 'implement.md'));
  assert.ok(
    body.includes('<!-- not-user-reviewed -->'),
    'commands/implement.md must check the literal "<!-- not-user-reviewed -->" marker before executing a plan, so drafts /awos:tasks saved unreviewed are gated'
  );
  assert.ok(
    /claim, not a fact/i.test(body),
    "commands/implement.md Step 4 must frame a subagent's report as a claim to verify, not a fact to relay"
  );
  assert.ok(
    !/assume that a success signal/i.test(body),
    'commands/implement.md must not instruct the orchestrator to assume a subagent success signal means the task completed'
  );
});

test('commands/verify.md acknowledges the skip-tests marker', () => {
  // The Slack thread feedback frames /awos:verify as look-and-feel +
  // spec-freshness rather than a test runner. The skip-tests marker
  // from /awos:tasks must short-circuit any test-running expectation
  // in this command — the literal marker string is the join key.
  const body = readUtf8(path.join(commandsDir, 'verify.md'));
  assert.ok(
    body.includes('<!-- skip-tests: true -->'),
    'commands/verify.md must reference the "<!-- skip-tests: true -->" marker so the two commands agree on the opt-out shape'
  );
  assert.ok(
    /look-and-feel|spec-freshness/i.test(body),
    'commands/verify.md must frame itself as a look-and-feel / spec-freshness check, not a test runner'
  );
});

test('verify.md does not hardcode a verification-tool priority order', () => {
  // The Slack feedback was explicit: tools should be chosen by fit
  // and wall-clock time, not a fixed ladder. The previous draft used
  // an arrow ladder "browser MCP → curl/shell → AskUserQuestion".
  // Lock that out.
  const body = readUtf8(path.join(commandsDir, 'verify.md'));
  assert.ok(
    !/browser MCP\s*→\s*curl\/shell\s*→/.test(body),
    'commands/verify.md must not declare a hardcoded "browser MCP → curl/shell → AskUserQuestion" tool priority'
  );
  assert.ok(
    !/fallback order:\s*browser MCP/i.test(body),
    'commands/verify.md must not name a fixed verification-tool fallback order'
  );
});

test('verify.md and the flow templates never punt a drivable render to the user', () => {
  // Road-test regression (session 928eba0a): the generated /fix-bug
  // paused and told the user to run `! make run` for the live check,
  // even though the agent could reclaim the port or drive the deploy
  // itself. It punted because a shared-resource guardrail made
  // "can't auto-verify" artificially true. The fix: running the app is
  // the flow's job, and the manual AskUserQuestion fallback is only for
  // a criterion with no agent-driven render path at all. Lock the
  // guidance into verify.md and both flow templates so a regenerated
  // command carries it.
  const verify = readUtf8(path.join(commandsDir, 'verify.md'));
  assert.ok(
    /Running the app is your job, not the user's/i.test(verify) ||
      /Running the app to verify is/i.test(verify),
    "commands/verify.md must state that running the app to verify is the agent's job — a reserved shared resource is not grounds to hand the user a `run` command"
  );
  assert.ok(
    /last resort/i.test(verify) && /alternate port/i.test(verify),
    'commands/verify.md must frame the manual AskUserQuestion fallback as a last resort and name agent-driven paths (alternate port / reclaim / deploy) to try first'
  );

  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /Running the app to verify is the flow's job, not the user's/i.test(body),
      `${tmpl} verify stage must state that running the app to verify is the flow's job, not the user's — the shared-resource guardrail must not become a reason to punt`
    );
    assert.ok(
      /sanctioned verification path/i.test(body),
      `${tmpl} verify stage must point at the §2/§3 sanctioned verification path (reclaim the resource / alternate port / drive the deploy) so a drivable criterion is never deferred to a manual run`
    );
  }

  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /sanctioned verification path/i.test(flow),
    'flow.md worktree/shared-resource investigation must record a sanctioned verification path so the generated verify stage self-verifies instead of handing the user a `run` command'
  );
  const dfTemplate = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /Sanctioned verification path/i.test(dfTemplate),
    'delivery-flow-template.md §2 must carry a "Sanctioned verification path" field so the decision record captures how verify drives the app when a shared resource is reserved'
  );
});

test('the flow templates finalize the flow-log at commit-push and never leave it as a leftover', () => {
  // Road-test regression (session 928eba0a): the generated flow left
  // context/spec/006-settings-page/flow-log.md dirty — the close stage
  // appended after the last commit, so the entry could never reach the
  // merged PR. The flow-log is committed with the work but must stop
  // being written once the change request is opened or merged, and the
  // close stage must leave a clean tree. Lock the discipline into both
  // templates, flow.md, and the decision record.
  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /once the change request is opened — or the change is merged — stop writing to the tracked log/i.test(
        body
      ),
      `${tmpl} must stop writing to the tracked flow-log once the change request is opened or merged — a late append strands a change that can never reach the PR`
    );
    assert.ok(
      /flow-log's last committed state/i.test(body),
      `${tmpl} commit-push stage must finalize the flow-log in that commit (write the entry before staging)`
    );
    assert.ok(
      /Leave a clean working tree/i.test(body) &&
        /leftover after a merged or in-review change request is a bug/i.test(
          body
        ),
      `${tmpl} close stage must guarantee a clean working tree — an uncommitted flow-created artifact after merge/review is a bug, not a record`
    );
  }

  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /stops writing to it once the change request is opened or merged/i.test(
      flow
    ),
    'flow.md context-strategy must bake in the flow-log commit discipline so generated commands never leave an uncommittable leftover'
  );
  const dfTemplate = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /never becomes an uncommittable leftover/i.test(dfTemplate),
    'delivery-flow-template.md §8 flow-log field must record that the log is finalized at commit-push and never left as a leftover'
  );
});

test('the flow distinguishes interactive vs unattended AskUserQuestion timeouts', () => {
  // A road-test found the 60s AskUserQuestion no-answer fallback firing
  // in an interactive session, silently defaulting while the user was
  // still deciding. The 60s timer is a harness guard (the skill can't
  // change it), but the reaction is ours: unattended runs (driven with
  // AWOS_UNATTENDED=1) take the safe default; interactive runs re-ask
  // once and announce the default. An irreversible step never proceeds
  // on a timeout. Lock the env-var contract into flow.md, both
  // templates, and the decision record.
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /AWOS_UNATTENDED/.test(flow),
    'flow.md must key the unanswered-question handling off the AWOS_UNATTENDED env var — interactive and headless runs treat a 60s timeout differently'
  );
  assert.ok(
    /re-ask the question once/i.test(flow),
    'flow.md must re-ask once in an interactive run rather than silently defaulting on the 60s timeout'
  );

  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /AWOS_UNATTENDED/.test(body) && /No response after 60s/i.test(body),
      `${tmpl} must carry the AWOS_UNATTENDED run-mode rule for the harness's "No response after 60s" fallback`
    );
    assert.ok(
      /timeout never authorizes an irreversible step/i.test(body),
      `${tmpl} must keep the guard that a timeout never authorizes an irreversible step (merge / spec-amendment confirmations stay a no)`
    );
  }

  const dfTemplate = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /AWOS_UNATTENDED=1/.test(dfTemplate),
    'delivery-flow-template.md §6 must record AWOS_UNATTENDED=1 as an operator prerequisite for unattended runs'
  );
});

test('flow.md investigation probes before claiming absence and validates ticket transitions', () => {
  // Road-test #2 regressions (HOP-3749): (1) the investigation missed a
  // versioned pre-commit hook installed via core.hooksPath and the
  // generated command confidently asserted "there are no pre-commit
  // hooks"; (2) the decision record said "PR opened → In Review" but the
  // tracker had no direct Open → In Review transition, so an unattended
  // run would fail its first transition; (3) the worktree recipe skipped
  // git-ignored build prerequisites, costing the fix agent an
  // undocumented install + codegen. Lock the probe list, the
  // no-absence-claims rule, transition-chain validation, and the
  // bring-up steps into flow.md and the decision-record template.
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /core\.hooksPath/.test(flow) && /\.pre-commit-config\.yaml/.test(flow),
    'flow.md Step 2 must carry an explicit pre-commit-hook probe list (core.hooksPath, .husky/, .pre-commit-config.yaml, …) — a hook found only in the conventional place is how the road-test missed a versioned one'
  );
  assert.ok(
    /No absence claims without a probe/i.test(flow),
    'flow.md Step 2 must forbid the decision record and generated commands from asserting "no X" unless X was explicitly probed — an unprobed signal is unknown, not absent'
  );
  assert.ok(
    /validate it at generation time/i.test(flow) &&
      /transition.*chain/i.test(flow),
    'flow.md §5 ticket-state map must be validated at generation time against a sample issue and record full transition chains (intermediate hops), not just target state names'
  );
  assert.ok(
    /bring-up steps/i.test(flow) && /\.gitignore/.test(flow),
    'flow.md worktree sub-interview must probe .gitignore for build-required artifacts and put the bring-up steps (install, codegen, env files) into the isolation recipe'
  );

  const dfTemplate = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /transition chain/i.test(dfTemplate),
    'delivery-flow-template.md §5 must record validated transition chains (with IDs where exposed), not just target states'
  );
  assert.ok(
    /bring-up steps/i.test(dfTemplate),
    'delivery-flow-template.md §2 Worktrees field must include the bring-up steps for git-ignored prerequisites'
  );

  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /recorded transition chain/i.test(body),
      `${tmpl} remote-gates stage must follow the recorded transition chain (intermediate hops), not just the target state name`
    );
  }
});

test('fix-bug template reads remote links, sweeps all surfaces, and verifies subagent claims', () => {
  // Road-test #2 regressions (HOP-3749): the bug's real context (a
  // screenshot naming the broken surface) lived in a Jira remote link;
  // diagnosis stopped at the first of three affected surfaces; an
  // Explore report proposed a 3-file fix where one line sufficed; and a
  // subagent returned a green-but-vacuous regression test asserting an
  // already-correct path. Lock the fetch-remote-links step, the
  // all-surfaces sweep, verified-vs-hypothesis labels, the demonstrated
  // fail-on-old-code check, and the verify-evidence proportionality
  // tier into the fix-bug template.
  const body = readUtf8(path.join(pluginTemplatesDir, 'fix-bug-template.md'));
  assert.ok(
    /remote links, attachments/i.test(body),
    "fix-bug fetch stage must pull the ticket's remote links and attachments — the real repro context often lives there, not in the description"
  );
  assert.ok(
    /every surface that renders or consumes the symptom data/i.test(body),
    'fix-bug diagnose stage must enumerate every renderer/consumer of the symptom data (sibling composers), not stop at the first root cause'
  );
  assert.ok(
    /\*\*verified\*\*/.test(body) && /\*\*hypothesis\*\*/.test(body),
    'fix-bug diagnose reports must label each claim verified vs hypothesis, and the orchestrator re-reads the named lines before accepting the fix shape'
  );
  assert.ok(
    /demonstrated, not asserted/i.test(body) && /green-but-vacuous/i.test(body),
    'fix-bug regression-test stage must demonstrate fail-on-old-code on a changed path (revert → fail → restore → pass) and reject a test that is green pre-fix'
  );
  assert.ok(
    /Scale the evidence to what changed/i.test(body),
    'fix-bug verify stage must carry the proportionality tier: for a payload-only fix with an untouched render path, regression test + unit-level render with mocks is sanctioned evidence'
  );

  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const t = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /report is a claim, not a fact/i.test(t),
      `${tmpl} Context Discipline must state that subagent reports are claims to spot-check, not facts to relay`
    );
  }
});

test('completion claims require fresh evidence — the verification reflex is baked into agent prompts', () => {
  // The verification-before-completion discipline: an agent may not
  // report its own work as done on belief ("should work", "Done!") —
  // the claim cites command output produced in the same run, and a
  // test written for a change is proven by failing without that
  // change. "RED validation" is the canonical name — coined by the
  // testing slice commands/tasks.md emits — so the other prompts
  // reference it rather than coining parallel terms. agent-template.md
  // is the ancestor of every hired specialist; /awos:implement's
  // <completion_evidence> block makes each subagent prove the tests it
  // writes; the implement-feature flow adds the orchestrator's
  // independent spot-check of one test, honoring skip-tests.
  const tasks = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    /RED validation/.test(tasks),
    'commands/tasks.md testing slice must carry the literal "RED validation" wording — the other prompts reference it as the canonical term'
  );

  const agentTemplate = readUtf8(path.join(templatesDir, 'agent-template.md'));
  assert.ok(
    /completion claim cites its evidence/i.test(agentTemplate),
    'templates/agent-template.md must require completion claims to cite fresh evidence — every hired agent inherits this template'
  );
  assert.ok(
    /browser-automation/i.test(agentTemplate) &&
      /docs\/screenshots\//.test(agentTemplate) &&
      /curl/.test(agentTemplate),
    "templates/agent-template.md must name the sanctioned evidence forms, mirroring commands/verify.md — browser-automation + screenshot to docs/screenshots/ for UI; curl/shell/log/database/MCP for the rest — so evidence isn't read as test-only"
  );
  assert.ok(
    /RED validation/.test(agentTemplate) &&
      /revert|stash/i.test(agentTemplate) &&
      /fail/i.test(agentTemplate),
    'templates/agent-template.md must require RED validation of new tests — revert the covered change, see the test fail, restore, see it pass'
  );
  assert.ok(
    /opted out of tests/i.test(agentTemplate),
    'templates/agent-template.md must make the tests opt-out explicit — evidence stays required in another form, and RED validation goes inert rather than prompting an unwanted test'
  );

  const implement = readUtf8(path.join(commandsDir, 'implement.md'));
  assert.ok(
    /RED validation/.test(implement) && /watch it fail/i.test(implement),
    'commands/implement.md <completion_evidence> block must carry the RED-validation fail-first proof for tests a subagent writes as part of a task'
  );
  assert.ok(
    /tailored to the task/i.test(implement) &&
      /exact test command/i.test(implement),
    'commands/implement.md <completion_evidence> block must be tailored per task — the evidence requirement in every delegation, RED validation instantiated concretely (what to revert, the exact test command) only when the task writes a test'
  );
  assert.ok(
    implement.includes('<!-- skip-tests: true -->'),
    'commands/implement.md <completion_evidence> block must honor the <!-- skip-tests: true --> marker — drop the RED-validation clause under an opt-out while keeping the evidence requirement'
  );

  const featureTemplate = readUtf8(
    path.join(pluginTemplatesDir, 'implement-feature-template.md')
  );
  assert.ok(
    /RED validation/.test(featureTemplate) &&
      /revert|stash/i.test(featureTemplate),
    'implement-feature-template.md implement stage must spot-check the testing slice via RED validation — the writing subagent proves its tests; the orchestrator independently re-proves one'
  );
  assert.ok(
    featureTemplate.includes('<!-- skip-tests: true -->'),
    'implement-feature-template.md spot-check must honor the <!-- skip-tests: true --> opt-out — with the marker set no testing slice exists to check'
  );
});

test('flow.md generator version constant matches plugin.json and stamps the artifacts', () => {
  // flow.md carries a literal generator-version constant with two jobs:
  // every generated artifact's footer marker is stamped with it (Step 6),
  // and the re-run detector compares each artifact's footer `version=`
  // against it to decide whether the templates have moved on (Step 1.4).
  // This test keeps the constant in sync with the manifest so the footer
  // provenance and re-run detection stay truthful.
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  const manifest = JSON.parse(
    readUtf8(
      path.join(repoRoot, 'plugins', 'awos', '.claude-plugin', 'plugin.json')
    )
  );
  const constant = flow.match(/generator version is `([^`]+)`/);
  assert.ok(
    constant,
    'flow.md Step 1 must declare a literal generator-version constant ("generator version is `X.Y.Z`") for the footer stamp and re-run detection'
  );
  assert.strictEqual(
    constant[1],
    manifest.version,
    `flow.md generator-version constant (${constant[1]}) must equal plugins/awos/.claude-plugin/plugin.json version (${manifest.version}) — bump them together or the footer stamp and re-run detection go stale`
  );

  const marketplace = JSON.parse(
    readUtf8(path.join(repoRoot, '.claude-plugin', 'marketplace.json'))
  );
  const awosEntry = marketplace.plugins.find((p) => p.name === 'awos');
  assert.ok(awosEntry, 'marketplace.json must list the awos plugin');
  assert.strictEqual(
    awosEntry.version,
    manifest.version,
    `marketplace.json awos entry version (${awosEntry.version}) must equal plugin.json version (${manifest.version}) — CLAUDE.md requires bumping both manifests together`
  );

  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /awos:flow:generated date=\[YYYY-MM-DD\] version=\[[^\]]+\] source=/.test(
        body
      ),
      `${tmpl} footer marker must carry version=[…] and source= fields so re-runs can tell which generator produced the on-disk artifacts and from which decision record`
    );
  }
});

test('flow.md flags routing policies that route agents around the generated commands', () => {
  // Road-test #2 item 8 (narrowed): the generated commands are
  // auto-discovered by autocomplete, but an agent follows the loaded
  // routing policy — hops' CLAUDE.md "AWOS Workflow (Required)" section
  // prescribed the manual /awos:* chain, so agents routed around
  // /implement-feature and /fix-bug by instruction, and nothing
  // auto-loads delivery-flow.md. flow.md must check always-loaded docs
  // for such a policy at investigation time and advise the wording fix
  // in the Step 8 project-side setup fixes (flag, never auto-edit).
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /Routing policy in always-loaded docs/i.test(flow),
    'flow.md Step 2 must inspect CLAUDE.md/AGENTS.md-style always-loaded docs for a prescribed-workflow section that routes agents through the manual /awos:* chain'
  );
  assert.ok(
    /routes around/i.test(flow),
    'flow.md must state why the policy matters: an agent following a manual-chain-only policy routes around the generated commands by instruction'
  );
  assert.ok(
    /advise updating it and offer the concrete wording/i.test(flow),
    'flow.md Step 8 must advise the routing-policy update with concrete wording as a project-side fix the user applies — the flow flags it, it does not edit CLAUDE.md'
  );
});

test('generated commands carry the hops-style Self-Improvement Loop with governed boundaries', () => {
  // Road-test #2 item 9, reworked to the hops team's field-tested shape
  // (hops fix-bug.md "Self-Improvement Loop"): a flow defect found
  // during a run (disproven fact, missing step, workaround-forcing
  // instruction) is fixed in the same run, shipped in the same change
  // request, recorded in the flow log, and promoted to Local
  // Customizations so regeneration preserves it. Boundaries stay
  // governed: delivery decisions belong to the flow owner, and
  // generator defects are reported via the user (an in-command "report
  // to the maintainers" is not actionable — the LLM has no channel).
  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /## Self-Improvement Loop/.test(body),
      `${tmpl} must carry the fixed Self-Improvement Loop section`
    );
    assert.ok(
      /same branch, same change request/i.test(body),
      `${tmpl} loop must ship flow fixes in the same change request as the work, never a separate one`
    );
    assert.ok(
      /promote it into the decision record's \*\*Local Customizations\*\*/i.test(
        body
      ),
      `${tmpl} loop must promote corrections to Local Customizations so regeneration preserves them`
    );
    assert.ok(
      /belongs to whoever owns the team's process/i.test(body),
      `${tmpl} loop must leave delivery decisions to the flow owner — a run never changes one`
    );
    assert.ok(
      /tell the user so they can report it to the AWOS repo/i.test(body),
      `${tmpl} loop must route generator defects through the user (actionable), not an abstract "report to maintainers"`
    );
  }

  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /Self-Improvement Loop/.test(flow) &&
      /never changes a delivery _?decision_? on its own/i.test(flow),
    'flow.md Step 6 must instruct keeping the Self-Improvement Loop verbatim and restate that a run never changes a delivery decision'
  );

  const dfTemplate = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /Self-Improvement Loop/.test(dfTemplate),
    'delivery-flow-template.md §10 must say Self-Improvement Loop corrections land in Local Customizations'
  );
});

test('generated commands are clean, self-contained, and interaction-explicit', () => {
  // Road-test #3 feedback (sde-automation PR #26): the regenerated
  // commands copied the template's generator-facing header comment into
  // the output (two paragraphs of noise), fix-bug said "Same resume
  // logic as implement-feature" (commands know nothing about each other
  // at run time), and stages that ask the user lost their explicit
  // AskUserQuestion mentions. Lock the fixes into the templates and
  // flow.md.
  for (const tmpl of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, tmpl));
    assert.ok(
      /do NOT copy it, or any\s+adaptation of it, into the generated file/.test(
        body
      ),
      `${tmpl} header comment must declare itself generator-only — never copied or adapted into the generated command`
    );
    assert.ok(
      /self-contained/i.test(body),
      `${tmpl} must require the generated command to be self-contained — no references to the sibling command`
    );
    assert.ok(
      /Every fixed-choice interaction with the user/i.test(body),
      `${tmpl} Context Discipline must route every fixed-choice user interaction through AskUserQuestion`
    );
    assert.ok(
      /Never improvise worktree preparation/i.test(body),
      `${tmpl} workspace stage must invoke the project's worktree command/script or the recorded §2 recipe — never improvise git-worktree prep in-run`
    );
    assert.ok(
      /agents do not nest/i.test(body),
      `${tmpl} local-review stage must handle the agent hierarchy: a review skill that spawns subagents runs from the main context, never wrapped in a subagent`
    );
  }

  const fixBug = readUtf8(path.join(pluginTemplatesDir, 'fix-bug-template.md'));
  assert.ok(
    !/Same resume logic as implement-feature/i.test(fixBug),
    'fix-bug-template.md must not defer to implement-feature for its resume logic — commands are independent at run time'
  );
  assert.ok(
    /awos:flow:stage=local-review/.test(fixBug),
    'fix-bug-template.md must have its own local-review stage — review folded into remote-gates loses its independent context'
  );

  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /no top-of-file comment/i.test(flow),
    'flow.md Step 6 must state the generated file carries no top-of-file comment — template headers are generator instructions'
  );
  assert.ok(
    /never improvises worktree preparation/i.test(flow),
    'flow.md worktree sub-interview must reuse an existing worktree command/script or record an exact recipe the stage executes verbatim'
  );
  assert.ok(
    /inspecting the review automation/i.test(flow),
    'flow.md Step 6 must pick the review shape at generation time by inspecting whether the reused review skill dispatches subagents'
  );
});

test('a generator update triggers full regeneration even when no decision changed', () => {
  // Road-test regression (sde-automation PR #25): after the generator
  // gained the road-test #2 fixes, a regenerate-only re-run (no
  // dimensions revisited) produced ONLY a version-stamped footer and a
  // log entry — none of the new template prose landed, because
  // reconciliation was decision-driven: unchanged decisions read as
  // "nothing to change", new sections outside stage markers had no
  // reconciliation slot, and new probes hung off unselected dimensions.
  // Lock the three fixes: generator update as an independent
  // regeneration trigger, generator-owned prose outside markers, and
  // fact-gap probes on any re-run.
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /generator-update re-run/i.test(flow),
    'flow.md Step 1 re-run detection must classify a footer version older than (or missing against) the constant as a generator-update re-run that regenerates every stage'
  );
  assert.ok(
    /independent regeneration triggers/i.test(flow),
    'flow.md Step 6 must treat a decision change and a generator update as independent regeneration triggers — "no dimensions revisited" never means the old text stays'
  );
  assert.ok(
    /never just a stamp-and-date update/i.test(flow),
    'flow.md Step 6 must forbid the no-op failure mode: an outdated footer triggers stage regeneration, not just a version stamp'
  );
  assert.ok(
    /generator-owned/i.test(flow) && /outside the stage markers/i.test(flow),
    'flow.md Step 6 must declare prose outside stage markers generator-owned — rewritten from the current template on every regeneration, since nothing reconciles it stage-by-stage'
  );
  assert.ok(
    /fact gap/i.test(flow) &&
      /fact upgrade is not a decision change/i.test(flow),
    'flow.md Step 5 must fill record fields the current template defines but the on-disk record lacks (transition chains, bring-up steps, routing policy) on any re-run, without a dimension being re-opened'
  );
});

test('hire.md QA Complement Rule is search-first and not tool-hardcoded', () => {
  // Mirror of the verify.md anti-hardcoding rule. /awos:hire must
  // propose a QA agent by searching the registry, not by always
  // including testing-expert or always recommending Playwright for
  // any frontend stack. Lock out the prior hard rules so they do not
  // creep back in.
  const body = readUtf8(path.join(commandsDir, 'hire.md'));
  assert.ok(
    /QA Complement Rule/.test(body),
    'commands/hire.md must declare a QA Complement Rule section'
  );
  assert.ok(
    !/always include\s+`?testing-expert`?/i.test(body),
    'commands/hire.md must not declare a blanket "always include testing-expert" rule — the rule is search-first now'
  );
  assert.ok(
    !/always include\s+`?playwright`?/i.test(body),
    'commands/hire.md must not declare a blanket "always include playwright" rule for any stack — tool choice depends on the project'
  );
});

test('setup-config does not auto-populate .claude/agents/', () => {
  // .claude/agents/ is the user's customization area. The earlier draft
  // of this PR shipped a `plugins/awos/agents` → `.claude/agents` copy
  // operation that would silently clobber user-authored subagents on
  // every install. AWOS-bundled agents (e.g. testing-expert) are hired
  // through awos-recruitment instead — so the installer must not
  // create or overwrite anything under .claude/agents/.
  const { copyOperations } = require(
    path.join(repoRoot, 'src', 'config', 'setup-config.js')
  );
  const offending = copyOperations.find(
    (op) => op.destination === '.claude/agents'
  );
  assert.ok(
    !offending,
    'setup-config must not declare a copy operation targeting .claude/agents/ — that directory is user-owned'
  );
});

test('templates/qa-context-template.md is not bundled with AWOS core', () => {
  // The test-registry template was originally shipped with this PR but
  // ended up unused inside the AWOS repo (the testing-expert agent that
  // would have populated it lives in awos-recruitment). Lint stops the
  // file from sneaking back in — if a future PR wants to add a related
  // template, it should justify the contract first.
  const file = path.join(templatesDir, 'qa-context-template.md');
  assert.ok(
    !fs.existsSync(file),
    'templates/qa-context-template.md must not exist in AWOS core — it belongs alongside testing-expert in awos-recruitment'
  );
});

test('SDD-07 recognizes the dual-model QA coverage', () => {
  // The audit dimension was updated to recognize both:
  //   - the new model (Feature Testing & Regression as the final slice)
  //   - the legacy per-slice Verify-task model
  // If the wording drifts so that only the legacy model is recognized,
  // every PR using the new model would warn — and vice versa.
  const file = path.join(dimensionsDir, 'spec-driven-development.md');
  const body = readUtf8(file);
  assert.ok(
    /Feature Testing & Regression/.test(body),
    'SDD-07 must reference the new "Feature Testing & Regression" final slice when discussing QA coverage'
  );
  assert.ok(
    /Legacy model/i.test(body),
    'SDD-07 must still recognize the legacy per-slice QA verification model so older specs are not over-flagged'
  );
});

test('flow.md wires the delivery-flow generator contract end to end', () => {
  // /awos:flow generates the project's /implement-feature command from two
  // templates and a decision record. The four path references below are the
  // joints of that contract — if any drifts, generation reads or writes the
  // wrong file. The command ships as a plugin command (plugins/awos/commands/),
  // not via the core installer — workshur asked to keep it out of the main flow.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  const requiredRefs = [
    // Templates ship bundled in the plugin (self-contained), not via the
    // installer's .awos/templates/ — a plugin user need not re-run the
    // installer to get the scaffolds.
    '${CLAUDE_PLUGIN_ROOT}/templates/delivery-flow-template.md',
    '${CLAUDE_PLUGIN_ROOT}/templates/implement-feature-template.md',
    'context/product/delivery-flow.md',
    '.claude/commands/implement-feature.md',
    // Context-strategy introspection must target the full prompts, not the
    // one-line wrappers in .claude/commands/awos/ (observed live: grepping
    // the wrappers returned all zeros and confused the interview).
    '.awos/commands/*.md',
  ];
  const missing = requiredRefs.filter((ref) => !body.includes(ref));
  assert.deepEqual(
    missing,
    [],
    `plugins/awos/commands/flow.md must reference its templates and both generated artifacts; missing: ${missing.join(', ')}`
  );
  assert.ok(
    /prefer the CLI/i.test(body),
    'plugins/awos/commands/flow.md must record the CLI-over-MCP transport preference (CLI is usually faster and cheaper in tokens)'
  );
  assert.ok(
    body.includes('`Explore`'),
    'plugins/awos/commands/flow.md must delegate the read-heavy project scan to the built-in Explore subagent, not read the codebase in its own context'
  );
  assert.ok(
    /automatic reviewers installed on the code host/i.test(body),
    'plugins/awos/commands/flow.md Step 2 must detect automatic reviewers installed on the code host (CodeRabbit-style bots)'
  );
  assert.ok(
    /waits for its review after opening the change request/i.test(body),
    'plugins/awos/commands/flow.md review dimension must carry the wait-and-address gate for a detected automatic reviewer'
  );
  assert.ok(
    /two to four listed options/i.test(body),
    'plugins/awos/commands/flow.md must state the AskUserQuestion 2–4 option bound — a single-option question is rejected at the schema level (observed live: the Step 3 docs question crashed with InputValidationError)'
  );
  assert.ok(
    !/One listed option suffices/i.test(body),
    'plugins/awos/commands/flow.md must not instruct a single-option AskUserQuestion call — the tool schema requires at least two options'
  );
  assert.ok(
    body.includes('`multiSelect`'),
    'plugins/awos/commands/flow.md must direct combinable answers (review gates, entry points) to multiSelect questions instead of yes/no series or forced single picks'
  );
  assert.ok(
    /Reuse, Replace, or Compose/i.test(body) && /Step 4\.5/.test(body),
    'plugins/awos/commands/flow.md must evaluate existing project automation in Step 4.5 (reuse/replace/compose) rather than adopting or ignoring it unconditionally — discovered automation is compared, and close calls are asked with the evidence'
  );
  assert.ok(
    /drives a large span of the flow autonomously/i.test(body),
    'flow.md must detect an existing command that overlaps the whole flow and surface the collision instead of generating a competing /implement-feature'
  );
  assert.ok(
    /\*\*Notifications\.\*\*/.test(body),
    'plugins/awos/commands/flow.md must interview the Notifications dimension — the flow announces transitions so the team stays aware as gates are removed'
  );
});

test('flow.md re-run interviews only the dimensions the user chose', () => {
  // A road-test re-run re-reviewed all seven dimensions with "(текущее)"
  // defaults instead of only the ones the user wanted to change. The re-run
  // path must collect a granular per-dimension selection in Step 1.3 and
  // interview only those, bulk-confirming the rest unchanged.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /granular/i.test(body),
    'flow.md re-run path must collect a granular per-dimension selection (the individual dimensions), not coarse buckets that re-ask everything inside them'
  );
  assert.ok(
    /bulk-confirm/i.test(body),
    'flow.md re-run path must bulk-confirm the unselected dimensions as unchanged in one summary line — never re-ask a dimension the user did not choose to revisit'
  );
  assert.ok(
    /only those/i.test(body),
    'flow.md Step 4 must interview only the dimensions selected on a re-run, not fall back to the fresh-run all-dimensions interview'
  );
});

test('flow.md keeps autonomy holistic and un-steered', () => {
  // The approval-gates question mis-steered the road-test user toward the
  // most-gated option, and autonomy was gates-only — reused interactive
  // skills and chain interviews impose pauses the gate choice never sees.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /do \*\*not\*\* pre-mark the most-gated option/i.test(body),
    'flow.md approval-gates question must not pre-mark the most-gated option "(Recommended)" — the amount of gating is the user\'s autonomy call, and flow.md forbids decorative recommendations'
  );
  assert.ok(
    /no gates: unattended/i.test(body),
    'flow.md approval-gates options must read as an autonomy spectrum labeled by the pauses each imposes (two gates / one combined gate / no gates: unattended)'
  );
  assert.ok(
    /Reused interactivity is part of the autonomy decision/i.test(body),
    "flow.md Step 4.5 must treat a reused skill's per-run confirmations as part of the autonomy decision (reuse-with-prompt vs. compose a non-interactive path that keeps validation) — not a silent import"
  );
  assert.ok(
    /Interaction budget/i.test(body),
    'flow.md Step 8 must report an Interaction budget enumerating every human-pause — gate-controlled, reuse-imposed, and chain-imposed — so "how autonomous is it really" is visible at generation time'
  );
});

test('flow.md tells the user to commit the generated artifacts', () => {
  // /awos:flow leaves delivery-flow.md + the generated command uncommitted;
  // the first run then warns on the dirty tree. Step 8 must close the gap.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /commit the generated artifacts/i.test(body),
    'flow.md Step 8 must tell the user to commit the generated artifacts (delivery-flow.md, implement-feature.md, fix-bug.md when present) so the first run starts from a clean tree'
  );
});

test('flow.md captures canonical project config and reconciles reused-skill constants', () => {
  // A reused skill hardcoded the wrong Jira instance host; the dead link
  // surfaced at runtime and was mis-blamed on the generated command. Step 2
  // must capture the canonical config and Step 4.5 must reconcile a reused
  // skill's hardcoded constants against it at generation time.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /Canonical project config/i.test(body) && /base URL/i.test(body),
    'flow.md Step 2 must capture canonical project config (Jira base URL, Slack channel/handles, code-host org/repo) as project-config facts'
  );
  assert.ok(
    /hardcoded constants/i.test(body) && /Project Setup/i.test(body),
    'flow.md Step 4.5 must scan a reused skill for hardcoded constants and reconcile them against the captured Project Setup config, asking on a mismatch'
  );
  assert.ok(
    /Format\/lint gate scope/i.test(body) &&
      /Do not add a format pass inside the generated flow/i.test(body),
    'flow.md Step 2 must detect a repo-wide format/lint gate and Step 8 must advise the project-side ignore fix — without adding a format pass inside the flow'
  );
});

test('delivery-flow-template.md carries a flow-agnostic Project Setup section', () => {
  // The canonical config the reconcile step checks against lives in the
  // decision record so re-runs and the sibling fix-bug flow reuse it.
  const body = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /## .*Project Setup/.test(body),
    'delivery-flow-template.md must declare a "Project Setup" section recording the canonical config (Jira base URL, Slack channel, team handles) — reconciled against reused-skill constants at generation time'
  );
  assert.ok(
    /base URL/i.test(body) && /code-host org\/repo/i.test(body),
    'delivery-flow-template.md Project Setup must record the Jira base URL and code-host org/repo so reused skills can be checked against them'
  );
});

test('flow.md and the template guard the generated header against comment-nesting', () => {
  // A generated file embedded a literal awos:flow:stage marker inside its
  // outer <!-- … --> header comment; the inner --> closed the comment early
  // (CodeRabbit-flagged). The generator must be told to describe markers in
  // prose, never nest one HTML comment inside another.
  const flowBody = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  const tplBody = readUtf8(
    path.join(pluginTemplatesDir, 'implement-feature-template.md')
  );
  assert.ok(
    /never nest one inside another/i.test(flowBody),
    "flow.md Step 6 must instruct the generator not to nest stage-marker HTML comments inside the generated file's own header comment"
  );
  assert.ok(
    /never nest one inside another/i.test(tplBody),
    'implement-feature-template.md header must warn the generator never to nest the stage-marker comments'
  );
});

test('implement-feature-template.md carries stage markers and the AWOS chain', () => {
  // The generated /implement-feature command is user-owned; /awos:flow re-runs
  // reconcile manual edits per stage. The HTML-comment stage markers are the
  // attribution mechanism — without them, regeneration degrades to whole-file
  // clobbering. The template must also route coding through the AWOS chain
  // rather than implementing in the main context.
  const body = readUtf8(
    path.join(pluginTemplatesDir, 'implement-feature-template.md')
  );
  assert.ok(
    body.includes('<!-- awos:flow:stage=') &&
      body.includes('<!-- /awos:flow:stage -->'),
    'implement-feature-template.md must fence every stage with <!-- awos:flow:stage=... --> / <!-- /awos:flow:stage --> markers so /awos:flow re-runs can attribute manual edits per stage'
  );
  assert.strictEqual(
    (body.match(/<!-- awos:flow:stage=/g) || []).length,
    (body.match(/<!-- \/awos:flow:stage -->/g) || []).length,
    'implement-feature-template.md stage markers must be balanced — every opener needs its closer, or per-stage re-run attribution silently breaks'
  );
  for (const cmd of [
    '/awos:spec',
    '/awos:tech',
    '/awos:tasks',
    '/awos:implement',
    '/awos:verify',
  ]) {
    assert.ok(
      body.includes(cmd),
      `implement-feature-template.md must run ${cmd} as part of the generated flow`
    );
  }
  assert.ok(
    /do not implement tasks in the main context/i.test(body),
    'implement-feature-template.md must preserve the orchestrator-only guard — coding goes through /awos:implement subagents'
  );
  for (const stage of ['local-review', 'remote-gates', 'merge']) {
    assert.ok(
      body.includes(`<!-- awos:flow:stage=${stage} -->`),
      `implement-feature-template.md must carry the ${stage} stage — the flow reviews locally before spending CI minutes, waits on remote gates, and covers the merge step, not just PR creation`
    );
  }
  assert.ok(
    /skipped or unanswered confirmation means do not merge/i.test(body),
    'implement-feature-template.md merge stage must keep the per-run confirmation guard as fixed prose — merging is irreversible, so a skipped confirmation is a no (inverse of the #132 skip-default)'
  );
  assert.ok(
    body.includes('flow-log.md'),
    'implement-feature-template.md must keep the flow-log contract — each stage appends a summary so fresh sessions resume from disk state'
  );
  assert.ok(
    /never launch a nested headless session/i.test(body),
    'implement-feature-template.md must forbid nested `claude -p` calls — permission modes, PATH, and timeouts vary per machine; headless chaining lives at the trigger layer'
  );
  assert.ok(
    /`Monitor` tool, never foreground `sleep` loops/.test(body),
    'implement-feature-template.md must wait on remote gates with the Monitor tool, not blind sleep loops — and its filter must cover failure states, not just success'
  );
  assert.ok(
    /merge cleanly/.test(body) && /re-check mergeability/.test(body),
    'implement-feature-template.md must check target-branch conflicts twice: before opening the change request and again before merging (the target moves while gates run)'
  );
  assert.ok(
    /do not add run-time focus areas/i.test(body),
    'implement-feature-template.md review stage must keep the independence rule: the reviewer prompt is fixed at generation time — an orchestrator that just implemented the change must not frame its own review'
  );
  // The close stage must surface the local review (verdict + finding count +
  // review file path) — the review is a real gate but otherwise buried in
  // the logs. The Close-the-Loop stage is the hand-off report.
  const closeStage = body.slice(body.indexOf('awos:flow:stage=close-ticket'));
  assert.ok(
    /verdict/i.test(closeStage) &&
      /finding count/i.test(closeStage) &&
      closeStage.includes('review.md'),
    'implement-feature-template.md close stage must report the local review evidence — verdict, finding count, and the review file path (context/spec/{SPEC_NAME}/review.md)'
  );
  const stageOrder = [
    'fetch-ticket',
    'resume-detection',
    'workspace',
    'specs',
    'commit-specs',
    'implement',
    'verify',
    'local-review',
    'commit-push',
    'remote-gates',
    'merge',
    'delivery',
    'close-ticket',
  ];
  const positions = stageOrder.map((s) =>
    body.indexOf(`<!-- awos:flow:stage=${s} -->`)
  );
  for (let i = 0; i < stageOrder.length; i++) {
    assert.ok(
      positions[i] !== -1 && (i === 0 || positions[i] > positions[i - 1]),
      `implement-feature-template.md stages must appear in canonical order (${stageOrder.join(' → ')}); '${stageOrder[i]}' is missing or out of place — in particular, verify and local-review precede commit-push (CI minutes are spent on reviewed code only) and merge comes after remote-gates`
    );
  }
});

test('delivery-flow-template.md preserves customizations and the tooling inventory', () => {
  // Local Customizations is where /awos:flow promotes manual edits the user
  // chose to keep — losing the section silently re-clobbers them on the next
  // regeneration. The tooling inventory records the chosen transport
  // (CLI vs MCP) per external service.
  const body = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /## .*Local Customizations/.test(body),
    'delivery-flow-template.md must declare a "Local Customizations" section — the regeneration contract depends on it'
  );
  assert.ok(
    /## .*Tooling Inventory/.test(body),
    'delivery-flow-template.md must declare a "Tooling Inventory" section recording the chosen transport per service'
  );
  assert.ok(
    /\*\*Merge policy:\*\*/.test(body) && /\*\*Post-merge CI:\*\*/.test(body),
    'delivery-flow-template.md §5 must record the merge policy and post-merge CI fields — the generated merge/ci-monitor stages derive from them'
  );
  assert.ok(
    /## .*Context Strategy/.test(body),
    'delivery-flow-template.md must declare a "Context Strategy" section — subagent-isolated stages and the flow log are recorded decisions, not ad-hoc behavior'
  );
  assert.ok(
    /## .*Notifications/.test(body),
    'delivery-flow-template.md must declare a "Notifications" section — where the flow announces transitions so the team stays aware as gates are removed'
  );
  assert.ok(
    /## Generation Log/.test(body),
    'delivery-flow-template.md must declare a "Generation Log" section — flow.md Steps 5/6 append re-run and correction entries to it'
  );
  assert.ok(
    /Stage automation \(reuse \/ replace \/ compose\)/.test(body),
    'delivery-flow-template.md must record the per-stage reuse/replace/compose decision for overlapping project automation, so re-runs do not regenerate over a reused command'
  );
  assert.ok(
    /## .*Bug-fix Flow/.test(body),
    'delivery-flow-template.md must declare a "Bug-fix Flow" section — whether fix-bug was generated, the classification/amendment policy, and the regression-test expectation; the sibling command consumes it'
  );
});

test('product.md passes brownfield findings to documentation retrieval', () => {
  // product.md creates brownfield.md first (substep 1), then uses its
  // content as <existing_findings> in the documentation retrieval prompt
  // (substep 2) so the Explore agent does not repeat codebase findings.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    /<existing_findings>/.test(body),
    'commands/product.md must pass existing brownfield findings to the documentation retrieval Explore agent'
  );
});

test('commands/spec.md carries an Update Mode that amends in place', () => {
  // spec.md was creation-only; a behavior-changing fix had no way to keep the
  // spec in sync. Update Mode mirrors the Step 2A pattern in
  // product/roadmap/architecture: detect an existing spec, edit it in place,
  // and never allocate a new index.
  const body = readUtf8(path.join(commandsDir, 'spec.md'));
  assert.ok(
    /Mode Detection/i.test(body) && /Update Mode/i.test(body),
    'commands/spec.md must add a Mode Detection step that routes an existing-spec reference to an Update Mode (mirroring product/roadmap/architecture)'
  );
  assert.ok(
    /never allocates a new index/i.test(body) &&
      /never runs `create-spec-directory\.sh`/i.test(body),
    'commands/spec.md Update Mode must edit in place — it must never run create-spec-directory.sh and never allocate a new index'
  );
  assert.ok(
    /## Change Log/.test(body),
    'commands/spec.md Update Mode must append a dated entry under a ## Change Log heading'
  );
  assert.ok(
    /stays `Completed`/i.test(body),
    'commands/spec.md Update Mode must not force a Status transition — a spec amended after a verified fix stays Completed'
  );
});

test('functional-spec-template.md declares a Change Log section', () => {
  // The amendment target for spec.md Update Mode must be a well-defined,
  // canonical section so the edit knows where to write.
  const body = readUtf8(path.join(templatesDir, 'functional-spec-template.md'));
  assert.ok(
    /## Change Log/.test(body),
    'functional-spec-template.md must carry a canonical "## Change Log" section — the target for Update-Mode amendments'
  );
});

test('fix-bug-template.md carries the canonical bug-fix stages and the classify gate', () => {
  // The generated /fix-bug command is the lighter sibling of
  // /implement-feature: diagnose → fix → scoped re-verify → targeted spec
  // amendment. Its classify gate is what makes spec-amendment correct, and
  // its amend-spec stage must invoke core /awos:spec rather than duplicating
  // amendment prose.
  const body = readUtf8(path.join(pluginTemplatesDir, 'fix-bug-template.md'));
  const stageOrder = [
    'fetch-bug',
    'resume-detection',
    'workspace',
    'diagnose',
    'classify',
    'fix',
    'regression-test',
    'verify-criteria',
    'amend-spec',
    'local-review',
    'commit-push',
    'remote-gates',
    'merge',
    'close-ticket',
  ];
  const positions = stageOrder.map((s) =>
    body.indexOf(`<!-- awos:flow:stage=${s} -->`)
  );
  for (let i = 0; i < stageOrder.length; i++) {
    assert.ok(
      positions[i] !== -1 && (i === 0 || positions[i] > positions[i - 1]),
      `fix-bug-template.md stages must appear in canonical order (${stageOrder.join(' → ')}); '${stageOrder[i]}' is missing or out of place`
    );
  }
  assert.ok(
    body.includes('<!-- /awos:flow:stage -->'),
    'fix-bug-template.md must close every stage with the <!-- /awos:flow:stage --> marker so /awos:flow re-runs can attribute manual edits per stage'
  );
  assert.strictEqual(
    (body.match(/<!-- awos:flow:stage=/g) || []).length,
    (body.match(/<!-- \/awos:flow:stage -->/g) || []).length,
    'fix-bug-template.md stage markers must be balanced — every opener needs its closer, or per-stage re-run attribution silently breaks'
  );
  assert.ok(
    /[Cc]onformance/.test(body) && /[Dd]ivergence/.test(body),
    'fix-bug-template.md classify stage must distinguish conformance bugs (do not amend the spec) from divergence (amend the spec) — the gate that makes amendment correct'
  );
  assert.ok(
    /amend-spec/.test(body) && /invoke[s]? `\/awos:spec`/i.test(body),
    'fix-bug-template.md amend-spec stage must invoke core /awos:spec in update mode on a divergence, not duplicate amendment prose'
  );
  assert.ok(
    body.includes('**[Agent:') &&
      /do not edit code in the main context/i.test(body),
    'fix-bug-template.md must be orchestrator-only — the fix is delegated via **[Agent: name]** and the orchestrator never edits code itself'
  );
  assert.ok(
    body.includes('<!-- skip-tests: true -->'),
    'fix-bug-template.md regression-test/verify-criteria stages must honor the <!-- skip-tests: true --> opt-out'
  );
  assert.ok(
    /`Monitor` tool, never foreground `sleep` loops/.test(body),
    'fix-bug-template.md remote-gates stage must wait with the Monitor tool, not blind sleep loops, with a filter covering failure states'
  );
  assert.ok(
    /skipped or unanswered confirmation means do not merge/i.test(body),
    'fix-bug-template.md merge stage must keep the per-run confirmation guard — a skipped confirmation is a no'
  );
  const closeStage = body.slice(body.indexOf('awos:flow:stage=close-ticket'));
  assert.ok(
    /verdict/i.test(closeStage) &&
      /finding count/i.test(closeStage) &&
      /review file path/i.test(closeStage),
    'fix-bug-template.md close stage must report the local review evidence (verdict, finding count, review file path as recorded in the flow log) — the same hand-off treatment as implement-feature'
  );
  for (const section of ['§2', '§4', '§5', '§9']) {
    assert.ok(
      body.includes(section),
      `fix-bug-template.md must reuse the shared delivery-flow decisions (${section}) rather than re-deriving them`
    );
  }
});

test('flow.md wires fix-bug generation alongside implement-feature', () => {
  // /awos:flow must generate the optional second command from its own
  // template, gated on the Command-set decision, with the same
  // reconcile-on-rerun behavior as implement-feature.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    body.includes('${CLAUDE_PLUGIN_ROOT}/templates/fix-bug-template.md'),
    'flow.md must reference the bundled fix-bug-template.md so generation is self-contained in the plugin'
  );
  assert.ok(
    body.includes('.claude/commands/fix-bug.md'),
    'flow.md must keep the default bug-fix command path .claude/commands/fix-bug.md'
  );
  assert.ok(
    /classification gate/i.test(body),
    'flow.md bug-fix policy must settle the classification gate (conformance vs. divergence)'
  );
});

test('flow.md inventory covers platform build/verify toolchains', () => {
  // Step 2 probed only web browser automation; mobile/native flows verify
  // with a platform toolchain (Eugene uses XcodeBuildMCP build_sim).
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /Build & verify toolchain/i.test(body),
    "flow.md Step 2 inventory must record the project's build/verify toolchain as a transport"
  );
  assert.ok(
    /XcodeBuildMCP|Gradle|emulator|simulator/i.test(body),
    'flow.md must recognize non-web build/verify toolchains (iOS/Android), not just browser automation'
  );
});

test('generated commands resume from the roadmap and skip already-done work', () => {
  // /everclear:workflow with no arg picks the next roadmap item; and a ticket
  // already Done / spec already Completed must not be re-implemented.
  const feat = readUtf8(
    path.join(pluginTemplatesDir, 'implement-feature-template.md')
  );
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /next incomplete item in `context\/product\/roadmap\.md`/i.test(feat),
    'implement-feature-template.md must resume from the next incomplete roadmap item when invoked with no input'
  );
  for (const f of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, f));
    assert.ok(
      /every source §1 records/i.test(body),
      `${f} resume-detection must check status across every source §1 records, not a single place`
    );
  }
  assert.ok(
    /already `Completed`/i.test(feat),
    'implement-feature-template.md must stop when the owning spec is already Completed (or its tasks are all done) instead of re-running the chain'
  );
  assert.ok(
    /"done"\/closed state names/i.test(flow),
    "flow.md §1 must capture the tracker's done/closed state names so resume-detection can skip delivered work"
  );
});

test('flow.md and the template record a ticket-state lifecycle and CI escalation', () => {
  // Eugene automates the whole status cycle off flow/CI events — including
  // the failure path (review fails → back to To Do) — driven by a project
  // -built CI AI reviewer. And remote-gate waits need a max-wait/escalation
  // policy, not an unbounded poll.
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  const tpl = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /Ticket state transitions/i.test(flow) &&
      /Ticket state transitions/i.test(tpl),
    'flow.md §5 and delivery-flow-template.md must record a ticket-state transition map (events → tracker states), not just the closing transition'
  );
  assert.ok(
    /back to .*needs-work|→ back to/i.test(flow),
    'the ticket-state map must cover the failure path — a failed gate/review sends the ticket back to a needs-work state'
  );
  assert.ok(
    /project-built AI reviewer/i.test(flow),
    'flow.md §4 must recognize a project-built CI AI reviewer (a GitHub Action calling Claude), not only third-party bots'
  );
  assert.ok(
    /max-wait/i.test(flow) && /max-wait/i.test(tpl),
    'flow.md §4 and delivery-flow-template.md must record a max-wait & escalation policy for remote-gate waits'
  );
  for (const f of ['implement-feature-template.md', 'fix-bug-template.md']) {
    const body = readUtf8(path.join(pluginTemplatesDir, f));
    assert.ok(
      /max-wait & escalation policy/i.test(body),
      `${f} remote-gates stage must apply the §4 max-wait & escalation policy instead of waiting forever`
    );
  }
});

test('fix-bug-template.md supports a crash-report source', () => {
  // Eugene's /everclear:fix starts from a Crashlytics issue: pull events,
  // map the stack to real file:line, and refuse to invent lines when the
  // build is unsymbolicated. The generated fix-bug command must support
  // crash reporters as a bug source, generically.
  const tpl = readUtf8(path.join(pluginTemplatesDir, 'fix-bug-template.md'));
  assert.ok(
    /unsymbolicated/i.test(tpl) && /do not invent line numbers/i.test(tpl),
    'fix-bug-template.md fetch-bug stage must map a crash stack to local file:line and refuse to invent line numbers on an unsymbolicated build'
  );
  assert.ok(
    /never auto-close/i.test(tpl),
    'fix-bug-template.md must allow writing an investigation note back to the crash issue without auto-closing it'
  );
  const flow = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /bug source/i.test(flow) && /crash report/i.test(flow),
    'flow.md bug-fix policy must ask the bug source, including a crash report from a crash-reporting tool'
  );
});

test('flow.md interviews the command set and names', () => {
  // Eugene's road-test named his commands to taste (/everclear:workflow,
  // /everclear:fix); the generator must let the team pick which commands to
  // build and what to call them, and record the names so re-runs reconcile
  // the right files. This decision absorbs the old bug-fix opt-in.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    /Command set & names/i.test(body),
    'flow.md must interview a "Command set & names" decision — which commands to generate (feature, bug-fix, or both) and the slash-name for each'
  );
  assert.ok(
    /Generated Commands/.test(body),
    "flow.md must record the chosen command names/filenames in the decision record's Generated Commands field so re-runs reconcile the right files"
  );
  assert.ok(
    /`\/feature`|`\/fix`/.test(body),
    'flow.md must show that the generated commands can be renamed from the defaults (e.g. /feature, /fix)'
  );
});

test('delivery-flow-template.md records the generated command set', () => {
  // Re-runs read this field to find the exact files to reconcile — it can no
  // longer assume implement-feature.md / fix-bug.md once names are renameable.
  const body = readUtf8(
    path.join(pluginTemplatesDir, 'delivery-flow-template.md')
  );
  assert.ok(
    /## .*Generated Commands/.test(body),
    'delivery-flow-template.md must declare a "Generated Commands" section recording each command\'s slash name and file'
  );
});

test('flow.md reads configured sources from context/sources/sources.md', () => {
  // flow.md's tooling inventory and team documentation collection must
  // reuse sources already configured by configure-external-sources rather
  // than re-probing the same services independently.
  const body = readUtf8(path.join(pluginCommandsDir, 'flow.md'));
  assert.ok(
    body.includes('context/sources/sources.md'),
    'flow.md must reference context/sources/sources.md as an input for configured transports'
  );
  assert.ok(
    /sources\.md.*Status: configured/i.test(body),
    'flow.md must check for ## Status: configured before reading sources.md transports'
  );
});

test('commands/tasks.md marks an unreviewed tasks.md and clears it on review', () => {
  // tasks.md is written before review (Step 4), so it starts as a
  // draft carrying a "<!-- not-user-reviewed -->" marker that Step 5
  // removes once the user reviews it. The marker shape is the contract
  // — awos-qa greps the saved file to tell a draft from a reviewed
  // plan, so a reword here would silently break that detection. Lock
  // the shape, plus the removal-on-review instruction.
  const body = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    body.includes('<!-- not-user-reviewed -->'),
    'commands/tasks.md must record the literal "<!-- not-user-reviewed -->" marker so awos-qa can detect a draft-grade tasks.md'
  );
  assert.ok(
    /remove the `<!-- not-user-reviewed -->` marker/i.test(body),
    'commands/tasks.md Step 5 must remove the not-user-reviewed marker once the plan has been reviewed'
  );
});

test('product.md creates context/product/brownfield.md on brownfield detection', () => {
  // /awos:product is the entry point for brownfield detection. When it finds
  // source code indicators it must explore the codebase and write accepted
  // findings to context/product/brownfield.md. Downstream commands (roadmap,
  // architecture) depend on this file existing to avoid duplicate exploration.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    body.includes('context/product/brownfield.md'),
    'commands/product.md must reference context/product/brownfield.md as the brownfield findings destination'
  );
  assert.ok(
    /with a `## Product` heading/.test(body),
    'commands/product.md must write brownfield findings under a "## Product" heading (anchored to brownfield.md context)'
  );
});

test('product.md brownfield detection includes source code indicators', () => {
  // The whole brownfield entry point depends on product.md checking for
  // source code indicators. If the indicator list is hollowed out,
  // brownfield never fires and the entire downstream chain goes dead.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    body.includes('package.json'),
    'commands/product.md must check for package.json as a brownfield indicator'
  );
  assert.ok(
    body.includes('`src/`'),
    'commands/product.md must check for src/ as a brownfield indicator'
  );
});

test('roadmap.md reads brownfield.md and appends a Capabilities section', () => {
  // /awos:roadmap reads the brownfield file produced by /awos:product and
  // runs its own focused exploration for capabilities. It must append its
  // findings under a "## Capabilities" heading so /awos:architecture can
  // see the accumulated context.
  const body = readUtf8(path.join(commandsDir, 'roadmap.md'));
  assert.ok(
    body.includes('context/product/brownfield.md'),
    'commands/roadmap.md must reference context/product/brownfield.md to consume and extend brownfield findings'
  );
  assert.ok(
    /under a `## Capabilities` heading/.test(body),
    'commands/roadmap.md must append brownfield findings under a "## Capabilities" heading (anchored to brownfield.md context)'
  );
});

test('architecture.md reads brownfield.md and appends a Technology section', () => {
  // /awos:architecture reads the accumulated brownfield file and runs a
  // focused exploration for the tech stack. It must append its findings
  // under a "## Technology" heading.
  const body = readUtf8(path.join(commandsDir, 'architecture.md'));
  assert.ok(
    body.includes('context/product/brownfield.md'),
    'commands/architecture.md must reference context/product/brownfield.md to consume and extend brownfield findings'
  );
  assert.ok(
    /under a `## Technology` heading/.test(body),
    'commands/architecture.md must append brownfield findings under a "## Technology" heading (anchored to brownfield.md context)'
  );
});

test('architecture.md conditionally removes brownfield.md after onboarding completes', () => {
  // /awos:architecture is the last command that uses brownfield.md. By this
  // point all brownfield knowledge has been absorbed into product-definition.md,
  // roadmap.md, and architecture.md. The brownfield file must be conditionally
  // cleaned up here, not deferred to /awos:hire.
  const body = readUtf8(path.join(commandsDir, 'architecture.md'));
  assert.ok(
    /If `context\/product\/brownfield\.md` exists, delete it/i.test(body),
    'commands/architecture.md must conditionally delete context/product/brownfield.md (guard + delete in one sentence)'
  );
});

test('brownfield commands launch Explore agents', () => {
  // The actual mechanism for brownfield awareness is the Explore agent.
  // Without it, the headings and triage prose are dead letters. Assert
  // that all three commands invoke the Explore subagent.
  for (const cmd of ['product.md', 'roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      /subagent_type="Explore"/.test(body),
      `commands/${cmd} must launch an Explore agent for brownfield analysis`
    );
  }
});

// ---------------------------------------------------------------------------
// External sources skill and documentation retrieval
// ---------------------------------------------------------------------------

test('configure-external-sources SKILL.md exists with required frontmatter', () => {
  // The configure-external-sources skill must exist as a plugin skill and have
  // the required frontmatter fields for Claude Code to discover and
  // invoke it.
  const skillPath = path.join(
    repoRoot,
    'plugins',
    'awos',
    'skills',
    'configure-external-sources',
    'SKILL.md'
  );
  assert.ok(
    fs.existsSync(skillPath),
    'plugins/awos/skills/configure-external-sources/SKILL.md must exist'
  );
  const { data } = parse(readUtf8(skillPath));
  assert.ok(data.name, 'SKILL.md frontmatter must have a name field');
  assert.ok(
    data.description,
    'SKILL.md frontmatter must have a description field'
  );
});

test('configure-external-sources SKILL.md references references/ for platform guides', () => {
  // The skill must load platform-specific setup guides from its own
  // references/ directory, not from commands/sources/ (which no longer
  // exists).
  const body = readUtf8(
    path.join(
      repoRoot,
      'plugins',
      'awos',
      'skills',
      'configure-external-sources',
      'SKILL.md'
    )
  );
  assert.ok(
    body.includes('references/'),
    'SKILL.md must reference its references/ directory for platform guides'
  );
});

test('configure-external-sources SKILL.md includes privacy gate for all sources', () => {
  // External sources may contain sensitive or personal data (PII in tickets,
  // internal discussions in wikis, private messages in chats). The skill must
  // warn the user that data will be sent to the LLM provider's API before
  // proceeding with retrieval.
  const body = readUtf8(
    path.join(
      repoRoot,
      'plugins',
      'awos',
      'skills',
      'configure-external-sources',
      'SKILL.md'
    )
  );
  const privacySection = body
    .split(/privacy gate/i)
    .slice(1)
    .join('');
  assert.ok(
    /LLM/i.test(privacySection),
    'SKILL.md privacy gate must mention LLM provider access'
  );
});

test('configure-external-sources SKILL.md stops when user declines at privacy gate', () => {
  // If the user declines at the privacy gate, the skill must write
  // ## Status: none and stop — not fall through to tool setup.
  const body = readUtf8(
    path.join(
      repoRoot,
      'plugins',
      'awos',
      'skills',
      'configure-external-sources',
      'SKILL.md'
    )
  );
  const privacySection = body
    .split(/privacy gate/i)
    .slice(1)
    .join('');
  assert.ok(
    /skip.*Status: none|skip.*stop/i.test(privacySection),
    'SKILL.md must stop with ## Status: none when the user declines at the privacy gate'
  );
});

test('configure-external-sources SKILL.md handles restart-resume with status markers', () => {
  // After adding MCP servers, the editor must be restarted. The skill
  // must write a status marker to sources.md and resume on re-invocation.
  const body = readUtf8(
    path.join(
      repoRoot,
      'plugins',
      'awos',
      'skills',
      'configure-external-sources',
      'SKILL.md'
    )
  );
  assert.ok(
    /restart-pending/i.test(body),
    'SKILL.md must use a restart-pending status marker for MCP restart-resume flow'
  );
  assert.ok(
    body.includes('verified'),
    'SKILL.md must use a verified status marker for post-verification state'
  );
  assert.ok(
    /## Status:/i.test(body),
    'SKILL.md must define ## Status: markers for state management'
  );
});

test('platform reference files exist under configure-external-sources skill', () => {
  // The skill reads platform-specific setup guides from references/.
  // All three category files must exist.
  const refsDir = path.join(
    repoRoot,
    'plugins',
    'awos',
    'skills',
    'configure-external-sources',
    'references'
  );
  for (const f of ['documentation.md', 'tickets.md', 'communication.md']) {
    assert.ok(
      fs.existsSync(path.join(refsDir, f)),
      `plugins/awos/skills/configure-external-sources/references/${f} must exist`
    );
  }
});

test('product.md invokes configure-external-sources skill for documentation setup', () => {
  // Only /awos:product invokes the configure-external-sources skill to create
  // context/sources/sources.md. Downstream commands read it if it exists.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    body.includes('Skill(name="awos:configure-external-sources")'),
    'commands/product.md must invoke the configure-external-sources skill for documentation setup'
  );
  assert.ok(
    body.includes('context/sources/sources.md'),
    'commands/product.md must reference context/sources/sources.md as the source manifest'
  );
});

test('product.md degrades gracefully when configure-external-sources skill is unavailable', () => {
  // The configure-external-sources skill ships with the awos plugin, which
  // may not be installed. product.md must handle the skill being absent
  // rather than silently failing, AND write ## Status: none so downstream
  // commands know sources were declined.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    /plugin absent|plugin is needed|skill is not found/i.test(body),
    'commands/product.md must handle the case where the awos plugin (and its skill) is not installed'
  );
  // Pin the fallback action — the fresh-run branch (the one that creates
  // sources.md from scratch) must write Status: none when the Skill call
  // fails. Split on the fresh-run clause to avoid matching the
  // intermediate-status branch, whose contract is to leave sources.md
  // untouched.
  const externalDocsBlock = body
    .split(/external documentation sources/i)
    .slice(1)
    .join('');
  const freshRunBranch = externalDocsBlock
    .split(/install it from the marketplace/i)
    .slice(1)
    .join('');
  assert.ok(
    /Status: none/i.test(freshRunBranch),
    'commands/product.md fresh-run branch must write ## Status: none as the fallback when the Skill call fails'
  );
});

test('product.md skips to substep 4 when user declines external docs', () => {
  // When the user says No (or the question goes unanswered), product.md must
  // skip to substep 4 without creating context/sources/. The question only
  // appears during Creation Mode on brownfield projects, so re-runs enter
  // Update Mode and never re-ask.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  const externalDocsBlock = body
    .split(/external documentation sources/i)
    .slice(1)
    .join('');
  assert.ok(
    /if no.*skip to substep 4/i.test(externalDocsBlock),
    'commands/product.md must skip to substep 4 when user declines external docs'
  );
  assert.ok(
    /default to .*No/i.test(externalDocsBlock),
    'commands/product.md must default to No when the external docs question goes unanswered'
  );
});

test('manual sources are handled across skill and commands', () => {
  // SKILL.md must offer manual as an access method in the manifest, and all
  // three retrieval commands must branch on manual sources (user pastes
  // content directly rather than calling a tool).
  const skillPath = path.join(
    repoRoot,
    'plugins',
    'awos',
    'skills',
    'configure-external-sources',
    'SKILL.md'
  );
  const skillBody = readUtf8(skillPath);
  assert.ok(
    /Access:.*manual/i.test(skillBody),
    'SKILL.md manifest must include Access: manual as an option'
  );

  for (const cmd of ['product.md', 'roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    const extDocBlock = body
      .split(/external documentation (sources|context)/i)
      .slice(1)
      .join('');
    assert.ok(
      /manual/i.test(extDocBlock),
      `commands/${cmd} retrieval must handle manual sources`
    );
  }
});

test('configure-external-sources SKILL.md has fallback for failed verification', () => {
  // If tool verification fails and troubleshooting doesn't help, the user
  // must be able to switch to manual or remove the source rather than being
  // stuck in a loop. Split on Step 6 heading to isolate the verification
  // section (not Step 1's passing mention of "tool verification").
  const skillPath = path.join(
    repoRoot,
    'plugins',
    'awos',
    'skills',
    'configure-external-sources',
    'SKILL.md'
  );
  const body = readUtf8(skillPath);
  const verificationSection = body
    .split(/## Step 6/)
    .slice(1)
    .join('');
  assert.ok(
    /switch to manual/i.test(verificationSection),
    'SKILL.md Step 6 must offer switching to manual when verification fails'
  );
  assert.ok(
    /remove this source/i.test(verificationSection),
    'SKILL.md Step 6 must offer removing the source when verification fails'
  );
});

test('product.md re-invokes skill for intermediate source states', () => {
  // When sources.md exists with restart-pending, verifying, or verified
  // status, product.md must re-invoke the skill to finish setup — this is
  // the restart-resume handshake that makes Step 5 of SKILL.md work.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  const externalDocsBlock = body
    .split(/external documentation sources/i)
    .slice(1)
    .join('');
  assert.ok(
    /restart-pending/i.test(externalDocsBlock),
    'commands/product.md must handle restart-pending status in sources.md'
  );
  assert.ok(
    /restart-pending[^]*?re-invoke|restart-pending[^]*?Skill/i.test(
      externalDocsBlock
    ),
    'commands/product.md must re-invoke the skill when sources.md has an intermediate status'
  );
});

test('downstream commands do not invoke configure-external-sources skill', () => {
  // Roadmap and architecture must not try to create sources from scratch.
  // If sources.md does not exist, that decision was made by purpose during
  // /awos:product. Downstream commands only read sources.md if it exists.
  for (const cmd of ['roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      !body.includes('Skill(name="awos:configure-external-sources")'),
      `commands/${cmd} must not invoke the configure-external-sources skill directly`
    );
    assert.ok(
      body.includes('context/sources/sources.md'),
      `commands/${cmd} must reference context/sources/sources.md for retrieval`
    );
  }
});

test('roadmap.md reads context/sources/sources.md for documentation retrieval', () => {
  // /awos:roadmap must reference sources.md inside the "External documentation
  // context" block — not just in INPUTS & OUTPUTS declarations.
  const body = readUtf8(path.join(commandsDir, 'roadmap.md'));
  const extDocBlock = body
    .split(/external documentation context/i)
    .slice(1)
    .join('');
  assert.ok(
    extDocBlock.includes('context/sources/sources.md'),
    'commands/roadmap.md must reference context/sources/sources.md inside the External documentation context block'
  );
});

test('architecture.md reads context/sources/sources.md for documentation retrieval', () => {
  // /awos:architecture must reference sources.md inside the "External
  // documentation context" block — not just in INPUTS & OUTPUTS declarations.
  const body = readUtf8(path.join(commandsDir, 'architecture.md'));
  const extDocBlock = body
    .split(/external documentation context/i)
    .slice(1)
    .join('');
  assert.ok(
    extDocBlock.includes('context/sources/sources.md'),
    'commands/architecture.md must reference context/sources/sources.md inside the External documentation context block'
  );
});

test('architecture.md checks absorption before cleaning up sources', () => {
  // architecture.md is the last onboarding command — it must verify all
  // source information was absorbed before deciding whether to delete
  // context/sources/. If useful content remains, sources.md is kept and
  // cross-referenced from product-definition.md.
  const body = readUtf8(path.join(commandsDir, 'architecture.md'));
  assert.ok(
    /absorbed/i.test(body),
    'commands/architecture.md must check whether source information was absorbed'
  );
  assert.ok(
    /context\/sources/i.test(body) && /delete/i.test(body),
    'commands/architecture.md must handle cleanup of context/sources/'
  );
});

test('retrieval commands pass existing findings to avoid duplicates', () => {
  // Product, roadmap, and architecture retrieval prompts must pass existing
  // brownfield findings to Explore agents via <existing_findings> tags so
  // agents skip already-confirmed findings.
  for (const cmd of ['product.md', 'roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      body.includes('<existing_findings>'),
      `commands/${cmd} must pass existing findings to the Explore agent to avoid duplicates`
    );
  }
});

test('external sources retrieval passes brownfield findings to avoid duplicate triage', () => {
  // The Explore agents that retrieve from external sources must receive the
  // current brownfield.md content so they do not resurface findings the user
  // has already triaged. The brownfield reference must appear inside the
  // retrieval prompt (after the sources.md guard), not just in the brownfield
  // exploration block.
  for (const cmd of ['product.md', 'roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    // Find the sources retrieval section and check it contains brownfield.md
    const sourcesSection = body
      .split(/external documentation (sources|context)/i)
      .slice(1)
      .join('');
    assert.ok(
      sourcesSection.includes('brownfield.md') &&
        sourcesSection.includes('<existing_findings>'),
      `commands/${cmd} sources retrieval must pass brownfield.md content via <existing_findings> to avoid duplicate triage`
    );
  }
});

test('retrieval commands guard on context/sources/sources.md existence', () => {
  // Roadmap and architecture must guard retrieval on sources.md existence
  // with configured status, inside the "External documentation context" block.
  for (const cmd of ['roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    const extDocBlock = body
      .split(/external documentation context/i)
      .slice(1)
      .join('');
    assert.ok(
      /sources\.md.*exists.*configured|sources\.md.*configured/i.test(
        extDocBlock
      ),
      `commands/${cmd} must guard documentation retrieval on context/sources/sources.md existence with configured status`
    );
  }
});

test('brownfield exploration passes existing findings to avoid duplicates', () => {
  // Each downstream exploration (roadmap, architecture) must pass the
  // current brownfield.md content to the Explore agent so it skips
  // already-confirmed findings. The literal <existing_findings> tag is
  // the contract — if renamed, the Explore prompt silently ignores it.
  // The "Report only NEW" instruction makes the tag actually work.
  for (const cmd of ['roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      body.includes('<existing_findings>'),
      `commands/${cmd} must pass existing brownfield findings inside <existing_findings> tags to the Explore agent`
    );
    assert.ok(
      /Report only NEW/i.test(body),
      `commands/${cmd} must instruct the Explore agent to report only NEW findings`
    );
  }
});

test('brownfield commands use accept/reject triage for findings', () => {
  // All three brownfield-aware commands must triage findings with the
  // user offering Accept and Reject options. The user can also provide
  // free-text via the built-in "Other" field.
  for (const cmd of ['product.md', 'roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      /Accept/.test(body),
      `commands/${cmd} must offer "Accept" as a triage option for brownfield findings`
    );
    assert.ok(
      /Reject/.test(body),
      `commands/${cmd} must offer "Reject" as a triage option for brownfield findings`
    );
  }
});

test('brownfield exploration includes fill-in slot for brownfield.md content', () => {
  // The fill-in slot tells the agent to interpolate brownfield.md contents
  // into the Explore prompt. Without it, <existing_findings> is empty and
  // dedup silently dies while the tag still matches.
  for (const cmd of ['roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      /\{paste the full current contents of context\/product\/brownfield\.md here\}/.test(
        body
      ),
      `commands/${cmd} must include the fill-in slot for brownfield.md content interpolation`
    );
  }
});

test('brownfield commands append (not overwrite) findings to brownfield.md', () => {
  // Each downstream command must append to brownfield.md, not overwrite it.
  // The append verb + heading together protect the accumulate-don't-overwrite
  // contract.
  const roadmapBody = readUtf8(path.join(commandsDir, 'roadmap.md'));
  assert.ok(
    /Append.*under a `## Capabilities` heading/i.test(roadmapBody),
    'commands/roadmap.md must append findings under a ## Capabilities heading'
  );
  const archBody = readUtf8(path.join(commandsDir, 'architecture.md'));
  assert.ok(
    /Append.*under a `## Technology` heading/i.test(archBody),
    'commands/architecture.md must append findings under a ## Technology heading'
  );
});

test('brownfield commands guard exploration on brownfield.md existence', () => {
  // Roadmap and architecture must check if brownfield.md exists before
  // running their explorations. Without this guard, greenfield projects
  // would attempt brownfield exploration.
  for (const cmd of ['roadmap.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      /brownfield\.md` exists/.test(body),
      `commands/${cmd} must guard brownfield exploration on brownfield.md existence`
    );
  }
});

test('product.md lets the user opt out of brownfield exploration', () => {
  // Even when source code is detected, the user may want to start from
  // scratch (e.g. reinitializing a project). product.md must ask before
  // launching the Explore agent.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    /start from scratch/i.test(body),
    'commands/product.md must offer a "start from scratch" option to skip brownfield exploration'
  );
});

test('product.md creates brownfield.md even when all findings are rejected', () => {
  // product.md must always create brownfield.md when a brownfield project is
  // detected, even if the user rejects every finding. The file acts as a
  // sentinel — downstream commands key on its existence to run their own
  // explorations.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    /still create the file/i.test(body),
    'commands/product.md must create brownfield.md even when all findings are rejected (sentinel behavior)'
  );
});

const skillRoot = path.join(
  repoRoot,
  'plugins',
  'awos',
  'skills',
  'ai-readiness-audit'
);
const referencesDir = path.join(skillRoot, 'references');

test('ai-sdlc metrics catalog exists and covers all tiers and rules', () => {
  const p = path.join(referencesDir, 'ai-sdlc-metrics-catalog.md');
  assert.ok(fs.existsSync(p), 'expected references/ai-sdlc-metrics-catalog.md');
  const src = readUtf8(p);
  for (const tier of ['Tier G', 'Tier C', 'Tier I', 'Tier D']) {
    assert.match(src, new RegExp(tier), `catalog must define ${tier}`);
  }
  for (const id of [
    'tooling_depth',
    'change_failure_rate',
    'ai_attribution',
    'work_mix_allocation',
    'mttr',
    'external_spec_coverage',
  ]) {
    assert.match(src, new RegExp(id), `catalog must define ${id}`);
  }
  // AI attribution is framed as a lower bound, not the true adoption level.
  assert.match(src, /lower bound/i);
  // No-PII, no-money, and the MTTR-skip rule must be stated.
  assert.match(
    src,
    /no data is attributed to named individuals/i,
    'catalog must state the actual privacy guarantee (repository granularity, no per-person attribution / no-PII)'
  );
  assert.match(src, /never.{0,20}(money|currenc)/i);
  assert.match(src, /MTTR/);
  assert.match(src, /SKIP/);
  // Citations present.
  assert.match(src, /DORA/);
  assert.match(src, /DX Core 4/);
  assert.match(src, /Provectus/);
  // New design: catalog is an index that references the engine + standards.
  assert.match(src, /standards\.toml/, 'catalog must reference standards.toml');
  assert.match(
    src,
    /collectors?\//,
    'catalog must reference the collectors/ layer'
  );
  assert.match(src, /metrics?\//, 'catalog must reference the metrics/ layer');
  // Current-state headline + explicit history (not before/after as the frame).
  assert.match(
    src,
    /current[- ]state/i,
    'catalog headline must be current-state'
  );
  assert.match(
    src,
    /history|lookback|monthly/i,
    'catalog must describe explicit history'
  );
  // Reliability is per-metric and computed.
  assert.match(
    src,
    /reliabilit/i,
    'catalog must describe per-metric reliability'
  );
  // Each metric row must name its real metrics/<id>.ts file.
  for (const id of [
    'tooling_depth',
    'active_contributors',
    'merge_frequency',
    'lead_time_for_change',
    'pr_cycle_time',
    'code_churn',
    'change_failure_rate',
    'review_rework',
    'ai_attribution',
    'ci_pass_rate',
    'pipeline_duration',
    'external_spec_coverage',
    'work_mix_allocation',
    'issue_throughput',
    'mttr',
  ]) {
    assert.match(
      src,
      new RegExp(`metrics/${id}\\.ts`),
      `catalog must name metrics/${id}.ts`
    );
  }
  // Each collector must be referenced by its real TS filename.
  for (const col of [
    'collectors/git.ts',
    'collectors/ci.ts',
    'collectors/tracker.ts',
    'collectors/docs.ts',
  ]) {
    assert.match(
      src,
      new RegExp(col.replace('/', '\\/')),
      `catalog must name ${col}`
    );
  }
  // No stale Python filenames.
  assert.doesNotMatch(
    src,
    /collectors\/[\w.]+\.py\b/,
    'catalog must not name any .py collector'
  );
  assert.doesNotMatch(
    src,
    /metrics\/[\w.]+\.py\b/,
    'catalog must not name any .py metric'
  );
  assert.doesNotMatch(
    src,
    /\.py\b/,
    'catalog must not contain any .py references'
  );
});

test('data-sources reference covers boundary rule, detection, and history params', () => {
  const p = path.join(referencesDir, 'data-sources.md');
  assert.ok(fs.existsSync(p), 'expected references/data-sources.md');
  const src = readUtf8(p);
  // The audit boundary is always a folder or a GitHub org — never a manifest file.
  assert.doesNotMatch(
    src,
    /sources\.toml/i,
    'data-sources must not reference a sources.toml scope manifest — the boundary is the folder or GitHub org'
  );
  assert.match(
    src,
    /boundary/i,
    'data-sources must describe the audit boundary rule'
  );
  assert.match(
    src,
    /gh repo list/,
    'data-sources must enumerate a GitHub org via `gh repo list <org>`'
  );
  assert.match(
    src,
    /org mode/i,
    'data-sources must describe org mode (a non-git folder of git subdirs, or a GitHub org)'
  );
  assert.match(src, /monorepo/i); // monorepo = single-repo mode over the whole folder
  assert.match(src, /current repo/i); // no-arg default
  assert.match(src, /AskUserQuestion/); // confirm scope once, at start
  assert.match(src, /discovery/i); // discovery-first flow
  assert.match(
    src,
    /standards\.toml/,
    'data-sources must point at standards.toml for period/history params'
  );
  assert.match(
    src,
    /monthly|30[- ]day|bucket/i,
    'data-sources must describe the monthly bucket cadence'
  );
  assert.match(
    src,
    /2[- ]year|730|lookback/i,
    'data-sources must describe the 2-year lookback cap'
  );
  assert.match(
    src,
    /minimal.{0,30}history|min(imum)?[- ]source[- ]history/i,
    'data-sources must state the minimal-source-history bound'
  );
  assert.match(
    src,
    /SKIP/,
    'data-sources must state the SKIP-when-no-source rule'
  );
  // Must name the real TS collector files, not Python ones.
  for (const col of [
    'collectors/git.ts',
    'collectors/ci.ts',
    'collectors/tracker.ts',
    'collectors/docs.ts',
  ]) {
    assert.match(
      src,
      new RegExp(col.replace('/', '\\/')),
      `data-sources must name ${col}`
    );
  }
  // Must reference the bundled CLI entry point.
  assert.match(src, /dist\/cli\.js/, 'data-sources must reference dist/cli.js');
  // Must reference the collected/ artifact directory.
  assert.match(
    src,
    /collected\//,
    'data-sources must reference the collected/ artifact dir'
  );
  // No stale Python filenames.
  assert.doesNotMatch(
    src,
    /collectors\/[\w.]+\.py\b/,
    'data-sources must not name any .py collector'
  );
  assert.doesNotMatch(
    src,
    /\.py\b/,
    'data-sources must not contain any .py references'
  );
});

test('standards.toml exists and matches the category/band schema', () => {
  const p = path.join(referencesDir, 'standards.toml');
  assert.ok(fs.existsSync(p), 'expected references/standards.toml');
  const src = readUtf8(p);
  // [meta] cadence + lookback are data, with the exact locked values.
  // Metrics v3: a single 90-day window (no 30-day bucketing); the active-
  // contributor and rework-horizon thresholds are locked meta constants.
  assert.match(src, /\[meta\]/, 'standards.toml must have a [meta] table');
  assert.doesNotMatch(
    src,
    /monthly_bucket_days/,
    'meta.monthly_bucket_days must be removed (single 90-day window, no bucketing)'
  );
  assert.match(
    src,
    /max_lookback_days\s*=\s*90/,
    'meta.max_lookback_days must be 90 (single recent window)'
  );
  assert.match(
    src,
    /active_contributor_threshold\s*=\s*0\.05/,
    'meta.active_contributor_threshold must be 0.05 (active-contributor exclusion threshold)'
  );
  assert.match(
    src,
    /rework_horizon_days\s*=\s*21/,
    'meta.rework_horizon_days must be 21 (code-turnover rework window)'
  );
  assert.match(
    src,
    /standards_version\s*=\s*"/,
    'meta.standards_version must be set'
  );
  // Required keys must appear inside a [category.*] table block, not merely
  // somewhere in the file — slice each block and assert against it so a key
  // declared only in (say) a [source.*] table can't satisfy the check.
  // [category.<slug>] only — [category.<slug>.scoring] sub-tables have their
  // own schema, asserted separately below.
  const categoryBlocks = [
    ...src.matchAll(/\[category\.[^.\]]+\]([\s\S]*?)(?=\n\[|$)/g),
  ].map((m) => m[1]);
  assert.ok(
    categoryBlocks.length > 0,
    'standards.toml must define [category.*] tables'
  );
  for (const key of [
    'code',
    'metric',
    'dimension',
    'weight',
    'definition',
    'applies_when',
    'sources',
    'reliability_default',
    'source',
  ]) {
    assert.ok(
      categoryBlocks.some((b) => new RegExp(`^\\s*${key}\\s*=`, 'm').test(b)),
      `[category.*] tables must declare ${key}`
    );
  }
  // check_id is required on EVERY category — standards.toml is the single
  // source of truth for check ids (the engine no longer parses dimension .md
  // headings at runtime; a heading rename must not change artifact ids).
  // Anchored to line start so the commented schema sketch in the file header
  // (`# [category.<slug>]`) is not mistaken for a real block.
  for (const m of src.matchAll(
    /\n\[category\.[^.\]]+\]([\s\S]*?)(?=\n\[|$)/g
  )) {
    const b = m[1];
    const code = (b.match(/^\s*code\s*=\s*(\d+)/m) || [])[1];
    assert.ok(
      /^\s*check_id\s*=\s*"/m.test(b),
      `[category.*] block${code ? ` (code ${code})` : ''} must declare check_id — standards.toml is the sole source of check ids`
    );
  }
  // Reliability defaults use the locked vocabulary only.
  const relTags = src.match(/reliability_default\s*=\s*"([^"]+)"/g) || [];
  for (const m of relTags) {
    assert.match(
      m,
      /"(minimal|maximal|not-reliable)"/,
      `reliability_default must be one of minimal|maximal|not-reliable: ${m}`
    );
  }
  // Verdict-step thresholds: detectors read their PASS/WARN/FAIL steps from
  // pass_at / warn_at / fail_at fields, not from code. Validate every
  // declared field and require them on the categories whose steps were
  // lifted out of detector code (2026-07-06 standards refresh follow-up).
  for (const m of src.matchAll(
    /\n\[category\.([^.\]]+)\]([\s\S]*?)(?=\n\[|$)/g
  )) {
    const [, slug, b] = m;
    const read = (key) => {
      const km = b.match(new RegExp(`^${key}\\s*=\\s*([\\d.]+)`, 'm'));
      return km ? Number(km[1]) : null;
    };
    const passAt = read('pass_at');
    const warnAt = read('warn_at');
    const failAt = read('fail_at');
    for (const [k, v] of [
      ['pass_at', passAt],
      ['warn_at', warnAt],
      ['fail_at', failAt],
    ]) {
      assert.ok(
        v === null || (v > 0 && v < 1),
        `[category.${slug}] ${k} must be a share in (0, 1); got ${v}`
      );
    }
    if (passAt !== null && warnAt !== null) {
      assert.ok(
        warnAt < passAt,
        `[category.${slug}] warn_at (${warnAt}) must be below pass_at (${passAt})`
      );
    }
    if (failAt !== null && warnAt !== null) {
      assert.ok(
        warnAt < failAt,
        `[category.${slug}] warn_at (${warnAt}) must be below fail_at (${failAt}) — bad-share checks WARN before they FAIL`
      );
    }
    if (failAt !== null && passAt !== null) {
      assert.fail(
        `[category.${slug}] declares both pass_at and fail_at — a check grades one direction, not both`
      );
    }
  }
  for (const slug of [
    'quality_assurance_qa_01',
    'appsec_auth_on_mutations',
    'software_best_practices_sbp_03',
    'software_best_practices_sbp_06',
    'sbp_vertical_delivery',
    'spec_driven_development_sdd_04',
    'spec_driven_development_sdd_07',
    'supply_chain_security_scs_03',
    'code_architecture_arch_06',
  ]) {
    const block = src.match(
      new RegExp(`\\n\\[category\\.${slug}\\]([\\s\\S]*?)(?=\\n\\[|$)`)
    );
    assert.ok(block, `[category.${slug}] must exist`);
    assert.match(
      block[1],
      /^\s*(pass_at|fail_at|warn_at)\s*=/m,
      `[category.${slug}] must declare its verdict thresholds (pass_at/warn_at or fail_at/warn_at) — they were lifted out of detector code so the linter can police them`
    );
  }

  // Scoring sub-tables: every [category.<slug>.scoring] declares the full
  // curve schema — scale, anchors, and a basis with the locked vocabulary.
  const scoringBlocks = [
    ...src.matchAll(/\n\[category\.[^.\]]+\.scoring\]([\s\S]*?)(?=\n\[|$)/g),
  ].map((m) => m[1]);
  assert.ok(
    scoringBlocks.length > 0,
    'standards.toml must define [category.*.scoring] curve tables'
  );
  for (const b of scoringBlocks) {
    assert.match(
      b,
      /^\s*scale\s*=\s*"(linear|log)"/m,
      'every scoring table must declare scale = "linear"|"log"'
    );
    assert.match(
      b,
      /^\s*anchors\s*=\s*\[/m,
      'every scoring table must declare anchors = [[x, y], …]'
    );
    assert.match(
      b,
      /^\s*basis\s*=\s*"(published|derived|heuristic)"/m,
      'every scoring table must declare basis = published|derived|heuristic'
    );
  }
  // At least one band table for banded metrics.
  assert.match(
    src,
    /\[band\./,
    'standards.toml must define at least one [band.*] table'
  );
  // Every category declares a method from the locked vocabulary.
  const methods = src.match(/\n\s*method\s*=\s*"([^"]+)"/g) || [];
  const categoryCount = (src.match(/^\[category\.[^.\]]+\]/gm) || []).length;
  assert.equal(
    methods.length,
    categoryCount,
    'every [category.*] must declare a method= line'
  );
  for (const m of methods) {
    assert.match(
      m,
      /"(computed|detected|judgment)"/,
      `method must be computed|detected|judgment: ${m}`
    );
  }
  // Judgment categories must carry a rubric (evidence_required checked by the engine schema test).
  assert.match(
    src,
    /method\s*=\s*"judgment"/,
    'at least one judgment category expected'
  );
  assert.match(
    src,
    /\n\s*rubric\s*=\s*"/,
    'judgment categories must declare a rubric'
  );
});

test('standards.toml prevention-coverage categories carry cluster metadata correctly', () => {
  const p = path.join(referencesDir, 'standards.toml');
  const src = readUtf8(p);
  const prevBlocks = [
    ...src.matchAll(/\n\[category\.(prev_[^.\]]+)\]([\s\S]*?)(?=\n\[|$)/g),
  ];
  assert.ok(
    prevBlocks.length > 0,
    'standards.toml must define [category.prev_*] prevention-coverage tables'
  );
  for (const [, slug, b] of prevBlocks) {
    assert.match(
      b,
      /^\s*dimension\s*=\s*"prevention-coverage"/m,
      `[category.${slug}] must belong to the prevention-coverage dimension`
    );
    assert.match(
      b,
      /^\s*cluster\s*=\s*"[a-z-]+"/m,
      `[category.${slug}] must declare its cluster slug — the linkage pass joins the pair by it`
    );
    const isDetected = /^\s*method\s*=\s*"detected"/m.test(b);
    const hasCovers = /^\s*covers_checks\s*=\s*\[/m.test(b);
    if (isDetected) {
      assert.ok(
        hasCovers,
        `[category.${slug}] enforcement (detected) category must declare covers_checks — the source checks its cluster guards`
      );
    } else {
      assert.ok(
        !hasCovers,
        `[category.${slug}] covers_checks belongs on the enforcement (detected) half only`
      );
    }
  }
  // The cluster/covers_checks keys are a prevention-coverage contract — they
  // must not leak onto other dimensions' categories.
  for (const m of src.matchAll(
    /\n\[category\.([^.\]]+)\]([\s\S]*?)(?=\n\[|$)/g
  )) {
    const [, slug, b] = m;
    if (slug.startsWith('prev_')) continue;
    assert.ok(
      !/^\s*(cluster|covers_checks)\s*=/m.test(b),
      `[category.${slug}] must not declare cluster/covers_checks — those keys are prevention-coverage-only`
    );
  }
});

test('scoring.md uses additive weighted categories, not A-F grades', () => {
  const p = path.join(skillRoot, 'scoring.md');
  const src = readUtf8(p);
  assert.match(src, /additive/i, 'scoring.md must describe additive scoring');
  assert.match(src, /weight/i, 'scoring.md must describe category weights');
  assert.match(
    src,
    /coverage ratio/i,
    'scoring.md must define the coverage ratio'
  );
  assert.match(
    src,
    /standards\.toml/,
    'scoring.md must reference standards.toml as the weight source'
  );
  assert.match(
    src,
    /uncapped|no cap|not capped/i,
    'scoring.md must state the total is uncapped'
  );
  // The fixed-ceiling model must be gone.
  assert.doesNotMatch(
    src,
    /Grade Scale/i,
    'scoring.md must not retain a grade scale'
  );
  assert.doesNotMatch(
    src,
    /\bA\s*[–-]\s*F\b/i,
    'scoring.md must not mention A–F grades'
  );
  assert.doesNotMatch(
    src,
    /clamped to 0\s*[–-]\s*100/i,
    'scoring.md must not clamp to 0–100'
  );
  // Severity demoted to priority only.
  assert.match(
    src,
    /severity[^.\n]*priorit/i,
    'scoring.md must state severity drives priority only'
  );
});

test('SKILL.md scores via a single audit-core pass — no per-dimension fan-out', () => {
  const src = readUtf8(path.join(skillRoot, 'SKILL.md'));
  // Deterministic scoring is one engine command (audit-core), not 11 subagents.
  assert.match(
    src,
    /dist\/cli\.js["']?\s+audit-core/,
    'SKILL.md must invoke the audit-core engine pass via the bundled CLI'
  );
  // The per-dimension subagent fan-out and its agent are retired.
  assert.doesNotMatch(
    src,
    /dimension-auditor/,
    'SKILL.md must not reference the retired dimension-auditor agent'
  );
  // The retired agent file must not exist (its presence reintroduces the fan-out).
  assert.ok(
    !fs.existsSync(
      path.join(repoRoot, 'plugins', 'awos', 'agents', 'dimension-auditor.md')
    ),
    'the dimension-auditor agent must be retired (agents/dimension-auditor.md removed)'
  );
  // The orchestrator must never average dimensions into a grade.
  assert.doesNotMatch(
    src,
    /grade [A-F]\b|letter grade/i,
    'SKILL.md must not describe letter-grade scoring'
  );
});

test('SKILL.md Step 4 is unconditional — no pre-run escape hatch (barley 2026-07-03 regression)', () => {
  const src = readUtf8(path.join(skillRoot, 'SKILL.md'));
  // The load-time !`…` injection never executed in plugin skills, but its
  // narrative gave the model a "scoring may already be done" premise it quoted
  // to skip audit-core entirely. No line may start with a !` injection.
  assert.doesNotMatch(
    src,
    /^!`/m,
    'SKILL.md must not carry a load-time !`…` injection — it never executes in plugin skills and its narrative is what the model cites to skip audit-core'
  );
  // No wording may suggest the engine pass might already have happened.
  assert.doesNotMatch(
    src,
    /pre-run happened|load-time pre-run|already completed step 4/i,
    'SKILL.md must not suggest a pre-run may have already executed Step 4'
  );
  // Audits are independent timestamped snapshots — no previous-audit/delta
  // logic may reappear in the skill.
  assert.doesNotMatch(
    src,
    /previous audit|delta comparison/i,
    'SKILL.md must not read previous audits or compute deltas — each run is an independent timestamped snapshot'
  );
  // The circuit-breaker must be stated at the decision point: hand-built
  // audits are refused by the engine (provenance stamp).
  assert.match(
    src,
    /provenance/,
    'SKILL.md must state the engine provenance circuit-breaker (patch-judgment/render refuse a hand-built audit.json)'
  );
  // Tool-level hard block: Edit (artifact hand-editing) and ScheduleWakeup
  // (banned polling) are removed from the tool pool while the skill runs.
  assert.match(
    src,
    /^disallowed-tools:.*\bEdit\b.*\bScheduleWakeup\b/m,
    'SKILL.md frontmatter must disallow Edit and ScheduleWakeup while the skill is active'
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

test('SKILL.md sums weighted categories and emits no grade', () => {
  const src = readUtf8(path.join(skillRoot, 'SKILL.md'));
  assert.match(
    src,
    /standards\.toml/,
    'SKILL.md Step 4 must pass standards.toml to auditors'
  );
  assert.match(
    src,
    /additive weighted points/i,
    'SKILL.md must state that scoring is additive weighted points (sum of category weights), not a grade'
  );
  assert.match(
    src,
    /coverage ratio/i,
    'SKILL.md must report an audit-level coverage ratio'
  );
  assert.doesNotMatch(
    src,
    /average of all dimension percentages/i,
    'SKILL.md must not average percentages'
  );
  assert.doesNotMatch(
    src,
    /Grade \*\*X\*\*|— Grade/i,
    'SKILL.md must not present a grade'
  );
});

test('SKILL.md emits progress + ETA (interactive + headless, wait-excluded)', () => {
  const src = readUtf8(path.join(skillRoot, 'SKILL.md'));
  // Must invoke the bundled progress helper via the CLI dispatcher.
  assert.ok(
    src.includes('node dist/cli.js progress') ||
      src.includes('CLAUDE_SKILL_DIR}/dist/cli.js" progress') ||
      /dist\/cli\.js["']?\s+progress/.test(src),
    'SKILL.md must call the progress CLI helper after each dimension/phase completes'
  );
  // Must mention ETA as a concept.
  assert.match(
    src,
    /\bETA\b/,
    'SKILL.md must mention ETA for the progress line'
  );
  // Must describe the percent-complete output.
  assert.match(
    src,
    /pct|percent complete|% complete|\bpct\b/i,
    'SKILL.md must describe the % complete output from the progress helper'
  );
  // Must state that the timer pauses across AskUserQuestion calls.
  assert.match(
    src,
    /AskUserQuestion/,
    'SKILL.md must reference AskUserQuestion in the context of pausing the elapsed timer'
  );
  assert.match(
    src,
    /pause|subtract|exclud/i,
    'SKILL.md must state the timer pauses/subtracts user-wait time across AskUserQuestion'
  );
  // Must mention headless stream-json support.
  assert.match(
    src,
    /stream-json/,
    'SKILL.md must mention --output-format stream-json for headless progress emission'
  );
  // Must document the artifact-count fallback for headless observability.
  assert.match(
    src,
    /\.json.*wc|wc.*\.json|artifact.*count|count.*artifact/i,
    'SKILL.md must describe the artifact-count fallback (count *.json files vs total) for headless progress'
  );
});

test('SKILL.md preflights a node runtime before running the engine', () => {
  const src = readUtf8(path.join(skillRoot, 'SKILL.md'));
  // The engine is a prebuilt Node bundle; the orchestrator must verify node is
  // on PATH so engine calls fail loudly with guidance, not mid-audit.
  assert.match(
    src,
    /command -v node|preflight/i,
    'SKILL.md must preflight that a node runtime is on PATH before invoking the engine'
  );
});

test('report templates use weighted points + reliability, not grades', () => {
  for (const f of ['output-format.md', 'report-template.md']) {
    const src = readUtf8(path.join(skillRoot, f));
    assert.match(src, /weight/i, `${f} must show category weights`);
    assert.match(src, /coverage ratio/i, `${f} must show the coverage ratio`);
    assert.match(src, /reliabilit/i, `${f} must show reliability`);
    assert.doesNotMatch(
      src,
      /Grade \*\*X\*\*|Letter grade|— Grade/i,
      `${f} must not present a letter grade`
    );
  }
  const html = readUtf8(path.join(skillRoot, 'report-template.md'));
  assert.match(
    html,
    /tooltip/i,
    'HTML template must describe tooltips carrying the reliability/hint detail'
  );
  assert.doesNotMatch(
    html,
    /Grade colors:/i,
    'HTML template must drop the A–F grade color CSS'
  );
});

// The plugin version is independent of the npm installer version (which
// release-drafter manages via PR labels). It is bumped MANUALLY when plugin
// behavior changes — always as one deliberate commit moving three files
// together: plugin.json, marketplace.json, and this pinned literal. The pin
// exists to force that deliberateness, not to freeze the version.
const EXPECTED_PLUGIN_VERSION = '2.4.2';

test(`plugin.json version matches the awos marketplace entry and equals ${EXPECTED_PLUGIN_VERSION}`, () => {
  const pluginManifest = JSON.parse(
    readUtf8(
      path.join(repoRoot, 'plugins', 'awos', '.claude-plugin', 'plugin.json')
    )
  );
  const marketplace = JSON.parse(
    readUtf8(path.join(repoRoot, '.claude-plugin', 'marketplace.json'))
  );
  const awosEntry = marketplace.plugins.find(
    (p) => p.name === 'awos' || (p.source && p.source.includes('plugins/awos'))
  );
  assert.ok(
    awosEntry,
    'marketplace.json must contain a plugins entry for awos (matched by name="awos" or source referencing plugins/awos)'
  );
  assert.equal(
    pluginManifest.version,
    awosEntry.version,
    `plugins/awos/.claude-plugin/plugin.json version ("${pluginManifest.version}") must match the awos marketplace entry version ("${awosEntry.version}") — bump both together`
  );
  assert.equal(
    pluginManifest.version,
    EXPECTED_PLUGIN_VERSION,
    `plugins/awos/.claude-plugin/plugin.json version must be "${EXPECTED_PLUGIN_VERSION}" — the plugin version moves as one deliberate commit (plugin.json + marketplace.json + this pin together) when plugin behavior changes; it is independent of the npm release version release-drafter manages. Got "${pluginManifest.version}"`
  );
});

test('awos-containment plugin ships a plugin.json, a PreToolUse hook, and a matching marketplace entry', () => {
  const manifestPath = path.join(
    repoRoot,
    'plugins',
    'awos-containment',
    '.claude-plugin',
    'plugin.json'
  );
  assert.ok(
    fs.existsSync(manifestPath),
    'plugins/awos-containment/.claude-plugin/plugin.json must exist — the containment guard ships as a dedicated plugin, not an installer-written settings hook'
  );
  const manifest = JSON.parse(readUtf8(manifestPath));
  assert.equal(
    manifest.name,
    'awos-containment',
    `awos-containment plugin.json name must be "awos-containment", got "${manifest.name}"`
  );

  // The guard script must live where the hook command references it.
  const guardPath = path.join(
    repoRoot,
    'plugins',
    'awos-containment',
    'hooks',
    'awos-containment-guard.js'
  );
  assert.ok(
    fs.existsSync(guardPath),
    'the containment guard must live at plugins/awos-containment/hooks/awos-containment-guard.js — the path the plugin hook command invokes'
  );

  // hooks/hooks.json must register a PreToolUse hook that runs the guard via
  // ${CLAUDE_PLUGIN_ROOT} and matches the tool set the guard inspects.
  const hooksPath = path.join(
    repoRoot,
    'plugins',
    'awos-containment',
    'hooks',
    'hooks.json'
  );
  assert.ok(
    fs.existsSync(hooksPath),
    'plugins/awos-containment/hooks/hooks.json must exist so Claude Code fires the guard as a PreToolUse hook'
  );
  const hooks = JSON.parse(readUtf8(hooksPath));
  const preToolUse = (hooks.hooks && hooks.hooks.PreToolUse) || [];
  assert.ok(
    preToolUse.length > 0,
    'hooks.json must declare at least one PreToolUse hook group'
  );
  const group = preToolUse[0];
  for (const tool of [
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'Bash',
    'PowerShell',
    'Read',
    'Glob',
    'Grep',
  ]) {
    assert.match(
      group.matcher,
      new RegExp(`\\b${tool}\\b`),
      `the PreToolUse matcher must include ${tool} — the guard inspects Write/Edit/Bash/Read families and must be invoked for each`
    );
  }
  const command = group.hooks[0].command;
  assert.match(
    command,
    /\$\{CLAUDE_PLUGIN_ROOT\}/,
    'the hook command must resolve the guard via ${CLAUDE_PLUGIN_ROOT} so it works from the plugin install directory'
  );
  assert.match(
    command,
    /awos-containment-guard\.js/,
    'the hook command must invoke awos-containment-guard.js'
  );

  // The marketplace must list awos-containment at the same version as plugin.json.
  const marketplace = JSON.parse(
    readUtf8(path.join(repoRoot, '.claude-plugin', 'marketplace.json'))
  );
  const entry = marketplace.plugins.find((p) => p.name === 'awos-containment');
  assert.ok(
    entry,
    'marketplace.json plugins[] must contain an awos-containment entry so the installer can register and enable it'
  );
  assert.equal(
    entry.version,
    manifest.version,
    `the awos-containment marketplace entry version ("${entry.version}") must match its plugin.json version ("${manifest.version}") — bump both together`
  );
});

test('TS engine scaffold present (package.json/tsconfig + collectors/detectors/metrics/tests dirs)', () => {
  const skill = path.join(
    repoRoot,
    'plugins',
    'awos',
    'skills',
    'ai-readiness-audit'
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, 'tsconfig.json')),
    'tsconfig.json must exist'
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, 'package.json')),
    'package.json must exist'
  );
  for (const d of ['collectors', 'detectors', 'metrics', 'tests']) {
    assert.ok(fs.existsSync(path.join(skill, d)), `${d}/ dir must exist`);
  }
});

test('every dimension check maps to a standards.toml category', () => {
  const standards = readUtf8(path.join(referencesDir, 'standards.toml'));
  const definedCodes = new Set(
    (standards.match(/\bcode\s*=\s*(\d+)/g) || []).map(
      (m) => m.match(/(\d+)/)[1]
    )
  );
  const files = listMarkdown(dimensionsDir);
  for (const f of files) {
    const body = readUtf8(path.join(dimensionsDir, f));
    const isTopology = f === 'project-topology.md';
    // Split into check blocks by the "### CODE-NN:" headings.
    const blocks = body.split(/^### /m).slice(1);
    for (const block of blocks) {
      const head = block.split('\n', 1)[0];
      const catLine = (block.match(/\*\*Category:\*\*\s*(.+)/) || [])[1];
      assert.ok(
        catLine,
        `${f}: check "${head}" must declare a **Category:** line`
      );
      if (isTopology) {
        assert.match(
          catLine,
          /none/i,
          `${f}: topology checks must be Category: none (unscored)`
        );
      } else {
        const codes = catLine.match(/\d+/g) || [];
        assert.ok(
          codes.length > 0,
          `${f}: check "${head}" must name at least one numeric category code`
        );
        for (const c of codes) {
          assert.ok(
            definedCodes.has(c),
            `${f}: check "${head}" references undefined standards.toml code ${c}`
          );
        }
      }
    }
  }
});

test('dimension check headings agree with standards.toml check_id', () => {
  // standards.toml owns check ids (the engine reads only the TOML); the
  // dimension .md headings are documentation and must not silently drift.
  // Where a code's md heading and its TOML check_id disagree, the TOML wins
  // at runtime — this lint makes the disagreement a build failure instead.
  const standards = readUtf8(path.join(referencesDir, 'standards.toml'));
  const checkIdByCode = new Map();
  for (const m of standards.matchAll(
    /\n\[category\.[^\]]+\]([\s\S]*?)(?=\n\[|$)/g
  )) {
    const code = (m[1].match(/^\s*code\s*=\s*(\d+)/m) || [])[1];
    const checkId = (m[1].match(/^\s*check_id\s*=\s*"([^"]+)"/m) || [])[1];
    if (code && checkId && !checkIdByCode.has(code))
      checkIdByCode.set(code, checkId);
  }
  for (const f of listMarkdown(dimensionsDir)) {
    if (f === 'project-topology.md') continue;
    const body = readUtf8(path.join(dimensionsDir, f));
    for (const block of body.split(/^### /m).slice(1)) {
      const head = block.split('\n', 1)[0];
      const headingId = (head.match(/^([A-Z][A-Z0-9]*-\w+)\s*:/) || [])[1];
      const codes =
        ((block.match(/\*\*Category:\*\*\s*(.+)/) || [])[1] || '').match(
          /\d+/g
        ) || [];
      if (!headingId || codes.length === 0) continue;
      const tomlId = checkIdByCode.get(codes[0]);
      assert.ok(
        tomlId !== undefined,
        `${f}: "${head}" — code ${codes[0]} has no check_id in standards.toml`
      );
      // A single-code heading must agree exactly. Multi-code headings share
      // one heading across several categories whose TOML ids may legitimately
      // differ (e.g. ADP-18 covering ADP-I4/ADP-I5), so only presence is
      // enforced there.
      if (codes.length === 1) {
        assert.equal(
          tomlId,
          headingId,
          `${f}: "${head}" — heading id ${headingId} disagrees with standards.toml check_id ${tomlId} for code ${codes[0]} (TOML wins at runtime; fix whichever is stale)`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// ORG.1: SKILL.md Step 0 multi-repo discover-first + AskUserQuestion
// ---------------------------------------------------------------------------

const SKILL_MD_PATH = path.join(
  repoRoot,
  'plugins',
  'awos',
  'skills',
  'ai-readiness-audit',
  'SKILL.md'
);

test('SKILL.md Step 0 references data-sources.md for multi-repo discovery', () => {
  // Step 0 must follow the discover-first flow from data-sources.md.
  // The reference is what ties SKILL.md to the canonical source-resolution spec.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    body.includes('data-sources.md'),
    'SKILL.md Step 0 must reference data-sources.md (the discover-first multi-repo flow spec)'
  );
});

test('SKILL.md headline delivery rows put the unit in the value, not a duplicated label', () => {
  // "Merges / active contributor" = "19.0 / contributor" reads as a duplicate.
  // The label carries the metric name; the per-contributor unit lives in the value.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    !body.includes('**Merges / active contributor**') &&
      !body.includes('**LOC / active contributor**'),
    'delivery rows must not use the duplicated "Merges / active contributor" / "LOC / active contributor" labels'
  );
  assert.ok(
    body.includes('**Merges**') && body.includes('**LOC**'),
    'SKILL.md must author the delivery rows with bare "Merges" / "LOC" labels'
  );
  assert.ok(
    body.includes('/ week (per active contributor)'),
    'the per-week per-contributor unit must live in the display_value (e.g. "1.5 / week (per active contributor)")'
  );
});

test('SKILL.md Step 0 uses AskUserQuestion to confirm discovered repos', () => {
  // A single AskUserQuestion at the start of the run is the only prompt
  // allowed — it confirms the auto-discovered repo set before the audit begins.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    body.includes('AskUserQuestion'),
    'SKILL.md must use AskUserQuestion to confirm the discovered repo set'
  );
});

test('SKILL.md Step 0 describes multi-repo (parallel) discovery', () => {
  // Org mode fans out per-repo audit agents in parallel. SKILL.md must
  // document the multi-repo parallel execution so the orchestrator knows
  // to fan out rather than run sequentially.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /multi.repo|multiple repo|parallel|fan.out/i.test(body),
    'SKILL.md must describe multi-repo parallel discovery/execution (org mode fan-out)'
  );
});

test('SKILL.md Step 0 documents headless default to auto-discovered repos', () => {
  // In headless / CI mode the audit must run without any prompting,
  // defaulting to the auto-discovered repos. This must be stated explicitly
  // so CI operators know the tool is safe to call without user interaction.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /headless default|headless.*auto.discover|auto.discover.*headless/i.test(
      body
    ),
    'SKILL.md must document the headless default behavior (fall back to auto-discovered repos when no interactive input)'
  );
});

// ---------------------------------------------------------------------------
// PERF: Step 5 batches connector re-scoring via the `enrich` verb, and org mode
// fans out per-repo `repo-auditor` subagents (Part 1 wall-time improvements).

test('SKILL.md Step 5 re-scores connectors via one `enrich` pass (not per-metric spawns)', () => {
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /dist\/cli\.js["']?\s+enrich/.test(src),
    'SKILL.md Step 5 must invoke the `enrich` engine verb to re-score connector metrics in one pass'
  );
});

test('SKILL.md Step 5.2 fetches independent connector sources concurrently', () => {
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /concurrent|in a single message|parallel tool calls/i.test(src),
    'SKILL.md Step 5 must instruct fetching the independent connector sources concurrently'
  );
});

test('SKILL.md Step 5 requires fetch_meta and the tracker changelog pass', () => {
  // A prior org run fetched exactly one 100-ticket page per repo with zero
  // changelogs — cycle time stayed blank everywhere and ticket counts drifted
  // run to run. These two requirements are what prevent that regression.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    src.includes('fetch_meta'),
    'SKILL.md Step 5 must require a fetch_meta block in paginated tracker artifacts (honest partial-fetch accounting)'
  );
  assert.ok(
    /changelog/i.test(src) && src.includes('in_progress_at'),
    'SKILL.md Step 5 must require the per-ticket changelog pass that populates in_progress_at (cycle time)'
  );
});

test('connector-shapes.md documents the per-ticket changelog fetch and fetch_meta shape', () => {
  const src = readUtf8(path.join(referencesDir, 'connector-shapes.md'));
  assert.ok(
    src.includes('expand: "changelog"'),
    'connector-shapes.md must document the per-ticket getJiraIssue(expand: "changelog") fetch — Jira search results never include changelogs'
  );
  assert.ok(
    src.includes('fetch_meta'),
    'connector-shapes.md must document the fetch_meta block (tickets_fetched/tickets_total/complete/pages_fetched/changelog_fetched_for/note)'
  );
  assert.ok(
    /statusCategory|indeterminate/.test(src),
    'connector-shapes.md must define in_progress_at by status category (statusCategory "indeterminate"), not the literal "In Progress" name'
  );
});

test('repo-auditor.md requires tracker pagination to completion and the changelog pass', () => {
  const src = readUtf8(
    path.join(repoRoot, 'plugins', 'awos', 'agents', 'repo-auditor.md')
  );
  assert.ok(
    /paginat/i.test(src) && src.includes('fetch_meta'),
    'repo-auditor.md must require paginating tracker sources to completion and flagging partial fetches in fetch_meta'
  );
  assert.ok(
    /changelog/i.test(src),
    'repo-auditor.md must require fetching per-ticket status changelogs so cycle time computes'
  );
});

test('SKILL.md org branch dispatches the repo-auditor subagent per repo', () => {
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /repo-auditor/.test(src),
    'SKILL.md org branch must dispatch the `awos:repo-auditor` subagent per repo (concurrent per-repo audits)'
  );
});

test('the repo-auditor plugin agent exists with valid frontmatter', () => {
  const agentPath = path.join(
    repoRoot,
    'plugins',
    'awos',
    'agents',
    'repo-auditor.md'
  );
  assert.ok(
    fs.existsSync(agentPath),
    'plugins/awos/agents/repo-auditor.md must exist'
  );
  const { data, hasFrontmatter } = parse(readUtf8(agentPath));
  assert.ok(hasFrontmatter, 'repo-auditor.md must have YAML frontmatter');
  assert.equal(data.name, 'repo-auditor', 'agent name must be "repo-auditor"');
  assert.ok(
    typeof data.description === 'string' && data.description.length > 0,
    'repo-auditor.md must declare a description'
  );
});

// ORG.2: SKILL.md Step 5 org branch — ≤3 portfolio metrics + org rollup
// ---------------------------------------------------------------------------

test('SKILL.md Step 5 org branch references the org rollup', () => {
  // The org rollup is invoked by SKILL.md Step 5 via the CLI. The reference
  // ties the orchestrator to the rollup implementation.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /org.rollup|rollup/i.test(body),
    'SKILL.md Step 5 org branch must reference the org rollup'
  );
  assert.ok(
    body.includes('node dist/cli.js rollup') ||
      body.includes('dist/cli.js rollup') ||
      /dist\/cli\.js["']?\s+rollup/.test(body),
    'SKILL.md must show the rollup CLI invocation (node dist/cli.js rollup <dir> or with absolute path)'
  );
});

test('SKILL.md Step 5 org branch names the three portfolio metrics', () => {
  // Exactly three portfolio metrics are computed — no more. All three must
  // be named so the orchestrator and the user both know what was computed.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    body.includes('org_ai_tooling_coverage'),
    'SKILL.md must name the "org_ai_tooling_coverage" portfolio metric'
  );
  assert.ok(
    body.includes('org_capability_score'),
    'SKILL.md must name the "org_capability_score" portfolio metric'
  );
  assert.ok(
    body.includes('org_measurement_coverage'),
    'SKILL.md must name the "org_measurement_coverage" portfolio metric'
  );
});

test('SKILL.md Step 5 states the ≤3 portfolio metrics constraint', () => {
  // The brief is explicit: "≤3 org metrics" is a hard constraint, not a
  // style choice. SKILL.md must state it so the orchestrator does not add
  // more metrics without revisiting the design.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /≤\s*3|<= 3|exactly three|three.*portfolio metric/i.test(body),
    'SKILL.md must state the ≤3 portfolio metrics constraint (never aggregate the full per-repo set)'
  );
});

test('SKILL.md Step 5 org branch emits an org-level JSON artifact', () => {
  // JSON is the source-of-truth (JSON-source-of-truth rule). SKILL.md must
  // document that the org rollup result is written to a JSON file before
  // any MD/HTML rendering.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    body.includes('org-portfolio.json'),
    'SKILL.md must document the org-level JSON artifact (org-portfolio.json)'
  );
});

// ---------------------------------------------------------------------------
// POL.1+2+3: report-template.md and output-format.md describe the renderer
// ---------------------------------------------------------------------------

test('report-template.md references the render verb (cli.js render)', () => {
  const src = readUtf8(path.join(skillRoot, 'report-template.md'));
  assert.ok(
    src.includes('cli.js render') || src.includes('cli render'),
    'report-template.md must reference the "render" verb (node dist/cli.js render) — report.md/report.html are produced by the renderer, not hand-written'
  );
});

test('report-template.md describes the single-page layout: overview + drill-down sub-pages (no audience tabs)', () => {
  const src = readUtf8(path.join(skillRoot, 'report-template.md'));
  assert.ok(
    /one scrolling page|single self-contained page/i.test(src) &&
      /no audience tabs|no .*tabs/i.test(src),
    'report-template.md must describe a single scrolling page, not three audience tabs'
  );
  assert.ok(
    /#dim\/|drill-down sub-page/i.test(src),
    'report-template.md must describe hash-routed drill-down sub-pages (#dim/<key>)'
  );
  assert.ok(
    /Back\/Forward|browser Back/i.test(src),
    'report-template.md must state the browser Back button returns from a sub-page to the overview'
  );
  assert.ok(
    /executive band/i.test(src) &&
      /insights/i.test(src) &&
      /what to improve|recommendations/i.test(src),
    'report-template.md must name the executive band, insights, and recommendations sections'
  );
});

test('report-template.md specifies instant plain-first tooltips (not native title= delay)', () => {
  const src = readUtf8(path.join(skillRoot, 'report-template.md'));
  assert.ok(
    /\.tip|tipbox/.test(src) && /instant/i.test(src),
    'report-template.md must specify instant CSS tooltips (.tip/.tipbox), not the delayed native title= attribute'
  );
  assert.ok(
    /plain-language|plain language|lead.*plain/i.test(src),
    'report-template.md must state tooltips lead with the plain-language explanation'
  );
});

test('output-format.md states that reports are produced by cli.js render (not hand-written)', () => {
  const src = readUtf8(path.join(skillRoot, 'output-format.md'));
  assert.ok(
    src.includes('node dist/cli.js render') || src.includes('cli.js render'),
    'output-format.md must state that report.md / report.html are produced by "node dist/cli.js render" — the auditor never writes markdown/HTML directly'
  );
});

// ---------------------------------------------------------------------------
// POL-B: SKILL.md Step 5 aggregates JSON → audit.json + renders MD;
//         Step 6 unconditionally renders HTML (incl. headless)
// ---------------------------------------------------------------------------

test('SKILL.md Step 5 aggregates per-dimension JSON into audit.json', () => {
  // JSON is the source of truth (global constraint). Step 6 must aggregate
  // per-dimension artifacts into a single audit.json before producing any
  // rendered output. The orchestrator must never hand-write report.md.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    src.includes('audit.json'),
    'SKILL.md Step 5 must reference audit.json as the aggregated result artifact'
  );
  assert.ok(
    /per.dimension.*json|<dimension>\.json|dimensions?\.json/i.test(src),
    'SKILL.md Step 5 must describe reading per-dimension JSON artifacts before aggregating'
  );
});

test('SKILL.md Step 5 renders report.md via cli.js render (--format md or both)', () => {
  // The orchestrator must call the renderer for markdown output, not write it
  // by hand. `--format both` writes report.md + report.html in one invocation.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    src.includes('node dist/cli.js render') ||
      src.includes('dist/cli.js render') ||
      /dist\/cli\.js["']?\s+render/.test(src),
    'SKILL.md Step 5 must invoke the render CLI command to produce report.md (never hand-write it)'
  );
  assert.ok(
    /--format (md|both)/.test(src),
    'SKILL.md Step 5 must pass "--format md" or "--format both" to the renderer for the markdown report'
  );
  assert.ok(
    /report\.md/.test(src),
    'SKILL.md Step 5 must name the output file report.md'
  );
});

test('SKILL.md Step 5 states the data-loss guarantee (no hand-written report)', () => {
  // The explicit "never hand-writes" guarantee is what prevents the orchestrator
  // from bypassing the renderer and losing structured data.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /never hand.writ|not hand.writ|source of truth.*json|json.*source of truth/i.test(
      src
    ),
    'SKILL.md must state the data-loss guarantee: orchestrator never hand-writes report.md/report.html (JSON is source of truth)'
  );
});

test('SKILL.md Step 5 unconditionally renders report.html via --format html', () => {
  // HTML is the headline deliverable. Step 6 produces it for every run,
  // including headless — generated unconditionally, never gated on Step 7 or
  // on interactivity. (Moving it out of Step 6 is the regression this pins.)
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /unconditional|always produce both|headless runs always produce/i.test(src),
    'SKILL.md Step 5 must state report.html is generated unconditionally (incl. headless), never gated on interactivity'
  );
  assert.ok(
    /--format (html|both)/.test(src),
    'SKILL.md Step 5 must show "--format html" or "--format both" as the HTML render flag'
  );
  assert.ok(
    /report\.html/.test(src),
    'SKILL.md Step 5 must name the output file report.html'
  );
});

test('SKILL.md Step 5 HTML always produced (never gated/skipped)', () => {
  // The "never skip" contract is the key headless guarantee. Lint pins it
  // so future edits do not accidentally make HTML optional in headless mode.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /always produc|never skip|never gated|unconditional/i.test(src),
    'SKILL.md Step 5 must state that report.html is always produced (never skipped/gated)'
  );
});

// ---------------------------------------------------------------------------
// ENGINE-PATH: no bare "node dist/cli.js" in prompt files
// ---------------------------------------------------------------------------

test('no prompt file uses a bare "node dist/cli.js" as an engine invocation in code blocks', () => {
  // All engine calls in code blocks in prompt files must use the absolute path form
  // so they resolve at audit runtime (cwd = user's repo, not plugin dir).
  // SKILL.md uses ${CLAUDE_SKILL_DIR}/dist/cli.js (skill context).
  // dimension-auditor.md and per-dimension files use the engine CLI path
  // passed by the orchestrator via "<engine cli path>".
  //
  // This guard checks fenced code block lines only (lines between ``` fences)
  // so prose mentions like "never use a bare `node dist/cli.js`" are not flagged.
  const auditSkillRoot = path.join(
    repoRoot,
    'plugins',
    'awos',
    'skills',
    'ai-readiness-audit'
  );
  const agentsDir = path.join(repoRoot, 'plugins', 'awos', 'agents');
  const promptFiles = [];
  const collectMd = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.md')) promptFiles.push(p);
      else if (entry.isDirectory() && entry.name !== 'dist') collectMd(p);
    }
  };
  collectMd(auditSkillRoot);
  collectMd(agentsDir);

  const offenders = [];
  for (const f of promptFiles) {
    const body = readUtf8(f);
    const lines = body.split('\n');
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      // Only flag bare invocations inside code blocks (actual commands, not prose)
      if (inCodeBlock && /^\s*node\s+dist\/cli\.js\b/.test(line)) {
        offenders.push(
          `${path.relative(repoRoot, f)}:${i + 1}: ${line.trim()}`
        );
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `prompt code blocks must not contain bare "node dist/cli.js" — use \${CLAUDE_SKILL_DIR}/dist/cli.js (SKILL.md) or the passed engine CLI path (agents/dimensions):\n${offenders.join('\n')}`
  );
});

// ---------------------------------------------------------------------------
// TOPOLOGY-FLAGS: project-topology.md lists all topology.<flag> predicates
// ---------------------------------------------------------------------------

test('project-topology.md lists all topology.* flag names used in standards.toml', () => {
  // The dimension-auditor evaluates applies_when expressions verbatim from
  // standards.toml. project-topology.md must enumerate every topology.*
  // predicate so the auditor can read them as booleans rather than inferring
  // from prose. If a new predicate is added to standards.toml, this test
  // forces a matching entry in project-topology.md.
  const standardsSrc = readUtf8(path.join(referencesDir, 'standards.toml'));
  const topologySrc = readUtf8(path.join(dimensionsDir, 'project-topology.md'));

  // Extract topology.<flag> predicates from standards.toml.
  const predicates = new Set(
    (standardsSrc.match(/topology\.[a-z_]+/g) || []).map((m) =>
      m.replace('topology.', '')
    )
  );
  assert.ok(
    predicates.size > 0,
    'standards.toml must define at least one topology.* applies_when predicate'
  );

  const missing = [];
  for (const flag of predicates) {
    if (
      !topologySrc.includes('`' + flag + '`') &&
      !topologySrc.includes(flag + ':')
    ) {
      missing.push(flag);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `project-topology.md must list every topology.* predicate from standards.toml (missing: ${missing.join(', ')})`
  );
});

test('commands/spec.md has a pre-write Definition of Done checklist', () => {
  // The spec command runs a Definition of Done self-review inside Step 4,
  // before the file is written: confirm no vague wording remains and every
  // requirement carries an acceptance criterion. It is a self-review, not an
  // approval gate — the file is still written. Any `[NEEDS CLARIFICATION]`
  // marker is resolved with the user post-save in Step 6 (offering the
  // assumption as the recommended first option), or left in place in an
  // unattended run; the Definition of Done itself never asks the user a
  // question. The behavioral proof — no raw markers in the produced
  // functional-spec.md, every requirement carries a criterion — lives in
  // awos-qa. This lint only pins that the instruction text is present, so
  // the contract can't be silently dropped from the prompt later.
  const body = readUtf8(path.join(commandsDir, 'spec.md'));
  assert.ok(
    /Definition of Done/i.test(body),
    'commands/spec.md must declare a "Definition of Done" pre-write checklist'
  );
  assert.ok(
    body.includes('Every requirement has at least one acceptance criterion'),
    'commands/spec.md Definition of Done must require every functional requirement to carry at least one acceptance criterion before saving'
  );
  assert.ok(
    /No vague wording remains/i.test(body),
    'commands/spec.md Definition of Done must gate on no vague wording remaining in requirements or acceptance criteria'
  );
  assert.ok(
    body.includes(
      'offering the assumption you would otherwise make as the recommended first option'
    ),
    'commands/spec.md Step 6 must resolve each [NEEDS CLARIFICATION] marker post-save via AskUserQuestion, offering the assumption you would otherwise make as the recommended first option'
  );
});

test('commands/spec.md self-review checks for vague, unmeasurable wording', () => {
  // The Step 4 self-review must hunt weasel words ("fast", "user-friendly",
  // "as appropriate") in requirements and acceptance criteria, and either
  // make them concrete in user-perceivable terms or convert them to a
  // [NEEDS CLARIFICATION] marker that Step 6 resolves with the user
  // post-save (or leaves in place in an unattended run). The behavioral
  // proof — no unverifiable wording in the produced functional-spec.md —
  // lives in awos-qa. This lint only pins that the instruction text is
  // present, so the contract can't be silently dropped from the prompt later.
  const body = readUtf8(path.join(commandsDir, 'spec.md'));
  assert.ok(
    /vague or unmeasurable wording/i.test(body),
    'commands/spec.md self-review must scan requirements and acceptance criteria for vague or unmeasurable wording'
  );
  assert.ok(
    /"user-friendly"/.test(body),
    'commands/spec.md self-review must name concrete weasel-word examples (e.g. "user-friendly") so the model knows what to hunt'
  );
  assert.ok(
    body.includes('Make each one concrete in user-perceivable terms'),
    'commands/spec.md Step 4 self-review rule must instruct making each vague term concrete in user-perceivable terms (not technical metrics), or converting it to a [NEEDS CLARIFICATION] marker'
  );
});

test('spec.md captures boundary/error behavior as rules in items 2 and 3', () => {
  // both sentences must be present — item 2 tells the model what to
  // elicit; item 3 closes the loop by requiring failure-path criteria for them.
  const body = readUtf8(path.join(commandsDir, 'spec.md'));
  assert.ok(
    body.includes('boundary and error behavior the user sees'),
    'spec.md Step 3 item 2 must contain the boundary/error elicitation rule'
  );
  assert.ok(
    body.includes(
      'at least one acceptance criterion covering the failure path'
    ),
    'spec.md Step 3 item 3 must require failure-path criteria for boundary/error requirements'
  );
});
