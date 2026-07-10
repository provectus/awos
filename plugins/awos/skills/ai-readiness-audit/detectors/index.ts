/**
 * Detector registry — category code → detector function, assembled from every
 * dimension's detector module. Adding a detector module is one import + one
 * spread here; cli.ts and audit-core consume the merged registry and never
 * enumerate modules themselves.
 */
import type { DetectorResult } from './_base.ts';

import { DETECTORS as SBP_DETECTORS } from './software_best_practices.ts';
import { DETECTORS as CODE_ARCH_DETECTORS } from './code_architecture.ts';
import { DETECTORS as SDD_DETECTORS } from './spec_driven_development.ts';
import { DETECTORS as AI_TOOLING_DETECTORS } from './ai_development_tooling.ts';
import { DETECTORS as E2E_DETECTORS } from './end_to_end_delivery.ts';
import { DETECTORS as SEC_DETECTORS } from './security.ts';
import { DETECTORS as SCS_DETECTORS } from './supply_chain_security.ts';
import { DETECTORS as PAI_DETECTORS } from './prompt_agent_integrity.ts';
import { DETECTORS as QA_DETECTORS } from './quality_assurance.ts';
import { DETECTORS as DOC_DETECTORS } from './documentation.ts';
import { DETECTORS as AS_DETECTORS } from './application_security.ts';

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => DetectorResult
> = {
  ...SBP_DETECTORS,
  ...CODE_ARCH_DETECTORS,
  ...SDD_DETECTORS,
  ...AI_TOOLING_DETECTORS,
  ...E2E_DETECTORS,
  ...SEC_DETECTORS,
  ...SCS_DETECTORS,
  ...PAI_DETECTORS,
  ...QA_DETECTORS,
  ...DOC_DETECTORS,
  ...AS_DETECTORS,
};
