/**
 * Metric registry — metric id (as named in standards.toml `metric = "..."`)
 * → compute function. Adding a metric module is one import + one entry here;
 * cli.ts and audit-core consume the merged registry and never enumerate
 * modules themselves.
 */
import type { MetricFn } from '../audit_core.ts';

import { compute as computeG1 } from './adp_g1_tooling_depth.ts';
import { compute as computeG2 } from './adp_g2_contributors.ts';
import { compute as computeG3 } from './adp_g3_deploy_frequency.ts';
import { compute as computeG4 } from './adp_g4_lead_time.ts';
import { compute as computeG5 } from './adp_g5_pr_cycle_time.ts';
import { compute as computeG6 } from './adp_g6_churn.ts';
import { compute as computeG7 } from './adp_g7_change_fail_rate.ts';
import { compute as computeG8 } from './adp_g8_review_rework.ts';
import { compute as computeG9 } from './adp_g9_ai_attribution.ts';
import { compute as computeC1 } from './adp_c1_ci_pass_rate.ts';
import { compute as computeC2 } from './adp_c2_pipeline_duration.ts';
import { compute as computeD1 } from './adp_d1_spec_coverage.ts';
import { compute as computeI1 } from './adp_i1_work_mix.ts';
import { compute as computeI2 } from './adp_i2_throughput.ts';
import { compute as computeI3 } from './adp_i3_mttr.ts';
import { compute as computeI4 } from './adp_i4_subtask_split.ts';
import { compute as computeI5 } from './adp_i5_description_quality.ts';
import { compute as computeG10 } from './adp_g10_complexity.ts';
import { compute as computeG11 } from './adp_g11_scale.ts';
import { compute as computeG12 } from './adp_g12_deps.ts';
import { compute as computeG13 } from './adp_g13_doc_coverage.ts';
import { compute as computeG14 } from './adp_g14_rework_rate.ts';
import { compute as computeG15 } from './adp_g15_onboarding_ease.ts';

export const METRICS: Record<string, MetricFn> = {
  adp_g1_tooling_depth: computeG1,
  adp_g2_contributors: computeG2,
  adp_g3_deploy_frequency: computeG3,
  adp_g4_lead_time: computeG4,
  adp_g5_pr_cycle_time: computeG5,
  adp_g6_churn: computeG6,
  adp_g7_change_fail_rate: computeG7,
  adp_g8_review_rework: computeG8,
  adp_g9_ai_attribution: computeG9,
  adp_c1_ci_pass_rate: computeC1,
  adp_c2_pipeline_duration: computeC2,
  adp_d1_spec_coverage: computeD1,
  adp_i1_work_mix: computeI1,
  adp_i2_throughput: computeI2,
  adp_i3_mttr: computeI3,
  adp_i4_subtask_split: computeI4,
  adp_i5_description_quality: computeI5,
  adp_g10_complexity: computeG10,
  adp_g11_scale: computeG11,
  adp_g12_deps: computeG12,
  adp_g13_doc_coverage: computeG13,
  adp_g14_rework_rate: computeG14,
  adp_g15_onboarding_ease: computeG15,
};
