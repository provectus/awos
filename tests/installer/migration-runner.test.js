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

test('a full pre-2.0 hire/roadmap footprint is disowned in place — nothing deleted, nothing rewritten, MCP entry kept', async () => {
  const workingDir = await freshTemp();

  // Disown-in-place (decided 2026-09-15): a project that still has its
  // 1.x roadmap/hire command bodies and templates keeps them, frozen and
  // working — AWOS no longer ships or updates them, but migrations never
  // reach in and break what works. The awos-recruitment MCP entry stays
  // too (the recruitment service remains available), because a working
  // local hire depends on it.
  const preservedFrameworkFiles = [
    path.join(workingDir, '.awos', 'commands', 'roadmap.md'),
    path.join(workingDir, '.awos', 'commands', 'hire.md'),
    path.join(workingDir, '.awos', 'templates', 'roadmap-template.md'),
    path.join(workingDir, '.awos', 'templates', 'agent-template.md'),
  ];
  for (const f of preservedFrameworkFiles) {
    await writeFile(f, `1.x body of ${path.basename(f)}\n`);
  }
  const preservedUserFiles = [
    path.join(workingDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    path.join(workingDir, '.claude', 'commands', 'awos', 'hire.md'),
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

  for (const f of preservedFrameworkFiles) {
    assert.equal(
      await fsPromises.readFile(f, 'utf8'),
      `1.x body of ${path.basename(f)}\n`,
      `${path.relative(workingDir, f)} must survive byte-identical — removed commands are disowned in place, never deleted or rewritten`
    );
  }
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
    'the awos-recruitment entry must be kept while /awos:hire is still present locally — the frozen command needs it and the service stays up'
  );
  assert.equal(
    result.applied,
    0,
    'a fully-preserved project has no migration work to apply — every 2.0 migration skips'
  );
  assert.ok(
    exists(path.join(workingDir, '.awos', '.migration-version')),
    'the version stamp still advances so the skipped migrations are not re-evaluated forever'
  );
});

test('migration 005 removes the awos-recruitment entry only from a project with no trace of hire', async () => {
  // A user who deleted every hire artifact (no .awos/commands/hire.md,
  // no wrapper) but kept .mcp.json has an orphaned installer-written
  // entry with no consumer — clean it. Any surviving hire trace skips
  // the migration instead (covered by the disown-in-place test above).
  const workingDir = await freshTemp();
  const mcpPath = path.join(workingDir, '.mcp.json');
  await writeFile(
    mcpPath,
    JSON.stringify(
      {
        mcpServers: {
          'awos-recruitment': {
            type: 'http',
            url: 'https://recruitment.awos.provectus.pro/mcp',
          },
        },
      },
      null,
      2
    ) + '\n'
  );

  await silenced(() => runMigrations(workingDir));

  const mcp = JSON.parse(await fsPromises.readFile(mcpPath, 'utf8'));
  assert.equal(
    'awos-recruitment' in mcp.mcpServers,
    false,
    'migration 005 must remove the orphaned awos-recruitment entry when no hire trace remains'
  );
  assert.equal(
    exists(path.join(workingDir, '.awos', 'commands', 'hire.md')),
    false,
    'a project with no hire wrapper must not gain a .awos/commands/hire.md it never had — tombstones are wrapper-repair only'
  );
});

test('an existing command body is never tombstoned, and wrapper repair is idempotent and dry-run-safe', async () => {
  // A present body — even alongside a wrapper — is disowned in place:
  // migration 003's skip_if_any sees it and leaves it byte-identical.
  const preserved = await freshTemp();
  const preservedBody = path.join(preserved, '.awos', 'commands', 'roadmap.md');
  await writeFile(preservedBody, 'original roadmap command body\n');
  await writeFile(
    path.join(preserved, '.claude', 'commands', 'awos', 'roadmap.md'),
    'user wrapper\n'
  );
  await silenced(() => runMigrations(preserved));
  assert.equal(
    await fsPromises.readFile(preservedBody, 'utf8'),
    'original roadmap command body\n',
    'a present command body must never be replaced with the tombstone — the frozen 1.x copy keeps working'
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

test('migration 005 remove_json_key skips gracefully when .mcp.json is malformed, entry-free, or under dry-run', async () => {
  // Each case is a no-trace-of-hire project (the only state where 005
  // runs at all — any hire trace skips it under disown-in-place).

  // Malformed JSON: the user's file must be left byte-for-byte untouched.
  const badJson = await freshTemp();
  await writeFile(path.join(badJson, '.mcp.json'), '{ not json\n');
  await silenced(() => runMigrations(badJson));
  assert.equal(
    await fsPromises.readFile(path.join(badJson, '.mcp.json'), 'utf8'),
    '{ not json\n',
    'an unparseable .mcp.json must be skipped, not rewritten or clobbered'
  );

  // Entry absent: user servers survive and the file is not corrupted.
  const noEntry = await freshTemp();
  await writeFile(
    path.join(noEntry, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          'user-server': { type: 'http', url: 'https://example.com/mcp' },
        },
      },
      null,
      2
    ) + '\n'
  );
  await silenced(() => runMigrations(noEntry));
  const after = JSON.parse(
    await fsPromises.readFile(path.join(noEntry, '.mcp.json'), 'utf8')
  );
  assert.ok(
    after.mcpServers['user-server'],
    'a .mcp.json without the awos entry must keep its user servers'
  );

  // Dry-run: the awos entry must survive.
  const dry = await freshTemp();
  await writeFile(
    path.join(dry, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          'awos-recruitment': {
            type: 'http',
            url: 'https://recruitment.awos.provectus.pro/mcp',
          },
        },
      },
      null,
      2
    ) + '\n'
  );
  await silenced(() => runMigrations(dry, { dryRun: true }));
  const dryAfter = JSON.parse(
    await fsPromises.readFile(path.join(dry, '.mcp.json'), 'utf8')
  );
  assert.ok(
    dryAfter.mcpServers['awos-recruitment'],
    'dry-run must not remove the awos-recruitment MCP entry'
  );
});

test('a migration whose operations all skip reports zero applied', async () => {
  // Log honesty: a fresh never-AWOS project with a user-authored
  // .mcp.json matches migration 005's preconditions (require_all
  // .mcp.json, no hire traces to skip on), but its one operation skips
  // — no awos-recruitment entry to remove. The run must not print
  // "Applied 1 migration(s)" over zero changed bytes; support cannot
  // diagnose logs that claim phantom work.
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          'user-server': { type: 'http', url: 'https://example.com/mcp' },
        },
      },
      null,
      2
    ) + '\n'
  );

  const result = await silenced(() => runMigrations(workingDir));

  assert.equal(
    result.applied,
    0,
    'a run where every operation skipped must report zero applied migrations — the log must never claim work that never happened'
  );
  const expectedLatest = await latestMigrationVersion();
  assert.equal(
    (
      await fsPromises.readFile(
        path.join(workingDir, '.awos', '.migration-version'),
        'utf8'
      )
    ).trim(),
    String(expectedLatest),
    'the version stamp still advances on a skip-only run, so skipped operations are not retried forever'
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
  // there, but 003/004 (wrapper repairs) and 005 (orphaned MCP cleanup)
  // find nothing to do: this working dir has no roadmap/hire wrappers
  // under .claude/commands/awos/, and no .mcp.json. runMigrations still writes the
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

test('migrations 003/004 create the tombstones for a wrapper-only project (committed .claude/, absent .awos/)', async () => {
  // A teammate clones a project that committed its .claude/ wrappers but
  // not .awos/ (nothing tells users to commit .awos/). The wrappers
  // @-import .awos/commands/{roadmap,hire}.md — without the create_if
  // authorization the migrations would go not_applicable, the version
  // would stamp anyway, and the broken imports would be permanent.
  const workingDir = await freshTemp();
  await writeFile(
    path.join(workingDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    'user wrapper\n'
  );
  await writeFile(
    path.join(workingDir, '.claude', 'commands', 'awos', 'hire.md'),
    'user wrapper\n'
  );

  await silenced(() => runMigrations(workingDir));

  for (const name of ['roadmap.md', 'hire.md']) {
    const target = path.join(workingDir, '.awos', 'commands', name);
    assert.ok(
      exists(target),
      `.awos/commands/${name} must be created when its preserved wrapper exists — the wrapper's @-import must never stay broken`
    );
    assert.ok(
      (await fsPromises.readFile(target, 'utf8')).includes(
        'removed in AWOS 2.0'
      ),
      `.awos/commands/${name} must carry the removal-notice tombstone`
    );
  }
});

test('operation-level contracts: missing "from" throws, dangling symlinks are deleted, unreadable JSON files fail loudly', async () => {
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
    () => executeOperation({ type: 'remove_json_key', key: 'a.b' }, workingDir),
    /requires "file" field/,
    'a remove_json_key operation without "file" must throw a clean authoring error, not a raw TypeError'
  );
  await assert.rejects(
    () =>
      executeOperation({ type: 'remove_json_key', file: 'x.json' }, workingDir),
    /requires "key" field/,
    'a remove_json_key operation without "key" must throw a clean authoring error'
  );
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

  // A .mcp.json that exists but cannot be read as a file (here: it is a
  // directory, EISDIR) is an environmental failure — it must throw so
  // the migration retries next run, never be mislabeled "file is not
  // valid JSON" and permanently forfeited.
  await fsPromises.mkdir(path.join(workingDir, '.mcp.json'));
  await assert.rejects(
    () =>
      silenced(() =>
        executeOperation(
          { type: 'remove_json_key', file: '.mcp.json', key: 'mcpServers.x' },
          workingDir
        )
      ),
    (error) => error.code === 'EISDIR',
    'an unreadable .mcp.json must fail the migration loudly, not be skipped as invalid JSON'
  );
});

test('preconditions probe with lstat: a dangling symlink counts as a present body and is preserved', async () => {
  // The probe policy is unified — preconditions and operations must
  // agree on what "exists" means, or a migration wedges half-way
  // (preconditions say the body is absent, the op sees the entry, and
  // the write either throws or lands through the dead link). A dangling
  // symlink at the body path is treated as present: 003 skips, the
  // entry is left alone, and nothing is written anywhere.
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

  await silenced(() => runMigrations(workingDir));

  const stat = await fsPromises.lstat(bodyPath);
  assert.ok(
    stat.isSymbolicLink(),
    'the dangling symlink at the body path must be preserved untouched — not replaced, not written through'
  );
});

test('an optional migration that fails warns, halts version advancement, and retries on the next run', async () => {
  // Migrations run before the copy step, so a throwing migration blocks
  // ALL future installs. The 2.0 migrations are repairs/cleanups marked
  // optional: a failure (here, .mcp.json is a directory, so the read
  // throws EISDIR) must not abort the run — it warns, leaves the version
  // below the failed migration, and succeeds once the cause is fixed.
  const workingDir = await freshTemp();
  await fsPromises.mkdir(path.join(workingDir, '.mcp.json'), {
    recursive: true,
  });

  const first = await silenced(() => runMigrations(workingDir));
  assert.equal(
    first.applied,
    0,
    'the failed optional migration must not count as applied'
  );
  assert.equal(
    first.current,
    4,
    'version advancement must halt below the failed optional migration (005) so it is retried'
  );

  // Fix the cause and re-run: the pending migration completes normally.
  await fsPromises.rmdir(path.join(workingDir, '.mcp.json'));
  await writeFile(
    path.join(workingDir, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          'awos-recruitment': {
            type: 'http',
            url: 'https://recruitment.awos.provectus.pro/mcp',
          },
        },
      },
      null,
      2
    ) + '\n'
  );
  const second = await silenced(() => runMigrations(workingDir));
  assert.equal(
    second.applied,
    1,
    'once the cause is repaired, the retried migration must run and apply'
  );
  const mcp = JSON.parse(
    await fsPromises.readFile(path.join(workingDir, '.mcp.json'), 'utf8')
  );
  assert.equal(
    'awos-recruitment' in mcp.mcpServers,
    false,
    'the retried migration 005 must complete the cleanup it previously could not'
  );
});

test('remove_json_key writes through a symlinked .mcp.json and preserves its mode', async () => {
  // A .mcp.json symlinked from a dotfiles repo must stay a symlink with
  // its target updated (a plain rename would strand the target and
  // orphan the link), and a 0600 config must not come back 0644.
  const workingDir = await freshTemp();
  const targetPath = path.join(workingDir, 'dotfiles', 'mcp.json');
  await writeFile(
    targetPath,
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
    ) + '\n'
  );
  await fsPromises.chmod(targetPath, 0o600);
  const linkPath = path.join(workingDir, '.mcp.json');
  await fsPromises.symlink(targetPath, linkPath);

  await silenced(() => runMigrations(workingDir));

  assert.ok(
    (await fsPromises.lstat(linkPath)).isSymbolicLink(),
    '.mcp.json must remain a symlink after the key removal — the link is the user’s setup'
  );
  const target = JSON.parse(await fsPromises.readFile(targetPath, 'utf8'));
  assert.equal(
    'awos-recruitment' in target.mcpServers,
    false,
    'the key removal must land in the symlink target, not a replacement file'
  );
  assert.ok(
    target.mcpServers['user-server'],
    'user servers in the symlink target must survive'
  );
  assert.equal(
    (await fsPromises.stat(targetPath)).mode & 0o777,
    0o600,
    'the original 0600 mode must be preserved through the atomic rewrite'
  );
  assert.equal(
    exists(`${targetPath}.awos-tmp`),
    false,
    'no temp-file litter may remain after a successful rewrite'
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
