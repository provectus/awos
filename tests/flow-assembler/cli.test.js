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
