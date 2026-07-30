// detectors/application_security_as07.test.ts
//
// Regression pin for issue #156 (evidence-observation correction, finding A5):
// AS-07's WARN branch used to name pbkdf2/sha256/sha512 as "found" whenever
// detectPasswordSessionHygiene reached WARN with no strong/insecure hash
// signal — including the CSPRNG-only case, where a repo has a CSPRNG
// session-token call and nothing else, so none of those algorithms appear
// anywhere in it. The fix splits the WARN branch on `weakHashFound` so the
// evidence only names an algorithm that was actually matched. Both paths
// keep the same status/score (WARN, 0.5) — this pins an evidence-accuracy
// fix, not a scoring change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(3006, repo);

test('AS-07 CSPRNG-only signal: WARN evidence states the CSPRNG observation and names no hashing algorithm', () => {
  const repo = tmpDir('awos-as07-csprng-');
  try {
    writeFileSync(
      join(repo, 'auth.py'),
      [
        'def authenticate(user):',
        '    session_token = secrets.token_hex(32)',
        '    return session_token',
      ].join('\n') + '\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `a CSPRNG session-token pattern with no hash signal must be WARN; got ${res.status}`
    );
    assert.equal(
      res.score,
      0.5,
      `WARN must score 0.5 regardless of which WARN sub-case is hit; got ${res.score}`
    );
    const text = (res.evidence ?? []).join(' ');
    assert.ok(
      /CSPRNG/.test(text),
      `evidence must state the CSPRNG observation that was actually made; got ${JSON.stringify(res.evidence)}`
    );
    assert.ok(
      !/pbkdf2|sha256|sha512|weaker hashing algorithm/i.test(text),
      `evidence must not claim a hashing algorithm was found — this fixture contains none (the bug this test pins: the old WARN text named pbkdf2/sha256/sha512 on CSPRNG-only repos); got ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-07 weak-hash signal: WARN evidence names the weaker-algorithm observation', () => {
  const repo = tmpDir('awos-as07-weak-');
  try {
    writeFileSync(
      join(repo, 'auth.py'),
      [
        'import hashlib',
        '',
        'def authenticate(user, password):',
        "    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), b'salt', 100000)",
        '    return hashed == user.password_hash',
      ].join('\n') + '\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `a weaker-algorithm pattern near password hashing with no strong algorithm must be WARN; got ${res.status}`
    );
    assert.equal(
      res.score,
      0.5,
      `WARN must score 0.5 regardless of which WARN sub-case is hit; got ${res.score}`
    );
    const text = (res.evidence ?? []).join(' ');
    assert.ok(
      /weaker hashing algorithm/i.test(text),
      `evidence must name the weaker-algorithm observation that was actually made; got ${JSON.stringify(res.evidence)}`
    );
    assert.ok(
      !text.includes('no password-hashing algorithm pattern found'),
      `evidence must not claim no hashing algorithm was found — this fixture has one (the mirror-image false claim: the CSPRNG-only WARN string must not leak into the weak-hash case); got ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
