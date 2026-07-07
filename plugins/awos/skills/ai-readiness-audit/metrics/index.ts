/**
 * Metric registry — metric id (as named in standards.toml `metric = "..."`)
 * → compute function. Adding a metric module is one import + one entry here;
 * cli.ts and audit-core consume the merged registry and never enumerate
 * modules themselves.
 */
import type { MetricFn } from './_base.ts';

import { compute as computeG1 } from './tooling_depth.ts';
import { compute as computeG2 } from './active_contributors.ts';
import { compute as computeG3 } from './merge_frequency.ts';
import { compute as computeG4 } from './lead_time_for_change.ts';
import { compute as computeG5 } from './pr_cycle_time.ts';
import { compute as computeG6 } from './code_churn.ts';
import { compute as computeG7 } from './change_failure_rate.ts';
import { compute as computeG8 } from './review_rework.ts';
import { compute as computeG9 } from './ai_attribution.ts';
import { compute as computeC1 } from './ci_pass_rate.ts';
import { compute as computeC2 } from './pipeline_duration.ts';
import { compute as computeD1 } from './external_spec_coverage.ts';
import { compute as computeI1 } from './work_mix_allocation.ts';
import { compute as computeI2 } from './issue_throughput.ts';
import { compute as computeI3 } from './mttr.ts';
import { compute as computeI4 } from './ticket_subtask_split.ts';
import { compute as computeI5 } from './ticket_description_quality.ts';
import { compute as computeG10 } from './cyclomatic_complexity.ts';
import { compute as computeG11 } from './loc_scale.ts';
import { compute as computeG12 } from './dependency_count.ts';
import { compute as computeG13 } from './doc_coverage.ts';
import { compute as computeLineCoverage } from './line_coverage.ts';
import { compute as computeG14 } from './rework_rate.ts';
import { compute as computeG15 } from './onboarding_ease.ts';

export const METRICS: Record<string, MetricFn> = {
  tooling_depth: computeG1,
  active_contributors: computeG2,
  merge_frequency: computeG3,
  lead_time_for_change: computeG4,
  pr_cycle_time: computeG5,
  code_churn: computeG6,
  change_failure_rate: computeG7,
  review_rework: computeG8,
  ai_attribution: computeG9,
  ci_pass_rate: computeC1,
  pipeline_duration: computeC2,
  external_spec_coverage: computeD1,
  work_mix_allocation: computeI1,
  issue_throughput: computeI2,
  mttr: computeI3,
  ticket_subtask_split: computeI4,
  ticket_description_quality: computeI5,
  cyclomatic_complexity: computeG10,
  loc_scale: computeG11,
  dependency_count: computeG12,
  doc_coverage: computeG13,
  line_coverage: computeLineCoverage,
  rework_rate: computeG14,
  onboarding_ease: computeG15,
};
