/**
 * Unit tests for src/services/version-stamper.js.
 *
 * The version stamp (.awos/.awos-version) is the only source the self-check
 * script has for "what AWOS version is this project on" — these tests pin
 * its format, idempotency, and never-throws behavior.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const { stampVersion } = require('../../src/services/version-stamper');
const {
  makeTempDir,
  removeTempDir,
  silenced,
} = require('../helpers/temp-project');

const repoRoot = path.resolve(__dirname, '..', '..');
const repoPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const repoVersion = repoPackageJson.version;

const createdDirs = [];
async function freshTemp() {
  const d = await makeTempDir();
  createdDirs.push(d);
  return d;
}

after(async () => {
  for (const d of createdDirs) await removeTempDir(d);
});

test('stampVersion writes the package.json version to .awos/.awos-version', async () => {
  const workingDir = await freshTemp();

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: repoRoot })
  );

  assert.equal(
    result.versionStamped,
    true,
    'stampVersion must write the package.json version to .awos/.awos-version so the self-check can detect version drift'
  );
  assert.equal(
    result.version,
    repoVersion,
    'stampVersion must write the package.json version to .awos/.awos-version so the self-check can detect version drift'
  );
  const stamped = await fsPromises.readFile(
    path.join(workingDir, '.awos', '.awos-version'),
    'utf8'
  );
  assert.equal(
    stamped,
    repoVersion,
    'stampVersion must write the package.json version to .awos/.awos-version so the self-check can detect version drift'
  );
});

test('.awos/.awos-version has no trailing newline', async () => {
  const workingDir = await freshTemp();

  await silenced(() => stampVersion({ workingDir, packageRoot: repoRoot }));

  const raw = await fsPromises.readFile(
    path.join(workingDir, '.awos', '.awos-version')
  );
  assert.equal(
    raw.toString('utf8'),
    repoVersion,
    ".awos/.awos-version must match .awos/.migration-version's format — a bare value with no trailing newline"
  );
  assert.ok(
    !raw.toString('utf8').endsWith('\n'),
    ".awos/.awos-version must match .awos/.migration-version's format — a bare value with no trailing newline"
  );
});

test('stampVersion creates .awos/ itself when absent', async () => {
  const workingDir = await freshTemp();
  assert.equal(
    fs.existsSync(path.join(workingDir, '.awos')),
    false,
    'precondition: .awos/ must not already exist in a fresh temp dir'
  );

  await silenced(() => stampVersion({ workingDir, packageRoot: repoRoot }));

  assert.ok(
    fs.existsSync(path.join(workingDir, '.awos', '.awos-version')),
    'stampVersion must create .awos/ itself rather than depending on step order'
  );
});

test('re-stamping the same version is a no-op', async () => {
  const workingDir = await freshTemp();
  await silenced(() => stampVersion({ workingDir, packageRoot: repoRoot }));
  const stampPath = path.join(workingDir, '.awos', '.awos-version');
  const beforeBytes = await fsPromises.readFile(stampPath);

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: repoRoot })
  );

  assert.equal(
    result.versionStamped,
    false,
    're-stamping the same version must be a no-op — installer runs are idempotent'
  );
  const afterBytes = await fsPromises.readFile(stampPath);
  assert.ok(
    beforeBytes.equals(afterBytes),
    're-stamping the same version must be a no-op — installer runs are idempotent'
  );
});

test('stampVersion overwrites a stale stamp on upgrade', async () => {
  const workingDir = await freshTemp();
  await fsPromises.mkdir(path.join(workingDir, '.awos'), { recursive: true });
  await fsPromises.writeFile(
    path.join(workingDir, '.awos', '.awos-version'),
    '1.0.0',
    'utf8'
  );

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: repoRoot })
  );

  assert.equal(
    result.versionStamped,
    true,
    'stampVersion must overwrite a stale stamp on upgrade, or the self-check reports a version the user no longer has'
  );
  const stamped = await fsPromises.readFile(
    path.join(workingDir, '.awos', '.awos-version'),
    'utf8'
  );
  assert.equal(
    stamped,
    repoVersion,
    'stampVersion must overwrite a stale stamp on upgrade, or the self-check reports a version the user no longer has'
  );
});

test('dry-run does not create .awos/.awos-version', async () => {
  const workingDir = await freshTemp();

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: repoRoot, dryRun: true })
  );

  assert.equal(
    result.versionStamped,
    true,
    'dry-run must report that a stamp would have been written'
  );
  assert.equal(
    fs.existsSync(path.join(workingDir, '.awos', '.awos-version')),
    false,
    'dry-run must not create .awos/.awos-version'
  );
});

test('a missing package.json never fails the install', async () => {
  const workingDir = await freshTemp();
  const emptyPackageRoot = await freshTemp();

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: emptyPackageRoot })
  );

  assert.equal(
    result.versionStamped,
    false,
    'a missing or unreadable package.json must never fail the install — the version stamp is bookkeeping, not a prerequisite'
  );
  assert.equal(
    result.version,
    null,
    'a missing or unreadable package.json must never fail the install — the version stamp is bookkeeping, not a prerequisite'
  );
});

test('a malformed package.json never fails the install', async () => {
  const workingDir = await freshTemp();
  const brokenPackageRoot = await freshTemp();
  await fsPromises.writeFile(
    path.join(brokenPackageRoot, 'package.json'),
    '{ not valid json',
    'utf8'
  );

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: brokenPackageRoot })
  );

  assert.equal(
    result.versionStamped,
    false,
    'a missing or unreadable package.json must never fail the install — the version stamp is bookkeeping, not a prerequisite'
  );
  assert.equal(
    result.version,
    null,
    'a missing or unreadable package.json must never fail the install — the version stamp is bookkeeping, not a prerequisite'
  );
});

test('a package.json with no version field never fails the install', async () => {
  const workingDir = await freshTemp();
  const versionlessPackageRoot = await freshTemp();
  await fsPromises.writeFile(
    path.join(versionlessPackageRoot, 'package.json'),
    JSON.stringify({ name: 'no-version-here' }, null, 2),
    'utf8'
  );

  const result = await silenced(() =>
    stampVersion({ workingDir, packageRoot: versionlessPackageRoot })
  );

  assert.equal(
    result.versionStamped,
    false,
    'a package.json without a version field must resolve to a no-op, not a throw — the version stamp is bookkeeping, not a prerequisite'
  );
  assert.equal(
    result.version,
    null,
    'a package.json without a version field must resolve to a no-op, not a throw — the version stamp is bookkeeping, not a prerequisite'
  );
  assert.equal(
    fs.existsSync(path.join(workingDir, '.awos', '.awos-version')),
    false,
    'a package.json without a version field must resolve to a no-op, not a throw — the version stamp is bookkeeping, not a prerequisite'
  );
});
