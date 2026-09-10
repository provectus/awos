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
  // tasks.md and tech.md only need to know what
  // specialist agents exist and what each one covers — enough to pick
  // an assignee / draft a stack section. Both
  // project-local and plugin-provided agents are listed in the Agent
  // tool's description block at runtime, so introspecting that block
  // is sufficient — neither command needs to Read each
  // `.claude/agents/*.md` file and parse YAML frontmatter.
  const lightReferencers = ['tasks.md', 'tech.md'];
  for (const file of lightReferencers) {
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

test('subagent-enumerating commands cover plugin-provided agents', () => {
  // /awos:tech and /awos:tasks assign or report on
  // specialists. Each must instruct Claude to look beyond
  // .claude/agents/*.md and also enumerate plugin-provided agents
  // (recognized by the "plugin-name:" prefix on subagent_type, which
  // only appears in the Agent tool's description block). Without this,
  // plugin-shipped specialists are invisible to the orchestrator.
  const enumerators = ['tech.md', 'tasks.md'];
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

  // The dimension must not resurrect the retired per-dimension collect/metric
  // fan-out. Neither verb exists in cli.ts — the dispatcher is
  // progress/render/rollup/audit-core/enrich/aggregate/patch-*/report-context
  // — and this lint used to REQUIRE the reference, so the file documented
  // commands the CLI has never implemented and the suite enforced it.
  assert.ok(
    !/cli[^"\n]*"?\s+collect\b/.test(body),
    'body must not document a "collect" engine command — no such verb exists in cli.ts, and the per-source collect block it belonged to could not produce collected/incidents.json, the artifact has_incident_source now reads'
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
    'commands/tasks.md must use AskUserQuestion to offer the 3-option fallback when no QA agent is available'
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

test('verify.md never punts a drivable render to the user', () => {
  // Road-test regression (session 928eba0a): the generated /fix-bug
  // paused and told the user to run `! make run` for the live check,
  // even though the agent could reclaim the port or drive the deploy
  // itself. It punted because a shared-resource guardrail made
  // "can't auto-verify" artificially true. Running the app is verify's
  // job, and the manual AskUserQuestion fallback is only for a criterion
  // with no agent-driven render path at all.
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
});

test('completion claims require fresh evidence — the verification reflex is baked into agent prompts', () => {
  // The verification-before-completion discipline: an agent may not
  // report its own work as done on belief ("should work", "Done!") —
  // the claim cites command output produced in the same run, and a
  // test written for a change is proven by failing without that
  // change. "RED validation" is the canonical name — coined by the
  // testing slice commands/tasks.md emits — so other prompts reference
  // it rather than coining parallel terms. /awos:implement's
  // <completion_evidence> block makes each subagent prove the tests it
  // writes, and Step 4's independent spot-check treats that proof as a
  // claim to verify, not a fact to relay.
  const tasks = readUtf8(path.join(commandsDir, 'tasks.md'));
  assert.ok(
    /RED validation/.test(tasks),
    'commands/tasks.md testing slice must carry the literal "RED validation" wording — the other prompts reference it as the canonical term'
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
});

test('setup-config does not auto-populate .claude/agents/', () => {
  // .claude/agents/ is the user's customization area. The earlier draft
  // of this PR shipped a `plugins/awos/agents` → `.claude/agents` copy
  // operation that would silently clobber user-authored subagents on
  // every install. AWOS does not manage a project's specialist subagents
  // at all — so the installer must not create or overwrite anything
  // under .claude/agents/.
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

test('manual sources are handled across skill and commands', () => {
  // SKILL.md must offer manual as an access method in the manifest, and
  // architecture.md — the one remaining retrieval command — must branch on
  // manual sources (user pastes content directly rather than calling a
  // tool). architecture.md is the only retrieval command left.
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
  for (const cmd of ['architecture.md']) {
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

test('architecture.md does not invoke configure-external-sources skill', () => {
  // architecture.md must not try to create sources from scratch — it only
  // reads context/sources/sources.md if some other process already
  // configured it (nothing in this repo invokes the skill anymore since
  // product.md dropped the sources-offer along with brownfield onboarding).
  for (const cmd of ['architecture.md']) {
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

test('architecture.md passes existing findings to its documentation retrieval', () => {
  // architecture.md's external-documentation retrieval prompt must pass the
  // codebase-exploration findings gathered in Step 2 via <existing_findings>
  // tags, so the docs-retrieval agent does not repeat what codebase
  // exploration already found.
  for (const cmd of ['architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      body.includes('<existing_findings>'),
      `commands/${cmd} must pass existing findings to the Explore agent to avoid duplicates`
    );
  }
});

test('architecture.md guards retrieval on context/sources/sources.md existence', () => {
  for (const cmd of ['architecture.md']) {
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

test('architecture.md docs retrieval reports only NEW findings', () => {
  // architecture.md's <existing_findings> block now carries the codebase-
  // exploration findings from Step 2 (not brownfield.md, which no longer
  // exists) — the "Report only NEW" instruction is what makes passing that
  // block actually suppress duplicate findings in the docs-retrieval pass.
  for (const cmd of ['architecture.md']) {
    const body = readUtf8(path.join(commandsDir, cmd));
    assert.ok(
      body.includes('<existing_findings>'),
      `commands/${cmd} must pass existing findings inside <existing_findings> tags to the Explore agent`
    );
    assert.ok(
      /Report only NEW/i.test(body),
      `commands/${cmd} must instruct the Explore agent to report only NEW findings`
    );
  }
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
// together: plugin.json, marketplace.json, and this pinned literal. (flow.md
// and its generator-version constant were removed with the flow feature —
// the lockstep is three files now, not four.) The pin exists to force that
// deliberateness, not to freeze the version.
const EXPECTED_PLUGIN_VERSION = '3.0.1';

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
const EXPECTED_BETTER_PLUGIN_VERSION = '0.2.0';

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

test('better command keeps its structural contracts (fan-out, unattended handling, core-contract references)', () => {
  const cmd = readUtf8(
    path.join(repoRoot, 'plugins', 'better', 'commands', 'spec.md')
  );
  const requiredSubstrings = [
    [
      'single message, as parallel `Agent` calls',
      'the research fan-out must be dispatched as parallel Agent calls in a single message — sequential or discretionary dispatch is the failure mode this contract prevents',
    ],
    [
      'AWOS_UNATTENDED',
      'the command must read AWOS_UNATTENDED to branch interactive vs unattended question handling',
    ],
    [
      '[NEEDS CLARIFICATION',
      'unresolved details must be captured as [NEEDS CLARIFICATION: …] markers, never as stop signals',
    ],
    [
      '## Language Rules',
      'the non-technical Language Rules section carried from core spec.md must be present',
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
      'The verifier runs exactly once',
      'the blind-verification cycle must be bounded to a single verifier dispatch',
    ],
    [
      'This step asks the user nothing',
      'synthesis must not interview — under claude -p a dismissed question ends the turn, so every question the research raises has to wait until after Step 7 writes the deliverables',
    ],
    [
      'When `AWOS_UNATTENDED` is set, skip this round entirely',
      'the opening interview must be skipped outright in unattended runs — it is the only ask that precedes the writes, so it is the only one that can still cost both deliverables',
    ],
    [
      'Do not ask here: this step precedes the write',
      'the scope boundary must be drafted and marked rather than asked — Step 6 runs before the files exist',
    ],
    [
      'view_model_path="${TMPDIR:-/tmp}/spec-view-[index].json"',
      'the temp paths must be resolved once with a TMPDIR fallback and reused — re-interpolating a bare $TMPDIR per step lets the file written and the file rendered diverge, and makes the cleanup rm a path that was never created',
    ],
    [
      'MANUAL SOURCES ONLY',
      'a configured-but-manual-only KB lane needs its own report label — SKIPPED implies an agent ran and NOT CONFIGURED tells the user to redo setup they already did',
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
      'one bullet at a time',
      'the self-review must re-read acceptance criteria one bullet at a time (carried from core spec.md) — checking the set as a whole lets a single non-compliant bullet survive',
    ],
    [
      'free-text option for open-ended markers',
      'marker resolution must offer free text (carried from core spec.md) — not every [NEEDS CLARIFICATION] reduces to an option set',
    ],
    [
      'functional-spec.html',
      'the command must name the rendered review page as a derived output',
    ],
    [
      'never fatal',
      'the render step must be non-fatal — the markdown deliverables stand alone if the render fails',
    ],
    [
      '--artifact',
      'the artifact publish path must use the renderer fragment mode, not upload the standalone document',
    ],
    [
      'withheld consent',
      'publishing to an external service is a consent gate — an unanswered question means no, inverting the usual proceed-with-default rule',
    ],
    [
      '**only** the absolute path',
      'the verifier dispatch must pass only the spec file path — session context would contaminate the blind read',
    ],
  ];
  for (const [needle, contract] of requiredSubstrings) {
    assert.ok(
      cmd.includes(needle),
      `plugins/better/commands/spec.md must contain "${needle}" — ${contract}`
    );
  }
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
  const producers = ['product.md', 'architecture.md', 'spec.md', 'tasks.md'];
  for (const name of producers) {
    const body = readUtf8(path.join(commandsDir, name));
    assert.ok(
      /without waiting for approval|writing before the review is safe/i.test(
        body
      ),
      `commands/${name} must state that it writes its artifact before the review, not after an approval`
    );
  }

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

test('commands/spec.md mandates the when/then pair per acceptance criterion', () => {
  // Step 3.3 described the three-part shape only abstractly ("a precondition
  // (Given), a user action (When), a visible outcome (Then)"), which reads as
  // guidance about content rather than a required sentence form — so a lone
  // bullet would come out declarative ("The user submits X. They see Y.") and
  // still look compliant. The behavioral proof is awos-qa's
  // spec-uses-gwt-acceptance-criteria, which greps every AC bullet for
  // `when … then` in one sentence; this lint pins the instruction that makes
  // it hold, including the per-bullet re-read in the Definition of Done
  // (checking the set as a whole is how a single offender survives).
  const body = readUtf8(path.join(commandsDir, 'spec.md'));
  assert.ok(
    /in that order, within a \*\*single sentence\*\*/.test(body),
    'commands/spec.md Step 3.3 must require when and then in that order within a single sentence'
  );
  assert.ok(
    /in every criterion/.test(body),
    'commands/spec.md Step 3.3 must apply the when/then shape to every criterion, not just to the set'
  );
  assert.ok(
    /one bullet at a time/.test(body),
    'commands/spec.md Definition of Done must re-check acceptance criteria one bullet at a time'
  );
});
