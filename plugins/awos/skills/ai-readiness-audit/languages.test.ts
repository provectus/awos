import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  LANGUAGES,
  ALL_SOURCE_GLOBS,
  ALL_DEP_FILES,
  detectLanguages,
} from './languages.ts';
import { tmpDir, writeRepo } from './tests/helpers.ts';

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

test('detectLanguages excludes htmlcov JS files (generated coverage assets are not language evidence)', () => {
  const repo = tmpDir('awos-lang-htmlcov-');
  try {
    writeRepo(repo, {
      'htmlcov/coverage_html_cb_dd2e7eb5.js': 'var x=1;\n',
      'src/a.py': 'print(1)\n',
      'pyproject.toml': '[project]\nname="x"\n',
    });

    const langs = detectLanguages(repo);
    const names = langs.map((l) => l.def.displayName).sort();
    assert.deepEqual(
      names,
      ['Python'],
      `htmlcov/*.js must not be counted as JavaScript; got ${names.join(',')}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLanguages evidence labels the extensions actually matched (.tsx-only repo is not ".ts files")', () => {
  // Regression: the label derived its extension from sourceGlobs[0], so a
  // .tsx-only repo was described as "N .ts files". The label must reflect the
  // extensions of the files that actually matched.
  const repo = tmpDir('awos-lang-tsx-');
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'App.tsx'), 'export const A = 1;\n');
    writeFileSync(join(repo, 'src', 'Nav.tsx'), 'export const N = 1;\n');

    const langs = detectLanguages(repo);
    const ts = langs.find((l) => l.def.id === 'typescript');
    assert.ok(ts, 'a .tsx-only repo must still detect TypeScript');
    assert.match(
      ts.evidence,
      /2 \.tsx files/,
      `evidence must cite the .tsx extension actually found, not sourceGlobs[0]'s .ts; got "${ts.evidence}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLanguages evidence lists every matched extension for a mixed .ts/.tsx repo', () => {
  const repo = tmpDir('awos-lang-mixed-');
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'util.ts'), 'export const U = 1;\n');
    writeFileSync(join(repo, 'src', 'App.tsx'), 'export const A = 1;\n');

    const langs = detectLanguages(repo);
    const ts = langs.find((l) => l.def.id === 'typescript');
    assert.ok(ts, 'a mixed .ts/.tsx repo must detect TypeScript');
    assert.match(
      ts.evidence,
      /2 \.ts\/\.tsx files/,
      `evidence must list both matched extensions (.ts and .tsx); got "${ts.evidence}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('Java/Kotlin/Scala testFileGlobs recognize Maven/Gradle failsafe IT suffix (issue #149)', () => {
  const java = LANGUAGES.find((l) => l.id === 'java')!;
  assert.ok(
    java.testFileGlobs.includes('*IT.java'),
    'Java testFileGlobs must include *IT.java'
  );
  assert.ok(
    java.testFileGlobs.includes('*ITCase.java'),
    'Java testFileGlobs must include *ITCase.java'
  );

  const kotlin = LANGUAGES.find((l) => l.id === 'kotlin')!;
  assert.ok(
    kotlin.testFileGlobs.includes('*IT.kt'),
    'Kotlin testFileGlobs must include *IT.kt'
  );

  const scala = LANGUAGES.find((l) => l.id === 'scala')!;
  assert.ok(
    scala.testFileGlobs.includes('*IT.scala'),
    'Scala testFileGlobs must include *IT.scala'
  );
});

test('detectLanguages requires real source files (Makefile alone is not C/C++)', () => {
  const repo = tmpDir('awos-lang-');
  try {
    // a C file ONLY inside an ignored dir must not trigger C
    writeRepo(repo, {
      Makefile: 'test:\n\tpytest\n',
      'pyproject.toml': '[project]\nname="x"\n',
      'src/a.py': 'print(1)\n',
      'src/b.py': 'print(2)\n',
      '.venv/native.c': 'int main(){}\n',
    });

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
