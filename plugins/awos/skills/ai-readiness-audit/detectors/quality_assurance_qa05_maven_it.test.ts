// detectors/quality_assurance_qa05_maven_it.test.ts — issue #149: the audit
// engine was blind to Maven/Gradle failsafe integration tests (*IT.java /
// *ITCase.java, an it/ dir under src/test/), so QA-05 never saw them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { runDetector, tmpDir, writeRepo } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2502, repo);

test('QA-05 (issue #149): Maven failsafe FooIT.java under src/test/.../it/ is detected as an integration test', () => {
  const repo = tmpDir('awos-qa05-it-');
  try {
    writeRepo(repo, {
      'backend/src/main/java/com/example/Foo.java': 'public class Foo {}\n',
      'backend/src/test/java/com/example/it/FooIT.java':
        'public class FooIT {}\n',
      'pom.xml': '<project></project>\n',
    });
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `FooIT.java under src/test/.../it/ must be detected as an integration test; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('QA-05 (issue #149): *ITCase.java suffix is recognized as an integration test file name', () => {
  const repo = tmpDir('awos-qa05-itcase-');
  try {
    writeRepo(repo, {
      'src/main/java/com/example/Foo.java': 'public class Foo {}\n',
      'src/test/java/com/example/FooITCase.java': 'public class FooITCase {}\n',
      'pom.xml': '<project></project>\n',
    });
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `*ITCase.java must be recognized as an integration test file name; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('QA-05 (issue #149): case sensitivity — unit.java / visit.java are not swept in as IT-suffix test files', () => {
  const repo = tmpDir('awos-qa05-case-');
  try {
    writeRepo(repo, {
      'src/main/java/com/example/Foo.java': 'public class Foo {}\n',
      // Neither matches any Java testFileGlobs pattern; a case-insensitive
      // "IT.java$" match would wrongly treat these as failsafe IT tests.
      'src/test/java/com/example/unit.java': 'public class unit {}\n',
      'src/test/java/com/example/visit.java': 'public class visit {}\n',
      'pom.xml': '<project></project>\n',
    });
    const res = detect(repo);
    assert.equal(
      res.status,
      'FAIL',
      `unit.java/visit.java must not be misclassified as integration test files; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('QA-05 (issue #149): the IT-suffix file-name check stays case-sensitive on an actual test file', () => {
  const repo = tmpDir('awos-qa05-case-suffix-');
  try {
    writeRepo(repo, {
      'src/main/java/com/example/Foo.java': 'public class Foo {}\n',
      // Matches Java's "Test*.java" glob (so it IS a recognized test file),
      // but its basename ends in lowercase "it.java" — the new IT-suffix
      // check must not fire on it (case-sensitive uppercase IT only).
      'src/test/java/com/example/Testit.java': 'public class Testit {}\n',
      'pom.xml': '<project></project>\n',
    });
    const res = detect(repo);
    const hits = (res.evidence as string[]).filter((e) =>
      e.includes('Testit.java')
    );
    assert.equal(
      hits.length,
      0,
      `Testit.java must not be flagged as an integration-file-name signal (case-sensitive IT suffix); got ${JSON.stringify(hits)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('QA-05 (issue #149): an it/ directory NOT under a test root does not by itself signal integration tests', () => {
  const repo = tmpDir('awos-qa05-it-not-test-root-');
  try {
    writeRepo(repo, {
      'src/main/java/com/example/Foo.java': 'public class Foo {}\n',
      // Italian-locale-style "it/" dir under main/, unrelated to tests.
      'src/main/resources/it/messages.properties': 'greeting=Ciao\n',
      'pom.xml': '<project></project>\n',
    });
    const res = detect(repo);
    assert.equal(
      res.status,
      'FAIL',
      `an it/ dir outside a test root must not by itself signal integration tests; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
