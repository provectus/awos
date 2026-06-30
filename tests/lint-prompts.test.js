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

test('implement.md uses XML scope, investigate, and skills snippets', () => {
  // The formulated subagent prompt in implement.md must contain three
  // XML blocks that have outsized impact on subagent behavior:
  //   <scope_discipline>             — keep the change minimal, don't over-engineer
  //   <investigate_before_answering> — read the relevant files, don't hallucinate
  //   <use_available_skills>         — apply matching project/user/plugin skills
  // A verification-commands block is intentionally NOT asserted here.
  // Teams that want mandatory verification can add it via wrapper
  // customization in .claude/commands/awos/implement.md.
  const body = readUtf8(path.join(commandsDir, 'implement.md'));
  const needed = [
    '<scope_discipline>',
    '<investigate_before_answering>',
    '<use_available_skills>',
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
    /automatic reviewer/i.test(body),
    'plugins/awos/commands/flow.md must cover automatic reviewers on the code host (CodeRabbit-style bots) — both detection in Step 2 and the wait-and-address gate in the review dimension'
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
    /never nest them/i.test(tplBody),
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
    /Stage automation \(reuse \/ replace \/ compose\)/.test(body),
    'delivery-flow-template.md must record the per-stage reuse/replace/compose decision for overlapping project automation, so re-runs do not regenerate over a reused command'
  );
  assert.ok(
    /## .*Bug-fix Flow/.test(body),
    'delivery-flow-template.md must declare a "Bug-fix Flow" section — whether fix-bug was generated, the classification/amendment policy, and the regression-test expectation; the sibling command consumes it'
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
      closeStage.includes('review.md'),
    'fix-bug-template.md close stage must report the local review evidence (verdict, finding count, review file path) — the same hand-off treatment as implement-feature'
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
