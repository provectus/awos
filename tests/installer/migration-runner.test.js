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

const {
  runMigrations,
  executeOperation,
} = require('../../src/migrations/runner');
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
  const expectedLatest = await latestMigrationVersion();
  assert.equal(
    parseInt(versionContent.trim(), 10),
    expectedLatest,
    `migration version should reach the latest migration version (${expectedLatest}), got "${versionContent.trim()}"`
  );

  // Second run: no migrations to apply (version file is up to date).
  const second = await silenced(() => runMigrations(workingDir));
  assert.equal(
    second.applied,
    0,
    're-running migrations should report zero applied'
  );
});

test('a full pre-2.0 roadmap footprint is shut down gracefully — the body becomes the removal notice, everything else is untouched', async () => {
  const workingDir = await freshTemp();

  // Graceful shutdown (decided 2026-09-17): a project that still has its
  // 1.x roadmap command gets the body replaced with the removal notice,
  // so /awos:roadmap answers that the feature left AWOS instead of
  // running a frozen copy. The template, the wrapper, and the user's own
  // roadmap document are never touched — a roadmap the team keeps
  // current is theirs. .mcp.json is no migration's concern either: the
  // installer's own MCP step owns that file.
  const bodyPath = path.join(workingDir, '.awos', 'commands', 'roadmap.md');
  await writeFile(bodyPath, '1.x body of roadmap.md\n');
  const templatePath = path.join(
    workingDir,
    '.awos',
    'templates',
    'roadmap-template.md'
  );
  await writeFile(templatePath, '1.x body of roadmap-template.md\n');
  const preservedUserFiles = [
    path.join(workingDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    path.join(workingDir, 'context', 'product', 'roadmap.md'),
  ];
  for (const f of preservedUserFiles) await writeFile(f, 'user content\n');

  // Seed the .mcp.json a pre-2.0 install wrote, plus a user-added server.
  const mcpPath = path.join(workingDir, '.mcp.json');
  const mcpContent =
    JSON.stringify(
      {
        mcpServers: {
          'awos-recruitment': {
            type: 'http',
            url: 'https://recruitment.awos.provectus.pro/mcp',
          },
          'user-server': { type: 'http', url: 'https://example.com/mcp' },
        },
      },
      null,
      2
    ) + '\n';
  await writeFile(mcpPath, mcpContent);

  const result = await silenced(() => runMigrations(workingDir));

  assert.ok(
    (await fsPromises.readFile(bodyPath, 'utf8')).includes(
      'removed in AWOS 2.0'
    ),
    '.awos/commands/roadmap.md must become the removal notice — /awos:roadmap answers that the feature left instead of running the 1.x copy'
  );
  assert.equal(
    await fsPromises.readFile(templatePath, 'utf8'),
    '1.x body of roadmap-template.md\n',
    'the roadmap template must survive byte-identical — it is the user’s if they keep a roadmap by hand'
  );
  for (const f of preservedUserFiles) {
    assert.equal(
      await fsPromises.readFile(f, 'utf8'),
      'user content\n',
      `migrations must never touch the user-owned file ${path.relative(workingDir, f)}`
    );
  }
  assert.equal(
    await fsPromises.readFile(mcpPath, 'utf8'),
    mcpContent,
    'migrations must never touch .mcp.json — the installer MCP step owns that file'
  );
  assert.equal(
    result.applied,
    1,
    'exactly one migration (003, the roadmap shutdown) applies to this footprint'
  );
});

test('a present command body is replaced with the removal notice, and the notice is idempotent and dry-run-safe', async () => {
  // A present body — with or without a wrapper — becomes the notice:
  // migration 003 has no skip on the body, because a frozen 1.x copy
  // that keeps running is exactly what graceful shutdown rules out.
  const present = await freshTemp();
  const presentBody = path.join(present, '.awos', 'commands', 'roadmap.md');
  await writeFile(presentBody, 'original roadmap command body\n');
  await silenced(() => runMigrations(present));
  assert.ok(
    (await fsPromises.readFile(presentBody, 'utf8')).includes(
      'removed in AWOS 2.0'
    ),
    'a present command body must be replaced with the removal notice even when no wrapper exists — the body alone is a roadmap trace'
  );

  // Wrapper-only project: dry-run writes nothing; the real run creates
  // the repair notice; a version-marker reset re-run reproduces it
  // byte-identically instead of erroring or double-applying.
  const workingDir = await freshTemp();
  const wrapper = path.join(
    workingDir,
    '.claude',
    'commands',
    'awos',
    'roadmap.md'
  );
  const target = path.join(workingDir, '.awos', 'commands', 'roadmap.md');
  await writeFile(wrapper, 'user wrapper\n');
  await silenced(() => runMigrations(workingDir, { dryRun: true }));
  assert.equal(
    exists(target),
    false,
    'dry-run must not create the wrapper-repair tombstone'
  );
  await silenced(() => runMigrations(workingDir));
  const firstTombstone = await fsPromises.readFile(target, 'utf8');
  assert.ok(
    firstTombstone.includes('removed in AWOS 2.0'),
    'the real run must repair the broken wrapper import with the removal notice'
  );
  await fsPromises.rm(path.join(workingDir, '.awos', '.migration-version'), {
    force: true,
  });
  await silenced(() => runMigrations(workingDir));
  assert.equal(
    await fsPromises.readFile(target, 'utf8'),
    firstTombstone,
    're-running migration 003 with the version marker reset must leave the repair notice byte-identical'
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
  // there, but 003 (wrapper repair) finds nothing to do: this working
  // dir has no roadmap wrapper under .claude/commands/awos/. runMigrations still writes the
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

test('migration 003 creates the tombstone for a wrapper-only project (committed .claude/, absent .awos/)', async () => {
  // A teammate clones a project that committed its .claude/ wrappers but
  // not .awos/ (nothing tells users to commit .awos/). The wrapper
  // @-imports .awos/commands/roadmap.md — without the create_if
  // authorization the migration would go not_applicable, the version
  // would stamp anyway, and the broken import would be permanent.
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    'user wrapper\n'
  );

  await silenced(() => runMigrations(workingDir));

  const target = path.join(workingDir, '.awos', 'commands', 'roadmap.md');
  assert.ok(
    exists(target),
    ".awos/commands/roadmap.md must be created when its preserved wrapper exists — the wrapper's @-import must never stay broken"
  );
  assert.ok(
    (await fsPromises.readFile(target, 'utf8')).includes('removed in AWOS 2.0'),
    '.awos/commands/roadmap.md must carry the removal-notice tombstone'
  );
});

test('operation-level contracts: missing "from" throws, missing replace_content fields throw, dangling symlinks are deleted', async () => {
  const workingDir = await freshTemp();

  // A delete/move/copy authored without "from" (e.g. copying the `file`
  // key from a replace_content op above it) must fail migration
  // authoring loudly, not log a green "Skipped delete (not found):
  // undefined" no-op.
  for (const type of ['delete', 'move', 'copy']) {
    await assert.rejects(
      () => executeOperation({ type, to: 'x.md' }, workingDir),
      /requires "from" field/,
      `a ${type} operation without "from" must throw, not silently no-op`
    );
  }
  await assert.rejects(
    () =>
      executeOperation({ type: 'replace_content', content: ['x'] }, workingDir),
    /requires "file" field/,
    'a replace_content operation without "file" must throw a clean authoring error'
  );
  await assert.rejects(
    () =>
      executeOperation({ type: 'replace_content', file: 'x.md' }, workingDir),
    /requires a "content" array field/,
    'a replace_content operation without a content array must throw a clean authoring error'
  );

  // A dangling symlink is a real, deletable entry: the delete op must
  // remove it (fs.access follows the link and would misreport it as
  // absent, leaving the dead link behind).
  const linkPath = path.join(workingDir, 'dangling-link.md');
  await fsPromises.symlink(
    path.join(workingDir, 'no-such-target.md'),
    linkPath
  );
  await silenced(() =>
    executeOperation({ type: 'delete', from: 'dangling-link.md' }, workingDir)
  );
  await assert.rejects(
    () => fsPromises.lstat(linkPath),
    { code: 'ENOENT' },
    'delete must remove a dangling symlink, not skip it as "not found"'
  );
});

test('preconditions probe with lstat: a dangling symlink at the body path is replaced by the notice, not written through', async () => {
  // The probe policy is unified — preconditions and operations must
  // agree on what "exists" means, or a migration wedges half-way. A
  // dangling symlink at the body path counts as present for both: the
  // notice is written to a temp file and renamed over the link entry, so
  // the result is a regular file with the notice — never a write through
  // the dead link, never a throw.
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    'user wrapper\n'
  );
  const bodyPath = path.join(workingDir, '.awos', 'commands', 'roadmap.md');
  await fsPromises.mkdir(path.dirname(bodyPath), { recursive: true });
  await fsPromises.symlink(
    path.join(workingDir, 'no-such-target.md'),
    bodyPath
  );

  const result = await silenced(() => runMigrations(workingDir));

  const stat = await fsPromises.lstat(bodyPath);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink(),
    'the dangling symlink must be replaced by a regular file carrying the notice'
  );
  assert.ok(
    (await fsPromises.readFile(bodyPath, 'utf8')).includes(
      'removed in AWOS 2.0'
    ),
    'the body must carry the removal notice after the symlink is replaced'
  );
  assert.equal(result.applied, 1, 'the shutdown migration must apply once');
});

test('an optional migration that fails warns, halts version advancement, and retries on the next run', async () => {
  // Migrations run before the copy step, so a throwing migration blocks
  // ALL future installs. The 2.0 wrapper repair (003) is marked optional:
  // a failure (here, .awos/commands is a regular file, so creating the
  // tombstone under it throws) must not abort the run — it warns, leaves
  // the version below the failed migration, and succeeds once the cause
  // is fixed.
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    'user wrapper\n'
  );
  await writeFile(path.join(workingDir, '.awos', 'commands'), 'not a dir\n');

  const first = await silenced(() => runMigrations(workingDir));
  assert.equal(
    first.applied,
    0,
    'the failed optional migration must not count as applied'
  );
  assert.equal(
    first.current,
    2,
    'version advancement must halt below the failed optional migration (003) so it is retried'
  );

  // Fix the cause and re-run: the pending migration completes normally.
  await fsPromises.rm(path.join(workingDir, '.awos', 'commands'));
  const second = await silenced(() => runMigrations(workingDir));
  assert.equal(
    second.applied,
    1,
    'once the cause is repaired, the retried migration must run and apply'
  );
  assert.ok(
    (
      await fsPromises.readFile(
        path.join(workingDir, '.awos', 'commands', 'roadmap.md'),
        'utf8'
      )
    ).includes('removed in AWOS 2.0'),
    'the retried migration 003 must complete the repair it previously could not'
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
