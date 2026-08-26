// audit-core-orchestration.test.ts — the orchestration root is resolved once,
// persisted, and recovered by enrich rather than re-detected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { auditCore } from '../audit_core.ts';
import { DETECTORS } from '../detectors/index.ts';
import { METRICS } from '../metrics/index.ts';
import { tmpDir, standardsPath } from './helpers.ts';

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'README.md'), '# repo\n');
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@e.x', 'commit', '-qm', 'init'],
    { cwd: dir, stdio: 'ignore' }
  );
}

// detectOrchestrationRelation canonicalizes via realpathSync (topology.ts),
// so on macOS — where /var symlinks to /private/var — the resolved root
// differs from the raw tmpDir() path even though they name the same
// directory. Compare against the same canonical form the production code
// produces rather than asserting byte-identity with the unresolved path.
function realRoot(dir: string): string {
  return realpathSync(dir).replace(/\/+$/, '');
}

function writeTooling(dir: string): void {
  mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'commands', 'ship.md'),
    '# Ship\n\nReal content.\nLine four.\nLine five.\nLine six.\nLine seven.\n'
  );
}

test('audit-core auto-detects the orchestration root and persists it', async () => {
  const root = tmpDir('awos-ac-orch-');
  try {
    initRepo(root);
    writeTooling(root);
    const member = join(root, 'services', 'api');
    initRepo(member);
    const out = join(tmpDir('awos-ac-out-'), 'audit');

    const summary = await auditCore(
      member,
      out,
      DETECTORS,
      METRICS,
      standardsPath()
    );
    assert.equal(
      summary.orchestration_root,
      realRoot(root),
      'audit-core must auto-detect the orchestration root so an audit run from inside a member needs no flag'
    );

    const git = JSON.parse(
      readFileSync(join(out, 'collected', 'git.json'), 'utf8')
    );
    assert.equal(
      git.raw.orchestration_root,
      realRoot(root),
      'the root must be persisted into collected/git.json, which is how enrich recovers it'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an explicit null disables inheritance — how the root audits itself', async () => {
  const root = tmpDir('awos-ac-orch-null-');
  try {
    initRepo(root);
    writeTooling(root);
    const member = join(root, 'services', 'api');
    initRepo(member);
    const out = join(tmpDir('awos-ac-out-null-'), 'audit');

    const summary = await auditCore(
      member,
      out,
      DETECTORS,
      METRICS,
      standardsPath(),
      undefined,
      { orchestrationRoot: null }
    );
    assert.equal(
      summary.orchestration_root,
      null,
      'null must mean "inheritance explicitly off", distinct from undefined meaning "auto-detect"'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('enrich recovers the root from collected/git.json rather than re-detecting', async () => {
  const root = tmpDir('awos-ac-enrich-');
  try {
    initRepo(root);
    writeTooling(root);
    const member = join(root, 'services', 'api');
    initRepo(member);
    const out = join(tmpDir('awos-ac-enrich-out-'), 'audit');

    await auditCore(member, out, DETECTORS, METRICS, standardsPath());
    const enriched = await auditCore(
      member,
      out,
      DETECTORS,
      METRICS,
      standardsPath(),
      join(out, 'collected')
    );
    assert.equal(
      enriched.orchestration_root,
      realRoot(root),
      'enrich must carry the same root as the first pass, so the two passes cannot disagree'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('widening the agent-file flag does not un-SKIP non-inheriting checks', async () => {
  const root = tmpDir('awos-ac-collateral-');
  try {
    initRepo(root);
    writeTooling(root);
    const member = join(root, 'services', 'api');
    initRepo(member);
    const out = join(tmpDir('awos-ac-collateral-out-'), 'audit');

    await auditCore(member, out, DETECTORS, METRICS, standardsPath());
    const audit = JSON.parse(readFileSync(join(out, 'audit.json'), 'utf8'));
    const byId = new Map<string, { status: string; evidence: string[] }>(
      (audit.dimensions ?? []).flatMap((d: any) =>
        (d.checks ?? []).map((c: any) => [
          c.check_id,
          { status: c.status, evidence: c.evidence ?? [] },
        ])
      )
    );

    for (const id of ['AIS-01', 'AIS-02', 'AIS-05']) {
      const check = byId.get(id);
      assert.equal(
        check?.status,
        'SKIP',
        `${id} gates on topology.has_ai_agent_files but does NOT inherit — widening that flag for everyone would turn its neutral SKIP into a FAIL in every member repo, cancelling the fairness fix this work exists for`
      );
      // The status assertion above is not enough on its own: these detectors
      // also defensively SKIP when they find no agent files in repoPath, so a
      // wrongly-widened gate would still read SKIP here even though the check
      // was routed into the detector instead of being gated off. Pin the
      // evidence text buildSkipReason() produces for a gate-level SKIP —
      // "Not applicable — ..." — which is distinct from the detector's own
      // "no AI agent instruction files found" message, so this genuinely
      // fails if the widened topology view leaks into these checks' gate.
      assert.ok(
        check?.evidence.some(
          (e) =>
            e.includes('Not applicable') && e.includes('has_ai_agent_files')
        ),
        `${id} must be gated off by applies_when (evidence: ${JSON.stringify(check?.evidence)}) — reaching the detector at all means the wrong topology view was used for this non-inheriting check`
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
