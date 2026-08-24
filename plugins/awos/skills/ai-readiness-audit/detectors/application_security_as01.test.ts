// detectors/application_security_as01.test.ts
//
// Regression pin for issue #156 (evidence-observation correction): AS-01's
// PASS evidence used to hand-type the list of config globs it scanned
// (`(*.env, *.yaml/yml, *.toml, *.ini/cfg/conf, *.json)`), which had already
// drifted once — it omitted `*.env.*`. The fix interpolates the actual
// `TLS_CONFIG_GLOBS` constant instead, mirroring the `ROOT_RUN_FILES.join(
// ', ')` pattern in `ai_development_tooling.ts`. This pins that every glob
// the detector actually scans is present in the PASS evidence, so a future
// edit to `TLS_CONFIG_GLOBS` can't silently drift from what the evidence
// claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { detectTlsEnforced, TLS_CONFIG_GLOBS } from './application_security.ts';
import { tmpDir } from '../tests/helpers.ts';

test('AS-01 PASS evidence names every glob in TLS_CONFIG_GLOBS, not a hand-typed copy of it', () => {
  const repo = tmpDir('awos-as01-globs-');
  try {
    writeFileSync(
      join(repo, 'config.yaml'),
      'database_url: "https://db.example.com"\n'
    );
    const res = detectTlsEnforced(repo);
    assert.equal(
      res.status,
      'PASS',
      `no plain-HTTP URLs must be PASS; got ${res.status}`
    );
    const text = (res.evidence ?? []).join(' | ');
    for (const glob of TLS_CONFIG_GLOBS) {
      assert.ok(
        text.includes(glob),
        `PASS evidence must list every glob TLS_CONFIG_GLOBS actually scans (a hand-typed list drifts from the constant it claims to describe) — missing "${glob}"; got ${JSON.stringify(res.evidence)}`
      );
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
