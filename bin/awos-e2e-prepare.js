#!/usr/bin/env node
/**
 * awos-e2e-prepare <scenario>
 *
 * 1. Validate that tests/e2e/scenarios/<scenario>/ exists.
 * 2. Create a fresh temp directory.
 * 3. Run the AWOS installer against it (silenced).
 * 4. Overlay the scenario's fixture/ tree on top of the installed tree.
 * 5. Write the prepare-start timestamp to <tempdir>/.awos-e2e-prepare-time.
 * 6. Print INSTRUCTIONS.md (with {{WORKDIR}} substituted) plus the verify
 *    command for convenience.
 *
 * Exit 0 on success, non-zero with a clear message on any failure.
 */

'use strict';

const fs = require('node:fs');
const fsPromises = fs.promises;
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const { runSetup } = require(
  path.join(repoRoot, 'src', 'core', 'setup-orchestrator')
);
const { silenced } = require(
  path.join(repoRoot, 'tests', 'helpers', 'temp-project')
);

async function main() {
  const scenario = process.argv[2];
  if (!scenario) {
    process.stderr.write(
      'usage: awos-e2e-prepare <scenario>\n' +
        '       (scenarios live under tests/e2e/scenarios/)\n'
    );
    process.exit(2);
  }

  const scenarioDir = path.join(
    repoRoot,
    'tests',
    'e2e',
    'scenarios',
    scenario
  );
  if (!fs.existsSync(scenarioDir)) {
    process.stderr.write(`error: no scenario at ${scenarioDir}\n`);
    process.exit(1);
  }
  const fixtureDir = path.join(scenarioDir, 'fixture');
  const instructionsPath = path.join(scenarioDir, 'INSTRUCTIONS.md');
  if (!fs.existsSync(instructionsPath)) {
    process.stderr.write(
      `error: scenario ${scenario} is missing INSTRUCTIONS.md\n`
    );
    process.exit(1);
  }

  const prepareTime = new Date();
  const workdir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'awos-e2e-'));

  await silenced(() =>
    runSetup({ workingDir: workdir, packageRoot: repoRoot })
  );

  if (fs.existsSync(fixtureDir)) {
    await fsPromises.cp(fixtureDir, workdir, { recursive: true });
  }

  await fsPromises.writeFile(
    path.join(workdir, '.awos-e2e-prepare-time'),
    prepareTime.toISOString() + '\n',
    'utf8'
  );

  const instructions = await fsPromises.readFile(instructionsPath, 'utf8');
  const rendered = instructions.replace(/\{\{WORKDIR\}\}/g, workdir);

  process.stdout.write(rendered);
  process.stdout.write('\n---\n');
  process.stdout.write(`Prepared workdir: ${workdir}\n`);
  process.stdout.write(
    `When the Claude session finishes, verify with:\n` +
      `  npm run e2e:verify ${scenario} ${workdir}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`prepare failed: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
