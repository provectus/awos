'use strict';

// Contract tests for the C4 diagram eval tooling (tools/c4-evals/) and the
// eval-c4-multiservice fixture. Everything here is deterministic and free:
// no claude sessions, no network. The experimental contracts under test are
// pre-registered in docs/2.0/c4-diagram-eval-plan.md.

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const TOOLS = path.join(REPO, 'tools', 'c4-evals');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'eval-c4-multiservice');

async function load(name) {
  return import(path.join(TOOLS, name));
}

// --- mermaid-edges.mjs -------------------------------------------------------

const SAMPLE_DIAGRAM = `flowchart LR
    user([Slack User]):::person

    subgraph acme["Acme System"]
        bot["Slack Bot<br/>(Python, ECS)"]:::container
        rds[("PostgreSQL")]:::datastore
    end

    slack[/"Slack API"/]:::external

    user -->|messages| slack
    slack -->|events| bot
    bot --> rds

    classDef person fill:#08427b,stroke:#052e56,color:#fff
`;

test('mermaid parser extracts every node with its kind and boundary', async () => {
  const { parseMermaid } = await load('mermaid-edges.mjs');
  const parsed = parseMermaid(SAMPLE_DIAGRAM);
  assert.strictEqual(
    parsed.nodes.size,
    4,
    'parser must find all 4 nodes of the sample diagram (person, container, datastore, external)'
  );
  assert.strictEqual(
    parsed.nodes.get('user').kind,
    'person',
    'user node must carry its classDef kind'
  );
  assert.strictEqual(
    parsed.nodes.get('rds').kind,
    'datastore',
    'cylinder node must carry its classDef kind'
  );
  assert.strictEqual(
    parsed.nodes.get('bot').group,
    'acme',
    'nodes inside a subgraph must record their boundary'
  );
  assert.strictEqual(
    parsed.nodes.get('bot').label,
    'Slack Bot (Python, ECS)',
    '<br/> in labels must flatten to a space'
  );
});

test('mermaid parser extracts every edge with direction and label', async () => {
  const { parseMermaid } = await load('mermaid-edges.mjs');
  const parsed = parseMermaid(SAMPLE_DIAGRAM);
  assert.deepStrictEqual(
    parsed.edges,
    [
      { from: 'user', to: 'slack', label: 'messages' },
      { from: 'slack', to: 'bot', label: 'events' },
      { from: 'bot', to: 'rds', label: null },
    ],
    'edges must preserve source order, direction, and labels (null when unlabeled)'
  );
});

test('edge-list rendering states boundaries, kinds, and every edge', async () => {
  const { parseMermaid, renderEdgeList } = await load('mermaid-edges.mjs');
  const text = renderEdgeList(parseMermaid(SAMPLE_DIAGRAM));
  assert.match(
    text,
    /\*\*Acme System\*\* contains/,
    'boundary membership must be stated'
  );
  assert.match(
    text,
    /Slack API is a external outside the system boundary/,
    'external systems must be placed outside the boundary'
  );
  assert.match(
    text,
    /Slack API \(external\) → Slack Bot \(Python, ECS\) \(container, inside Acme System\) — events/,
    'each edge must name both endpoints with kinds and carry its label'
  );
});

test('transformMarkdown replaces mermaid fences and leaves prose untouched', async () => {
  const { transformMarkdown } = await load('mermaid-edges.mjs');
  const md = `# Doc\n\nIntro prose.\n\n\`\`\`mermaid\n${SAMPLE_DIAGRAM}\`\`\`\n\nOutro prose.\n`;
  const out = transformMarkdown(md);
  assert.ok(
    !out.includes('```mermaid'),
    'no mermaid fence may survive the arm-C transform'
  );
  assert.ok(
    out.includes('Intro prose.') && out.includes('Outro prose.'),
    'surrounding prose must be byte-identical'
  );
  assert.match(
    out,
    /stated explicitly/,
    'the derived edge list must replace the fence in place'
  );
});

// --- grade-run.mjs -----------------------------------------------------------

test('hallucination grader: unresolvable references are flagged, resolvable and run-created ones are not', async () => {
  const { extractTaskRefs, resolveRefs } = await load('grade-run.mjs');
  const tasksMd = [
    '- [ ] Edit `services/gateway-api/src/routes/orders.js` to add the route `/orders/:id/eta`',
    '- [ ] Create `packages/shared/src/models/eta-estimate.js`',
    '- [ ] Wire `services/gateway-api/src/clients/billing-client.js` into checkout', // hallucinated
    '- [ ] Call the endpoint `/billing/invoices`', // hallucinated
  ].join('\n');
  const postrun = [
    'services/gateway-api/src/routes/orders.js',
    'packages/shared/src/models/eta-estimate.js', // created by the run itself -> resolves
  ];
  const sources = "router.get('/orders/:id/eta', handler)";
  const refs = extractTaskRefs(tasksMd);
  const unresolved = resolveRefs(refs, postrun, sources);
  assert.deepStrictEqual(
    unresolved.sort(),
    ['/billing/invoices', 'services/gateway-api/src/clients/billing-client.js'],
    'exactly the two references that exist nowhere in the post-run tree must be flagged as hallucinations'
  );
});

test('hallucination grader: dot-dot-relative requires resolve by trailing path (smoke-run regression)', async () => {
  const { resolveRefs } = await load('grade-run.mjs');
  // Observed in the first smoke run: require('../validation') from
  // packages/shared/src/models/eta-estimate.js was false-flagged.
  const unresolved = resolveRefs(
    ['../validation', '../nonexistent-helper'],
    ['packages/shared/src/validation.js'],
    ''
  );
  assert.deepStrictEqual(
    unresolved,
    ['../nonexistent-helper'],
    'a ..-relative require that matches a real file by trailing path must resolve; one that matches nothing must still be flagged'
  );
});

test('hallucination grader: wrong-directory refs to a duplicated basename stay flagged (review regression)', async () => {
  const { resolveRefs } = await load('grade-run.mjs');
  // Fixtures repeat basenames across services (errors.js in 5+ places); a
  // reference to a nonexistent path must not resolve via the bare filename.
  const unresolved = resolveRefs(
    ['services/pricing-service/src/handlers/errors.js', 'errors.js'],
    ['services/billing-engine/src/errors.js'],
    ''
  );
  assert.deepStrictEqual(
    unresolved,
    ['services/pricing-service/src/handlers/errors.js'],
    'a pathed reference to the wrong directory is a hallucination even when the basename exists elsewhere; a bare-basename token still resolves'
  );
});

test('diff reference extraction keeps only fixture-resolvable module paths', async () => {
  const { extractDiffRefs } = await load('grade-run.mjs');
  const diff = [
    '+++ b/services/gateway-api/src/routes/orders.js',
    "+const eta = require('../eta/estimator');",
    "+const { EtaEstimate } = require('packages/shared/src/models/eta-estimate');",
    "+const http = require('node:http');",
    '-const old = require("./removed");',
  ].join('\n');
  assert.deepStrictEqual(
    extractDiffRefs(diff).sort(),
    ['../eta/estimator', 'packages/shared/src/models/eta-estimate'],
    'only added relative/fixture module paths count as reference claims; node built-ins and removed lines do not'
  );
});

test('scope grader: edits outside scope.json allowed paths are out of scope', async () => {
  const { outOfScope, parseChangedFiles } = await load('grade-run.mjs');
  const changed = parseChangedFiles(
    [
      'M\tservices/gateway-api/src/routes/orders.js',
      'A\tpackages/shared/src/models/eta-estimate.js',
      'M\tservices/gateway-api/src/legacy/notifications.js',
      'R100\tsrc/a.js\tservices/tracking-worker/src/renamed.js',
      'M\tvar/tracking/state.json',
    ].join('\n')
  );
  const scope = {
    allowed: [
      'services/gateway-api/src/routes',
      'packages/shared/src/models',
      'services/tracking-worker/src',
    ],
    ignored: ['var'],
  };
  assert.deepStrictEqual(
    outOfScope(changed, scope),
    ['services/gateway-api/src/legacy/notifications.js'],
    'the legacy bait edit must be the only out-of-scope finding: renames count their destination, ignored dirs are excluded'
  );
});

test('drift grader reports both directions of tasks<->implement drift', async () => {
  const { drift } = await load('grade-run.mjs');
  const postrun = [
    'services/a/planned-touched.js',
    'services/a/planned-skipped.js',
    'services/a/surprise.js',
  ];
  const result = drift(
    ['services/a/planned-touched.js', 'services/a/planned-skipped.js'],
    ['services/a/planned-touched.js', 'services/a/surprise.js'],
    postrun
  );
  assert.deepStrictEqual(
    result.plannedNotTouched,
    ['services/a/planned-skipped.js'],
    'a planned existing file the diff never touched is drift'
  );
  assert.deepStrictEqual(
    result.touchedNotPlanned,
    ['services/a/surprise.js'],
    'a touched file the tasks never named is drift'
  );
});

test('transcript usage and question counting survive streaming partials', async () => {
  const { parseTranscript, sessionUsage, countQuestions } =
    await load('grade-run.mjs');
  const jsonl = [
    JSON.stringify({ type: 'system', session_id: 's1' }),
    '{"type":"assistant","message":{"content":[{"type":"te', // garbled partial line
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }],
      },
    }),
    JSON.stringify({
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      duration_ms: 1234,
      num_turns: 7,
    }),
  ].join('\n');
  const events = parseTranscript(jsonl);
  assert.strictEqual(
    countQuestions(events),
    1,
    'AskUserQuestion tool uses must be counted as clarifying questions'
  );
  const usage = sessionUsage(events);
  assert.strictEqual(
    usage.inputTokens,
    100,
    'tokens must come from the final result event'
  );
  assert.strictEqual(
    usage.numTurns,
    7,
    'turn count must come from the final result event'
  );
});

// --- compare-arms.mjs: the pre-registered decision rule ----------------------

function armSummary(overrides) {
  return {
    n: 10,
    passes: 5,
    stalled: 0,
    hallucinatedMean: 4,
    hallucinatedSd: 1,
    outOfScopeMean: 1,
    questionsMean: 1,
    tokensMean: 100000,
    tokensSd: 5000,
    durationMsMean: 60000,
    driftMean: 2,
    ...overrides,
  };
}

test('pairwise rule: >=2 extra passes within token budget wins', async () => {
  const { beats } = await load('compare-arms.mjs');
  assert.ok(
    beats(armSummary({ passes: 7 }), armSummary({ passes: 5 })),
    'pass-count branch of the rule must fire at +2 passes'
  );
  assert.ok(
    !beats(armSummary({ passes: 6 }), armSummary({ passes: 5 })),
    '+1 pass is below the pre-registered threshold'
  );
});

test('pairwise rule: >=30% hallucination drop needs non-decreasing passes', async () => {
  const { beats } = await load('compare-arms.mjs');
  assert.ok(
    beats(
      armSummary({ hallucinatedMean: 2.0 }),
      armSummary({ hallucinatedMean: 4 })
    ),
    '50% hallucination drop with equal passes must win'
  );
  assert.ok(
    !beats(
      armSummary({ hallucinatedMean: 2.0, passes: 4 }),
      armSummary({ hallucinatedMean: 4, passes: 5 })
    ),
    'a hallucination drop paid for with fewer passes must not win'
  );
  assert.ok(
    !beats(
      armSummary({ hallucinatedMean: 3.2 }),
      armSummary({ hallucinatedMean: 4 })
    ),
    'a 20% drop is below the 30% threshold'
  );
});

test('pairwise rule: a >15% token regression vetoes an otherwise-winning arm', async () => {
  const { beats } = await load('compare-arms.mjs');
  assert.ok(
    !beats(
      armSummary({ passes: 8, tokensMean: 120000 }),
      armSummary({ passes: 5, tokensMean: 100000 })
    ),
    'the token gate must veto even a +3 pass improvement at +20% tokens'
  );
  assert.ok(
    beats(
      armSummary({ passes: 8, tokensMean: 114000 }),
      armSummary({ passes: 5, tokensMean: 100000 })
    ),
    '+14% tokens is within the pre-registered budget'
  );
});

test('readout table maps arm outcomes to the three pre-registered branches', async () => {
  const { readout } = await load('compare-arms.mjs');
  const base = armSummary({});
  assert.strictEqual(
    readout({ A: base, B: armSummary({ passes: 8 }), C: base }).branch,
    'notation-effect',
    'B beating both A and C must read out as the notation effect'
  );
  assert.strictEqual(
    readout({
      A: base,
      B: armSummary({ passes: 8 }),
      C: armSummary({ passes: 8 }),
    }).branch,
    'information-effect',
    'B beating A but not C must read out as the information effect'
  );
  assert.strictEqual(
    readout({ A: base, B: base, C: base }).branch,
    'falsified',
    'B not beating A must read out as falsified regardless of C'
  );
});

test('two-arm campaign (no C) reads out replicated / not-replicated', async () => {
  const { readout } = await load('compare-arms.mjs');
  const base = armSummary({});
  assert.strictEqual(
    readout({ A: base, B: armSummary({ passes: 8 }) }).branch,
    'replicated',
    'a phase-2 A/B campaign where B beats A must read out as replicated'
  );
  assert.strictEqual(
    readout({ A: base, B: armSummary({ passes: 6 }) }).branch,
    'not-replicated',
    'a phase-2 A/B campaign where B does not beat A must read out as not-replicated'
  );
});

test('node --test summary parsing reads only the summary block, not decoys in test names', async () => {
  const { parseNodeTestSummary } = await load('run-eval.mjs');
  const out =
    'not ok 2 - totals must pass 2 of 3 gates\n' +
    '  Error: expected fail 0 but saw fail 1\n' +
    '# tests 12\n# suites 0\n# pass 9\n# fail 3\n# cancelled 0\n';
  assert.deepStrictEqual(
    parseNodeTestSummary(out),
    { pass: 9, fail: 3, total: 12 },
    "counts must come from the anchored '# pass N' summary lines, never from 'pass 2'/'fail 0' inside test names or assertion diffs"
  );
});

// --- fixture integrity contracts ---------------------------------------------
// One block per eval-* fixture. These bind each committed fixture to its
// generators, so a fixture edit that forgets to regenerate a manifest (or
// desynchronizes arm C from arm B) fails loudly. They skip with a clear
// reason while a fixture is still being assembled, and must not skip once
// it ships. Arm C is optional per fixture (phase 2 runs A/B only).

const fs = require('node:fs');
const FIXTURES_ROOT = path.join(REPO, 'tests', 'fixtures');
const evalFixtures = fs
  .readdirSync(FIXTURES_ROOT)
  .filter((d) => d.startsWith('eval-'))
  .sort();

for (const name of evalFixtures) {
  const FIX = path.join(FIXTURES_ROOT, name);
  const ready = existsSync(path.join(FIX, 'project', 'package.json'));

  test(
    `fixture ${name}: feature tests fail before implementation (the eval quality metric)`,
    { skip: !ready && 'fixture project not yet present' },
    () => {
      const projectDir = path.join(FIX, 'project');
      const testFiles = fs
        .readdirSync(path.join(projectDir, 'tests'))
        .filter((f) => f.endsWith('.test.js'))
        .map((f) => path.join('tests', f));
      // Strip the outer runner's test-context env vars, or the nested
      // `node --test` thinks it's a child test process and no-ops with exit 0.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST'))
      );
      const res = spawnSync('node', ['--test', ...testFiles], {
        cwd: projectDir,
        encoding: 'utf8',
        env,
      });
      assert.notStrictEqual(
        res.status,
        0,
        'the fixture suite must fail pre-implementation — a green suite means the feature tests are not doing their job'
      );
      const output = res.stdout + res.stderr;
      assert.match(
        output,
        /feature-/,
        'the failing tests must be the feature-* tests, not baseline tests'
      );
    }
  );

  test(
    `fixture ${name}: committed symbols.json matches its generator`,
    {
      skip:
        !(ready && existsSync(path.join(FIX, 'symbols.json'))) &&
        'symbols.json not yet generated',
    },
    () => {
      const committed = readFileSync(path.join(FIX, 'symbols.json'), 'utf8');
      const regenerated = execFileSync(
        'node',
        [path.join(FIX, 'generate-symbols.mjs')],
        { encoding: 'utf8' }
      );
      assert.strictEqual(
        regenerated,
        committed,
        'symbols.json must regenerate byte-identically — re-run generate-symbols.mjs --write after any fixture change'
      );
    }
  );

  test(
    `fixture ${name}: committed arm C regenerates byte-identically from arm B`,
    {
      skip:
        !existsSync(path.join(FIX, 'arms', 'C', 'architecture.md')) &&
        'no arm C in this fixture',
    },
    () => {
      for (const doc of ['architecture.md', 'technical-considerations.md']) {
        const committed = readFileSync(
          path.join(FIX, 'arms', 'C', doc),
          'utf8'
        );
        const regenerated = execFileSync(
          'node',
          [
            path.join(TOOLS, 'mermaid-edges.mjs'),
            path.join(FIX, 'arms', 'B', doc),
          ],
          { encoding: 'utf8' }
        );
        assert.strictEqual(
          regenerated,
          committed,
          `arms/C/${doc} must be exactly mermaid-edges.mjs applied to arms/B/${doc} — information equivalence is a mechanical contract`
        );
      }
    }
  );

  test(
    `fixture ${name}: arm B is arm A plus diagram sections only (prose untouched)`,
    {
      skip:
        !existsSync(path.join(FIX, 'arms', 'B', 'architecture.md')) &&
        'arm documents not yet authored',
    },
    () => {
      // Both documents the harness swaps per arm are under contract: a prose
      // edit that desynchronizes either one would make a campaign measure a
      // prose difference instead of the diagram effect.
      const specDirs = fs.readdirSync(
        path.join(FIX, 'project', 'context', 'spec')
      );
      assert.strictEqual(
        specDirs.length,
        1,
        'an eval fixture must carry exactly one frozen spec directory'
      );
      const pairs = [
        {
          doc: 'architecture.md',
          armAPath: path.join(
            FIX,
            'project',
            'context',
            'product',
            'architecture.md'
          ),
        },
        {
          doc: 'technical-considerations.md',
          armAPath: path.join(
            FIX,
            'project',
            'context',
            'spec',
            specDirs[0],
            'technical-considerations.md'
          ),
        },
      ];
      for (const { doc, armAPath } of pairs) {
        const armA = readFileSync(armAPath, 'utf8');
        const armB = readFileSync(path.join(FIX, 'arms', 'B', doc), 'utf8');
        for (const line of armA.split('\n')) {
          assert.ok(
            armB.includes(line),
            `arm B ${doc} must contain every arm-A line verbatim; missing: ${JSON.stringify(line.slice(0, 80))}`
          );
        }
        assert.match(
          armB,
          /```mermaid/,
          `arm B ${doc} must actually contain a mermaid diagram`
        );
        assert.ok(
          !armA.includes('```mermaid'),
          `arm A ${doc} must stay diagram-free`
        );
      }
    }
  );
}
