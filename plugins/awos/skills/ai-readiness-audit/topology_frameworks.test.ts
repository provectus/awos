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
    const frameworks = detectFrameworks(repo);
    assert.ok(
      frameworks.includes('FastAPI'),
      `detectFrameworks must include "FastAPI" for a repo with FastAPI source, got ${JSON.stringify(frameworks)}`
    );
    assert.ok(
      !frameworks.includes('Flask'),
      `detectFrameworks must not include "Flask" for a FastAPI-only repo, got ${JSON.stringify(frameworks)}`
    );
    assert.ok(
      !frameworks.includes('Django'),
      `detectFrameworks must not include "Django" for a FastAPI-only repo, got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
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
    const frameworks = detectFrameworks(repo);
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
    const frameworks = detectFrameworks(repo);
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
    const frameworks = detectFrameworks(repo);
    assert.ok(
      !frameworks.includes('AWOS'),
      `detectFrameworks must not report AWOS when only context/ exists (no .awos or context/spec), got ${JSON.stringify(frameworks)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
