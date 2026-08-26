/**
 * inheritance-policy.test.ts
 *
 * Enforces the orchestration-root inheritance policy declared in
 * standards.toml. Three contracts:
 *
 *  1. Coverage — every category declares a policy, so adding a category
 *     without deciding fails here rather than silently defaulting.
 *  2. The declared inheriting set matches the design decision exactly.
 *  3. Gate consistency — a category that inherits must not be gated on a
 *     topology flag that stays member-local, or its inheritance is dead code
 *     (applies_when is evaluated before the detector runs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStandards } from './helpers.ts';
import { ORCHESTRATION_WIDENED_FLAGS } from '../topology.ts';
import { INHERITING_CHECK_IDS } from './helpers_orchestration.ts';

test('every standards.toml category declares an inheritance policy', () => {
  const categories = loadStandards().category as Record<string, any>;
  const undeclared: string[] = [];
  for (const [slug, cat] of Object.entries(categories)) {
    if (typeof cat.inherits_from_orchestration_root !== 'boolean') {
      undeclared.push(`${slug} (${cat.check_id ?? 'no check_id'})`);
    }
  }
  assert.deepEqual(
    undeclared,
    [],
    `every category must set inherits_from_orchestration_root so a new check cannot skip the decision; undeclared: ${undeclared.join(', ')}`
  );
});

test('the declared inheriting set matches the design decision', () => {
  const categories = loadStandards().category as Record<string, any>;
  const declared = new Set<string>();
  for (const cat of Object.values(categories)) {
    if (cat.inherits_from_orchestration_root === true && cat.check_id) {
      declared.add(cat.check_id as string);
    }
  }
  assert.deepEqual(
    [...declared].sort(),
    [...INHERITING_CHECK_IDS].sort(),
    'the set of inheriting checks is a recorded decision; changing it must be deliberate, not incidental'
  );
});

test('an inheriting category is not gated on a member-local topology flag', () => {
  const categories = loadStandards().category as Record<string, any>;
  const widened = new Set<string>(ORCHESTRATION_WIDENED_FLAGS);
  const dead: string[] = [];
  for (const cat of Object.values(categories)) {
    if (cat.inherits_from_orchestration_root !== true) continue;
    const flag = String(cat.applies_when ?? 'always').match(
      /^topology\.(.+)$/
    )?.[1];
    if (flag && !widened.has(flag)) {
      dead.push(`${cat.check_id} gated on topology.${flag}`);
    }
  }
  assert.deepEqual(
    dead,
    [],
    `applies_when is evaluated before the detector runs, so these categories would SKIP before inheritance could apply — add the flag to ORCHESTRATION_WIDENED_FLAGS or drop the inheritance: ${dead.join('; ')}`
  );
});
