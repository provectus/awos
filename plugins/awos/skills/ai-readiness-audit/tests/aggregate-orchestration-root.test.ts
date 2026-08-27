// aggregate-orchestration-root.test.ts — the seam between audit-core and the
// post-audit patch verbs.
//
// audit-core writes `orchestration_root` onto audit.json, and render.ts gates
// the whole cross-boundary note on `audit.orchestration_root != null`. But
// every audit runs patch-judgment (which calls aggregate()) before render, and
// aggregate() rebuilds audit.json from the per-dimension files, carrying only
// an explicit allow-list of blocks forward. render.test.ts hand-constructs its
// audit object, so it exercises the renderer's gate but never this seam.
// These tests run the real pipeline — auditCore → aggregate → renderMarkdown —
// so a field dropped in the rebuild fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { auditCore } from '../audit_core.ts';
import { aggregate } from '../audit_patch.ts';
import { DETECTORS } from '../detectors/index.ts';
import { METRICS } from '../metrics/index.ts';
import { renderMarkdown } from '../render.ts';
import type { AuditJson } from '../artifact_types.ts';
import { tmpDir, standardsPath } from './helpers.ts';
import { buildOrchestrationFixture } from './helpers_orchestration.ts';

function readAudit(outDir: string): AuditJson {
  return JSON.parse(
    readFileSync(join(outDir, 'audit.json'), 'utf8')
  ) as AuditJson;
}

test('aggregate() carries orchestration_root forward so the cross-boundary note still renders', async () => {
  const fx = buildOrchestrationFixture('awos-agg-orch-');
  try {
    const out = join(tmpDir('awos-agg-out-'), 'audit');
    await auditCore(fx.member, out, DETECTORS, METRICS, standardsPath());

    const before = readAudit(out);
    assert.equal(
      before.orchestration_root,
      realpathSync(fx.root).replace(/\/+$/, ''),
      'precondition: audit-core must have written the orchestration root onto audit.json'
    );

    aggregate(out);

    const after = readAudit(out);
    assert.equal(
      after.orchestration_root,
      before.orchestration_root,
      'aggregate() must carry audit.orchestration_root forward — patch-judgment aggregates before every render, so dropping it here silently disables the cross-boundary note for every real audit'
    );

    const md = renderMarkdown(after);
    assert.ok(
      md.includes('cross-boundary limitation'),
      'the rendered report of an orchestration member must carry the cross-boundary limitation note on SDD-04/DOC-07 — its render gate reads audit.orchestration_root, which aggregate() must not have dropped'
    );
  } finally {
    fx.cleanup();
  }
});

test('aggregate() preserves a null orchestration_root without inventing a note', async () => {
  const fx = buildOrchestrationFixture('awos-agg-noorch-');
  try {
    // Auditing the root itself: it is nobody's member, so the field is null.
    const out = join(tmpDir('awos-agg-noorch-out-'), 'audit');
    await auditCore(fx.root, out, DETECTORS, METRICS, standardsPath());
    assert.equal(
      readAudit(out).orchestration_root,
      null,
      'precondition: a repo that is not an orchestration member records a null root'
    );

    aggregate(out);

    const after = readAudit(out);
    assert.equal(
      after.orchestration_root,
      null,
      'a null orchestration_root is meaningful ("no root") and must survive aggregate() as null'
    );
    assert.ok(
      !renderMarkdown(after).includes('cross-boundary limitation'),
      'a non-member repo must not be annotated with the cross-boundary limitation note'
    );
  } finally {
    fx.cleanup();
  }
});
