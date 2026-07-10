/**
 * Tests for onboarding_ease — onboarding enabler presence proxy.
 *
 * Contracts verified:
 *   - All 4 enablers present → value 1.0, band "good", score ≥ 0.8
 *   - 2 of 4 enablers present → value 0.5, band "watch"
 *   - 0 enablers present → value 0, band "concerning", status OK (NOT SKIP)
 *   - repoPath nonexistent → status SKIP
 *   - More enablers → higher score (band direction: higher = better)
 *   - topology.has_agent_instruction_files flag counts as agent-context enabler
 *   - README bootstrap command detection (npm install, docker compose, etc.)
 *   - awards code 1501
 *   - reliability "minimal"
 *   - standards.toml weight for onboarding_ease === 3
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { compute } from './onboarding_ease.ts';
import { loadStandards } from './_base.ts';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { tmpDir } from '../tests/helpers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STANDARDS_PATH = join(__dirname, '..', 'references', 'standards.toml');
// Real standards.toml — compute() reads its score curve from
// [category.onboarding_ease.scoring].
const STANDARDS = loadStandards(STANDARDS_PATH);

function makeTempDir(): string {
  return tmpDir('awos-g15-');
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function writeReadme(dir: string, content: string): void {
  writeFileSync(join(dir, 'README.md'), content);
}

function writeAgentContext(dir: string): void {
  writeFileSync(join(dir, 'CLAUDE.md'), '# Agent instructions\n');
}

function writeEnvExample(dir: string): void {
  writeFileSync(
    join(dir, '.env.example'),
    'DATABASE_URL=postgres://localhost/app\n'
  );
}

function writeMakefile(dir: string): void {
  writeFileSync(join(dir, 'Makefile'), 'setup:\n\tnpm install\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('adp_g15: all 4 enablers present → value 1.0, band "good", OK (not SKIP)', async () => {
  const dir = makeTempDir();
  try {
    writeReadme(dir, '## Getting Started\n\nRun `npm install` to begin.\n');
    writeAgentContext(dir);
    writeEnvExample(dir);
    writeMakefile(dir);

    const res = await compute(dir, STANDARDS, {}, dir);

    assert.equal(res.status, 'OK', 'status must be OK when repoPath exists');
    assert.equal(res.value, 1.0, 'value must be 1.0 (4/4 enablers)');
    assert.equal(res.band, 'good', 'band must be "good" at value 1.0');
    assert.ok(
      (res.score ?? 0) >= 0.8,
      `score must be ≥ 0.8 for 4/4 enablers, got ${res.score}`
    );
    assert.ok(
      (res.categories_awarded as number[]).includes(1501),
      `must award code 1501, got ${JSON.stringify(res.categories_awarded)}`
    );
    assert.equal(
      res.reliability.tag,
      'minimal',
      'reliability tag must be "minimal"'
    );
    assert.ok(
      typeof res.expression === 'string',
      'must carry an expression string'
    );
    assert.ok(
      (res.expression ?? '').includes('4/4'),
      `expression must mention "4/4", got: ${res.expression}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g15: 2 of 4 enablers (README + .env.example) → value 0.5, band "watch"', async () => {
  const dir = makeTempDir();
  try {
    writeReadme(dir, '## Setup\n\nRun `docker compose up` to start.\n');
    writeEnvExample(dir);
    // No CLAUDE.md, no Makefile/bootstrap

    const res = await compute(dir, STANDARDS, {}, dir);

    assert.equal(res.status, 'OK', 'status must be OK');
    assert.ok(
      Math.abs(Number(res.value) - 0.5) < 1e-9,
      `value must be 0.5 (2/4 enablers), got ${res.value}`
    );
    assert.equal(res.band, 'watch', 'band must be "watch" at value 0.5');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g15: 0 enablers → value 0, band "concerning", status OK (not SKIP)', async () => {
  const dir = makeTempDir();
  try {
    // Write a README with no recognizable setup content
    writeFileSync(
      join(dir, 'README.md'),
      '# My Project\n\nSome description.\n'
    );
    // No CLAUDE.md, no .env.example, no Makefile

    const res = await compute(dir, STANDARDS, {}, dir);

    assert.equal(
      res.status,
      'OK',
      'must be OK (not SKIP) even with 0 enablers'
    );
    assert.equal(res.value, 0, 'value must be 0 (0/4 enablers)');
    assert.equal(
      res.band,
      'concerning',
      'band must be "concerning" at value 0'
    );
    assert.ok(
      Number(res.score ?? 0) < 0.3,
      `score must be low for 0 enablers, got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g15: repoPath nonexistent → status SKIP', async () => {
  const res = await compute(
    '/nonexistent/path/that/does/not/exist',
    STANDARDS,
    {},
    '/nonexistent/path/that/does/not/exist'
  );

  assert.equal(res.status, 'SKIP', 'must SKIP when repoPath does not exist');
  assert.equal(res.value, null, 'SKIP value must be null');
  assert.deepEqual(res.categories_awarded, [], 'no categories awarded on SKIP');
});

test('adp_g15: more enablers → higher score (band direction: higher = better)', async () => {
  const dirNone = makeTempDir();
  const dirAll = makeTempDir();
  try {
    // dirNone: empty dir (no readme at all)
    const resNone = await compute(dirNone, STANDARDS, {}, dirNone);

    // dirAll: all 4 enablers
    writeReadme(dirAll, '# Setup\n\npip install -r requirements.txt\n');
    writeAgentContext(dirAll);
    writeEnvExample(dirAll);
    writeMakefile(dirAll);
    const resAll = await compute(dirAll, STANDARDS, {}, dirAll);

    assert.ok(
      Number(resAll.score ?? 0) > Number(resNone.score ?? 0),
      `all-enablers score (${resAll.score}) must exceed no-enablers score (${resNone.score})`
    );
    assert.ok(
      Number(resAll.value ?? 0) > Number(resNone.value ?? 0),
      `all-enablers value (${resAll.value}) must exceed no-enablers value (${resNone.value})`
    );
  } finally {
    rmSync(dirNone, { recursive: true, force: true });
    rmSync(dirAll, { recursive: true, force: true });
  }
});

test('adp_g15: topology.has_agent_instruction_files counts as agent-context enabler', async () => {
  const dirNoFile = makeTempDir();
  const dirWithFlag = makeTempDir();
  try {
    // dirNoFile: README + env.example but no agent context file
    writeReadme(dirNoFile, '## Install\n\nyarn install\n');
    writeEnvExample(dirNoFile);
    const resNoFlag = await compute(dirNoFile, STANDARDS, {}, dirNoFile);

    // dirWithFlag: same files + topology flag set (no actual CLAUDE.md)
    writeReadme(dirWithFlag, '## Install\n\nyarn install\n');
    writeEnvExample(dirWithFlag);
    const resWithFlag = await compute(
      dirWithFlag,
      STANDARDS,
      { has_agent_instruction_files: true },
      dirWithFlag
    );

    assert.ok(
      Number(resWithFlag.value ?? 0) > Number(resNoFlag.value ?? 0),
      `topology flag should add 1 enabler: ${resWithFlag.value} > ${resNoFlag.value}`
    );
    // Without flag: 2 enablers (README + env) = 0.5
    assert.ok(
      Math.abs(Number(resNoFlag.value) - 0.5) < 1e-9,
      `without flag: 2/4 = 0.5, got ${resNoFlag.value}`
    );
    // With flag: 3 enablers = 0.75
    assert.ok(
      Math.abs(Number(resWithFlag.value) - 0.75) < 1e-9,
      `with flag: 3/4 = 0.75, got ${resWithFlag.value}`
    );
  } finally {
    rmSync(dirNoFile, { recursive: true, force: true });
    rmSync(dirWithFlag, { recursive: true, force: true });
  }
});

test('adp_g15: README bootstrap command detection — various package managers', async () => {
  const cases: Array<[string, string]> = [
    ['npm install', 'npm install command'],
    ['yarn', 'yarn command'],
    ['pnpm install', 'pnpm install command'],
    ['make', 'make command'],
    ['docker compose up', 'docker compose command'],
    ['docker-compose up', 'docker-compose command'],
    ['pip install -r requirements.txt', 'pip install command'],
    ['poetry install', 'poetry install command'],
    ['./gradlew build', 'gradlew command'],
    ['bundle install', 'bundle install command'],
    ['go build ./...', 'go build command'],
    ['cargo build', 'cargo build command'],
    ['uv sync', 'uv sync command'],
  ];

  for (const [cmd, label] of cases) {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'README.md'),
        `# Project\n\nTo get started:\n\n\`\`\`\n${cmd}\n\`\`\`\n`
      );

      const res = await compute(dir, STANDARDS, {}, dir);

      assert.equal(res.status, 'OK', `${label}: status must be OK`);
      // README signal should be true (at least 1/4 enabler)
      assert.ok(
        Number(res.value ?? 0) >= 0.25,
        `${label}: README bootstrap detection must give ≥0.25 (1/4 enabler), got ${res.value}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('adp_g15: README heading detection — setup/install/quickstart/usage headings', async () => {
  const cases: Array<[string, string]> = [
    ['## Installation\n\nSee below.', '## Installation heading'],
    ['## Setup\n\nSee below.', '## Setup heading'],
    ['## Getting Started\n\nSee below.', '## Getting Started heading'],
    ['## Usage\n\nSee below.', '## Usage heading'],
    ['## Quick Start\n\nSee below.', '## Quick Start heading'],
    ['## Quickstart\n\nSee below.', '## Quickstart heading'],
  ];

  for (const [content, label] of cases) {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'README.md'), `# My Project\n\n${content}\n`);

      const res = await compute(dir, STANDARDS, {}, dir);

      assert.ok(
        Number(res.value ?? 0) >= 0.25,
        `${label}: README heading detection must give ≥0.25, got ${res.value}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('adp_g15: one-command bootstrap — package.json with dev/setup/bootstrap script', async () => {
  const dir = makeTempDir();
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'node server.js', test: 'jest' } })
    );

    const res = await compute(dir, STANDARDS, {}, dir);

    assert.equal(res.status, 'OK', 'status must be OK');
    // package.json dev script = bootstrap signal (1/4 = 0.25)
    assert.ok(
      Number(res.value ?? 0) >= 0.25,
      `package.json dev script must count as bootstrap enabler, got ${res.value}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g15: justfile counts as one-command bootstrap', async () => {
  const dir = makeTempDir();
  try {
    writeFileSync(join(dir, 'Justfile'), 'setup:\n    npm install\n');

    const res = await compute(dir, STANDARDS, {}, dir);

    assert.ok(
      Number(res.value ?? 0) >= 0.25,
      `Justfile must count as bootstrap enabler, got ${res.value}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g15: standards.toml weight for onboarding_ease === 3', () => {
  const standards = loadStandards(STANDARDS_PATH);
  const cat = (
    standards['category'] as Record<string, Record<string, unknown>>
  )['onboarding_ease'];
  assert.ok(cat, 'standards.toml must define [category.onboarding_ease]');
  assert.equal(
    cat['code'],
    1501,
    '[category.onboarding_ease] code must be 1501'
  );
  assert.equal(cat['weight'], 3, '[category.onboarding_ease] weight must be 3');
  assert.equal(
    cat['applies_when'],
    'always',
    '[category.onboarding_ease] applies_when must be "always"'
  );
  assert.equal(
    cat['reliability_default'],
    'minimal',
    '[category.onboarding_ease] reliability_default must be "minimal"'
  );
  assert.equal(
    cat['method'],
    'computed',
    '[category.onboarding_ease] method must be "computed"'
  );
});
