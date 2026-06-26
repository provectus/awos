/**
 * topology-multitool.test.ts — regression proof for the de-Claude-ify and
 * language-registry fixes.
 *
 * Contracts verified:
 * - A GEMINI-only repo (GEMINI.md + .gemini/commands/) is recognised as
 *   having AI agent files and commands/skills — not gated out.
 * - A Rust API repo (Cargo.toml + .rs source with axum/router keyword) is
 *   recognised as has_api — was false before CODE_GLOBS was broadened.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeTopology } from '../topology.ts';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'topo-mt-'));
}

test('GEMINI-only repo: has_ai_agent_files and has_agent_instruction_files are true', () => {
  const t = makeTmpDir();
  writeFileSync(join(t, 'GEMINI.md'), '# Gemini instructions\n');
  mkdirSync(join(t, '.gemini', 'commands'), { recursive: true });
  writeFileSync(join(t, '.gemini', 'commands', 'hello.md'), '# hello\n');

  const flags = computeTopology(t);

  assert.equal(
    flags.has_ai_agent_files,
    true,
    'has_ai_agent_files must be true for a GEMINI-only repo'
  );
  assert.equal(
    flags.has_agent_instruction_files,
    true,
    'has_agent_instruction_files must be true for a GEMINI-only repo'
  );
});

test('GEMINI-only repo: has_commands_or_skills is true for .gemini/commands/', () => {
  const t = makeTmpDir();
  writeFileSync(join(t, 'GEMINI.md'), '# Gemini instructions\n');
  mkdirSync(join(t, '.gemini', 'commands'), { recursive: true });
  writeFileSync(join(t, '.gemini', 'commands', 'hello.md'), '# hello\n');

  const flags = computeTopology(t);

  assert.equal(
    flags.has_commands_or_skills,
    true,
    'has_commands_or_skills must be true when .gemini/commands/ exists'
  );
});

test('Rust API repo: has_api is true when Cargo.toml + axum keyword in .rs file', () => {
  const t = makeTmpDir();
  writeFileSync(
    join(t, 'Cargo.toml'),
    '[package]\nname = "myapp"\nversion = "0.1.0"\n'
  );
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(
    join(t, 'src', 'main.rs'),
    'use axum::{Router, routing::get};\nasync fn main() { let app = Router::new(); }\n'
  );

  const flags = computeTopology(t);

  assert.equal(
    flags.has_api,
    true,
    'has_api must be true for Rust repo with axum keyword in .rs source (was false before CODE_GLOBS broadening)'
  );
});
