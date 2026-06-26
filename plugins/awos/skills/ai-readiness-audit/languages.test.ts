import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, ALL_SOURCE_GLOBS, ALL_DEP_FILES } from './languages.ts';

test('registry covers the grammar languages plus glob-only ones', () => {
  const ids = new Set(LANGUAGES.map((l) => l.id));
  for (const id of [
    'javascript',
    'typescript',
    'python',
    'go',
    'java',
    'kotlin',
    'ruby',
    'php',
    'c',
    'cpp',
    'csharp',
    'rust',
    'swift',
    'scala',
    'dart',
  ]) {
    assert.ok(ids.has(id), `missing language ${id}`);
  }
});

test('union helpers aggregate per-language attributes', () => {
  assert.ok(ALL_SOURCE_GLOBS.includes('*.kt'));
  assert.ok(ALL_SOURCE_GLOBS.includes('*.py'));
  assert.ok(ALL_DEP_FILES.includes('pyproject.toml'));
  assert.ok(ALL_DEP_FILES.includes('go.mod'));
});
