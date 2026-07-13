/**
 * prevention-flow.test.ts — end-to-end contract of the prevention linkage
 * through the engine verbs: audit-core emits the PRV checks + a pending-tier
 * prevention block in audit.json (dimension files stay annotation-free);
 * patch-judgment finalizes tiers via its aggregate(); report-context exposes
 * the block; a second bare aggregate() is idempotent.
 *
 * Structured as ONE parent test with awaited subtests (not a top-level
 * before() hook): on Node 20 a top-level async before() does not reliably
 * block subtests when it awaits real I/O (the tree-sitter WASM loads inside
 * the metric registry), and the tsx CJS transform rules out top-level await.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditCore } from '../audit_core.ts';
import {
  aggregate,
  patchJudgments,
  reportContext,
  type JudgmentPatch,
} from '../audit_patch.ts';
import { DETECTORS } from '../detectors/index.ts';
import { METRICS } from '../metrics/index.ts';
import { tmpDir, writeRepo, gitAs } from './helpers.ts';

const SKILL_ROOT = new URL('..', import.meta.url).pathname;
const STANDARDS_PATH = join(SKILL_ROOT, 'references', 'standards.toml');

test('prevention linkage flows through audit-core → patch-judgment → report-context → aggregate', async (t) => {
  const REPO = tmpDir('prv-flow-repo-');
  // A small repo with: agent instruction files (PRV-07/PRV-17 apply), a
  // package ecosystem (PRV-02/PRV-12 apply), a gated secret scanner
  // (secrets-hygiene → enforced), and no CI (testing-discipline → E FAIL,
  // so the tier hangs on the pending instruction verdict).
  writeRepo(REPO, {
    'CLAUDE.md': '# Project rules\n\nNever commit credentials.\n',
    'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3 }),
    '.pre-commit-config.yaml':
      'repos:\n  - repo: https://github.com/gitleaks/gitleaks\n    hooks:\n      - id: gitleaks\n',
    'src/index.js': 'module.exports = 1;\n',
  });
  gitAs(REPO, ['init', '-q'], '2026-01-01T00:00:00Z', 'T', 't@t.t');
  gitAs(REPO, ['add', '.'], '2026-01-01T00:00:00Z', 'T', 't@t.t');
  gitAs(
    REPO,
    ['commit', '-q', '-m', 'init'],
    '2026-01-01T00:00:00Z',
    'T',
    't@t.t'
  );
  const OUT = tmpDir('prv-flow-out-');
  await auditCore(REPO, OUT, DETECTORS, METRICS, STANDARDS_PATH);

  const readAudit = (): Record<string, any> =>
    JSON.parse(readFileSync(join(OUT, 'audit.json'), 'utf8'));
  const readPrvDim = (): Record<string, any> =>
    JSON.parse(readFileSync(join(OUT, 'prevention-coverage.json'), 'utf8'));

  await t.test(
    'audit-core lists all 8 PRV instruction checks as PENDING_JUDGMENT',
    () => {
      const pendingIds = readPrvDim()
        .checks.filter((c: any) => c.status === 'PENDING_JUDGMENT')
        .map((c: any) => c.check_id)
        .sort();
      assert.deepEqual(
        pendingIds,
        [
          'PRV-11',
          'PRV-12',
          'PRV-13',
          'PRV-14',
          'PRV-15',
          'PRV-16',
          'PRV-17',
          'PRV-18',
        ],
        'every applicable instruction check must await a judgment verdict'
      );
    }
  );

  await t.test(
    'PRV dimension checks are self-describing (cluster/covers_checks/prevention_kind)',
    () => {
      const prvDim = readPrvDim();
      const enforcement = prvDim.checks.find(
        (c: any) => c.check_id === 'PRV-01'
      );
      assert.equal(enforcement.cluster, 'secrets-hygiene');
      assert.equal(enforcement.prevention_kind, 'enforcement');
      assert.deepEqual(enforcement.covers_checks, [
        'AS-05',
        'AS-12',
        'AS-13',
        'AS-14',
      ]);
      const instruction = prvDim.checks.find(
        (c: any) => c.check_id === 'PRV-11'
      );
      assert.equal(instruction.cluster, 'secrets-hygiene');
      assert.equal(instruction.prevention_kind, 'instruction');
      assert.equal(
        instruction.covers_checks,
        undefined,
        'covers_checks lives on the enforcement half only'
      );
    }
  );

  await t.test(
    'audit.json carries the prevention block: gated secrets enforced, no-CI testing pending',
    () => {
      const audit = readAudit();
      assert.ok(audit.prevention, 'audit.json must carry the prevention block');
      const secrets = audit.prevention.clusters.find(
        (c: any) => c.cluster === 'secrets-hygiene'
      );
      assert.equal(
        secrets.tier,
        'enforced',
        'gitleaks in .pre-commit-config.yaml is an enforcement gate'
      );
      const testing = audit.prevention.clusters.find(
        (c: any) => c.cluster === 'testing-discipline'
      );
      assert.equal(
        testing.tier,
        'pending',
        'no CI gate → the tier waits on the instruction judgment'
      );
      assert.ok(audit.prevention.summary.pending > 0);
    }
  );

  await t.test(
    'prevention annotations exist in audit.json only — per-dimension files stay pure',
    () => {
      const audit = readAudit();
      const appsecInAudit = audit.dimensions.find(
        (d: any) => d.dimension === 'application-security'
      );
      const annotatedInAudit = appsecInAudit.checks.filter(
        (c: any) => c.prevention
      );
      assert.ok(
        annotatedInAudit.length > 0,
        'covered application-security checks in audit.json must carry the prevention annotation'
      );
      const appsecFile = JSON.parse(
        readFileSync(join(OUT, 'application-security.json'), 'utf8')
      );
      assert.ok(
        appsecFile.checks.every((c: any) => c.prevention === undefined),
        'the per-dimension artifact must never carry derived prevention annotations'
      );
    }
  );

  await t.test(
    'patch-judgment finalizes tiers; report-context exposes the block; aggregate is idempotent',
    () => {
      const pending = readPrvDim().checks.filter(
        (c: any) => c.status === 'PENDING_JUDGMENT'
      );
      const verdicts: JudgmentPatch[] = pending.map((c: any) => ({
        check_id: c.check_id,
        // The fixture CLAUDE.md states a secrets rule and nothing else.
        status: c.check_id === 'PRV-11' ? 'PASS' : 'FAIL',
        score: c.check_id === 'PRV-11' ? 1 : 0,
        confidence: 1,
        evidence: [
          c.check_id === 'PRV-11'
            ? 'CLAUDE.md: "Never commit credentials."'
            : 'CLAUDE.md read — no rule for this cluster',
        ],
      }));
      patchJudgments(OUT, verdicts);

      const audit = readAudit();
      const tiers = new Map(
        audit.prevention.clusters.map((c: any) => [c.cluster, c.tier])
      );
      assert.equal(
        audit.prevention.summary.pending,
        0,
        'no cluster may stay pending once every instruction verdict is patched'
      );
      assert.equal(tiers.get('secrets-hygiene'), 'enforced');
      assert.equal(
        tiers.get('testing-discipline'),
        'absent',
        'E FAIL + I FAIL → absent after the verdict lands'
      );

      const ctx = reportContext(OUT);
      assert.ok(
        (ctx.prevention as any)?.clusters?.length > 0,
        'report-context must expose the prevention block for narrative authoring'
      );
      const annotated = (ctx.checks as any[]).filter((c) => c.prevention);
      assert.ok(
        annotated.length > 0,
        'report-context per-check projection must carry the prevention annotations'
      );

      const before2 = JSON.stringify(readAudit().prevention);
      aggregate(OUT);
      const after2 = JSON.stringify(readAudit().prevention);
      assert.equal(
        after2,
        before2,
        'a second bare aggregate() must not change the prevention block'
      );
    }
  );
});
