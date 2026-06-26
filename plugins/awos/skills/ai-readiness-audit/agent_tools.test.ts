import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_TOOLS,
  ALL_INSTRUCTION_FILES,
  ALL_MCP_CONFIG_PATHS,
  detectAgentTools,
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
    .map((t) => t.id)
    .sort();
  assert.deepEqual(found, ['gemini', 'windsurf']);
});
