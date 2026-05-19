#!/usr/bin/env node
/**
 * awos-e2e-list
 *
 * Prints every scenario under tests/e2e/scenarios/ with a one-line
 * description sourced from the first non-heading line of its
 * INSTRUCTIONS.md. Output is plain text aligned in two columns so
 * `bun run e2e:list` is useful both interactively and in piped use.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scenariosDir = path.join(repoRoot, 'tests', 'e2e', 'scenarios');

function describe(scenarioName) {
  const instructionsPath = path.join(
    scenariosDir,
    scenarioName,
    'INSTRUCTIONS.md'
  );
  if (!fs.existsSync(instructionsPath)) return '(no INSTRUCTIONS.md)';
  const text = fs.readFileSync(instructionsPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return '(empty INSTRUCTIONS.md)';
}

function main() {
  if (!fs.existsSync(scenariosDir)) {
    process.stderr.write(`no scenarios directory at ${scenariosDir}\n`);
    process.exit(1);
  }
  const scenarios = fs
    .readdirSync(scenariosDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (scenarios.length === 0) {
    process.stdout.write('No scenarios defined yet.\n');
    return;
  }

  const widest = Math.max(...scenarios.map((n) => n.length));
  process.stdout.write('Available scenarios:\n\n');
  for (const name of scenarios) {
    const desc = describe(name);
    process.stdout.write(`  ${name.padEnd(widest)}   ${desc}\n`);
  }
  process.stdout.write('\nRun a scenario:\n');
  process.stdout.write('  bun run e2e:prepare <scenario>\n');
  process.stdout.write('  # ... follow the printed instructions ...\n');
  process.stdout.write('  bun run e2e:verify\n');
}

main();
