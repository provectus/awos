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

// ---------------------------------------------------------------------------
// Brownfield awareness contracts
// ---------------------------------------------------------------------------

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

test('product.md does not consume existing_findings (it is the first command)', () => {
  // product.md is always first in the brownfield chain — it must not
  // consume <existing_findings> since there are none before it. If it
  // gained that tag, it would imply a circular dependency.
  const body = readUtf8(path.join(commandsDir, 'product.md'));
  assert.ok(
    !/<existing_findings>/.test(body),
    'commands/product.md must not contain <existing_findings> — it is the first brownfield command'
  );
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
    'ADP-G1',
    'ADP-G7',
    'ADP-G9',
    'ADP-I1',
    'ADP-I3',
    'ADP-D1',
  ]) {
    assert.match(src, new RegExp(id), `catalog must define ${id}`);
  }
  // AI attribution is framed as a lower bound, not the true adoption level.
  assert.match(src, /lower bound/i);
  // No-PII, no-money, and the MTTR-skip rule must be stated.
  assert.match(src, /repositor/i);
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
    'adp_g1_tooling_depth',
    'adp_g2_contributors',
    'adp_g3_deploy_frequency',
    'adp_g4_lead_time',
    'adp_g5_pr_cycle_time',
    'adp_g6_churn',
    'adp_g7_change_fail_rate',
    'adp_g8_review_rework',
    'adp_g9_ai_attribution',
    'adp_c1_ci_pass_rate',
    'adp_c2_pipeline_duration',
    'adp_d1_spec_coverage',
    'adp_i1_work_mix',
    'adp_i2_throughput',
    'adp_i3_mttr',
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

test('data-sources reference covers detection, schema, linking, history params', () => {
  const p = path.join(referencesDir, 'data-sources.md');
  assert.ok(fs.existsSync(p), 'expected references/data-sources.md');
  const src = readUtf8(p);
  assert.match(src, /sources\.toml/);
  assert.match(src, /submodule/i);
  assert.match(src, /symlink/i);
  assert.match(src, /monorepo/i);
  assert.match(src, /current repo/i); // no-arg default
  assert.match(src, /AskUserQuestion/); // confirm sources once, at start
  assert.match(src, /discovery/i); // discovery-first flow
  assert.match(src, /empiric/i); // many-repos: map repos → links empirically
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
  assert.match(src, /\[meta\]/, 'standards.toml must have a [meta] table');
  assert.match(
    src,
    /monthly_bucket_days\s*=\s*30/,
    'meta.monthly_bucket_days must be 30'
  );
  assert.match(
    src,
    /max_lookback_days\s*=\s*730/,
    'meta.max_lookback_days must be 730'
  );
  assert.match(
    src,
    /standards_version\s*=\s*"/,
    'meta.standards_version must be set'
  );
  // Required keys must appear inside a [category.*] table block, not merely
  // somewhere in the file — slice each block and assert against it so a key
  // declared only in (say) a [source.*] table can't satisfy the check.
  const categoryBlocks = [
    ...src.matchAll(/\[category\.[^\]]+\]([\s\S]*?)(?=\n\[|$)/g),
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
  // Reliability defaults use the locked vocabulary only.
  const relTags = src.match(/reliability_default\s*=\s*"([^"]+)"/g) || [];
  for (const m of relTags) {
    assert.match(
      m,
      /"(minimal|maximal|not-reliable)"/,
      `reliability_default must be one of minimal|maximal|not-reliable: ${m}`
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
  const categoryCount = (src.match(/^\[category\./gm) || []).length;
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
    'SKILL.md Step 5 must pass standards.toml to auditors'
  );
  assert.match(src, /sum|total/i, 'SKILL.md Step 6 must sum weighted points');
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

test('plugin.json version matches the awos marketplace entry and equals 2.3.0', () => {
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
    '2.3.0',
    `plugins/awos/.claude-plugin/plugin.json version must be "2.3.0" (release version is managed by release-drafter, not bumped per change), got "${pluginManifest.version}"`
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
// ORG.2: SKILL.md Step 6 org branch — ≤3 portfolio metrics + org rollup
// ---------------------------------------------------------------------------

test('SKILL.md Step 6 org branch references the org rollup', () => {
  // The org rollup is invoked by SKILL.md Step 6 via the CLI. The reference
  // ties the orchestrator to the rollup implementation.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /org.rollup|rollup/i.test(body),
    'SKILL.md Step 6 org branch must reference the org rollup'
  );
  assert.ok(
    body.includes('node dist/cli.js rollup') ||
      body.includes('dist/cli.js rollup') ||
      /dist\/cli\.js["']?\s+rollup/.test(body),
    'SKILL.md must show the rollup CLI invocation (node dist/cli.js rollup <dir> or with absolute path)'
  );
});

test('SKILL.md Step 6 org branch names the three portfolio metrics', () => {
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

test('SKILL.md Step 6 states the ≤3 portfolio metrics constraint', () => {
  // The brief is explicit: "≤3 org metrics" is a hard constraint, not a
  // style choice. SKILL.md must state it so the orchestrator does not add
  // more metrics without revisiting the design.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /≤\s*3|<= 3|exactly three|three.*portfolio metric/i.test(body),
    'SKILL.md must state the ≤3 portfolio metrics constraint (never aggregate the full per-repo set)'
  );
});

test('SKILL.md Step 6 org branch emits an org-level JSON artifact', () => {
  // JSON is the source-of-truth (JSON-source-of-truth rule). SKILL.md must
  // document that the org rollup result is written to a JSON file before
  // any MD/HTML rendering.
  const body = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /org.portfolio\.json|org.*\.json/i.test(body),
    'SKILL.md must document the org-level JSON artifact (org-portfolio.json)'
  );
});

// ---------------------------------------------------------------------------
// POL.1+2+3: report-template.md and output-format.md describe the renderer
// ---------------------------------------------------------------------------

test('report-template.md references the render verb (cli.js render)', () => {
  const src = readUtf8(path.join(skillRoot, 'report-template.md'));
  assert.ok(
    src.includes('cli.js render') ||
      src.includes('cli render') ||
      /render\b/.test(src),
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
// POL-B: SKILL.md Step 6 aggregates JSON → audit.json + renders MD;
//         Step 6 unconditionally renders HTML (incl. headless)
// ---------------------------------------------------------------------------

test('SKILL.md Step 6 aggregates per-dimension JSON into audit.json', () => {
  // JSON is the source of truth (global constraint). Step 6 must aggregate
  // per-dimension artifacts into a single audit.json before producing any
  // rendered output. The orchestrator must never hand-write report.md.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    src.includes('audit.json'),
    'SKILL.md Step 6 must reference audit.json as the aggregated result artifact'
  );
  assert.ok(
    /per.dimension.*json|<dimension>\.json|dimensions?\.json/i.test(src),
    'SKILL.md Step 6 must describe reading per-dimension JSON artifacts before aggregating'
  );
});

test('SKILL.md Step 6 renders report.md via cli.js render --format md', () => {
  // The orchestrator must call the renderer for markdown output, not write it
  // by hand. The render command + --format md flag are the canonical invocation.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    src.includes('node dist/cli.js render') ||
      src.includes('dist/cli.js render') ||
      /dist\/cli\.js["']?\s+render/.test(src),
    'SKILL.md Step 6 must invoke the render CLI command to produce report.md (never hand-write it)'
  );
  assert.ok(
    /--format md/.test(src),
    'SKILL.md Step 6 must pass "--format md" to the renderer for the markdown report'
  );
  assert.ok(
    /report\.md/.test(src),
    'SKILL.md Step 6 must name the output file report.md'
  );
});

test('SKILL.md Step 6 states the data-loss guarantee (no hand-written report)', () => {
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

test('SKILL.md Step 6 unconditionally renders report.html via --format html', () => {
  // HTML is the headline deliverable. Step 6 produces it for every run,
  // including headless — generated unconditionally, never gated on Step 7 or
  // on interactivity. (Moving it out of Step 6 is the regression this pins.)
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /unconditional|always produce both|headless runs always produce/i.test(src),
    'SKILL.md Step 6 must state report.html is generated unconditionally (incl. headless), never gated on interactivity'
  );
  assert.ok(
    /--format html/.test(src),
    'SKILL.md Step 6 must show "--format html" as the HTML render flag'
  );
  assert.ok(
    /report\.html/.test(src),
    'SKILL.md Step 6 must name the output file report.html'
  );
});

test('SKILL.md Step 6 HTML always produced (never gated/skipped)', () => {
  // The "never skip" contract is the key headless guarantee. Lint pins it
  // so future edits do not accidentally make HTML optional in headless mode.
  const src = readUtf8(SKILL_MD_PATH);
  assert.ok(
    /always produc|never skip|never gated|unconditional/i.test(src),
    'SKILL.md Step 6 must state that report.html is always produced (never skipped/gated)'
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
