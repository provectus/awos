import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LANGUAGES,
  ALL_SOURCE_GLOBS,
  ALL_DEP_FILES,
  detectLanguages,
} from './languages.ts';

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

test('detectLanguages requires real source files (Makefile alone is not C/C++)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-lang-'));
  try {
    writeFileSync(join(repo, 'Makefile'), 'test:\n\tpytest\n');
    writeFileSync(join(repo, 'pyproject.toml'), '[project]\nname="x"\n');
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.py'), 'print(1)\n');
    writeFileSync(join(repo, 'src', 'b.py'), 'print(2)\n');
    // a C file ONLY inside an ignored dir must not trigger C
    mkdirSync(join(repo, '.venv'), { recursive: true });
    writeFileSync(join(repo, '.venv', 'native.c'), 'int main(){}\n');

    const langs = detectLanguages(repo);
    const names = langs.map((l) => l.def.displayName).sort();
    assert.deepEqual(
      names,
      ['Python'],
      `only Python expected; got ${names.join(',')}`
    );
    const py = langs.find((l) => l.def.id === 'python');
    assert.match(
      py.evidence,
      /2 .*\.py|2 files/i,
      `evidence should cite the .py count; got "${py.evidence}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
