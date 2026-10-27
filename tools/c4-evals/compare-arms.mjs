#!/usr/bin/env node
// Aggregate a campaign's per-run metrics.json files by arm and apply the
// pre-registered decision rule from docs/2.0/c4-diagram-eval-plan.md.
// Deterministic, no API calls; the readout logic is unit-tested.
//
// CLI: node compare-arms.mjs <campaign-dir>
//   expects run dirs named run-NNN-<arm>/ each containing metrics.json;
//   writes campaign-summary.{json,md} into the campaign dir.

'use strict';

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function mean(xs) {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(
    mean(xs.map((x) => (x - m) ** 2)) * (xs.length / (xs.length - 1))
  );
}

export function totalTokens(metrics) {
  const u = metrics.usage;
  return (
    u.tasksStage.inputTokens +
    u.tasksStage.outputTokens +
    u.implementStage.inputTokens +
    u.implementStage.outputTokens
  );
}

export function summarizeArm(runs) {
  const halluc = runs.map((r) => r.hallucinatedCount);
  const tokens = runs.map(totalTokens);
  return {
    n: runs.length,
    passes: runs.filter((r) => r.testsAllPass).length,
    stalled: runs.filter((r) => r.stalled).length,
    hallucinatedMean: mean(halluc),
    hallucinatedSd: sd(halluc),
    outOfScopeMean: mean(runs.map((r) => r.outOfScopeEdits.length)),
    questionsMean: mean(runs.map((r) => r.questions)),
    tokensMean: mean(tokens),
    tokensSd: sd(tokens),
    durationMsMean: mean(
      runs.map(
        (r) => r.usage.tasksStage.durationMs + r.usage.implementStage.durationMs
      )
    ),
    driftMean: mean(
      runs.map(
        (r) =>
          r.drift.plannedNotTouched.length + r.drift.touchedNotPlanned.length
      )
    ),
  };
}

// Pre-registered pairwise rule: `candidate` beats `baseline` iff
//   (passes_candidate - passes_baseline >= 2
//    OR hallucination mean drops >= 30% with no decrease in passes)
//   AND token regression <= 15%.
export function beats(candidate, baseline) {
  const passGain = candidate.passes - baseline.passes >= 2;
  const hallucDrop =
    baseline.hallucinatedMean > 0 &&
    (baseline.hallucinatedMean - candidate.hallucinatedMean) /
      baseline.hallucinatedMean >=
      0.3 &&
    candidate.passes >= baseline.passes;
  const tokensOk =
    baseline.tokensMean === 0 ||
    candidate.tokensMean <= baseline.tokensMean * 1.15;
  return (passGain || hallucDrop) && tokensOk;
}

// Pre-registered readout table (see the plan doc). A two-arm campaign
// (phase-2 replication, no C) reads out replicated / not-replicated.
export function readout(summaries) {
  const { A, B, C } = summaries;
  const bBeatsA = beats(B, A);
  if (!C || C.n === 0) {
    return bBeatsA
      ? {
          branch: 'replicated',
          verdict: 'B > A on this fixture: the diagram advantage replicates.',
        }
      : {
          branch: 'not-replicated',
          verdict:
            'B ≈ A on this fixture: the diagram advantage does not replicate here.',
        };
  }
  const bBeatsC = beats(B, C);
  if (bBeatsA && bBeatsC) {
    return {
      branch: 'notation-effect',
      verdict:
        'B > A and B > C: the diagram itself helps. Adopt C4 Mermaid per the proposal.',
    };
  }
  if (bBeatsA) {
    return {
      branch: 'information-effect',
      verdict:
        'B > A but B ≈ C: explicitness helps, the Mermaid notation does not. Adopt explicit structure text; diagrams become a humans-only optional convention.',
    };
  }
  return {
    branch: 'falsified',
    verdict:
      'B ≈ A: the agent-side claim is falsified. The proposal downgrades to "useful for humans, optional for agents".',
  };
}

const ARM_LABELS = {
  A: 'A (baseline)',
  B: 'B (diagrams)',
  C: 'C (edge list)',
};

export function renderSummaryMd(summaries, verdict, perRun) {
  const arms = Object.keys(summaries);
  const row = (label, f, digits = 1) =>
    `| ${label} | ${arms.map((a) => f(summaries[a]).toFixed(digits)).join(' | ')} |`;
  const lines = [
    '# C4 eval campaign summary',
    '',
    `**Readout branch:** \`${verdict.branch}\``,
    '',
    verdict.verdict,
    '',
    `| Metric | ${arms.map((a) => ARM_LABELS[a] ?? a).join(' | ')} |`,
    `| --- |${' --- |'.repeat(arms.length)}`,
    row('Runs', (s) => s.n, 0),
    row('Fixture-tests passes', (s) => s.passes, 0),
    row('Stalled runs', (s) => s.stalled, 0),
    row('Hallucinated refs (mean)', (s) => s.hallucinatedMean),
    row('Hallucinated refs (sd)', (s) => s.hallucinatedSd),
    row('Out-of-scope edits (mean)', (s) => s.outOfScopeMean),
    row('Questions (mean)', (s) => s.questionsMean),
    row('Total tokens (mean)', (s) => s.tokensMean, 0),
    row('Total tokens (sd)', (s) => s.tokensSd, 0),
    row('Duration ms (mean)', (s) => s.durationMsMean, 0),
    row('Drift items (mean)', (s) => s.driftMean),
    '',
    '## Per-run table',
    '',
    '| Run | Arm | Tests pass | Halluc. | Out-of-scope | Questions | Tokens | Stalled |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...perRun.map(
      (r) =>
        `| ${r.runIndex} | ${r.arm} | ${r.testsAllPass ? 'yes' : 'no'} | ${r.hallucinatedCount} | ${r.outOfScopeEdits.length} | ${r.questions} | ${totalTokens(r)} | ${r.stalled ? 'yes' : 'no'} |`
    ),
  ];
  return lines.join('\n') + '\n';
}

export function compareCampaign(runs) {
  const byArm = { A: [], B: [], C: [] };
  for (const r of runs) {
    if (!byArm[r.arm])
      throw new Error(`unknown arm '${r.arm}' in run ${r.runIndex}`);
    byArm[r.arm].push(r);
  }
  const summaries = {};
  for (const arm of ['A', 'B', 'C']) {
    if (byArm[arm].length > 0) summaries[arm] = summarizeArm(byArm[arm]);
  }
  if (!summaries.A || !summaries.B) {
    throw new Error('a campaign needs runs in both arm A and arm B');
  }
  return { summaries, verdict: readout(summaries) };
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const campaignDir = process.argv[2];
  if (!campaignDir) {
    console.error('usage: node compare-arms.mjs <campaign-dir>');
    process.exit(1);
  }
  const runs = readdirSync(campaignDir)
    .filter((d) => /^run-\d+-[ABC]$/.test(d))
    .sort()
    .map((d) =>
      JSON.parse(readFileSync(join(campaignDir, d, 'metrics.json'), 'utf8'))
    );
  const { summaries, verdict } = compareCampaign(runs);
  const md = renderSummaryMd(summaries, verdict, runs);
  writeFileSync(
    join(campaignDir, 'campaign-summary.json'),
    JSON.stringify({ summaries, verdict }, null, 2)
  );
  writeFileSync(join(campaignDir, 'campaign-summary.md'), md);
  process.stdout.write(md);
}
