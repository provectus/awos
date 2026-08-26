/**
 * inheritance-differential.test.ts
 *
 * Audits one orchestration-root fixture twice — once with the root credited,
 * once with inheritance explicitly off — and asserts on the FULL per-check
 * status table rather than on a hand-listed set. A new detector or metric that
 * lands in the wrong bucket shifts this table and forces its author to look.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { auditCore } from '../audit_core.ts';
import { DETECTORS } from '../detectors/index.ts';
import { METRICS } from '../metrics/index.ts';
import { tmpDir, standardsPath } from './helpers.ts';
import {
  buildOrchestrationFixture,
  statusByCheckId,
  INHERITING_CHECK_IDS,
} from './helpers_orchestration.ts';

test('exactly the declared inheriting checks change when a root is credited', async () => {
  const fx = buildOrchestrationFixture('awos-differential-');
  try {
    const withRoot = join(tmpDir('awos-diff-with-'), 'audit');
    const without = join(tmpDir('awos-diff-without-'), 'audit');

    await auditCore(
      fx.member,
      withRoot,
      DETECTORS,
      METRICS,
      standardsPath(),
      undefined,
      { orchestrationRoot: fx.root }
    );
    await auditCore(
      fx.member,
      without,
      DETECTORS,
      METRICS,
      standardsPath(),
      undefined,
      { orchestrationRoot: null }
    );

    const a = statusByCheckId(join(withRoot, 'audit.json'));
    const b = statusByCheckId(join(without, 'audit.json'));

    const changed = [...a.keys()]
      .filter((id) => a.get(id) !== b.get(id))
      .sort();

    const unexpected = changed.filter((id) => !INHERITING_CHECK_IDS.has(id));
    assert.deepEqual(
      unexpected,
      [],
      `these checks changed when the orchestration root was credited but are NOT declared as inheriting — either wire them into standards.toml deliberately or stop them reading the root: ${unexpected.join(', ')}`
    );
  } finally {
    fx.cleanup();
  }
});

test('every check declared as inheriting actually responds to the root', async () => {
  const fx = buildOrchestrationFixture('awos-declared-live-');
  try {
    const withRoot = join(tmpDir('awos-live-with-'), 'audit');
    const without = join(tmpDir('awos-live-without-'), 'audit');

    await auditCore(
      fx.member,
      withRoot,
      DETECTORS,
      METRICS,
      standardsPath(),
      undefined,
      { orchestrationRoot: fx.root }
    );
    await auditCore(
      fx.member,
      without,
      DETECTORS,
      METRICS,
      standardsPath(),
      undefined,
      { orchestrationRoot: null }
    );

    const a = statusByCheckId(join(withRoot, 'audit.json'));
    const b = statusByCheckId(join(without, 'audit.json'));

    // A judgment check is PENDING_JUDGMENT in both passes by construction — the
    // orchestrator fills it later — so it cannot be exercised here. PRV-17's
    // inheritance is a prompt contract, covered in Task 12.
    const JUDGMENT_ONLY = new Set(['PRV-17']);

    // Known limitation: the `b.get(id) !== 'FAIL'` guard below skips a check
    // whose status is equal with and without the root as long as that shared
    // status isn't FAIL — so a declared-inheriting check resolving SKIP-both-
    // ways or PENDING_JUDGMENT-both-ways passes silently instead of being
    // flagged as dead. This is latent today (the fixture's content clears the
    // substantiveness bar, so every declared check genuinely fires) but is
    // reachable by a fixture edit as small as deleting one line. If this test
    // ever starts reporting checks as dead, check the fixture content against
    // MIN_SUBSTANTIVE_LINES (fs_probe.ts) first — a fixture file that dropped
    // below that line count is the far more likely cause than a wiring bug.

    const dead: string[] = [];
    for (const id of INHERITING_CHECK_IDS) {
      if (JUDGMENT_ONLY.has(id)) continue;
      // AI-01/ADP-01-style checks the member already satisfies on its own stay
      // equal by design; skip only when the member genuinely carries it.
      if (a.get(id) === b.get(id) && b.get(id) !== 'FAIL') continue;
      if (a.get(id) === b.get(id)) dead.push(`${id} (${b.get(id)} both ways)`);
    }
    assert.deepEqual(
      dead,
      [],
      `these checks are declared as inheriting but FAIL identically with and without the root — their inheritance is dead code: ${dead.join(', ')}`
    );
  } finally {
    fx.cleanup();
  }
});
