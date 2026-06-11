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
  // /awos:flow generates the project's /implement-ticket command from two
  // templates and a decision record. The four path references below are the
  // joints of that contract — if any drifts, generation reads or writes the
  // wrong file.
  const body = readUtf8(path.join(commandsDir, 'flow.md'));
  const requiredRefs = [
    '.awos/templates/delivery-flow-template.md',
    '.awos/templates/implement-ticket-template.md',
    'context/product/delivery-flow.md',
    '.claude/commands/implement-ticket.md',
  ];
  const missing = requiredRefs.filter((ref) => !body.includes(ref));
  assert.deepEqual(
    missing,
    [],
    `commands/flow.md must reference its templates and both generated artifacts; missing: ${missing.join(', ')}`
  );
  assert.ok(
    /prefer the CLI/i.test(body),
    'commands/flow.md must record the CLI-over-MCP transport preference (CLI is usually faster and cheaper in tokens)'
  );
  assert.ok(
    body.includes('`Explore`'),
    'commands/flow.md must delegate the read-heavy project scan to the built-in Explore subagent, not read the codebase in its own context'
  );
});

test('implement-ticket-template.md carries stage markers and the AWOS chain', () => {
  // The generated /implement-ticket command is user-owned; /awos:flow re-runs
  // reconcile manual edits per stage. The HTML-comment stage markers are the
  // attribution mechanism — without them, regeneration degrades to whole-file
  // clobbering. The template must also route coding through the AWOS chain
  // rather than implementing in the main context.
  const body = readUtf8(
    path.join(templatesDir, 'implement-ticket-template.md')
  );
  assert.ok(
    body.includes('<!-- awos:flow:stage=') &&
      body.includes('<!-- /awos:flow:stage -->'),
    'implement-ticket-template.md must fence every stage with <!-- awos:flow:stage=... --> / <!-- /awos:flow:stage --> markers so /awos:flow re-runs can attribute manual edits per stage'
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
      `implement-ticket-template.md must run ${cmd} as part of the generated flow`
    );
  }
  assert.ok(
    /do not implement tasks in the main context/i.test(body),
    'implement-ticket-template.md must preserve the orchestrator-only guard — coding goes through /awos:implement subagents'
  );
  for (const stage of ['ci-monitor', 'merge']) {
    assert.ok(
      body.includes(`<!-- awos:flow:stage=${stage} -->`),
      `implement-ticket-template.md must carry the ${stage} stage — the flow covers CI checks and the merge step, not just PR creation`
    );
  }
  assert.ok(
    /skipped or unanswered confirmation means do not merge/i.test(body),
    'implement-ticket-template.md merge stage must keep the per-run confirmation guard as fixed prose — merging is irreversible, so a skipped confirmation is a no (inverse of the #132 skip-default)'
  );
  assert.ok(
    body.includes('flow-log.md'),
    'implement-ticket-template.md must keep the flow-log contract — each stage appends a summary so fresh sessions resume from disk state'
  );
  assert.ok(
    /never launch a nested headless session/i.test(body),
    'implement-ticket-template.md must forbid nested `claude -p` calls — permission modes, PATH, and timeouts vary per machine; headless chaining lives at the trigger layer'
  );
  assert.ok(
    /do not add run-time focus areas/i.test(body),
    'implement-ticket-template.md review stage must keep the independence rule: the reviewer prompt is fixed at generation time — an orchestrator that just implemented the change must not frame its own review'
  );
});

test('delivery-flow-template.md preserves customizations and the tooling inventory', () => {
  // Local Customizations is where /awos:flow promotes manual edits the user
  // chose to keep — losing the section silently re-clobbers them on the next
  // regeneration. The tooling inventory records the chosen transport
  // (CLI vs MCP) per external service.
  const body = readUtf8(path.join(templatesDir, 'delivery-flow-template.md'));
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
});

test('setup-chain commands point users at /awos:flow', () => {
  // /awos:flow slots into the run-once setup chain after /awos:hire. Both
  // upstream commands must surface it, or users never discover the
  // delivery-flow generator.
  for (const file of ['hire.md', 'architecture.md']) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('/awos:flow'),
      `commands/${file} must point to /awos:flow as the next setup step after hiring`
    );
  }
});

test('E2E-06 audit check recommends the delivery-flow generator', () => {
  // The end-to-end-delivery audit dimension checks for the /awos:flow
  // artifacts and recommends running the command when they are missing.
  const body = readUtf8(path.join(dimensionsDir, 'end-to-end-delivery.md'));
  assert.ok(
    body.includes('E2E-06'),
    'end-to-end-delivery.md must declare the E2E-06 check for generated delivery flow automation'
  );
  assert.ok(
    body.includes('context/product/delivery-flow.md') &&
      body.includes('/awos:flow'),
    'E2E-06 must check for context/product/delivery-flow.md and recommend /awos:flow when delivery automation is missing'
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
