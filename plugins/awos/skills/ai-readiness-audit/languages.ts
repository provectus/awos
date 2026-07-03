import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { iterFiles } from './detectors/_base.ts';

export interface LanguageDef {
  id: string;
  displayName: string;
  sourceGlobs: string[];
  testFileGlobs: string[];
  testDirNames: string[];
  depFiles: string[];
  importRx?: RegExp;
  sizeThreshold?: number;
  /**
   * AST node types that should carry a doc-comment, for doc-coverage
   * (adp_g13_doc_coverage). Tree-sitter node type names confirmed against the
   * bundled grammars. Populated only for languages with a well-defined
   * doc-comment convention; the metric's per-language doc/export logic keys off
   * the language `id`.
   */
  docConvention?: {
    documentableNodeTypes: string[];
  };
}

export const LANGUAGES: LanguageDef[] = [
  {
    id: 'javascript',
    displayName: 'JavaScript',
    sourceGlobs: ['*.js', '*.jsx', '*.mjs', '*.cjs'],
    testFileGlobs: ['*.test.js', '*.test.jsx', '*.spec.js', '*.spec.jsx'],
    testDirNames: ['__tests__', 'test', 'tests'],
    depFiles: ['package.json'],
    importRx:
      /(?:import\s.*from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/,
    docConvention: {
      documentableNodeTypes: [
        'function_declaration',
        'method_definition',
        'class_declaration',
      ],
    },
  },
  {
    id: 'typescript',
    displayName: 'TypeScript',
    sourceGlobs: ['*.ts', '*.tsx'],
    testFileGlobs: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
    testDirNames: ['__tests__', 'test', 'tests'],
    depFiles: ['package.json', 'tsconfig.json'],
    importRx: /import\s.*from\s+['"]([^'"]+)['"]/,
    docConvention: {
      documentableNodeTypes: [
        'function_declaration',
        'method_definition',
        'class_declaration',
      ],
    },
  },
  {
    id: 'python',
    displayName: 'Python',
    sourceGlobs: ['*.py'],
    testFileGlobs: ['test_*.py', '*_test.py'],
    testDirNames: ['tests', 'test'],
    depFiles: [
      'requirements.txt',
      'pyproject.toml',
      'Pipfile',
      'poetry.lock',
      'setup.cfg',
      'setup.py',
    ],
    importRx: /(?:from\s+(\S+)\s+import|import\s+(\S+))/,
    docConvention: {
      documentableNodeTypes: [
        'function_definition',
        'class_definition',
        'module',
      ],
    },
  },
  {
    id: 'go',
    displayName: 'Go',
    sourceGlobs: ['*.go'],
    testFileGlobs: ['*_test.go'],
    testDirNames: ['test', 'tests'],
    depFiles: ['go.mod', 'go.sum'],
    importRx: /import\s+(?:\(\s*)?["]([^"]+)["]/,
    sizeThreshold: 500,
    docConvention: {
      documentableNodeTypes: [
        'function_declaration',
        'method_declaration',
        'type_declaration',
      ],
    },
  },
  {
    id: 'java',
    displayName: 'Java',
    sourceGlobs: ['*.java'],
    testFileGlobs: ['*Test.java', 'Test*.java', '*Tests.java'],
    testDirNames: ['test', 'tests'],
    depFiles: [
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
    ],
    importRx: /import\s+([\w.]+);/,
    sizeThreshold: 500,
    docConvention: {
      documentableNodeTypes: ['method_declaration', 'class_declaration'],
    },
  },
  {
    id: 'kotlin',
    displayName: 'Kotlin',
    sourceGlobs: ['*.kt', '*.kts'],
    testFileGlobs: ['*Test.kt', '*Spec.kt', '*Tests.kt'],
    testDirNames: ['test', 'tests'],
    depFiles: [
      'build.gradle.kts',
      'build.gradle',
      'pom.xml',
      'settings.gradle.kts',
    ],
    importRx: /import\s+([\w.]+)/,
    sizeThreshold: 450,
    docConvention: {
      documentableNodeTypes: ['function_declaration', 'class_declaration'],
    },
  },
  {
    id: 'ruby',
    displayName: 'Ruby',
    sourceGlobs: ['*.rb'],
    testFileGlobs: ['*_spec.rb', '*_test.rb'],
    testDirNames: ['spec', 'test'],
    depFiles: ['Gemfile', 'Gemfile.lock', '*.gemspec'],
    importRx: /require(?:_relative)?\s+['"]([^'"]+)['"]/,
  },
  {
    id: 'php',
    displayName: 'PHP',
    sourceGlobs: ['*.php'],
    testFileGlobs: ['*Test.php'],
    testDirNames: ['tests', 'test'],
    depFiles: ['composer.json', 'composer.lock'],
    importRx: /(?:use|require|include)\s+([\w\\]+)/,
  },
  {
    id: 'c',
    displayName: 'C',
    sourceGlobs: ['*.c', '*.h'],
    testFileGlobs: ['*_test.c', 'test_*.c'],
    testDirNames: ['test', 'tests'],
    depFiles: ['Makefile', 'CMakeLists.txt', 'conanfile.txt'],
    importRx: /#include\s+["<]([^">]+)[">]/,
  },
  {
    id: 'cpp',
    displayName: 'C++',
    sourceGlobs: ['*.cpp', '*.cc', '*.cxx', '*.hpp', '*.hh'],
    testFileGlobs: ['*_test.cpp', '*_test.cc', 'test_*.cpp'],
    testDirNames: ['test', 'tests'],
    depFiles: ['CMakeLists.txt', 'conanfile.txt', 'vcpkg.json', 'Makefile'],
    importRx: /#include\s+["<]([^">]+)[">]/,
  },
  {
    id: 'csharp',
    displayName: 'C#',
    sourceGlobs: ['*.cs'],
    testFileGlobs: ['*Test.cs', '*Tests.cs'],
    testDirNames: ['test', 'tests'],
    depFiles: [
      '*.csproj',
      '*.sln',
      'packages.config',
      'Directory.Packages.props',
    ],
    importRx: /using\s+([\w.]+);/,
    sizeThreshold: 500,
  },
  {
    id: 'rust',
    displayName: 'Rust',
    sourceGlobs: ['*.rs'],
    testFileGlobs: ['*_test.rs'],
    testDirNames: ['tests'],
    depFiles: ['Cargo.toml', 'Cargo.lock'],
    importRx: /use\s+([\w:]+)/,
  },
  {
    id: 'swift',
    displayName: 'Swift',
    sourceGlobs: ['*.swift'],
    testFileGlobs: ['*Tests.swift', '*Test.swift'],
    testDirNames: ['Tests', 'tests'],
    depFiles: ['Package.swift', '*.xcodeproj', 'Podfile'],
    importRx: /import\s+(\w+)/,
  },
  {
    id: 'scala',
    displayName: 'Scala',
    sourceGlobs: ['*.scala', '*.sc'],
    testFileGlobs: ['*Spec.scala', '*Test.scala'],
    testDirNames: ['test', 'tests'],
    depFiles: ['build.sbt', 'build.sc'],
    importRx: /import\s+([\w.]+)/,
    sizeThreshold: 450,
  },
  {
    id: 'dart',
    displayName: 'Dart',
    sourceGlobs: ['*.dart'],
    testFileGlobs: ['*_test.dart'],
    testDirNames: ['test', 'tests'],
    depFiles: ['pubspec.yaml', 'pubspec.lock'],
    importRx: /import\s+['"]([^'"]+)['"]/,
  },
];

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const ALL_SOURCE_GLOBS = uniq(LANGUAGES.flatMap((l) => l.sourceGlobs));
export const ALL_TEST_GLOBS = uniq(LANGUAGES.flatMap((l) => l.testFileGlobs));
export const ALL_DEP_FILES = uniq(LANGUAGES.flatMap((l) => l.depFiles));

export interface DetectedLanguage {
  def: LanguageDef;
  evidence: string;
}

/**
 * A language is "present" when it has at least one real source file (its
 * sourceGlobs) outside ignored dirs (.venv/node_modules/etc., via iterFiles's
 * DEFAULT_IGNORE). Shared build files (Makefile, CMakeLists) alone do NOT count
 * — that produced false C/C++ on Python repos. Evidence cites the source-file
 * count plus any matching dependency manifest.
 */
export function detectLanguages(repoPath: string): DetectedLanguage[] {
  const out: DetectedLanguage[] = [];
  for (const def of LANGUAGES) {
    const files = iterFiles(repoPath, def.sourceGlobs);
    const count = files.length;
    if (count === 0) continue;
    const dep = def.depFiles.find(
      (f) => !f.includes('*') && existsSync(join(repoPath, f))
    );
    // Label with the extensions actually matched, not sourceGlobs[0] — a
    // .tsx-only repo must read "3 .tsx files", not "3 .ts files".
    const exts = uniq(
      files.map((f) => extname(f).toLowerCase()).filter(Boolean)
    ).sort();
    const label = exts.length > 0 ? exts.join('/') : def.sourceGlobs.join('/');
    const evidence = `${count} ${label} file${count === 1 ? '' : 's'}${dep ? ` · ${dep}` : ''}`;
    out.push({ def, evidence });
  }
  return out;
}

const DEFAULT_SIZE_THRESHOLD = 300;

/** Per-language max reasonable file size (lines); falls back to 300. */
export function sizeThresholdForFile(repoRelPath: string): number {
  const ext = extname(repoRelPath).toLowerCase();
  const lang = LANGUAGES.find((l) =>
    l.sourceGlobs.some((g) => g.toLowerCase().endsWith(ext))
  );
  return lang?.sizeThreshold ?? DEFAULT_SIZE_THRESHOLD;
}
