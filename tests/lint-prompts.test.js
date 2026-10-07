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
  // an assignee / draft a stack section / hint at coverage — and
  // implement.md verifies a task's named agent against the same roster
  // before delegating. Both project-local and plugin-provided agents
  // are listed in the Agent tool's description block at runtime, so
  // introspecting that block is sufficient. Forcing them to Read the
  // files (as earlier versions of this test did) over-specified the
  // implementation; the awos-qa contract is the output (correct
  // `**[Agent: ...]**` markers, no hallucinations), not the tool
  // sequence used to produce it.
  const frontmatterReaders = ['hire.md'];
  const lightReferencers = [
    'tasks.md',
    'tech.md',
    'architecture.md',
    'implement.md',
  ];

  for (const file of [...frontmatterReaders, ...lightReferencers]) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('.claude/agents/'),
      `commands/${file} must reference '.claude/agents/' as the subagent discovery source`
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
  // The audit command is a plugin skill, not a commands/ file, so it needs
  // an explicit entry to resolve.
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
  for (const key of ['name', 'description', 'model', 'effort', 'skills']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(data, key),
      `agent-template.md missing key "${key}"`
    );
  }
  // The defaults are the contract, not just the keys. An agent file that
  // omits model/effort inherits the orchestrator's, which is what makes a
  // routine implementation task run on a model priced for hard reasoning.
  assert.strictEqual(
    data.model,
    'sonnet',
    `agent-template.md must default model to "sonnet" — every hired agent inherits this file, so a change here silently re-prices every delegated task. Got "${data.model}"`
  );
  assert.strictEqual(
    data.effort,
    'low',
    `agent-template.md must default effort to "low" — raising it is a per-role decision /awos:hire makes deliberately, never the template's default. Got "${data.effort}"`
  );
});

test('hired specialists cannot re-delegate: template denies Agent, hire.md enforces it', () => {
  // A specialist with the Agent tool tends to forward its brief to another
  // agent (even its own type) instead of doing the work — profiled
  // /awos:implement runs showed verify tasks three delegation hops deep.
  // The template denies the tool for generated agents; hire.md applies the
  // same denial to registry-installed and pre-existing agent files, which
  // never pass through the template.
  const { data } = parse(
    readUtf8(path.join(templatesDir, 'agent-template.md'))
  );
  assert.ok(
    /\bAgent\b/.test(String(data.disallowedTools ?? '')),
    'templates/agent-template.md frontmatter must carry `disallowedTools: Agent` so a generated specialist cannot spawn subagents'
  );
  const hire = readUtf8(path.join(commandsDir, 'hire.md'));
  assert.ok(
    /disallowedTools: Agent/.test(hire),
    'commands/hire.md must ensure every installed or existing agent file carries `disallowedTools: Agent` — registry agents never pass through the template'
  );
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
  //   <do_the_work_yourself>         — the specialist implements, it doesn't re-delegate
  //   <command_hygiene>              — no daemon piped into tail/grep, stop by PID, timeouts
  //   <completion_evidence>          — cite fresh command output, no belief-based "done"
  const body = readUtf8(path.join(commandsDir, 'implement.md'));
  const needed = [
    '<scope_discipline>',
    '<investigate_before_answering>',
    '<use_available_skills>',
    '<do_the_work_yourself>',
    '<command_hygiene>',
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
  // /awos:tech, /awos:hire, and /awos:tasks assign or report on
  // specialists, and /awos:implement verifies each task's named agent before
  // delegating. Each must instruct Claude to look beyond
  // .claude/agents/*.md and also enumerate plugin-provided agents
  // (recognized by the "plugin-name:" prefix on subagent_type, which
  // only appears in the Agent tool's description block). Without this,
  // plugin-shipped specialists are invisible to the orchestrator.
  const enumerators = ['tech.md', 'hire.md', 'tasks.md', 'implement.md'];
  for (const file of enumerators) {
    const body = readUtf8(path.join(commandsDir, file));
    assert.ok(
      body.includes('plugin-name:'),
      `commands/${file} must mention the "plugin-name:" prefix used to recognize plugin-provided subagents`
    );
  }
});

test('implement.md falls back to general-purpose for a missing agent and reports the substitution', () => {
  // A tasks.md may name a specialist that was never installed, has
  // since been removed, or has not been hired yet, and the upgrading
  // guide promises that such a task still runs. implement.md must (a) fall back to
  // general-purpose instead of dispatching an unresolvable
  // subagent_type, and (b) say so — substituted work must never be
  // presented as specialist work.
  const body = readUtf8(path.join(commandsDir, 'implement.md'));
  assert.ok(
    /falling back to `general-purpose`/.test(body),
    'commands/implement.md must fall back to `general-purpose` when a task names an agent that is not installed'
  );
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

test('commands/tasks.md records staffing gaps as open questions after the write', () => {
  // A task no available agent covers is a staffing gap the user decides
  // on, not a silent general-purpose fallback. The plan must stay
  // executable (every task carries a marker for /awos:implement), the gap
  // must stay visible in the file (a `## Open Questions` section), that
  // section must never look like tasks (prose or bullets, no checkbox
  // lines — or /awos:implement would run them and /awos:verify could never
  // see the spec complete), and the decision must be asked after the
  // Step 4 write with "keep the gaps recorded" as the unanswered default,
  // so an unanswered question never hides a gap.
  const body = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    body.includes('`## Open Questions`') &&
      body.includes('**[Agent: general-purpose]**'),
    'commands/tasks.md must record staffing gaps under a `## Open Questions` section and mark the uncovered tasks **[Agent: general-purpose]** — the two tokens /awos:implement reads'
  );
  const implement = readUtf8(path.join(commandsDir, 'implement.md'));
  assert.ok(
    implement.includes('`## Open Questions`'),
    'commands/implement.md must read the `## Open Questions` section tasks.md writes — a token written by one command and read by none is a dropped hand-off'
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
  // The test-registry template was shipped once but ended up unused inside
  // the AWOS repo — nothing in commands/ or templates/ reads it. Lint stops
  // the file from sneaking back in — if a future PR wants to add a related
  // template, it should justify the contract first.
  const file = path.join(templatesDir, 'qa-context-template.md');
  assert.ok(
    !fs.existsSync(file),
    'templates/qa-context-template.md must not exist in AWOS core — nothing in this repo reads it'
  );
});

test('commands/spec.md carries an Update Mode that amends in place', () => {
  // spec.md was creation-only; a behavior-changing fix had no way to keep the
  // spec in sync. Update Mode mirrors the Step 2A pattern in
  // product/architecture: detect an existing spec, edit it in place,
  // and never allocate a new index.
  const body = readUtf8(path.join(commandsDir, 'spec.md'));
  assert.ok(
    /Mode Detection/i.test(body) && /Update Mode/i.test(body),
    'commands/spec.md must add a Mode Detection step that routes an existing-spec reference to an Update Mode (mirroring product/architecture)'
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

test('functional-spec-template.md anchors the spec on a Topic field', () => {
  // With the roadmap retired, the explicit topic is what anchors a spec.
  // Both spec commands fill it (Step 1 "Determine the Specification
  // Topic"); the template must carry the field they write into.
  const body = readUtf8(path.join(templatesDir, 'functional-spec-template.md'));
  assert.ok(
    /^- \*\*Topic:\*\*/m.test(body),
    'functional-spec-template.md must carry a `- **Topic:**` header field — the anchor both spec commands fill in Step 1'
  );
});

test('architecture.md and product.md receive the verify handoff through $ARGUMENTS', () => {
  // /awos:verify ends by telling the user to run
  // `/awos:architecture <prompt>` or `/awos:product <prompt>` describing
  // what changed. Each receiver must declare $ARGUMENTS inside
  // <user_prompt> and consume it as the change request in Update Mode —
  // otherwise the handoff reaches a command that re-asks what to change.
  for (const name of ['architecture.md', 'product.md']) {
    const body = readUtf8(path.join(commandsDir, name));
    assert.ok(
      /<user_prompt>\s*\$ARGUMENTS\s*<\/user_prompt>/.test(body),
      `commands/${name} must declare $ARGUMENTS inside <user_prompt> so a verify handoff prompt reaches it`
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

test('architecture.md external-documentation retrieval contract', () => {
  // architecture.md is the only command left that reads external sources
  // (product.md dropped its sources offer with brownfield onboarding), so
  // the whole retrieval contract is pinned here in one place. It must (a)
  // never invoke the configure-external-sources skill — it only consumes a
  // sources.md some other process wrote; (b) guard retrieval on that file
  // existing with configured status, inside the retrieval block rather
  // than only in INPUTS; (c) branch on manual sources, which the user
  // pastes rather than a tool fetching; and (d) pass the Step 2 codebase
  // findings to the retrieval agent inside <existing_findings> with a
  // "report only NEW" instruction — passing the block is what suppresses
  // duplicate findings, and the instruction is what makes the block act.
  const body = readUtf8(path.join(commandsDir, 'architecture.md'));
  assert.ok(
    !body.includes('Skill(name="awos:configure-external-sources")'),
    'commands/architecture.md must not invoke the configure-external-sources skill — it only reads a sources.md some other process configured'
  );
});

test('architecture.md Update Mode re-gathers the codebase and confirms drift after the write', () => {
  // Closes the architecture-drift gap (the retired registry's gap 6): Update Mode must run the same codebase
  // exploration Creation Mode runs and diff its findings against the
  // recorded architecture — the document may only diverge from the code
  // with the user's explicit say-so. An Update Mode that revises by
  // interview alone re-opens the gap. Ordering is part of the contract:
  // the per-drift AskUserQuestion is dismissable, so it must come after
  // the Finalization write — a pre-write drift question ends an
  // unattended run with no deliverable.
  const body = readUtf8(path.join(commandsDir, 'architecture.md'));
  const updateBlock = body
    .split(/## Scenario 2: Update Mode/i)
    .slice(1)
    .join('')
    .split(/### Step 3/i)[0];
  const finalizationBlock = body
    .split(/### Step 3: Finalization/i)
    .slice(1)
    .join('');
  const creationBlock = body
    .split(/## Scenario 1: Creation Mode/i)
    .slice(1)
    .join('')
    .split(/## Scenario 2: Update Mode/i)[0];
  assert.ok(
    creationBlock.includes('subagent_type="Explore"'),
    'commands/architecture.md Creation Mode must delegate the every-run codebase gather to an Explore subagent — the orchestrator reading the tree itself is the anti-pattern the unconditional-gather contract exists to prevent'
  );
  assert.ok(
    !updateBlock.includes('AskUserQuestion'),
    'the drift AskUserQuestion must not fire before the Finalization write — a dismissed pre-write question ends an unattended run before the deliverable exists'
  );
  assert.ok(
    finalizationBlock.includes('AskUserQuestion') &&
      finalizationBlock.includes('Adopt') &&
      finalizationBlock.includes('Keep as recorded'),
    "Finalization must resolve each drift item via AskUserQuestion with Adopt / 'Keep as recorded' options, after the write"
  );
});

test('no prompt file mentions brownfield (Phase 2b: brownfield onboarding removed)', () => {
  // Phase 2b retired the brownfield-detection flow (product.md creating
  // brownfield.md, roadmap.md/architecture.md consuming it, the accept/
  // reject triage). No prompt under commands/, claude/commands/, or
  // templates/ may reintroduce the word — its presence means the removed
  // machinery (or a reference to it) crept back in.
  const promptDirs = [commandsDir, wrappersDir, templatesDir];
  const offenders = [];
  for (const dir of promptDirs) {
    for (const f of listMarkdown(dir)) {
      const body = readUtf8(path.join(dir, f));
      if (/brownfield/i.test(body)) {
        offenders.push(path.relative(repoRoot, path.join(dir, f)));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `no file under commands/, claude/commands/, or templates/ may mention "brownfield" — the Phase 2b brownfield-onboarding contract was removed: ${offenders.join(', ')}`
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
    'context/product/architecture.md',
  ];
  for (const p of canonical) {
    assert.ok(
      refs.has(p),
      `expected canonical path ${p} to be referenced by at least one prompt`
    );
  }
});

// The plugin version is independent of the npm installer version (which
// release-drafter manages via PR labels). It is bumped MANUALLY when plugin
// behavior changes — always as one deliberate commit moving three files
// together: plugin.json, marketplace.json, and this pinned literal. (flow.md
// and its generator-version constant were removed with the flow feature —
// the lockstep is three files now, not four.) The pin exists to force that
// deliberateness, not to freeze the version.
const EXPECTED_PLUGIN_VERSION = '2.4.6';

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
    `plugins/awos/.claude-plugin/plugin.json version must be "${EXPECTED_PLUGIN_VERSION}" — the plugin version moves as one deliberate commit (plugin.json + marketplace.json + this pin, together) when plugin behavior changes; it is independent of the npm release version release-drafter manages. Got "${pluginManifest.version}"`
  );
});

// The better plugin has its own independent version line. Its discipline
// is three files moving together: its plugin.json, its marketplace.json entry,
// and this pinned literal (it has no generator-version constant).
const EXPECTED_BETTER_PLUGIN_VERSION = '0.1.1';

test(`better plugin.json version matches its marketplace entry and equals ${EXPECTED_BETTER_PLUGIN_VERSION}`, () => {
  const pluginManifest = JSON.parse(
    readUtf8(
      path.join(repoRoot, 'plugins', 'better', '.claude-plugin', 'plugin.json')
    )
  );
  const marketplace = JSON.parse(
    readUtf8(path.join(repoRoot, '.claude-plugin', 'marketplace.json'))
  );
  const entries = marketplace.plugins.filter(
    (p) => p.name === 'better' && p.source === './plugins/better'
  );
  assert.equal(
    entries.length,
    1,
    'marketplace.json must contain exactly one plugins entry with name="better" and source="./plugins/better" — a near-miss name or source would register a different plugin than the one this pin guards'
  );
  const [entry] = entries;
  assert.equal(
    pluginManifest.version,
    entry.version,
    `plugins/better/.claude-plugin/plugin.json version ("${pluginManifest.version}") must match the better marketplace entry version ("${entry.version}") — bump both together`
  );
  assert.equal(
    pluginManifest.version,
    EXPECTED_BETTER_PLUGIN_VERSION,
    `plugins/better/.claude-plugin/plugin.json version must be "${EXPECTED_BETTER_PLUGIN_VERSION}" — the better version moves as one deliberate commit (its plugin.json + its marketplace.json entry + this pin, together) when plugin behavior changes. Got "${pluginManifest.version}"`
  );
});

// The profiler plugin has its own independent version line, with the same
// three-file discipline as better: plugin.json, marketplace entry, this pin.
const EXPECTED_PROFILER_PLUGIN_VERSION = '0.1.0';

test(`profiler plugin.json version matches its marketplace entry and equals ${EXPECTED_PROFILER_PLUGIN_VERSION}`, () => {
  const pluginManifest = JSON.parse(
    readUtf8(
      path.join(
        repoRoot,
        'plugins',
        'profiler',
        '.claude-plugin',
        'plugin.json'
      )
    )
  );
  const marketplace = JSON.parse(
    readUtf8(path.join(repoRoot, '.claude-plugin', 'marketplace.json'))
  );
  const entries = marketplace.plugins.filter(
    (p) => p.name === 'profiler' && p.source === './plugins/profiler'
  );
  assert.equal(
    entries.length,
    1,
    'marketplace.json must contain exactly one plugins entry with name="profiler" and source="./plugins/profiler"'
  );
  assert.equal(
    pluginManifest.version,
    entries[0].version,
    `plugins/profiler/.claude-plugin/plugin.json version ("${pluginManifest.version}") must match the profiler marketplace entry version ("${entries[0].version}") — bump both together`
  );
  assert.equal(
    pluginManifest.version,
    EXPECTED_PROFILER_PLUGIN_VERSION,
    `plugins/profiler/.claude-plugin/plugin.json version must be "${EXPECTED_PROFILER_PLUGIN_VERSION}" — the profiler version moves as one deliberate commit (its plugin.json + its marketplace.json entry + this pin) when plugin behavior changes. Got "${pluginManifest.version}"`
  );
});

test('profiler skill and script are wired together', () => {
  // The skill is the only prompt in the plugin; it must exist with a name
  // frontmatter (which becomes /profiler:<name>) and must invoke the
  // bundled script through ${CLAUDE_PLUGIN_ROOT}, the only path that
  // resolves once the plugin is installed. The script must be present and
  // executable by node without dependencies.
  const skillFile = path.join(
    repoRoot,
    'plugins',
    'profiler',
    'skills',
    'implement',
    'SKILL.md'
  );
  assert.ok(
    fs.existsSync(skillFile),
    'plugins/profiler/skills/implement/SKILL.md must exist'
  );
  const { data, body } = parse(readUtf8(skillFile));
  assert.equal(
    data.name,
    'implement',
    'the skill frontmatter name must be "implement" so it surfaces as /profiler:implement'
  );
  assert.ok(
    body.includes('${CLAUDE_PLUGIN_ROOT}/scripts/profile-implement.mjs'),
    'SKILL.md must run the bundled script via ${CLAUDE_PLUGIN_ROOT}/scripts/profile-implement.mjs'
  );
  assert.ok(
    /AskUserQuestion/.test(body),
    'SKILL.md must ask for the mode with AskUserQuestion when none is given'
  );
  assert.ok(
    /Do not kill processes or stop agents yourself/.test(body),
    'SKILL.md must leave releasing a stall to the user — the profiler observes, it does not act'
  );
  const scriptFile = path.join(
    repoRoot,
    'plugins',
    'profiler',
    'scripts',
    'profile-implement.mjs'
  );
  assert.ok(
    fs.existsSync(scriptFile),
    'plugins/profiler/scripts/profile-implement.mjs must exist'
  );
  const src = readUtf8(scriptFile);
  assert.ok(
    !/from ['"](?!node:)/.test(src),
    'profile-implement.mjs must import only node: built-ins — the plugin ships with no dependencies'
  );
});

test('better command keeps its structural contracts (fan-out, unattended handling, core-contract references)', () => {
  const cmd = readUtf8(
    path.join(repoRoot, 'plugins', 'better', 'commands', 'spec.md')
  );
  const requiredSubstrings = [
    [
      'AWOS_UNATTENDED',
      'the command must read AWOS_UNATTENDED to branch interactive vs unattended question handling',
    ],
    [
      '[NEEDS CLARIFICATION',
      'unresolved details must be captured as [NEEDS CLARIFICATION: …] markers, never as stop signals',
    ],
    [
      '.awos/templates/functional-spec-template.md',
      'the command must fill the installed core template (same deliverable contract as /awos:spec)',
    ],
    [
      'create-spec-directory.sh',
      'the command must allocate the spec directory via the core script (same numbering as /awos:spec)',
    ],
    [
      'research-notes.md',
      'the command must write the research-notes.md side artifact alongside the spec',
    ],
    [
      '`## Status: configured`',
      'the internal-KB lane must gate on the exact sources.md status idiom used across AWOS commands',
    ],
    [
      'view_model_path="${TMPDIR:-/tmp}/spec-view-[index].json"',
      'the temp paths must be resolved once with a TMPDIR fallback and reused — re-interpolating a bare $TMPDIR per step lets the file written and the file rendered diverge, and makes the cleanup rm a path that was never created',
    ],
    [
      '${CLAUDE_PLUGIN_ROOT}/scripts/render-spec.mjs',
      'the renderer must be invoked through ${CLAUDE_PLUGIN_ROOT} — a relative path breaks across install locations',
    ],
    [
      'Agent(subagent_type="better:spec-verifier")',
      'the blind verifier must be dispatched by its plugin-prefixed subagent_type — without the better: prefix the agent does not resolve and the verification pass silently never runs',
    ],
    [
      'functional-spec.html',
      'the command must name the rendered review page as a derived output',
    ],
    [
      '--artifact',
      'the artifact publish path must use the renderer fragment mode, not upload the standalone document',
    ],
    [
      'Do not guess a topic from the product definition or the codebase.',
      'the no-topic bail-out must refuse to invent a topic — shared verbatim with core spec.md (see the shared-bail-out test below)',
    ],
  ];
  for (const [needle, contract] of requiredSubstrings) {
    assert.ok(
      cmd.includes(needle),
      `plugins/better/commands/spec.md must contain "${needle}" — ${contract}`
    );
  }
});

test('core spec.md shares the no-topic bail-out contract with /better:spec', () => {
  const core = readUtf8(path.join(repoRoot, 'commands', 'spec.md'));
  assert.ok(
    core.includes(
      'Do not guess a topic from the product definition or the codebase.'
    ),
    'commands/spec.md must refuse to invent a topic when the prompt is empty — the same sentence /better:spec pins, so the two contract-identical spec commands cannot drift apart silently'
  );
  assert.ok(
    core.includes('AWOS_UNATTENDED'),
    'commands/spec.md must branch on AWOS_UNATTENDED for the no-topic stop — the stop has to precede the topic question, because under claude -p a dismissed AskUserQuestion ends the turn and an instruction placed after it never executes'
  );
});

test('better spec-verifier agent stays blind (tools restricted to Read, no other file reads)', () => {
  const agent = readUtf8(
    path.join(repoRoot, 'plugins', 'better', 'agents', 'spec-verifier.md')
  );
  assert.ok(
    /^tools: Read$/m.test(agent),
    'spec-verifier.md frontmatter must restrict the agent to `tools: Read` — the blind read depends on the agent being unable to explore the repo'
  );
  assert.ok(
    agent.includes('Do not read any other file'),
    'spec-verifier.md body must prohibit reading any file other than the dispatched spec path'
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
// Audit plugin agents
// ---------------------------------------------------------------------------

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

test('connector-shapes.md documents every incidents field the collector defines', () => {
  // The incidents recipe must not drift from the collector's actual contract:
  // every field on the IncidentRecord / IncidentsConnector / IncidentsRaw
  // interfaces in collectors/incidents.ts has to appear in
  // references/connector-shapes.md, so a renamed/added field can't silently
  // leave the recipe stale. IncidentsRaw carries the DERIVED fields the engine
  // reports (resolved_count, median_duration_hours, …) — the very contract the
  // recipe must explain — so it is guarded alongside the input shapes.
  const ts = readUtf8(
    path.join(
      repoRoot,
      'plugins/awos/skills/ai-readiness-audit/collectors/incidents.ts'
    )
  );
  const doc = readUtf8(
    path.join(
      repoRoot,
      'plugins/awos/skills/ai-readiness-audit/references/connector-shapes.md'
    )
  );
  const fieldsOf = (iface) => {
    const body = ts.match(
      new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`)
    );
    assert.ok(body, `collectors/incidents.ts must define interface ${iface}`);
    return [...body[1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
  };
  const fields = [
    ...fieldsOf('IncidentRecord'),
    ...fieldsOf('IncidentsConnector'),
    ...fieldsOf('IncidentsRaw'),
  ];
  // Match only within the incidents recipe. Six of the guarded fields ('id',
  // 'resolved_at', 'source', 'source_label', 'count', 'resolved_count') appear
  // as standalone identifiers in the tracker/CI/code-host recipes, so matching
  // the whole file let the incidents bullets be deleted with this test green.
  const start = doc.indexOf('## Incidents');
  assert.ok(
    start !== -1,
    'connector-shapes.md must carry an "## Incidents" section for the field guard to scope to'
  );
  const section = doc.slice(start);
  // Match each field as a standalone identifier, not a raw substring: 'id' must
  // not be satisfied by the word "incident", nor 'count' by "resolved_count" or
  // 'source' by ordinary prose — the fields most likely to drift unnoticed.
  const documented = (f) =>
    new RegExp(`(?<![A-Za-z0-9_])${f}(?![A-Za-z0-9_])`).test(section);
  const missing = [...new Set(fields)].filter((f) => !documented(f));
  assert.deepEqual(
    missing,
    [],
    `connector-shapes.md must document these incidents fields (drifted from incidents.ts): ${missing.join(', ')}`
  );
});

test('every artifact-producing command writes before review, never gating the write on a reply', () => {
  // The deliverable must never sit behind a confirmation an unattended
  // `claude -p` run cannot answer. A past AWOS command regressed exactly
  // this way: a prose "confirm before proceeding" after an inference table
  // ended the turn, so its artifact was never written at all. Every command
  // that produces a durable artifact declares the contract, and no command
  // may reintroduce a write-gating phrase. A genuine decision is fine — it
  // just has to be an AskUserQuestion (which an answer-map can answer)
  // placed before anything is written, not prose the run stalls on.
  // Phrases that gate a write on a user reply. "before saving" alone is
  // allowed: architecture.md and spec.md use it for content checks the model
  // performs itself, which block nothing.
  const writeGates = [
    /for approval before saving/i,
    /approval before (saving|writing)/i,
    /confirm before proceeding/i,
    /wait for (the user's )?(approval|confirmation) before (saving|writing)/i,
  ];
  for (const name of fs
    .readdirSync(commandsDir)
    .filter((f) => f.endsWith('.md'))) {
    const body = readUtf8(path.join(commandsDir, name));
    for (const rx of writeGates) {
      assert.ok(
        !rx.test(body),
        `commands/${name} gates a write on a user reply (${rx}) — write the artifact, then present it for review`
      );
    }
  }
});
