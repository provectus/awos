import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_TOOLS,
  ALL_INSTRUCTION_FILES,
  ALL_MCP_CONFIG_PATHS,
  ALL_COMMIT_ATTRIBUTION,
  detectAgentTools,
  ALL_LOCAL_ONLY_FILES,
  isLocalOnlyAgentFile,
} from './agent_tools.ts';

test('registry covers exactly the eight supported tools', () => {
  const ids = AGENT_TOOLS.map((t) => t.id).sort();
  assert.deepEqual(ids, [
    'claude',
    'cline',
    'codex',
    'copilot',
    'cursor',
    'gemini',
    'kiro',
    'windsurf',
  ]);
});

test('union helpers include each tool primary instruction file', () => {
  assert.ok(ALL_INSTRUCTION_FILES.includes('CLAUDE.md'));
  assert.ok(ALL_INSTRUCTION_FILES.includes('GEMINI.md'));
  assert.ok(ALL_INSTRUCTION_FILES.includes('AGENTS.md'));
  assert.ok(ALL_MCP_CONFIG_PATHS.includes('.mcp.json'));
});

test('detectAgentTools finds present tools by any attribute', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agt-'));
  writeFileSync(join(dir, 'GEMINI.md'), '# gemini');
  mkdirSync(join(dir, '.windsurf'), { recursive: true });
  const found = detectAgentTools(dir)
    .map((t) => t.def.id)
    .sort();
  assert.deepEqual(found, ['gemini', 'windsurf']);
});

test('commit-attribution patterns stay POSIX-ERE-safe (they feed git log --grep --extended-regexp)', () => {
  // The git collector passes each pattern's .source to `git log --grep` with
  // --extended-regexp. JS-only regex constructs (lookarounds, backreferences,
  // \d/\w/\s classes, non-capturing groups) are not POSIX ERE and would
  // silently never match — so no pattern may use them.
  for (const pat of ALL_COMMIT_ATTRIBUTION) {
    assert.doesNotMatch(
      pat.source,
      /\(\?|\\[dwsbDWSB0-9]/,
      `attribution pattern /${pat.source}/ uses a JS-only regex construct that POSIX ERE (git log --grep --extended-regexp) does not support`
    );
  }
});

test('Windsurf/Cascade alternation is present in the attribution registry', () => {
  // Companion to the git-collector ERE test: the (Windsurf|Cascade) alternation
  // is the pattern that motivated --extended-regexp; keep it alternation-based
  // so both trailer spellings stay covered by one pattern.
  assert.ok(
    ALL_COMMIT_ATTRIBUTION.some((p) => p.source.includes('(Windsurf|Cascade)')),
    'the Windsurf tool must attribute commits via the (Windsurf|Cascade) ERE alternation'
  );
});

test('local-only agent files are recognized and excluded from tracking checks', () => {
  assert.ok(
    ALL_LOCAL_ONLY_FILES.length > 0,
    'registry must declare local-only files'
  );
  assert.equal(
    isLocalOnlyAgentFile('.claude/settings.local.json'),
    true,
    'Claude local settings must be treated as local-only (expected untracked)'
  );
  assert.equal(
    isLocalOnlyAgentFile('.claude/settings.json'),
    false,
    'shared settings must NOT be local-only'
  );
});
