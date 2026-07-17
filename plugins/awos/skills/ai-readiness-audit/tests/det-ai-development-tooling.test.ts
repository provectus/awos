import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectCustomCommands,
  detectClaudeSkills,
  detectMcpConfig,
  detectClaudeHooks,
  detectCanRunApp,
  DETECTORS,
} from '../detectors/ai_development_tooling.ts';
import { tmpDir } from './helpers.ts';

function tmp(): string {
  return tmpDir('ai-tooling-');
}

// ---------------------------------------------------------------------------
// detectCustomCommands — category 2001 (AI-02, method: detected)
// ---------------------------------------------------------------------------

test('detectCustomCommands: .claude/commands dir present → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'commands'), { recursive: true });
  writeFileSync(join(t, '.claude', 'commands', 'foo.md'), '# foo\n');
  const r = detectCustomCommands(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when .claude/commands/ has files'
  );
  assert.ok(r.evidence.some((e) => e.includes('foo.md')));
  assert.equal(r.method, 'detected');
});

test('detectCustomCommands: .claude/commands dir empty → FAIL', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'commands'), { recursive: true });
  const r = detectCustomCommands(t);
  assert.equal(
    r.status,
    'FAIL',
    'expected FAIL when .claude/commands/ has no files'
  );
});

test('detectCustomCommands: no .claude dir → FAIL', () => {
  const t = tmp();
  const r = detectCustomCommands(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectClaudeSkills — category 2002 (AI-03, method: detected)
// ---------------------------------------------------------------------------

test('detectClaudeSkills: SKILL.md present under .claude/skills → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'skills', 'my-skill'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'skills', 'my-skill', 'SKILL.md'),
    '# My Skill\n'
  );
  const r = detectClaudeSkills(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when SKILL.md exists under .claude/skills/'
  );
  assert.ok(r.evidence.some((e) => e.includes('SKILL.md')));
  assert.equal(r.method, 'detected');
});

test('detectClaudeSkills: no SKILL.md → FAIL', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'skills', 'empty-skill'), { recursive: true });
  const r = detectClaudeSkills(t);
  assert.equal(r.status, 'FAIL', 'expected FAIL when no SKILL.md present');
});

test('detectClaudeSkills: multiple skills → PASS with count', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'skills', 'skill-a'), { recursive: true });
  mkdirSync(join(t, '.claude', 'skills', 'skill-b'), { recursive: true });
  writeFileSync(join(t, '.claude', 'skills', 'skill-a', 'SKILL.md'), '# A\n');
  writeFileSync(join(t, '.claude', 'skills', 'skill-b', 'SKILL.md'), '# B\n');
  const r = detectClaudeSkills(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.value, 2, 'expected value to be the count of SKILL.md files');
});

test('detectClaudeSkills: .claude/skills is a symlink to a dir containing SKILL.md → PASS', () => {
  // Create a real skills directory outside the repo tree, then symlink
  // .claude/skills → that real directory.
  const t = tmp();
  const realSkillsDir = tmp(); // real dir lives outside the project tree
  mkdirSync(join(realSkillsDir, 'foo'), { recursive: true });
  writeFileSync(join(realSkillsDir, 'foo', 'SKILL.md'), '# Foo\n');

  mkdirSync(join(t, '.claude'), { recursive: true });
  symlinkSync(realSkillsDir, join(t, '.claude', 'skills'));

  const r = detectClaudeSkills(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when .claude/skills is a symlink to a dir with SKILL.md inside'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('SKILL.md')),
    'evidence must mention SKILL.md'
  );
});

test('detectClaudeSkills: individual skill subdir is a symlink → PASS', () => {
  // .claude/skills/ is a real directory, but .claude/skills/bar is a symlink
  // pointing to a real skill directory that contains SKILL.md.
  const t = tmp();
  const realSkillDir = tmp(); // real skill dir with SKILL.md
  writeFileSync(join(realSkillDir, 'SKILL.md'), '# Bar\n');

  mkdirSync(join(t, '.claude', 'skills'), { recursive: true });
  symlinkSync(realSkillDir, join(t, '.claude', 'skills', 'bar'));

  const r = detectClaudeSkills(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when an individual skill subdir is a symlink to a dir with SKILL.md'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('SKILL.md')),
    'evidence must mention SKILL.md'
  );
});

// ---------------------------------------------------------------------------
// detectMcpConfig — category 2003 (AI-04, method: detected)
// ---------------------------------------------------------------------------

test('detectMcpConfig: .mcp.json present → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.mcp.json'), '{"mcpServers":{}}\n');
  const r = detectMcpConfig(t);
  assert.equal(r.status, 'PASS', 'expected PASS when .mcp.json present');
  assert.ok(r.evidence.some((e) => e.includes('.mcp.json')));
  assert.equal(r.method, 'detected');
});

test('detectMcpConfig: no .mcp.json → FAIL', () => {
  const t = tmp();
  const r = detectMcpConfig(t);
  assert.equal(r.status, 'FAIL');
});

test('detectMcpConfig: .claude/mcp.json also counts → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude'), { recursive: true });
  writeFileSync(join(t, '.claude', 'mcp.json'), '{"mcpServers":{}}\n');
  const r = detectMcpConfig(t);
  assert.equal(r.status, 'PASS', 'expected PASS when .claude/mcp.json present');
});

// ---------------------------------------------------------------------------
// detectClaudeHooks — category 2004 (AI-05, method: detected)
// ---------------------------------------------------------------------------

test('detectClaudeHooks: .claude/hooks dir with files → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'hooks'), { recursive: true });
  writeFileSync(join(t, '.claude', 'hooks', 'pre-tool-use.sh'), '#!/bin/sh\n');
  const r = detectClaudeHooks(t);
  assert.equal(r.status, 'PASS', 'expected PASS when .claude/hooks/ has files');
  assert.ok(r.evidence.some((e) => e.includes('pre-tool-use.sh')));
  assert.equal(r.method, 'detected');
});

test('detectClaudeHooks: settings.json with hooks key → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [] } })
  );
  const r = detectClaudeHooks(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when settings.json contains "hooks" key'
  );
});

test('detectClaudeHooks: no hooks → FAIL', () => {
  const t = tmp();
  const r = detectClaudeHooks(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectCanRunApp — category 2006 (AI-07, method: detected)
// ---------------------------------------------------------------------------

test('detectCanRunApp: Makefile present → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'Makefile'), 'run:\n\tnode index.js\n');
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'PASS', 'expected PASS when Makefile present');
  assert.ok(r.evidence.some((e) => e.toLowerCase().includes('makefile')));
  assert.equal(r.method, 'detected');
});

test('detectCanRunApp: docker-compose.yml present → PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'docker-compose.yml'),
    'services:\n  app:\n    image: node\n'
  );
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'PASS');
});

test('detectCanRunApp: package.json with scripts.start → PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({ scripts: { start: 'node index.js' } })
  );
  const r = detectCanRunApp(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when package.json has a start script'
  );
});

test('detectCanRunApp: no run mechanism → FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'FAIL');
});

// Issue #151: JVM and other language-standard run mechanisms were invisible —
// a Spring Boot repo with only mvnw/gradlew wrappers failed AI-07.

test('detectCanRunApp (issue #151): Maven wrapper mvnw at root → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'mvnw'), '#!/bin/sh\nexec java ...\n');
  writeFileSync(join(t, 'pom.xml'), '<project></project>\n');
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'PASS', 'expected PASS when mvnw wrapper present');
  assert.ok(r.evidence.some((e) => e.includes('mvnw')));
});

test('detectCanRunApp (issue #151): Gradle wrapper gradlew at root → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'gradlew'), '#!/bin/sh\nexec java ...\n');
  writeFileSync(join(t, 'build.gradle.kts'), 'plugins { java }\n');
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'PASS', 'expected PASS when gradlew wrapper present');
  assert.ok(r.evidence.some((e) => e.includes('gradlew')));
});

test('detectCanRunApp (issue #151): Django manage.py at root → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'manage.py'), '#!/usr/bin/env python\n');
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'PASS', 'expected PASS when manage.py present');
  assert.ok(r.evidence.some((e) => e.includes('manage.py')));
});

test('detectCanRunApp (issue #151): Procfile at root → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'Procfile'), 'web: gunicorn app:app\n');
  const r = detectCanRunApp(t);
  assert.equal(r.status, 'PASS', 'expected PASS when Procfile present');
  assert.ok(r.evidence.some((e) => e.includes('Procfile')));
});

test('detectCanRunApp (issue #151): bare pom.xml without wrapper still FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'pom.xml'), '<project></project>\n');
  const r = detectCanRunApp(t);
  assert.equal(
    r.status,
    'FAIL',
    'a build manifest alone is not a run mechanism — only the wrapper script is'
  );
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2001, 2002, 2003, 2004, 2006', () => {
  assert.ok(
    2001 in DETECTORS,
    'DETECTORS must include 2001 (detectCustomCommands)'
  );
  assert.ok(
    2002 in DETECTORS,
    'DETECTORS must include 2002 (detectClaudeSkills)'
  );
  assert.ok(2003 in DETECTORS, 'DETECTORS must include 2003 (detectMcpConfig)');
  assert.ok(
    2004 in DETECTORS,
    'DETECTORS must include 2004 (detectClaudeHooks)'
  );
  assert.ok(2006 in DETECTORS, 'DETECTORS must include 2006 (detectCanRunApp)');
});

test('judgment codes 2000 and 2005 are NOT in DETECTORS', () => {
  assert.ok(
    !(2000 in DETECTORS),
    'judgment code 2000 must not be in DETECTORS'
  );
  assert.ok(
    !(2005 in DETECTORS),
    'judgment code 2005 must not be in DETECTORS'
  );
});

test('DETECTORS[2003] returns same result as detectMcpConfig', () => {
  const t = tmp();
  writeFileSync(join(t, '.mcp.json'), '{"mcpServers":{}}\n');
  const direct = detectMcpConfig(t);
  const viaMap = DETECTORS[2003](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'detected');
});

// ---------------------------------------------------------------------------
// Multi-tool registry tests (B3)
// ---------------------------------------------------------------------------

test('detectCustomCommands: .cursor/commands dir present → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.cursor', 'commands'), { recursive: true });
  writeFileSync(join(t, '.cursor', 'commands', 'build.md'), '# build');
  const r = detectCustomCommands(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when .cursor/commands/ has files'
  );
});

test('detectMcpConfig: .cursor/mcp.json present → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.cursor'), { recursive: true });
  writeFileSync(join(t, '.cursor', 'mcp.json'), '{}');
  const r = detectMcpConfig(t);
  assert.equal(r.status, 'PASS', 'expected PASS when .cursor/mcp.json present');
});
