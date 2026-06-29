// topology_frameworks.test.ts — detectFrameworks unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFrameworks } from './topology.ts';

test('detectFrameworks returns ["FastAPI"] for a FastAPI Python repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-fastapi-'));
  try {
    writeFileSync(
      join(repo, 'main.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );
    assert.deepStrictEqual(
      detectFrameworks(repo).map((f) => f.name),
      ['FastAPI'],
      'detectFrameworks must return exactly ["FastAPI"] for a FastAPI-only repo'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks: prose "express" does NOT yield Express; manifest dep does', () => {
  const proseRepo = mkdtempSync(join(tmpdir(), 'awos-fw-prose-'));
  const realRepo = mkdtempSync(join(tmpdir(), 'awos-fw-real-'));
  try {
    mkdirSync(join(proseRepo, 'src'), { recursive: true });
    writeFileSync(
      join(proseRepo, 'src', 'm.py'),
      '# Raw DDL because the ORM cannot express multi-column indexes\nx = 1\n'
    );
    writeFileSync(
      join(proseRepo, 'pyproject.toml'),
      '[project]\ndependencies=["fastapi"]\n'
    );
    const prose = detectFrameworks(proseRepo).map((f) => f.name);
    assert.ok(
      !prose.includes('Express'),
      `prose must not yield Express; got ${prose.join(',')}`
    );
    assert.ok(
      prose.includes('FastAPI'),
      `fastapi dep must yield FastAPI; got ${prose.join(',')}`
    );
    const fa = detectFrameworks(proseRepo).find((f) => f.name === 'FastAPI');
    assert.ok(
      fa !== undefined && fa.evidence && fa.evidence.length > 0,
      'FastAPI must carry evidence'
    );

    writeFileSync(
      join(realRepo, 'package.json'),
      '{"dependencies":{"express":"^4"}}\n'
    );
    const real = detectFrameworks(realRepo).map((f) => f.name);
    assert.ok(
      real.includes('Express'),
      `express dep must yield Express; got ${real.join(',')}`
    );
  } finally {
    rmSync(proseRepo, { recursive: true, force: true });
    rmSync(realRepo, { recursive: true, force: true });
  }
});

test('detectFrameworks returns [] for a plain repo with no framework signals', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-empty-'));
  try {
    writeFileSync(join(repo, 'main.go'), 'package main\nfunc main() {}\n');
    const frameworks = detectFrameworks(repo);
    assert.deepStrictEqual(
      frameworks,
      [],
      `detectFrameworks must return [] for a plain Go repo with no framework imports, got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks detects GraphQL and gRPC stack components', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-api-'));
  try {
    writeFileSync(
      join(repo, 'schema.ts'),
      'import { buildSchema } from "graphql";\nimport * as grpc from "@grpc/grpc-js";\n'
    );
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      frameworks.includes('GraphQL'),
      `detectFrameworks must detect GraphQL, got ${JSON.stringify(frameworks)}`
    );
    assert.ok(
      frameworks.includes('gRPC'),
      `detectFrameworks must detect gRPC, got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks detects AWOS layout', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-awos-'));
  try {
    mkdirSync(join(repo, 'context'));
    mkdirSync(join(repo, '.awos'));
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      frameworks.includes('AWOS'),
      `detectFrameworks must detect AWOS when context/ and .awos/ both exist, got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks does not report AWOS when only context/ exists', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-ctx-only-'));
  try {
    mkdirSync(join(repo, 'context'));
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      !frameworks.includes('AWOS'),
      `detectFrameworks must not report AWOS when only context/ exists (no .awos or context/spec), got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks does not report Spring Boot for bare "spring" word', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-spring-bare-'));
  try {
    writeFileSync(
      join(repo, 'util.py'),
      '# spring cleaning TODO\nspring_offset = 1\n'
    );
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      !frameworks.includes('Spring Boot'),
      `detectFrameworks must not report "Spring Boot" when the only "spring" occurrence is a bare word (no "framework"/"boot" suffix), got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks: guardrails-ai dep must NOT yield Rails (false positive guard)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-guardrails-'));
  try {
    writeFileSync(
      join(repo, 'pyproject.toml'),
      '[project]\ndependencies = ["fastapi>=0.100", "guardrails-ai>=0.4"]\n'
    );
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      !frameworks.includes('Rails'),
      `guardrails-ai dep must NOT trigger Rails detection (substring false positive); got ${JSON.stringify(frameworks)}`
    );
    assert.ok(
      frameworks.includes('FastAPI'),
      `fastapi dep must still yield FastAPI; got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks: PyPI "expression" dep must NOT yield Express (false positive guard)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-expression-'));
  try {
    writeFileSync(
      join(repo, 'requirements.txt'),
      'expression==5.0.0\naiohttp==3.9.0\n'
    );
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      !frameworks.includes('Express'),
      `PyPI "expression" dep must NOT trigger Express detection (substring false positive); got ${JSON.stringify(frameworks)}`
    );
    assert.ok(
      frameworks.includes('aiohttp'),
      `aiohttp dep must still yield aiohttp; got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectFrameworks: spring-boot-starter-web in build.gradle still yields Spring Boot', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-fw-spring-starter-'));
  try {
    writeFileSync(
      join(repo, 'build.gradle'),
      "plugins { id 'org.springframework.boot' version '3.2.0' }\n" +
        'dependencies {\n' +
        "  implementation 'org.springframework.boot:spring-boot-starter-web:3.2.0'\n" +
        '}\n'
    );
    const frameworks = detectFrameworks(repo).map((f) => f.name);
    assert.ok(
      frameworks.includes('Spring Boot'),
      `spring-boot-starter-web must still yield Spring Boot (boundary match must not over-tighten); got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
