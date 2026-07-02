import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  detectAwosInstalled,
  detectProductContextDocs,
  detectArchTechMatch,
  detectBranchSpecRatio,
  detectSpecTriadComplete,
  detectStaleSpecs,
  detectAgentAnnotations,
  DETECTORS,
} from '../detectors/spec_driven_development.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'sdd-'));
}

/** Initialise a bare git repo in dir and create an initial empty commit on the given trunk branch. */
function gitInitOnTrunk(dir: string, trunk: string): void {
  execFileSync('git', ['init', '-b', trunk, dir]);
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, '.gitkeep'), '');
  execFileSync('git', ['add', '.gitkeep'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
}

/** Initialise a bare git repo in dir and create an initial empty commit on main. */
function gitInit(dir: string): void {
  gitInitOnTrunk(dir, 'main');
}

/**
 * Create a branch, touch a file, commit, and return to trunk.
 * If specFile is provided the commit will also touch that path
 * (under context/spec/) so it counts as a spec branch.
 * specFile is a repo-relative path e.g. "context/spec/001-alpha/functional-spec.md".
 * trunk defaults to 'main'.
 */
function addBranch(
  dir: string,
  branchName: string,
  specFile?: string,
  trunk: string = 'main'
): void {
  execFileSync('git', ['checkout', '-b', branchName], { cwd: dir });
  writeFileSync(join(dir, `${branchName}.txt`), branchName);
  execFileSync('git', ['add', `${branchName}.txt`], { cwd: dir });
  if (specFile) {
    const specPath = join(dir, specFile);
    const specDir = dirname(specPath);
    if (!existsSync(specDir)) mkdirSync(specDir, { recursive: true });
    writeFileSync(specPath, `# ${branchName}\n`);
    execFileSync('git', ['add', specFile], { cwd: dir });
  }
  execFileSync('git', ['commit', '-m', `feat: ${branchName}`], { cwd: dir });
  execFileSync('git', ['checkout', trunk], { cwd: dir });
}

// ---------------------------------------------------------------------------
// detectAwosInstalled — code 2800 (SDD-01, detected)
//
// PASS if .awos/ and a real spec workspace (context/product or context/spec)
// exist. WARN if only one side exists. FAIL if neither. A bare context/ does
// NOT count — the audit itself creates context/audits/ (self-pollution, B3).
// ---------------------------------------------------------------------------

test('SDD-01: PASS when both .awos/ and a spec workspace are present', () => {
  const t = tmp();
  mkdirSync(join(t, '.awos'));
  mkdirSync(join(t, 'context', 'product'), { recursive: true });
  const r = detectAwosInstalled(t);
  assert.equal(r.status, 'PASS', '.awos + context/product → PASS');
  assert.equal(r.method, 'detected');
});

test('SDD-01: WARN when only .awos/ is present (no spec workspace)', () => {
  const t = tmp();
  mkdirSync(join(t, '.awos'));
  const r = detectAwosInstalled(t);
  assert.equal(r.status, 'WARN', 'only .awos → WARN');
});

test('SDD-01: WARN when only the spec workspace is present (no .awos/)', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'spec'), { recursive: true });
  const r = detectAwosInstalled(t);
  assert.equal(r.status, 'WARN', 'only context/spec → WARN');
});

test('SDD-01: FAIL when neither .awos/ nor a spec workspace is present', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectAwosInstalled(t);
  assert.equal(r.status, 'FAIL', 'no dirs → FAIL');
});

test('SDD-01: FAIL when context/ holds no workspace subdirs (e.g. only audit output)', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'audits'), { recursive: true });
  const r = detectAwosInstalled(t);
  assert.equal(
    r.status,
    'FAIL',
    'a bare context/ (audit output only) must not count as a spec workspace'
  );
});

// ---------------------------------------------------------------------------
// detectProductContextDocs — code 2801 (SDD-02, detected)
//
// Check for the three foundational AWOS docs:
//   context/product/product-definition.md
//   context/product/roadmap.md
//   context/architecture/architecture.md  (or context/product/architecture.md)
//
// PASS if all 3 present and non-trivial (> 5 lines).
// WARN if 2 of 3 present.
// FAIL if fewer than 2 present.
// ---------------------------------------------------------------------------

const PRODUCT_DOC_CONTENT = Array(10).fill('meaningful content\n').join('');

test('SDD-02: PASS when all three foundational docs are present and non-trivial', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'product'), { recursive: true });
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'product', 'product-definition.md'),
    PRODUCT_DOC_CONTENT
  );
  writeFileSync(
    join(t, 'context', 'product', 'roadmap.md'),
    PRODUCT_DOC_CONTENT
  );
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    PRODUCT_DOC_CONTENT
  );
  const r = detectProductContextDocs(t);
  assert.equal(r.status, 'PASS', 'all 3 present → PASS');
  assert.equal(r.method, 'detected');
});

test('SDD-02: WARN when 2 of 3 foundational docs are present', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'product'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'product', 'product-definition.md'),
    PRODUCT_DOC_CONTENT
  );
  writeFileSync(
    join(t, 'context', 'product', 'roadmap.md'),
    PRODUCT_DOC_CONTENT
  );
  const r = detectProductContextDocs(t);
  assert.equal(r.status, 'WARN', '2 of 3 present → WARN');
});

test('SDD-02: FAIL when fewer than 2 foundational docs are present', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'product'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'product', 'product-definition.md'),
    PRODUCT_DOC_CONTENT
  );
  const r = detectProductContextDocs(t);
  assert.equal(r.status, 'FAIL', '1 of 3 present → FAIL');
});

test('SDD-02: FAIL when docs are present but trivial (≤ 5 lines)', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'product'), { recursive: true });
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  // Trivial placeholder content — only 2 lines
  writeFileSync(
    join(t, 'context', 'product', 'product-definition.md'),
    '# placeholder\n\nTODO\n'
  );
  writeFileSync(
    join(t, 'context', 'product', 'roadmap.md'),
    '# placeholder\n\nTODO\n'
  );
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    '# placeholder\n\nTODO\n'
  );
  const r = detectProductContextDocs(t);
  // All 3 present but trivial → counts as 0 substantive → FAIL
  assert.equal(r.status, 'FAIL', 'trivial docs → FAIL');
});

test('SDD-02: FAIL when no context/ directory', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectProductContextDocs(t);
  assert.equal(r.status, 'FAIL', 'no context dir → FAIL');
});

// ---------------------------------------------------------------------------
// detectArchTechMatch — code 2802 (SDD-03, detected)
//
// Reads context/architecture/architecture.md (or context/product/architecture.md)
// and checks for technology markers.  Scans codebase for evidence each mentioned
// tech is actually used.
//
// PASS if no mismatches found (≤ 0 unverified mentions) OR no architecture doc.
// WARN if 1-2 unverified tech mentions.
// FAIL if 3+ unverified tech mentions.
// ---------------------------------------------------------------------------

test('SDD-03: SKIP when no architecture document exists — absence is not compliance', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectArchTechMatch(t);
  assert.equal(
    r.status,
    'SKIP',
    'no arch doc → SKIP (nothing to match against)'
  );
  assert.equal(r.method, 'detected');
});

test('SDD-03: PASS when architecture doc mentions tech that is present in codebase', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  // Architecture mentions TypeScript only
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    '# Architecture\n\nWe use TypeScript.\n'
  );
  // Codebase has ts file → TypeScript verified
  writeFileSync(join(t, 'index.ts'), 'console.log("hello");\n');
  const r = detectArchTechMatch(t);
  assert.equal(r.status, 'PASS', 'mentioned tech present in codebase → PASS');
});

test('SDD-03: WARN when exactly 2 tech mentions cannot be verified in codebase', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  // Architecture mentions TypeScript (verified by index.ts), Python and Java (both unverified).
  // Exactly 2 unverified techs → WARN (1-2 unverified threshold, not FAIL which needs 3+).
  // Note: "Django" is avoided because it contains the substring "go" which would also
  // trigger the Go signal, inflating the unverified count to 3+ → FAIL.
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    '# Architecture\n\nWe use TypeScript, Python, and Java.\n'
  );
  // Codebase has a .ts file → TypeScript verified; no .py → Python unverified; no .java → Java unverified
  writeFileSync(join(t, 'index.ts'), 'console.log("hello");\n');
  const r = detectArchTechMatch(t);
  assert.equal(
    r.status,
    'WARN',
    `expected WARN for exactly 2 unverified techs (Python, Java), got ${r.status}`
  );
});

test('SDD-03: lowercase prose "go"/"node" is not a tech mention (PASS, not WARN)', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  // "before we go live" and "each node" are ordinary English — they must not
  // register Go/Node.js as unverified technology mentions.
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    '# Architecture\n\nWe use TypeScript. Review each node in the workflow before we go live.\n'
  );
  writeFileSync(join(t, 'index.ts'), 'console.log("hello");\n');
  const r = detectArchTechMatch(t);
  assert.equal(
    r.status,
    'PASS',
    `prose "go"/"node" must not count as tech mentions; got ${r.status} (${JSON.stringify(r.evidence)})`
  );
});

test('SDD-03: canonical "Go" capitalization still registers as a tech mention', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    '# Architecture\n\nWe use TypeScript and Go for the backend.\n'
  );
  // TypeScript verified; no .go files → Go is an unverified mention → WARN
  writeFileSync(join(t, 'index.ts'), 'console.log("hello");\n');
  const r = detectArchTechMatch(t);
  assert.equal(
    r.status,
    'WARN',
    `capitalized "Go" must register as an (unverified) tech mention; got ${r.status}`
  );
  assert.ok(
    r.evidence.some((e) => e.includes('not evidenced') && e.includes('go')),
    `evidence must flag go as mentioned-but-unverified; got ${JSON.stringify(r.evidence)}`
  );
});

test('SDD-03: backticked `node` counts as a tech mention even in lowercase', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'architecture'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'architecture', 'architecture.md'),
    '# Architecture\n\nWe use TypeScript. Run `node dist/cli.js` to start.\n'
  );
  writeFileSync(join(t, 'index.ts'), 'console.log("hello");\n');
  // No package.json / *.js → node is an unverified mention → WARN
  const r = detectArchTechMatch(t);
  assert.equal(
    r.status,
    'WARN',
    `inline-code \`node\` must register as a tech mention; got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// detectBranchSpecRatio — code 2803 (SDD-04, computed)
//
// THE SWING FIX: deterministic branch→spec ratio via git log.
//
// For each non-main branch, check if any commit on that branch touched a file
// under context/spec/. Ratio = branches_touching_spec / total_feature_branches.
//
// PASS if ratio >= 0.70
// WARN if 0.40 <= ratio < 0.70
// FAIL if ratio < 0.40
// SKIP if no feature branches found (method=computed)
// ---------------------------------------------------------------------------

test('SDD-04: SKIP when no feature branches exist', () => {
  const t = tmp();
  gitInit(t);
  const r = detectBranchSpecRatio(t);
  assert.equal(r.status, 'SKIP', 'no feature branches → SKIP');
  assert.equal(r.method, 'computed');
});

test('SDD-04: PASS when all feature branches touched spec files (ratio = 1.0)', () => {
  const t = tmp();
  gitInit(t);
  // 3 feature branches, all touching context/spec/
  addBranch(t, 'feat-alpha', 'context/spec/001-alpha/functional-spec.md');
  addBranch(t, 'feat-beta', 'context/spec/002-beta/functional-spec.md');
  addBranch(t, 'feat-gamma', 'context/spec/003-gamma/functional-spec.md');
  const r = detectBranchSpecRatio(t);
  assert.equal(r.status, 'PASS', '3/3 spec branches → PASS');
  assert.equal(r.method, 'computed');
  assert.equal(typeof r.value, 'number');
  assert.equal(r.value, 1, 'ratio must be exactly 1.0');
});

test('SDD-04: WARN when ratio is between 0.40 and 0.70 (2/4 = 0.50)', () => {
  const t = tmp();
  gitInit(t);
  // 2 spec branches, 2 plain feature branches → ratio = 0.5
  addBranch(t, 'feat-one', 'context/spec/001-one/functional-spec.md');
  addBranch(t, 'feat-two', 'context/spec/002-two/functional-spec.md');
  addBranch(t, 'feat-three'); // no spec touch
  addBranch(t, 'feat-four'); // no spec touch
  const r = detectBranchSpecRatio(t);
  assert.equal(r.status, 'WARN', '2/4 = 0.5 → WARN');
  assert.equal(r.value, 0.5, 'ratio must be exactly 0.5');
});

test('SDD-04: FAIL when ratio is below 0.40 (1/4 = 0.25)', () => {
  const t = tmp();
  gitInit(t);
  // 1 spec branch, 3 plain → ratio = 0.25
  addBranch(t, 'feat-spec', 'context/spec/001-spec/functional-spec.md');
  addBranch(t, 'feat-plain-a');
  addBranch(t, 'feat-plain-b');
  addBranch(t, 'feat-plain-c');
  const r = detectBranchSpecRatio(t);
  assert.equal(r.status, 'FAIL', '1/4 = 0.25 → FAIL');
  assert.equal(r.value, 0.25, 'ratio must be exactly 0.25');
});

test('SDD-04: PASS at boundary 3/4 = 0.75', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'feat-a', 'context/spec/001-a/functional-spec.md');
  addBranch(t, 'feat-b', 'context/spec/002-b/functional-spec.md');
  addBranch(t, 'feat-c', 'context/spec/003-c/functional-spec.md');
  addBranch(t, 'feat-d'); // plain
  const r = detectBranchSpecRatio(t);
  assert.equal(r.status, 'PASS', '3/4 = 0.75 → PASS');
  assert.equal(r.value, 0.75, 'ratio must be exactly 0.75');
});

test('SDD-04: exact counts pinned — 2 spec branches / 5 total = 0.40 → WARN boundary', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'f1', 'context/spec/001-f1/functional-spec.md');
  addBranch(t, 'f2', 'context/spec/002-f2/functional-spec.md');
  addBranch(t, 'f3');
  addBranch(t, 'f4');
  addBranch(t, 'f5');
  const r = detectBranchSpecRatio(t);
  // 2/5 = 0.40 — exactly at WARN threshold (< 0.70, >= 0.40)
  assert.equal(r.status, 'WARN', '2/5 = 0.40 → WARN');
  assert.equal(r.value, 0.4, 'ratio must be exactly 0.4');
});

test('SDD-04: master-trunk repo computes correct ratio (no ancestor inflation)', () => {
  // Regression: detectTrunk() must find "master" so --not master is used,
  // preventing the full ancestor history from being included in the diff.
  const t = tmp();
  gitInitOnTrunk(t, 'master');
  // 2 spec branches, 2 plain → ratio = 0.5 → WARN (not inflated to 1.0)
  addBranch(
    t,
    'feat-spec-a',
    'context/spec/001-a/functional-spec.md',
    'master'
  );
  addBranch(
    t,
    'feat-spec-b',
    'context/spec/002-b/functional-spec.md',
    'master'
  );
  addBranch(t, 'feat-plain-x', undefined, 'master');
  addBranch(t, 'feat-plain-y', undefined, 'master');
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'WARN',
    'master-trunk: 2/4 = 0.5 → WARN (not inflated to PASS)'
  );
  assert.equal(
    r.value,
    0.5,
    'master-trunk: ratio must be exactly 0.5 (not inflated to 1.0)'
  );
  assert.equal(r.method, 'computed');
});

test('SDD-04: branch touching non-AWOS spec dir (specs/) counts as spec-touching', () => {
  const t = tmp();
  gitInit(t);
  // A plain `specs/` convention (not AWOS `context/spec/`) must still count.
  addBranch(t, 'feat-kiroless', 'specs/foo.md');
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'PASS',
    'branch touching specs/ must count as spec-touching → 1/1 = 1.0 → PASS'
  );
  assert.equal(r.value, 1, 'specs/ path counted → ratio 1.0');
});

test('SDD-04: branch touching a Kiro spec dir (.kiro/specs/) counts as spec-touching', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'feat-kiro', '.kiro/specs/bar.md');
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'PASS',
    'branch touching .kiro/specs/ must count as spec-touching → 1/1 = 1.0 → PASS'
  );
  assert.equal(r.value, 1, '.kiro/specs/ path counted → ratio 1.0');
});

test('SDD-04: mixed frameworks — AWOS + Kiro + Agent-OS all count as spec-touching', () => {
  const t = tmp();
  gitInit(t);
  // Three branches, each under a different spec-driven framework's spec dir.
  addBranch(t, 'feat-awos', 'context/spec/001-a/functional-spec.md');
  addBranch(t, 'feat-kiro', '.kiro/specs/b.md');
  addBranch(t, 'feat-agentos', '.agent-os/specs/c.md');
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'PASS',
    'all three framework spec dirs must count → 3/3 = 1.0 → PASS'
  );
  assert.equal(r.value, 1, 'AWOS + Kiro + Agent-OS all counted → ratio 1.0');
});

test('SDD-04: RSpec test files under spec/ do not earn spec-dir credit', () => {
  const t = tmp();
  gitInit(t);
  // A Ruby test suite lives in spec/ — touching it is testing, not
  // spec-driven development. 0/1 spec-touching → FAIL.
  addBranch(t, 'feat-rspec', 'spec/models/user_spec.rb');
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'FAIL',
    `spec/models/user_spec.rb must NOT count as a spec artifact (SDD-04); got ${r.status}`
  );
  assert.equal(
    r.value,
    0,
    'RSpec-only branch must yield ratio 0 (no spec credit)'
  );
});

test('SDD-04: markdown spec document under specs/ still earns credit', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'feat-specced', 'specs/001-feature/spec.md');
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'PASS',
    `specs/001-feature/spec.md must count as a spec artifact; got ${r.status}`
  );
  assert.equal(r.value, 1, 'spec.md branch must yield ratio 1.0');
});

test('SDD-04: detached HEAD pseudo-entry is not counted as a feature branch', () => {
  const t = tmp();
  gitInit(t);
  // Detach HEAD — `git branch` now emits "(HEAD detached at <sha>)", which
  // must be filtered out rather than treated as a plain feature branch.
  execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: t });
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.status,
    'SKIP',
    `detached-HEAD pseudo branch must be ignored (no feature branches → SKIP); got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// detectSpecTriadComplete — code 2804 (SDD-05, detected)
//
// Checks every context/spec/NNN-* directory for the three required files:
//   functional-spec.md, technical-considerations.md, tasks.md
//
// PASS if all spec dirs have all 3 files (or no spec dirs).
// WARN if some dirs are incomplete (1-2 missing files).
// FAIL if any dir has 0 of the 3 files.
// ---------------------------------------------------------------------------

test('SDD-05: SKIP when no spec directories exist — absence is not compliance', () => {
  const t = tmp();
  mkdirSync(join(t, 'context'), { recursive: true });
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'SKIP', 'no spec dirs → SKIP');
  assert.equal(r.method, 'detected');
});

test('SDD-05: PASS when all spec dirs have the full triad', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-feature');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'functional-spec.md'), '# spec\n');
  writeFileSync(join(specDir, 'technical-considerations.md'), '# tech\n');
  writeFileSync(join(specDir, 'tasks.md'), '# tasks\n');
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'PASS', 'full triad → PASS');
  assert.equal(r.method, 'detected');
});

test('SDD-05: WARN when a spec dir is missing one file', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-feature');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'functional-spec.md'), '# spec\n');
  writeFileSync(join(specDir, 'technical-considerations.md'), '# tech\n');
  // tasks.md missing
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'WARN', 'missing 1 file → WARN');
});

test('SDD-05: FAIL when a spec dir is completely empty (0 of 3 files)', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-feature');
  mkdirSync(specDir, { recursive: true });
  // No files at all
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'FAIL', 'empty spec dir → FAIL');
});

test('SDD-05: WARN when one spec dir is complete but another is incomplete', () => {
  const t = tmp();
  const dir1 = join(t, 'context', 'spec', '001-ok');
  const dir2 = join(t, 'context', 'spec', '002-incomplete');
  mkdirSync(dir1, { recursive: true });
  mkdirSync(dir2, { recursive: true });
  writeFileSync(join(dir1, 'functional-spec.md'), '# spec\n');
  writeFileSync(join(dir1, 'technical-considerations.md'), '# tech\n');
  writeFileSync(join(dir1, 'tasks.md'), '# tasks\n');
  writeFileSync(join(dir2, 'functional-spec.md'), '# spec\n');
  // dir2 missing technical-considerations.md and tasks.md → WARN (not 0 of 3)
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'WARN', 'mixed completeness → WARN');
});

// ---------------------------------------------------------------------------
// detectStaleSpecs — code 2805 (SDD-06, detected)
//
// A spec is "stale" if it exists but tasks.md exists AND all tasks are marked
// as done ([x]) — meaning the work is complete — or if the spec dir has only
// partial files with no recent git modification.
//
// Simplified heuristic (deterministic):
//   - Look at every context/spec/NNN-* dir that has tasks.md.
//   - If ALL tasks in tasks.md are checked ([x] / [X]), mark as completed (not stale, PASS).
//   - If tasks.md has ONLY unchecked tasks but functional-spec.md is present,
//     it's actively in progress (PASS/OK).
//   - A spec is stale if tasks.md is present but has zero task lines
//     (empty stub that was never filled in).
//
// PASS if no stale specs.
// WARN if 1 stale spec.
// FAIL if 2+ stale specs.
// ---------------------------------------------------------------------------

test('SDD-06: SKIP when no spec directories exist — absence is not compliance', () => {
  const t = tmp();
  mkdirSync(join(t, 'context'), { recursive: true });
  const r = detectStaleSpecs(t);
  assert.equal(r.status, 'SKIP', 'no spec dirs → SKIP');
  assert.equal(r.method, 'detected');
});

test('SDD-06: PASS when tasks.md has active (unchecked) tasks', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-active');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'tasks.md'),
    '# Tasks\n\n- [ ] Task one\n- [ ] Task two\n'
  );
  writeFileSync(join(specDir, 'functional-spec.md'), '# spec\n');
  const r = detectStaleSpecs(t);
  assert.equal(r.status, 'PASS', 'active tasks → PASS');
});

test('SDD-06: PASS when tasks.md has all tasks completed ([x])', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-done');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'tasks.md'),
    '# Tasks\n\n- [x] Task one\n- [x] Task two\n'
  );
  const r = detectStaleSpecs(t);
  assert.equal(r.status, 'PASS', 'completed tasks → PASS (not stale, done)');
});

test('SDD-06: WARN when 1 spec has an empty tasks.md stub (stale)', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-stale');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'tasks.md'), '# Tasks\n\n');
  writeFileSync(join(specDir, 'functional-spec.md'), '# spec\n');
  const r = detectStaleSpecs(t);
  assert.equal(r.status, 'WARN', '1 stale spec → WARN');
});

test('SDD-06: FAIL when 2+ specs have empty tasks.md stubs (stale)', () => {
  const t = tmp();
  for (const name of ['001-stale-a', '002-stale-b']) {
    const specDir = join(t, 'context', 'spec', name);
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'tasks.md'), '# Tasks\n\n');
  }
  const r = detectStaleSpecs(t);
  assert.equal(r.status, 'FAIL', '2 stale specs → FAIL');
});

// ---------------------------------------------------------------------------
// detectAgentAnnotations — code 2806 (SDD-07, detected)
//
// Scan all tasks.md files under context/spec/. A task is "annotated" if it
// has an **[Agent: name]** annotation per the AWOS format.
//
// PASS if >= 70% of non-empty task lines are annotated.
// WARN if 40–69% annotated.
// FAIL if < 40% annotated.
// SKIP if no task lines found.
// ---------------------------------------------------------------------------

test('SDD-07: SKIP when no tasks.md files exist', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'spec'), { recursive: true });
  const r = detectAgentAnnotations(t);
  assert.equal(r.status, 'SKIP', 'no tasks.md → SKIP');
  assert.equal(r.method, 'detected');
});

test('SDD-07: PASS when all tasks have agent annotations (ratio = 1.0)', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-annotated');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'tasks.md'),
    [
      '# Tasks',
      '',
      '- [ ] Implement auth **[Agent: backend-development]**',
      '- [ ] Write tests **[Agent: backend-development]**',
      '- [x] Setup DB **[Agent: backend-development]**',
    ].join('\n') + '\n'
  );
  const r = detectAgentAnnotations(t);
  assert.equal(r.status, 'PASS', 'all annotated → PASS');
  assert.equal(r.method, 'detected');
});

test('SDD-07: WARN when 40-69% of tasks have agent annotations (2/3 = 67%)', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-partial');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'tasks.md'),
    [
      '# Tasks',
      '',
      '- [ ] Task one **[Agent: backend-development]**',
      '- [ ] Task two **[Agent: frontend-design]**',
      '- [ ] Task three (no annotation)',
    ].join('\n') + '\n'
  );
  const r = detectAgentAnnotations(t);
  // 2/3 = 0.667 → WARN
  assert.equal(r.status, 'WARN', '2/3 annotated → WARN');
});

test('SDD-07: FAIL when fewer than 40% of tasks have agent annotations (1/4 = 25%)', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-unannotated');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'tasks.md'),
    [
      '# Tasks',
      '',
      '- [ ] Task one **[Agent: backend-development]**',
      '- [ ] Task two (no annotation)',
      '- [ ] Task three (no annotation)',
      '- [ ] Task four (no annotation)',
    ].join('\n') + '\n'
  );
  const r = detectAgentAnnotations(t);
  // 1/4 = 0.25 → FAIL
  assert.equal(r.status, 'FAIL', '1/4 annotated → FAIL');
});

test('SDD-07: PASS when no task checkboxes found in tasks.md files (SKIP)', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-empty-tasks');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'tasks.md'), '# Tasks\n\nSee backlog.\n');
  const r = detectAgentAnnotations(t);
  assert.equal(r.status, 'SKIP', 'no task lines → SKIP');
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains all spec-driven-development computed/detected codes', () => {
  assert.ok(
    2800 in DETECTORS,
    'DETECTORS must include 2800 (detectAwosInstalled)'
  );
  assert.ok(
    2801 in DETECTORS,
    'DETECTORS must include 2801 (detectProductContextDocs)'
  );
  assert.ok(
    2802 in DETECTORS,
    'DETECTORS must include 2802 (detectArchTechMatch)'
  );
  assert.ok(
    2803 in DETECTORS,
    'DETECTORS must include 2803 (detectBranchSpecRatio)'
  );
  assert.ok(
    2804 in DETECTORS,
    'DETECTORS must include 2804 (detectSpecTriadComplete)'
  );
  assert.ok(
    2805 in DETECTORS,
    'DETECTORS must include 2805 (detectStaleSpecs)'
  );
  assert.ok(
    2806 in DETECTORS,
    'DETECTORS must include 2806 (detectAgentAnnotations)'
  );
});

test('DETECTORS[2803] returns same result as detectBranchSpecRatio', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'feat-test', 'context/spec/001-test/functional-spec.md');
  const direct = detectBranchSpecRatio(t);
  const viaMap = DETECTORS[2803](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'computed');
});

// ---------------------------------------------------------------------------
// SDD-04 merged-event denominator: repos whose CI deletes branches after merge
// must count DELIVERED work (merge commits + squash-merged PRs), not just the
// branches that happen to still exist.
// ---------------------------------------------------------------------------

function squashCommit(
  dir: string,
  subject: string,
  files: Record<string, string>
): void {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', subject], { cwd: dir });
}

test('SDD-04 counts squash-merged PRs as feature work even when branches were deleted', () => {
  const t = tmp();
  gitInit(t);
  // 4 squash-merged PRs on trunk, no live feature branches at all.
  squashCommit(t, 'feat: alpha (#1)', {
    'src/a.ts': 'a\n',
    'context/spec/001-alpha/tasks.md': '- [x] done\n',
  });
  squashCommit(t, 'feat: beta (#2)', {
    'src/b.ts': 'b\n',
    'context/spec/002-beta/tasks.md': '- [x] done\n',
  });
  squashCommit(t, 'feat: gamma (#3)', {
    'src/c.ts': 'c\n',
    'context/spec/003-gamma/tasks.md': '- [x] done\n',
  });
  squashCommit(t, 'chore: bump deps (#4)', { 'package.json': '{}\n' });
  const r = detectBranchSpecRatio(t);
  assert.notEqual(
    r.status,
    'SKIP',
    'merged PRs must be countable even with zero live feature branches'
  );
  assert.ok(
    r.evidence.some((e) => /3\/4 merged branches\/PRs/.test(e)),
    `evidence must count 3 of 4 merged PRs as spec-driven, got: ${JSON.stringify(r.evidence)}`
  );
  assert.equal(r.status, 'PASS', '75% spec-driven merged work ≥ 70% → PASS');
});
