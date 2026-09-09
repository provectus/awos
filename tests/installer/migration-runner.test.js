/**
 * Unit tests for src/migrations/runner.js.
 *
 * Builds minimal fixture directory layouts that match each migration's
 * preconditions and verifies that runMigrations behaves correctly:
 * idempotency, skip semantics, and version monotonicity.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const { runMigrations } = require('../../src/migrations/runner');
const {
  makeTempDir,
  removeTempDir,
  exists,
  silenced,
} = require('../helpers/temp-project');

const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(repoRoot, 'src', 'migrations');

const createdDirs = [];
async function freshTemp() {
  const d = await makeTempDir();
  createdDirs.push(d);
  return d;
}

after(async () => {
  for (const d of createdDirs) await removeTempDir(d);
});

async function writeFile(p, content = 'placeholder\n') {
  await fsPromises.mkdir(path.dirname(p), { recursive: true });
  await fsPromises.writeFile(p, content, 'utf8');
}

async function latestMigrationVersion() {
  const files = (await fsPromises.readdir(migrationsDir)).filter((f) =>
    f.endsWith('.json')
  );
  const versions = await Promise.all(
    files.map(async (f) => {
      const content = await fsPromises.readFile(
        path.join(migrationsDir, f),
        'utf8'
      );
      return JSON.parse(content).version;
    })
  );
  return Math.max(...versions);
}

test('all migrations run end-to-end then re-running is a no-op', async () => {
  const workingDir = await freshTemp();

  // Match preconditions for migration 001: a python-expert.md at the old path.
  await writeFile(
    path.join(workingDir, '.claude', 'agents', 'python-expert.md'),
    '# python expert\n'
  );

  const first = await silenced(() => runMigrations(workingDir));
  assert.ok(
    first.applied >= 1,
    'first run should apply at least one migration'
  );

  // After all migrations: migration 001 moves the file to domain-experts/,
  // then migration 002 deletes the domain-experts/ directory. Final state:
  // neither the original nor the migrated path exists, and the migration
  // version file is bumped to the latest version.
  assert.equal(
    exists(path.join(workingDir, '.claude', 'agents', 'python-expert.md')),
    false,
    'original python-expert.md should be removed after 001 moves it'
  );
  assert.equal(
    exists(
      path.join(
        workingDir,
        '.claude',
        'agents',
        'domain-experts',
        'python-expert.md'
      )
    ),
    false,
    'domain-experts/python-expert.md should be removed by migration 002'
  );

  const versionFile = path.join(workingDir, '.awos', '.migration-version');
  assert.ok(exists(versionFile), '.awos/.migration-version should be written');
  const versionContent = await fsPromises.readFile(versionFile, 'utf8');
  assert.ok(
    parseInt(versionContent.trim(), 10) >= 2,
    `migration version should be at least 2 (latest), got "${versionContent.trim()}"`
  );

  // Second run: no migrations to apply (version file is up to date).
  const second = await silenced(() => runMigrations(workingDir));
  assert.equal(
    second.applied,
    0,
    're-running migrations should report zero applied'
  );
});

test('migration 001 skip_if_any leaves the source file untouched', async () => {
  const workingDir = await freshTemp();
  // Pre-create the post-migration target — skip_if_any should fire and the
  // migration should not move anything. Use the .awos/subagents path (which
  // would otherwise trigger 002) absent to keep this test focused on 001.
  await writeFile(
    path.join(workingDir, '.claude', 'agents', 'python-expert.md'),
    'old\n'
  );
  await writeFile(
    path.join(
      workingDir,
      '.claude',
      'agents',
      'domain-experts',
      'python-expert.md'
    ),
    'already migrated\n'
  );

  await silenced(() => runMigrations(workingDir));

  // The key invariant: migration 001's skip_if_any prevented it from moving
  // the source file. (Migration 002 may still fire because the
  // domain-experts/ directory we created matches its require_any — that's
  // covered separately.)
  // We can't simply assert "old-path file is still there" since 002 doesn't
  // touch .claude/agents/python-expert.md, only domain-experts/. So this
  // remains a clean signal that 001 did not perform its move.
  assert.ok(
    exists(path.join(workingDir, '.claude', 'agents', 'python-expert.md')),
    'migration 001 should have skipped — old-path python-expert.md should remain in place'
  );
});

test('migration 001 in isolation: source-only state moves to migrated state', async () => {
  // Hand-build a working dir that only satisfies migration 001's
  // precondition (a python-expert.md at the old path) — 002's
  // domain-experts/ precondition is satisfied once 001 moves the file
  // there, but 003 (remove-roadmap) and 004 (remove-hire) find nothing:
  // this working dir has no .awos/commands/roadmap.md, no
  // .awos/templates/roadmap-template.md, no .awos/commands/hire.md, and
  // no .awos/templates/agent-template.md. runMigrations still writes the
  // version file after every pending migration it iterates, not only the
  // ones whose preconditions matched (see runner.js: `writeVersion` runs
  // unconditionally inside the pending-migrations loop), so the version
  // file always advances to the highest version among ALL migration
  // files — not just the ones that actually touched this working dir.
  // Assert that dynamically (the max `version` across
  // src/migrations/*.json) so this test needs no manual bump whenever a
  // migration is added.
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.claude', 'agents', 'python-expert.md'),
    'old\n'
  );

  await silenced(() => runMigrations(workingDir));

  const expectedLatest = await latestMigrationVersion();
  const versionContent = await fsPromises.readFile(
    path.join(workingDir, '.awos', '.migration-version'),
    'utf8'
  );
  assert.equal(
    versionContent.trim(),
    String(expectedLatest),
    `expected the migration-version file to reach the latest migration version (${expectedLatest}) — runMigrations advances the version marker for every pending migration it iterates, whether or not that migration's preconditions matched this working dir`
  );
});

test('migration versions are sequential with no gaps or duplicates', async () => {
  const files = (await fsPromises.readdir(migrationsDir)).filter((f) =>
    f.endsWith('.json')
  );
  assert.ok(files.length > 0, 'expected at least one migration file');
  const versions = [];
  for (const f of files) {
    const content = await fsPromises.readFile(
      path.join(migrationsDir, f),
      'utf8'
    );
    const migration = JSON.parse(content);
    assert.equal(
      typeof migration.version,
      'number',
      `migration ${f} must have a numeric version`
    );
    assert.ok(
      typeof migration.name === 'string' && migration.name.length > 0,
      `migration ${f} must have a non-empty name`
    );
    assert.ok(
      Array.isArray(migration.operations),
      `migration ${f} must have an operations array`
    );
    versions.push(migration.version);
  }
  versions.sort((a, b) => a - b);
  for (let i = 0; i < versions.length; i++) {
    assert.equal(
      versions[i],
      i + 1,
      `expected version ${i + 1} but found ${versions[i]} at position ${i}; versions must be sequential starting at 1`
    );
  }
  assert.equal(
    new Set(versions).size,
    versions.length,
    'migration versions must be unique'
  );
});

test('migration runs in dry-run without touching disk', async () => {
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.claude', 'agents', 'python-expert.md'),
    'a\n'
  );

  await silenced(() => runMigrations(workingDir, { dryRun: true }));

  // The source file should still be at its old path; nothing moved.
  assert.ok(
    exists(path.join(workingDir, '.claude', 'agents', 'python-expert.md')),
    'dry-run must not move files'
  );
  assert.equal(
    exists(
      path.join(
        workingDir,
        '.claude',
        'agents',
        'domain-experts',
        'python-expert.md'
      )
    ),
    false,
    'dry-run must not create the migrated path'
  );
  assert.equal(
    exists(path.join(workingDir, '.awos', '.migration-version')),
    false,
    'dry-run must not write the migration version file'
  );
});
