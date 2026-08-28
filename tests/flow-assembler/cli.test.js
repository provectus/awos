import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const CLI = path.join(
  repoRoot,
  'plugins',
  'awos',
  'scripts',
  'assemble-flow-command.mjs'
);
const MINI = path.join(here, 'fixtures', 'mini.md');

function run(args, opts = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    ...opts,
  });
}

const FILLS = {
  frontmatter: { description: 'd', 'argument-hint': '[a]' },
  slots: {
    'intro.source': 'a ticket',
    'notifications.body': 'post',
    'first.body': 'do it',
    'first.extra': 'and this',
    'second.body': 'close it',
  },
};

test('slots emits the slot inventory as JSON and nothing else', () => {
  const out = JSON.parse(run(['slots', MINI]));
  assert.equal(out.slots.length, 5, 'every slot in the template is listed');
  assert.ok(
    out.slots.every((s) => 'instruction' in s && 'context' in s),
    'each slot carries its instruction and surrounding context — this is all the generator reads'
  );
  assert.deepEqual(
    out.stages.map((s) => s.id),
    ['first', 'second']
  );
});

test('assemble writes the command, a byte-identical baseline and the fills', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'implement-feature.md');
  fs.writeFileSync(fillsPath, JSON.stringify(FILLS));
  run([
    'assemble',
    MINI,
    fillsPath,
    '--out',
    outPath,
    '--version',
    '2.5.0',
    '--date',
    '2026-08-27',
    '--source',
    'context/product/delivery-flow.md',
    '--baseline-dir',
    path.join(dir, '.flow'),
  ]);
  const generated = fs.readFileSync(outPath, 'utf8');
  const baseline = fs.readFileSync(
    path.join(dir, '.flow', 'implement-feature.md.baseline.md'),
    'utf8'
  );
  assert.equal(
    generated,
    baseline,
    'the baseline must be byte-identical to what was written, or diff attribution is meaningless'
  );
  assert.ok(
    fs.existsSync(path.join(dir, '.flow', 'implement-feature.md.fills.json')),
    'the fills are persisted alongside the baseline so a regeneration can start from the recorded decisions'
  );
});

test('assemble writes nothing and exits non-zero when fills are invalid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const bad = { ...FILLS, slots: { ...FILLS.slots } };
  delete bad.slots['first.body'];
  fs.writeFileSync(fillsPath, JSON.stringify(bad));
  assert.throws(
    () =>
      run(
        [
          'assemble',
          MINI,
          fillsPath,
          '--out',
          outPath,
          '--version',
          '2.5.0',
          '--date',
          '2026-08-27',
          '--source',
          's',
          '--baseline-dir',
          path.join(dir, '.flow'),
        ],
        { stdio: 'pipe' }
      ),
    /first\.body/,
    'a validation failure names the offending slot'
  );
  assert.equal(
    fs.existsSync(outPath),
    false,
    'a partially assembled command is worse than none — nothing is written on failure'
  );
});

test('diff reports absent when the baseline file does not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const gen = path.join(dir, 'g.md');
  fs.writeFileSync(gen, '# x\n');
  const out = JSON.parse(run(['diff', gen, path.join(dir, 'missing.md')]));
  assert.deepEqual(out, { baseline: 'absent' });
});

test('a validation failure leaves no baseline and no fills file behind, not just no command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  const bad = { ...FILLS, slots: { ...FILLS.slots } };
  delete bad.slots['first.body'];
  fs.writeFileSync(fillsPath, JSON.stringify(bad));
  assert.throws(() =>
    run([
      'assemble',
      MINI,
      fillsPath,
      '--out',
      outPath,
      '--version',
      '2.5.0',
      '--date',
      '2026-08-27',
      '--source',
      's',
      '--baseline-dir',
      baselineDir,
    ])
  );
  assert.equal(
    fs.existsSync(path.join(baselineDir, 'out.md.baseline.md')),
    false,
    'no baseline is written when validation fails'
  );
  assert.equal(
    fs.existsSync(path.join(baselineDir, 'out.md.fills.json')),
    false,
    'no fills file is written when validation fails'
  );
});

test('a fill that omits a non-optional stage is rejected by the validation gate specifically, not by assemble itself', () => {
  // assemble.mjs has no defence of its own against omitStages naming a
  // stage the template does not mark optional — it just filters the
  // stage out and proceeds, silently dropping contracts the flow
  // depends on. validateFills is the only guard for this shape of bad
  // fill (unlike a missing slot value, which also makes assemble.mjs's
  // own applySlots throw). This fixture is chosen specifically so the
  // test cannot pass unless the CLI actually calls validateFills before
  // assemble.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  const bad = {
    ...FILLS,
    omitStages: ['first'],
    slots: { 'intro.source': 'a ticket', 'notifications.body': 'post' },
  };
  fs.writeFileSync(fillsPath, JSON.stringify(bad));
  assert.throws(
    () =>
      run(
        [
          'assemble',
          MINI,
          fillsPath,
          '--out',
          outPath,
          '--version',
          '2.5.0',
          '--date',
          '2026-08-27',
          '--source',
          's',
          '--baseline-dir',
          baselineDir,
        ],
        { stdio: 'pipe' }
      ),
    /stage "first" is not optional/,
    'the error names the stage that cannot be omitted'
  );
  assert.equal(
    fs.existsSync(outPath),
    false,
    'no command is written when omitStages names a non-optional stage'
  );
  assert.equal(
    fs.existsSync(path.join(baselineDir, 'out.md.baseline.md')),
    false,
    'no baseline is written either'
  );
  assert.equal(
    fs.existsSync(path.join(baselineDir, 'out.md.fills.json')),
    false,
    'no fills file is written either'
  );
});

test('diff exits 0 on an absent baseline rather than treating it as an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const gen = path.join(dir, 'g.md');
  fs.writeFileSync(gen, '# x\n');
  const result = execFileSync(
    process.execPath,
    [CLI, 'diff', gen, path.join(dir, 'missing.md')],
    { encoding: 'utf8' }
  );
  // execFileSync throws on a non-zero exit, so reaching here already
  // proves exit 0; assert the payload too so the test documents why.
  assert.deepEqual(JSON.parse(result), { baseline: 'absent' });
});

test('diff exits 0 and reports the generated file absent, rather than crashing on ENOENT, on a first-ever generation', () => {
  // flow.md's Step 6 item 2 calls diff unconditionally, before the command
  // has ever been generated. diff's own generated-file read had no
  // existence guard (unlike its baseline read), so this used to throw a
  // raw ENOENT stack trace instead of reporting a state.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const result = execFileSync(
    process.execPath,
    [
      CLI,
      'diff',
      path.join(dir, 'does-not-exist.md'),
      path.join(dir, 'also-missing.md'),
    ],
    { encoding: 'utf8' }
  );
  // execFileSync throws on a non-zero exit, so reaching here already
  // proves exit 0; assert the payload too so the test documents why.
  assert.deepEqual(JSON.parse(result), { generated: 'absent' });
});

test('a usage error (missing required flag) exits with the usage code, distinct from the validation code', () => {
  let threw = false;
  try {
    run([
      'assemble',
      MINI,
      path.join(os.tmpdir(), 'does-not-matter.json'),
      '--version',
      '2.5.0',
      '--date',
      '2026-08-27',
      '--source',
      's',
      // --out deliberately omitted
    ]);
  } catch (err) {
    threw = true;
    assert.equal(
      err.status,
      2,
      'a usage error exits 2, distinct from the validation-failure exit code 1'
    );
  }
  assert.ok(threw, 'missing --out must fail, not silently proceed');
});

// The migration gate: every existing AWOS install has a generated command
// and no baseline (the baseline mechanism is new to the assembler), so
// assemble must refuse to overwrite that file unless the fills carry a
// fills.migrationReview acknowledgement — flow.md Step 6 item 2's on-disk
// fallback used to be skippable by doing nothing, since {"baseline":
// "absent"} alone was never checked against anything.

const LEGACY_CONTENT =
  '# Old hand-maintained command\n\nContains a pre-assembler edit.\n';

test('the migration gate fires: an existing command with no baseline and no migrationReview is refused, and nothing is overwritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  fs.writeFileSync(outPath, LEGACY_CONTENT);
  fs.writeFileSync(fillsPath, JSON.stringify(FILLS));
  assert.throws(
    () =>
      run(
        [
          'assemble',
          MINI,
          fillsPath,
          '--out',
          outPath,
          '--version',
          '2.5.0',
          '--date',
          '2026-08-27',
          '--source',
          's',
          '--baseline-dir',
          baselineDir,
        ],
        { stdio: 'pipe' }
      ),
    /migrationReview/,
    'the failure names the missing fill so the operator or model knows what to add'
  );
  assert.equal(
    fs.readFileSync(outPath, 'utf8'),
    LEGACY_CONTENT,
    'the existing hand-maintained command must survive untouched — this is exactly the overwrite the gate exists to prevent'
  );
  assert.equal(
    fs.existsSync(path.join(baselineDir, 'out.md.baseline.md')),
    false,
    'no baseline is written on a gated failure'
  );
  assert.equal(
    fs.existsSync(path.join(baselineDir, 'out.md.fills.json')),
    false,
    'no fills file is written on a gated failure either'
  );
});

test('the migration gate is satisfied by a proper migrationReview acknowledgement', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  fs.writeFileSync(outPath, LEGACY_CONTENT);
  const fills = {
    ...FILLS,
    migrationReview: {
      first: 'carried forward a retry flag found in the old command',
      second: 'none',
    },
  };
  fs.writeFileSync(fillsPath, JSON.stringify(fills));
  run([
    'assemble',
    MINI,
    fillsPath,
    '--out',
    outPath,
    '--version',
    '2.5.0',
    '--date',
    '2026-08-27',
    '--source',
    's',
    '--baseline-dir',
    baselineDir,
  ]);
  assert.notEqual(
    fs.readFileSync(outPath, 'utf8'),
    LEGACY_CONTENT,
    'a satisfied gate lets the migration regenerate the command as normal'
  );
  assert.ok(
    fs.existsSync(path.join(baselineDir, 'out.md.baseline.md')),
    'a baseline is written now, so the next re-run is a normal diff, not another migration'
  );
});

test('the migration gate does not apply to a fresh install (no existing file at --out)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  fs.writeFileSync(fillsPath, JSON.stringify(FILLS));
  run([
    'assemble',
    MINI,
    fillsPath,
    '--out',
    outPath,
    '--version',
    '2.5.0',
    '--date',
    '2026-08-27',
    '--source',
    's',
    '--baseline-dir',
    baselineDir,
  ]);
  assert.ok(
    fs.existsSync(outPath),
    'no file existed at --out, so there is nothing to migrate-gate — generation proceeds without a migrationReview fill'
  );
});

test('the migration gate does not apply to a normal re-run once a baseline exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  fs.writeFileSync(fillsPath, JSON.stringify(FILLS));
  const args = [
    'assemble',
    MINI,
    fillsPath,
    '--out',
    outPath,
    '--version',
    '2.5.0',
    '--date',
    '2026-08-27',
    '--source',
    's',
    '--baseline-dir',
    baselineDir,
  ];
  run(args); // first run creates the baseline, same as any fresh install
  // Second run: --out now exists AND a baseline exists for it — a normal
  // re-run, which the exact diff already protects. No migrationReview
  // fill is supplied, and this must still succeed.
  run(args);
  assert.ok(
    fs.existsSync(outPath),
    'the re-run is ungated once a baseline is on disk'
  );
});

test('the migration gate rejects an empty or omitted acknowledgement, not just a missing one, and writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const baselineDir = path.join(dir, '.flow');
  fs.writeFileSync(outPath, LEGACY_CONTENT);
  // "first" is acknowledged with an empty string; "second" is omitted
  // entirely — neither counts as a deliberate statement.
  const fills = { ...FILLS, migrationReview: { first: '' } };
  fs.writeFileSync(fillsPath, JSON.stringify(fills));
  assert.throws(
    () =>
      run(
        [
          'assemble',
          MINI,
          fillsPath,
          '--out',
          outPath,
          '--version',
          '2.5.0',
          '--date',
          '2026-08-27',
          '--source',
          's',
          '--baseline-dir',
          baselineDir,
        ],
        { stdio: 'pipe' }
      ),
    /"first".*no acknowledgement|"second".*no acknowledgement/s,
    'an empty string and an omitted key are both called out by name, not silently accepted'
  );
  assert.equal(
    fs.readFileSync(outPath, 'utf8'),
    LEGACY_CONTENT,
    'the legacy file survives an invalid acknowledgement exactly as it survives a missing one'
  );
});

test('assemble reports the number of stage markers it actually emitted, not the template stage count minus omissions', () => {
  // The reported count used to be `parsed.stages.length -
  // omitStages.length`, which ignores every hatch that changes what is
  // emitted: a repeat expands one template stage into N instances, an
  // insert adds a stage that is in no template. Two template stages, a
  // two-instance repeat and one insert emit four stages; the old formula
  // reported two. A zero-instance repeat undercounts the same way.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-cli-'));
  const fillsPath = path.join(dir, 'fills.json');
  const outPath = path.join(dir, 'out.md');
  const fills = {
    ...FILLS,
    repeat: {
      first: [{ label: 'dev' }, { label: 'prod' }],
    },
    insert: [
      {
        after: 'second',
        stage: 'canary',
        title: 'Canary',
        body: 'Watch it for an hour.',
      },
    ],
  };
  fs.writeFileSync(fillsPath, JSON.stringify(fills));
  const reported = JSON.parse(
    run([
      'assemble',
      MINI,
      fillsPath,
      '--out',
      outPath,
      '--version',
      '2.5.0',
      '--date',
      '2026-08-27',
      '--source',
      's',
      '--baseline-dir',
      path.join(dir, '.flow'),
    ])
  );
  const emitted = (
    fs
      .readFileSync(outPath, 'utf8')
      .match(/<!--\s*awos:flow:stage=[a-z0-9#-]+\s*-->/g) || []
  ).length;
  assert.equal(
    emitted,
    4,
    'the fixture must actually emit four stages (first#dev, first#prod, second, canary), or this test is not exercising the hatches'
  );
  assert.equal(
    reported.stages,
    emitted,
    'the reported stage count must match the stages in the file it just wrote — it is what the caller reads back to confirm the run, so a count that ignores repeat and insert misreports the generated command'
  );
});
