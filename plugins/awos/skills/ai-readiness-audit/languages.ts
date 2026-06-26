import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface LanguageDef {
  id: string;
  displayName: string;
  sourceGlobs: string[];
  testFileGlobs: string[];
  testDirNames: string[];
  depFiles: string[];
  importRx?: RegExp;
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
  },
  {
    id: 'typescript',
    displayName: 'TypeScript',
    sourceGlobs: ['*.ts', '*.tsx'],
    testFileGlobs: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
    testDirNames: ['__tests__', 'test', 'tests'],
    depFiles: ['package.json', 'tsconfig.json'],
    importRx: /import\s.*from\s+['"]([^'"]+)['"]/,
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
  },
  {
    id: 'go',
    displayName: 'Go',
    sourceGlobs: ['*.go'],
    testFileGlobs: ['*_test.go'],
    testDirNames: ['test', 'tests'],
    depFiles: ['go.mod', 'go.sum'],
    importRx: /import\s+(?:\(\s*)?["]([^"]+)["]/,
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
export const ALL_TEST_DIRS = uniq(LANGUAGES.flatMap((l) => l.testDirNames));
export const ALL_DEP_FILES = uniq(LANGUAGES.flatMap((l) => l.depFiles));

export function detectLanguages(repoPath: string): LanguageDef[] {
  return LANGUAGES.filter((l) =>
    l.depFiles.some((f) => !f.includes('*') && existsSync(join(repoPath, f)))
  );
}
