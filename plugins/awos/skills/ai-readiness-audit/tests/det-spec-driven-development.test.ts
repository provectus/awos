import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  detectSpecWorkflowAdopted,
  detectProductContextDocs,
  detectArchTechMatch,
  detectBranchSpecRatio,
  detectSpecTriadComplete,
  detectStaleSpecs,
  detectAgentAnnotations,
  DETECTORS,
} from '../detectors/spec_driven_development.ts';
import { tmpDir, writeRepo } from './helpers.ts';
import { detectSpecFrameworks } from '../spec_frameworks.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmp(): string {
  return tmpDir('sdd-');
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
// detectSpecWorkflowAdopted — code 2800 (SDD-01, detected)
//
// PASS if .awos/ and a real spec workspace (context/product or context/spec)
// exist. WARN if only one side exists. FAIL if neither. A bare context/ does
// NOT count — the audit itself creates context/audits/ (self-pollution, B3).
// ---------------------------------------------------------------------------

test('SDD-01: PASS when both .awos/ and a spec workspace are present', () => {
  const t = tmp();
  mkdirSync(join(t, '.awos'));
  mkdirSync(join(t, 'context', 'product'), { recursive: true });
  const r = detectSpecWorkflowAdopted(t);
  assert.equal(r.status, 'PASS', '.awos + context/product → PASS');
  assert.equal(r.method, 'detected');
});

test('SDD-01: WARN when only .awos/ is present (no spec workspace)', () => {
  const t = tmp();
  mkdirSync(join(t, '.awos'));
  const r = detectSpecWorkflowAdopted(t);
  assert.equal(r.status, 'WARN', 'only .awos → WARN');
});

test('SDD-01: WARN when only the spec workspace is present (no .awos/)', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'spec'), { recursive: true });
  const r = detectSpecWorkflowAdopted(t);
  assert.equal(r.status, 'WARN', 'only context/spec → WARN');
});

test('SDD-01: FAIL when neither .awos/ nor a spec workspace is present', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectSpecWorkflowAdopted(t);
  assert.equal(r.status, 'FAIL', 'no dirs → FAIL');
});

test('SDD-01: FAIL when context/ holds no workspace subdirs (e.g. only audit output)', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'audits'), { recursive: true });
  const r = detectSpecWorkflowAdopted(t);
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

test('SDD-02 accepts non-AWOS foundational documents', () => {
  const repo = tmpDir('awos-sdd02-generic-');
  try {
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'product.md'), SDD_CONTENT);
    writeFileSync(join(repo, 'ROADMAP.md'), SDD_CONTENT);
    writeFileSync(join(repo, 'docs', 'architecture.md'), SDD_CONTENT);
    assert.equal(
      detectProductContextDocs(repo).status,
      'PASS',
      'a project that documents its product, roadmap and architecture outside AWOS filenames has the capability this check measures'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-02 accepts an ADR index in place of an architecture document', () => {
  const repo = tmpDir('awos-sdd02-adrindex-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'adr', 'README.md'), SDD_CONTENT);
    writeFileSync(join(repo, 'docs', 'product.md'), SDD_CONTENT);
    writeFileSync(join(repo, 'ROADMAP.md'), SDD_CONTENT);
    assert.equal(
      detectProductContextDocs(repo).status,
      'PASS',
      'an ADR index records architecture decisions and satisfies the architecture slot'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-02 still fails when two of the three are missing', () => {
  const repo = tmpDir('awos-sdd02-thin-');
  try {
    writeFileSync(join(repo, 'ROADMAP.md'), SDD_CONTENT);
    assert.equal(
      detectProductContextDocs(repo).status,
      'FAIL',
      'genericizing widens what counts, it must not lower the bar for how much is required'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
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
// Judges every spec/decision record — across whichever recognized
// convention(s) a repo uses — against the full AWOS/Kiro/Agent-OS/Spec-Kit
// file triad, or the ADR template sections. Each record earns fractional
// credit (elements present / elements required), averaged across records —
// a spec missing only one file is not zero credit.
//
// PASS if the average credit is >=90% (or no records exist — SKIP).
// WARN if 50-89%.
// FAIL if <50%.
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
  writeRepo(t, {
    'context/spec/001-feature/functional-spec.md': '# spec\n',
    'context/spec/001-feature/technical-considerations.md': '# tech\n',
    'context/spec/001-feature/tasks.md': '# tasks\n',
  });
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'PASS', 'full triad → PASS');
  assert.equal(r.method, 'detected');
});

test('SDD-05: WARN (not FAIL) when the lone spec dir is missing one file — credit is fractional per record', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-feature');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'functional-spec.md'), '# spec\n');
  writeFileSync(join(specDir, 'technical-considerations.md'), '# tech\n');
  // tasks.md missing — 2/3 required elements present, so this record earns
  // 0.667 credit rather than zero; a single mostly-complete spec must not
  // swing the whole repo to a hard FAIL.
  const r = detectSpecTriadComplete(t);
  assert.equal(
    r.status,
    'WARN',
    '2/3 elements present on the only record → 0.667 ratio → WARN, not FAIL'
  );
  assert.ok(
    r.evidence.some((e) => /2\/3/.test(e)),
    `evidence must report the present/required count, got: ${JSON.stringify(r.evidence)}`
  );
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
  writeRepo(t, {
    'context/spec/001-ok/functional-spec.md': '# spec\n',
    'context/spec/001-ok/technical-considerations.md': '# tech\n',
    'context/spec/001-ok/tasks.md': '# tasks\n',
    // dir2 has 1/3 present (credit 0.333) → average ratio (1.0+0.333)/2 = 0.667 → WARN
    'context/spec/002-incomplete/functional-spec.md': '# spec\n',
  });
  const r = detectSpecTriadComplete(t);
  assert.equal(r.status, 'WARN', 'mixed completeness → WARN');
});

test('SDD-05: WARN exactly at the 0.5 ratio boundary (inclusive)', () => {
  const t = tmp();
  writeRepo(t, {
    // Record A: fully complete → credit 1.0.
    'context/spec/001-full/functional-spec.md': '# spec\n',
    'context/spec/001-full/technical-considerations.md': '# tech\n',
    'context/spec/001-full/tasks.md': '# tasks\n',
    // Record B: nothing present → credit 0. Average ratio = (1.0+0)/2 = 0.5 exactly.
  });
  mkdirSync(join(t, 'context', 'spec', '002-empty'), { recursive: true });
  const r = detectSpecTriadComplete(t);
  assert.equal(
    r.status,
    'WARN',
    'ratio of exactly 0.5 must land on the WARN side of the >=0.5 boundary, not FAIL'
  );
});

// ---------------------------------------------------------------------------
// detectStaleSpecs — code 2805 (SDD-06, detected)
//
// Classifies every spec/decision record by its own convention's status
// vocabulary, read from the record's status-bearing file (functional-spec.md
// for AWOS, the record itself for a single-file ADR — or, for a convention
// that tracks status once for the whole project (GSD), one shared file every
// record is judged against). A record whose status is one of its
// convention's "terminal" values (AWOS Completed) is settled, not stale. A
// record that declares no status this check recognizes is excluded from the
// ratio rather than penalized.
//
// Status alone decides staleness: a record is stale when its status is in
// its convention's active vocabulary, full stop — there is no task-progress
// signal. This check runs against projects already shown to the audit
// plugin, so a freshly-opened spec being "active" five minutes in does not
// arise as a false positive in practice.
//
// PASS if none of the judged records are active.
// WARN if fewer than half of the judged records are active.
// FAIL if half or more of the judged records are active.
// SKIP if no record exists, or none declares a recognized status.
// ---------------------------------------------------------------------------

test('SDD-06: SKIP when no spec directories exist — absence is not compliance', () => {
  const t = tmp();
  mkdirSync(join(t, 'context'), { recursive: true });
  const r = detectStaleSpecs(t);
  assert.equal(r.status, 'SKIP', 'no spec dirs → SKIP');
  assert.equal(r.method, 'detected');
});

test('SDD-06: SKIP when the only spec has no recognized Status field', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-nostatus');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'functional-spec.md'),
    '# Spec\n\nNo status here.\n'
  );
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'SKIP',
    'a record must not be penalized for a status this check does not recognize'
  );
});

test('SDD-06: PASS when the record has reached a terminal status', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-done');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'functional-spec.md'),
    '# Spec\n\n- **Status:** Completed\n'
  );
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'PASS',
    "Completed is AWOS's terminal status — settled work is not stale"
  );
});

test('SDD-06: WARN when fewer than half of judged records are active', () => {
  const t = tmp();
  writeRepo(t, {
    'context/spec/001-done/functional-spec.md':
      '# Spec\n\n- **Status:** Completed\n',
    'context/spec/002-done/functional-spec.md':
      '# Spec\n\n- **Status:** Completed\n',
    'context/spec/003-active/functional-spec.md':
      '# Spec\n\n- **Status:** Draft\n',
  });
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'WARN',
    '1 of 3 judged records active (33%, below half) → WARN'
  );
});

test('SDD-06: FAIL at the exact half boundary — 2 of 4 judged records active', () => {
  const t = tmp();
  writeRepo(t, {
    'context/spec/001-done/functional-spec.md':
      '# Spec\n\n- **Status:** Completed\n',
    'context/spec/002-done/functional-spec.md':
      '# Spec\n\n- **Status:** Completed\n',
    'context/spec/003-active/functional-spec.md':
      '# Spec\n\n- **Status:** Draft\n',
    'context/spec/004-active/functional-spec.md':
      '# Spec\n\n- **Status:** In Review\n',
  });
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'FAIL',
    '2 of 4 = exactly half — the band is "half or more", so the boundary itself must FAIL, not WARN'
  );
});

test('SDD-06: WARN just below the half boundary — 4 of 9 judged records active', () => {
  const t = tmp();
  const files: Record<string, string> = {};
  for (let i = 1; i <= 4; i++) {
    files[`context/spec/00${i}-active/functional-spec.md`] =
      '# Spec\n\n- **Status:** Draft\n';
  }
  for (let i = 5; i <= 9; i++) {
    files[`context/spec/00${i}-done/functional-spec.md`] =
      '# Spec\n\n- **Status:** Completed\n';
  }
  writeRepo(t, files);
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'WARN',
    '4 of 9 ≈ 44%, just under half → WARN, one record short of the FAIL boundary'
  );
});

test('SDD-06: a lone brand-new Draft spec with no tasks.md now counts toward the active ratio', () => {
  // Removing the task-progress condition (issue: SDD-06 status-only rework)
  // means a single active record is, by itself, 100% of the judged ratio —
  // half or more — so it FAILs. This is the acknowledged behavior change:
  // the false positive this used to guard against (a spec five minutes old
  // reading as "abandoned") does not arise for projects the audit plugin is
  // actually run against.
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-brand-new');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'functional-spec.md'),
    '# Spec\n\n- **Status:** Draft\n'
  );
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'FAIL',
    'a lone active record is 100% of the judged ratio — half or more — under the status-only model'
  );
});

test('SDD-06: an active record counts even with a fully checked-off task list — status alone is the model now', () => {
  // Proves isStuckWithNoProgress is actually gone, not just unreachable: this
  // exact fixture (active status, tasks.md fully populated and checked)
  // would have PASSed under the old task-progress condition. It must FAIL
  // now because staleness is judged on status alone.
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-active');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'functional-spec.md'),
    '# Spec\n\n- **Status:** In Review\n'
  );
  writeFileSync(
    join(specDir, 'tasks.md'),
    '# Tasks\n\n- [x] Design it\n- [x] Build it\n- [x] Ship it\n'
  );
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'FAIL',
    'real, fully-checked task progress no longer exempts an active record — only its status is read'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('active: AWOS: 001-active')),
    `evidence must label the record "active:", not the retired "stalled:" wording, got: ${JSON.stringify(r.evidence)}`
  );
  assert.ok(
    r.evidence.every((e) => !/stalled|in flight/i.test(e)),
    `evidence must not use the retired "stalled"/"in flight" wording, got: ${JSON.stringify(r.evidence)}`
  );
});

test('SDD-06: SKIP when the status line is the unedited template menu, not a chosen value', () => {
  // templates/functional-spec-template.md ships
  // "- **Status:** Draft | In Review | Approved | Completed" — a menu of
  // options, not a value. recordStatus() returns that whole string verbatim,
  // and it must match neither statusActive nor statusTerminal by exact
  // equality, so an unedited spec is excluded from the ratio instead of
  // being counted as active (and therefore eligible to be flagged stalled).
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-unedited');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'functional-spec.md'),
    '# Spec\n\n- **Status:** Draft | In Review | Approved | Completed\n'
  );
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'SKIP',
    'an unedited template menu declares no chosen status — it must not be counted active (which would corrupt the staleness ratio) or terminal'
  );
  assert.ok(
    r.evidence.some((e) =>
      e.includes('Draft | In Review | Approved | Completed')
    ),
    `evidence must name the offending unedited-template string, got: ${JSON.stringify(r.evidence)}`
  );
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
    'DETECTORS must include 2800 (detectSpecWorkflowAdopted)'
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
  // A feature PR without a spec — stays in the denominator...
  squashCommit(t, 'feat: delta, straight to code (#4)', { 'src/d.ts': 'd\n' });
  // ...while maintenance PRs are excluded entirely (no spec expected).
  squashCommit(t, 'chore: bump deps (#5)', { 'package.json': '{}\n' });
  squashCommit(t, 'fix: crash on empty input (#6)', { 'src/a.ts': 'a2\n' });
  const r = detectBranchSpecRatio(t);
  assert.notEqual(
    r.status,
    'SKIP',
    'merged PRs must be countable even with zero live feature branches'
  );
  assert.ok(
    r.evidence.some((e) => /3\/4 merged feature PRs/.test(e)),
    `evidence must count 3 of the 4 FEATURE PRs as spec-driven (chore/fix PRs excluded from the denominator), got: ${JSON.stringify(r.evidence)}`
  );
  assert.ok(
    r.evidence.some((e) => /2 fix\/maintenance PRs excluded/.test(e)),
    `evidence must disclose how many maintenance PRs were excluded, got: ${JSON.stringify(r.evidence)}`
  );
  assert.equal(r.status, 'PASS', '75% spec-driven feature work ≥ 70% → PASS');
});

// ---------------------------------------------------------------------------
// Verdict-threshold params (standards.toml pass_at/warn_at/fail_at)
// ---------------------------------------------------------------------------

test('SDD-04: warn_at param is honored — 0.5 ratio is WARN by default but FAIL with warn_at 0.6', () => {
  const t = tmp();
  gitInit(t);
  // 2 spec branches, 2 plain → ratio = 0.5
  addBranch(t, 'feat-one', 'context/spec/001-one/functional-spec.md');
  addBranch(t, 'feat-two', 'context/spec/002-two/functional-spec.md');
  addBranch(t, 'feat-three');
  addBranch(t, 'feat-four');
  assert.equal(
    detectBranchSpecRatio(t).status,
    'WARN',
    '0.5 ratio must be WARN under the default warn_at 0.4'
  );
  assert.equal(
    detectBranchSpecRatio(t, { warn_at: 0.6 }).status,
    'FAIL',
    'warn_at param must be honored: raising warn_at to 0.6 must flip to FAIL'
  );
});

test('SDD-07: pass_at/warn_at params are honored — 2/3 annotated flips WARN→PASS and WARN→FAIL', () => {
  const t = tmp();
  const specDir = join(t, 'context', 'spec', '001-params');
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
  // 2/3 ≈ 0.667: WARN under defaults (pass_at 0.7 / warn_at 0.4)
  assert.equal(
    detectAgentAnnotations(t).status,
    'WARN',
    '0.667 ratio must be WARN under default pass_at 0.7 / warn_at 0.4'
  );
  assert.equal(
    detectAgentAnnotations(t, { pass_at: 0.6 }).status,
    'PASS',
    'pass_at param must be honored: lowering pass_at to 0.6 must flip to PASS'
  );
  const r = detectAgentAnnotations(t, { warn_at: 0.7 });
  assert.equal(
    r.status,
    'FAIL',
    'warn_at param must be honored: raising warn_at to 0.7 must flip to FAIL'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('threshold: 70%')),
    `evidence must cite the resolved pass_at threshold; got: ${r.evidence[0]}`
  );
});

// ---------------------------------------------------------------------------
// Orchestration-root inheritance — SDD-01, SDD-02, SDD-05, SDD-06, SDD-07
// ---------------------------------------------------------------------------

const SDD_CONTENT =
  '# Doc\n\nStatus: Approved\n\nLine four.\nLine five.\nLine six.\nLine seven.\nLine eight.\n';

function writeAwosWorkspace(dir: string): void {
  mkdirSync(join(dir, '.awos', 'commands'), { recursive: true });
  writeFileSync(join(dir, '.awos', 'commands', 'spec.md'), SDD_CONTENT);
  mkdirSync(join(dir, 'context', 'product'), { recursive: true });
  for (const f of ['product-definition.md', 'roadmap.md', 'architecture.md']) {
    writeFileSync(join(dir, 'context', 'product', f), SDD_CONTENT);
  }
  const spec = join(dir, 'context', 'spec', '001-demo');
  mkdirSync(spec, { recursive: true });
  // SDD-06 reads this record's status from functional-spec.md. It must be a
  // terminal AWOS status (not SDD_CONTENT's "Approved", which is active) so
  // this fixture reads as settled — the inheritance tests below expect PASS
  // for a fully-populated, self-sufficient spec workspace.
  writeFileSync(
    join(spec, 'functional-spec.md'),
    '# Doc\n\n- **Status:** Completed\n\nLine four.\nLine five.\nLine six.\nLine seven.\nLine eight.\n'
  );
  writeFileSync(join(spec, 'technical-considerations.md'), SDD_CONTENT);
  writeFileSync(
    join(spec, 'tasks.md'),
    '# Tasks\n\n## Slice one\n\n  - [x] Build it **[Agent: backend-dev]**\n  - [x] Verify it **[Agent: testing-expert]**\n  - [x] Ship it **[Agent: backend-dev]**\n'
  );
  writeFileSync(
    join(spec, 'impl-notes.md'),
    '# Notes\n\nSee src/api/handler.ts for the implementation.\nLine four.\nLine five.\nLine six.\nLine seven.\n'
  );
}

/** Build a root-with-member tree; `writeInto` populates whichever dir it is given. */
function orchestrationFixture(
  prefix: string,
  writeInto: (dir: string) => void,
  target: 'root' | 'member'
): { root: string; member: string } {
  const root = tmpDir(prefix);
  const member = join(root, 'services', 'api');
  mkdirSync(member, { recursive: true });
  writeInto(target === 'root' ? root : member);
  return { root, member };
}

function inheritParams(root: string) {
  return { inheritance: { orchestrationRoot: root, inherits: true } };
}

const SDD_INHERIT_CASES = [
  { id: 'SDD-01', fn: detectSpecWorkflowAdopted, bareStatus: 'FAIL' },
  { id: 'SDD-02', fn: detectProductContextDocs, bareStatus: 'FAIL' },
  { id: 'SDD-05', fn: detectSpecTriadComplete, bareStatus: 'SKIP' },
  { id: 'SDD-06', fn: detectStaleSpecs, bareStatus: 'SKIP' },
  { id: 'SDD-07', fn: detectAgentAnnotations, bareStatus: 'SKIP' },
] as const;

for (const c of SDD_INHERIT_CASES) {
  test(`${c.id} inherits capability from the orchestration root`, () => {
    const { root, member } = orchestrationFixture(
      `sdd-inherit-${c.id}-`,
      writeAwosWorkspace,
      'root'
    );
    try {
      assert.equal(
        c.fn(member).status,
        c.bareStatus,
        `${c.id} must ${c.bareStatus} for a member with no root in scope — otherwise the inheritance test proves nothing`
      );
      const res = c.fn(member, inheritParams(root));
      assert.equal(
        res.status,
        'PASS',
        `${c.id} must be credited from the orchestration root, which is where the spec workspace actually lives`
      );
      assert.ok(
        res.evidence.some((e) => /inherited from orchestration root/.test(e)),
        `${c.id}'s evidence must say the credit was inherited, so a reader can trace it; got ${JSON.stringify(res.evidence)}`
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${c.id} is unchanged for a member carrying its own capability`, () => {
    const { root, member } = orchestrationFixture(
      `sdd-own-${c.id}-`,
      writeAwosWorkspace,
      'member'
    );
    try {
      const bare = c.fn(member);
      const withRoot = c.fn(member, inheritParams(root));
      assert.deepEqual(
        withRoot,
        bare,
        `${c.id} must produce byte-identical results for a self-sufficient member whether or not a root is in scope — this is the no-regression guarantee for repos that already pass`
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${c.id} does not inherit when the category policy is false`, () => {
    const { root, member } = orchestrationFixture(
      `sdd-nopolicy-${c.id}-`,
      writeAwosWorkspace,
      'root'
    );
    try {
      const res = c.fn(member, {
        inheritance: { orchestrationRoot: root, inherits: false },
      });
      assert.equal(
        res.status,
        c.bareStatus,
        `${c.id} must respect its standards.toml policy — a root in scope is not by itself permission to inherit`
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
// SDD-01 genericized — any recognized spec-driven practice, not only AWOS
// ---------------------------------------------------------------------------

test('SDD-01 credits an ADR practice, not only AWOS', () => {
  const repo = tmpDir('awos-sdd01-adr-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    for (const n of ['0001-a.md', '0002-b.md', '0003-c.md']) {
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nAccepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n\n## Consequences\n\nSo what.\n`
      );
    }
    const res = detectSpecWorkflowAdopted(repo);
    assert.equal(
      res.status,
      'PASS',
      'a repo with a real ADR practice must not be told it lacks spec-driven development because it never installed AWOS — that is the substance of issue #160'
    );
    assert.ok(
      res.evidence.some((e) => /ADR/i.test(e)),
      `the evidence must name which practice was recognized, got ${JSON.stringify(res.evidence)}`
    );
    assert.ok(
      res.evidence.some(
        (e) => e === 'ADR / design-doc practice in use (docs/adr)'
      ),
      `the ADR label already contains "practice" — the template must not double it, got ${JSON.stringify(res.evidence)}`
    );
    assert.ok(
      res.evidence.some((e) => e.includes('docs/adr')),
      `the evidence must name the root that actually exists (docs/adr), got ${JSON.stringify(res.evidence)}`
    );
    assert.ok(
      res.evidence.every((e) => !e.includes('docs/rfcs')),
      `the evidence must not name a declared-but-absent root (docs/rfcs) as "in use", got ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-01 still credits AWOS', () => {
  const repo = tmpDir('awos-sdd01-awos-');
  try {
    mkdirSync(join(repo, '.awos', 'commands'), { recursive: true });
    writeFileSync(join(repo, '.awos', 'commands', 'spec.md'), SDD_CONTENT);
    mkdirSync(join(repo, 'context', 'product'), { recursive: true });
    writeFileSync(join(repo, 'context', 'product', 'roadmap.md'), SDD_CONTENT);
    assert.equal(
      detectSpecWorkflowAdopted(repo).status,
      'PASS',
      'genericizing must not cost AWOS projects the credit they already earned'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-01 fails a repo with no spec practice at all', () => {
  const repo = tmpDir('awos-sdd01-none-');
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    const res = detectSpecWorkflowAdopted(repo);
    assert.equal(
      res.status,
      'FAIL',
      'a repo with no design record of any kind genuinely lacks the capability and must be told so'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a single stray ADR is not a practice', () => {
  const repo = tmpDir('awos-sdd01-stray-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(
      join(repo, 'docs', 'adr', '0001-a.md'),
      '# One\n\n## Status\n\nAccepted\n'
    );
    assert.equal(
      detectSpecWorkflowAdopted(repo).status,
      'FAIL',
      'one decision record is not a discipline; awarding it would make the check meaningless'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// SDD-05/SDD-06 genericized — judged per spec-driven convention, not only AWOS
// ---------------------------------------------------------------------------

test('SDD-05 judges Kiro specs by the Kiro triad', () => {
  const repo = tmpDir('awos-sdd05-kiro-');
  try {
    const spec = join(repo, '.kiro', 'specs', 'feature-a');
    mkdirSync(spec, { recursive: true });
    for (const f of ['requirements.md', 'design.md', 'tasks.md']) {
      writeFileSync(join(spec, f), SDD_CONTENT);
    }
    assert.equal(
      detectSpecTriadComplete(repo).status,
      'PASS',
      'a complete Kiro spec must not be marked incomplete for lacking AWOS filenames'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-05 judges ADRs by template conformance', () => {
  const repo = tmpDir('awos-sdd05-adr-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    for (const n of ['0001-a.md', '0002-b.md', '0003-c.md']) {
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nAccepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n\n## Consequences\n\nSo what.\n`
      );
    }
    assert.equal(
      detectSpecTriadComplete(repo).status,
      'PASS',
      'a single-file practice is complete when its records carry the template sections; demanding three files would be nonsense for ADRs'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-06 reads the ADR status vocabulary', () => {
  const repo = tmpDir('awos-sdd06-adr-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    for (const n of ['0001-a.md', '0002-b.md', '0003-c.md']) {
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nAccepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n\n## Consequences\n\nSo what.\n`
      );
    }
    assert.equal(
      detectStaleSpecs(repo).status,
      'PASS',
      'Accepted is a terminal ADR status — settled decisions are not abandoned work'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-06 flags an ADR-practice repo whose records are all still Proposed — status alone, no task artifact needed', () => {
  // Under the status-only model, an ADR practice is judged exactly like any
  // other: three records all in the active vocabulary (Proposed) is 100% of
  // the judged ratio, so it FAILs. This used to PASS unconditionally — ADR
  // is single-file and had no task-bearing file for the old task-progress
  // condition to read — but that condition no longer exists.
  const repo = tmpDir('awos-sdd06-adr-active-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    for (const n of ['0001-a.md', '0002-b.md', '0003-c.md']) {
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nProposed\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n\n## Consequences\n\nSo what.\n`
      );
    }
    assert.equal(
      detectStaleSpecs(repo).status,
      'FAIL',
      'three Proposed (active) records out of three judged is half or more → FAIL, even though ADR has no task-bearing file'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-06 recognizes AWOS status even in the real bullet/bold template format', () => {
  const repo = tmpDir('awos-sdd06-bullet-');
  try {
    const spec = join(repo, 'context', 'spec', '001-real');
    mkdirSync(spec, { recursive: true });
    // The actual AWOS functional-spec template writes this as a bulleted,
    // bolded key, not a bare "Status: X" line — templates/functional-spec-template.md:4.
    writeFileSync(
      join(spec, 'functional-spec.md'),
      '# Functional Specification: Real feature\n\n- **Status:** Draft\n- **Author:** Someone\n'
    );
    const r = detectStaleSpecs(repo);
    assert.notEqual(
      r.status,
      'SKIP',
      'the real "- **Status:** Draft" bullet format must be recognized, not read as "no status declared"'
    );
    assert.ok(
      r.evidence.some((e) => /active/i.test(e)),
      `Draft is an active AWOS status and must show up in the active ratio, got: ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-06 reads an ADR Status section even when it is the last heading in the file', () => {
  const repo = tmpDir('awos-sdd06-lastsection-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    for (const n of ['0001-a.md', '0002-b.md', '0003-c.md']) {
      // Status is the only, and therefore last, heading — there is no
      // following "## ..." heading for the section-content regex to anchor
      // on, so it must fall back to matching true end-of-file.
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nAccepted\n`
      );
    }
    const r = detectStaleSpecs(repo);
    assert.equal(
      r.status,
      'PASS',
      'Accepted must be read even with no heading after Status — a terse ADR must not read as SKIP for having no recognized status'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("SDD-05/SDD-06 SKIP for a single stray ADR, matching SDD-01's MIN_DECISION_RECORDS gate", () => {
  const repo = tmpDir('awos-sdd0506-stray-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(
      join(repo, 'docs', 'adr', '0001-a.md'),
      '# One\n\n## Status\n\nAccepted\n'
    );
    // detectSpecFrameworks requires MIN_DECISION_RECORDS (3) before it
    // recognizes the ADR practice at all; specRootsFor alone does not apply
    // that threshold. SDD-05/06 must go through detectSpecFrameworks first
    // (as listSpecRecords does) so a single stray ADR is not scored as a
    // one-record-complete practice.
    assert.equal(
      detectSpecTriadComplete(repo).status,
      'SKIP',
      'a stray ADR below MIN_DECISION_RECORDS must not register as a spec record for SDD-05'
    );
    assert.equal(
      detectStaleSpecs(repo).status,
      'SKIP',
      'a stray ADR below MIN_DECISION_RECORDS must not register as a spec record for SDD-06'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-05 excludes a non-numbered stray dir under context/spec from the AWOS record count', () => {
  const repo = tmpDir('awos-sdd05-numeric-');
  try {
    writeRepo(repo, {
      'context/spec/001-good/functional-spec.md': '# spec\n',
      'context/spec/001-good/technical-considerations.md': '# tech\n',
      'context/spec/001-good/tasks.md': '# tasks\n',
      // Not numbered — SDD-07's listSpecDirs already ignores this; SDD-05
      // must agree, or the two checks disagree about what a spec is.
      'context/spec/scratch-notes/functional-spec.md': '# spec\n',
    });
    const r = detectSpecTriadComplete(repo);
    assert.equal(r.status, 'PASS', 'the one numbered, complete record → PASS');
    assert.ok(
      r.evidence.some((e) => e.includes('1/1 record(s)')),
      `the non-numbered dir must not be counted as a second record, got: ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-05 does not grade an ADR README index as a decision record', () => {
  const repo = tmpDir('awos-sdd05-readme-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    // A README-style index is not a decision — grading it would drag down
    // (or artificially pad) the completeness ratio for a practice whose
    // real records are all complete.
    writeFileSync(join(repo, 'docs', 'adr', 'README.md'), '# ADR index\n');
    for (const n of ['0001-a.md', '0002-b.md', '0003-c.md']) {
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nAccepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n\n## Consequences\n\nSo what.\n`
      );
    }
    const r = detectSpecTriadComplete(repo);
    assert.equal(
      r.status,
      'PASS',
      'all 3 real ADR records are complete → PASS'
    );
    assert.ok(
      r.evidence.some((e) => e.includes('3/3 record(s)')),
      `README.md must not be counted as a 4th record, got: ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// OpenSpec and GSD — newly recognized conventions (registry-driven, work
// item 2). Covers SDD-01/04/06 per the rework's minimum test requirement.
// ---------------------------------------------------------------------------

test('OpenSpec: SDD-01 PASSes for a repo with a real change record', () => {
  const repo = tmpDir('awos-sdd01-openspec-');
  try {
    writeRepo(repo, {
      'openspec/project.md': '# Project conventions\n',
      'openspec/changes/add-thing/proposal.md':
        '# Add thing\n\nWhy and what.\n',
      'openspec/changes/add-thing/tasks.md': '# Tasks\n\n- [ ] Do it\n',
    });
    const r = detectSpecWorkflowAdopted(repo);
    assert.equal(
      r.status,
      'PASS',
      'a real OpenSpec change record must be recognized as an adopted spec-driven practice'
    );
    assert.ok(
      r.evidence.some((e) => /OpenSpec/i.test(e)),
      `evidence must name OpenSpec as the recognized convention, got: ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('OpenSpec: SDD-01 WARNs when the marker exists but changes/ holds no records yet', () => {
  const repo = tmpDir('awos-sdd01-openspec-empty-');
  try {
    writeRepo(repo, { 'openspec/project.md': '# Project conventions\n' });
    const r = detectSpecWorkflowAdopted(repo);
    assert.equal(
      r.status,
      'WARN',
      'the openspec/ marker is installed but holds no change records yet'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('OpenSpec: SDD-04 counts a branch touching openspec/changes/ as spec-driven', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'feat-a', 'openspec/changes/add-a/proposal.md');
  addBranch(t, 'feat-b', 'openspec/changes/add-b/proposal.md');
  addBranch(t, 'feat-c'); // no spec touch
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.value,
    Math.round((2 / 3) * 1e10) / 1e10,
    'ratio must count both openspec/changes/ touches'
  );
});

test('OpenSpec: SDD-06 judges a change record against the OpenSpec status vocabulary', () => {
  const t = tmp();
  writeRepo(t, {
    'openspec/changes/add-thing/proposal.md':
      '# Add thing\n\n- **Status:** Draft\n\nWhy and what.\n',
    'openspec/changes/add-thing/tasks.md': '# Tasks\n\n- [ ] Do it\n',
  });
  const r = detectStaleSpecs(t);
  assert.equal(
    r.status,
    'FAIL',
    'a lone Draft (active) OpenSpec record is 100% of the judged ratio → FAIL, same status-only model as every other convention'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('active: OpenSpec: add-thing')),
    `evidence must name OpenSpec's record as active, got: ${JSON.stringify(r.evidence)}`
  );
});

function writeGsdPhase(repo: string, phase: string, planFiles: string[]): void {
  const dir = join(repo, '.planning', 'phases', phase);
  mkdirSync(dir, { recursive: true });
  for (const f of planFiles) writeFileSync(join(dir, f), `# ${f}\n`);
}

function writeGsdState(repo: string, status: string): void {
  writeRepo(repo, {
    '.planning/ROADMAP.md': '# Roadmap\n\nMilestones and phases.\n',
    '.planning/STATE.md': `---\nstatus: ${status}\n---\n\n# State\n`,
  });
}

test('GSD: SDD-01 PASSes for a repo with a real phase record', () => {
  const repo = tmpDir('awos-sdd01-gsd-');
  try {
    writeGsdState(repo, 'executing');
    writeGsdPhase(repo, '01-init', ['01-01-PLAN.md']);
    const r = detectSpecWorkflowAdopted(repo);
    assert.equal(
      r.status,
      'PASS',
      'a real GSD phase record must be recognized as an adopted spec-driven practice'
    );
    assert.ok(
      r.evidence.some((e) => /GSD/.test(e)),
      `evidence must name GSD as the recognized convention, got: ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('GSD: SDD-02 credits .planning/PROJECT.md and .planning/ROADMAP.md as foundational docs', () => {
  const repo = tmpDir('awos-sdd02-gsd-');
  try {
    const long = Array.from({ length: 8 }, (_, i) => `Line ${i}.`).join('\n');
    writeRepo(repo, {
      '.planning/PROJECT.md': `# Project\n\n${long}\n`,
      '.planning/ROADMAP.md': `# Roadmap\n\n${long}\n`,
    });
    const r = detectProductContextDocs(repo);
    assert.ok(
      r.evidence.some((e) => e.includes('.planning/PROJECT.md')),
      `.planning/PROJECT.md must satisfy the product-definition slot, got: ${JSON.stringify(r.evidence)}`
    );
    assert.ok(
      r.evidence.some((e) => e.includes('.planning/ROADMAP.md')),
      `.planning/ROADMAP.md must satisfy the roadmap slot, got: ${JSON.stringify(r.evidence)}`
    );
    assert.equal(
      r.value,
      2,
      'exactly the product-definition and roadmap slots are satisfied — GSD has no architecture-record equivalent'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('GSD: SDD-04 counts a branch touching .planning/phases/ as spec-driven', () => {
  const t = tmp();
  gitInit(t);
  addBranch(t, 'feat-a', '.planning/phases/01-init/01-01-PLAN.md');
  addBranch(t, 'feat-b'); // no spec touch
  addBranch(t, 'feat-c'); // no spec touch
  const r = detectBranchSpecRatio(t);
  assert.equal(
    r.value,
    Math.round((1 / 3) * 1e10) / 1e10,
    'ratio must count the .planning/phases/ touch'
  );
});

test('GSD: SDD-05 a phase directory is complete once it holds one NN-PP-PLAN.md file', () => {
  const repo = tmpDir('awos-sdd05-gsd-');
  try {
    writeGsdState(repo, 'executing');
    writeGsdPhase(repo, '01-init', ['01-01-PLAN.md', '01-02-PLAN.md']);
    const r = detectSpecTriadComplete(repo);
    assert.equal(
      r.status,
      'PASS',
      'a phase directory holding PLAN.md-pattern files is structurally complete'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('GSD: SDD-05 a phase directory with no matching PLAN.md file is incomplete', () => {
  const repo = tmpDir('awos-sdd05-gsd-incomplete-');
  try {
    writeGsdState(repo, 'executing');
    const dir = join(repo, '.planning', 'phases', '01-init');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'notes.md'), '# Notes\n');
    const r = detectSpecTriadComplete(repo);
    assert.notEqual(
      r.status,
      'PASS',
      'a phase directory with no file matching -PLAN.md$ must not read as complete'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('GSD: SDD-06 PASSes a project mid-flight ("executing") — working is not stalled', () => {
  // "executing" means the team is actively working — the opposite of
  // abandonment. Mapping every GSD working state to "active" (in the
  // AWOS "not yet Completed" sense) would make SDD-06 read as "is this
  // project finished?" and FAIL every in-progress GSD project by
  // definition. Only paused/stopped — nobody working on it — count as
  // stalled; see the companion test below.
  const repo = tmpDir('awos-sdd06-gsd-executing-');
  try {
    writeGsdState(repo, 'executing');
    writeGsdPhase(repo, '01-init', ['01-01-PLAN.md']);
    writeGsdPhase(repo, '02-next', ['02-01-PLAN.md']);
    const r = detectStaleSpecs(repo);
    assert.equal(
      r.status,
      'PASS',
      '0 of 2 judged records active — "executing" is a working (terminal, not-stalled) status for GSD, not an active/stale one'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('GSD: SDD-06 flags a project whose STATE.md is paused — every phase record shares the one status', () => {
  const repo = tmpDir('awos-sdd06-gsd-paused-');
  try {
    writeGsdState(repo, 'paused');
    writeGsdPhase(repo, '01-init', ['01-01-PLAN.md']);
    writeGsdPhase(repo, '02-next', ['02-01-PLAN.md']);
    const r = detectStaleSpecs(repo);
    assert.equal(
      r.status,
      'FAIL',
      '2 of 2 judged records active (both read the one project-level "paused" status) — half or more → FAIL'
    );
    assert.ok(
      r.evidence.some((e) => e.includes('active: GSD: 01-init (paused)')),
      `evidence must show the shared "paused" status applied to the first phase, got: ${JSON.stringify(r.evidence)}`
    );
    assert.ok(
      r.evidence.some((e) => e.includes('active: GSD: 02-next (paused)')),
      `evidence must show the shared "paused" status applied to the second phase, got: ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('GSD: SDD-06 PASSes once STATE.md declares the project done — every phase record settles together', () => {
  // Proves the project-level status is actually read per call, not cached
  // stale: the only thing that changes between this fixture and the
  // executing/paused fixtures above is STATE.md's status value, and every
  // phase record's verdict flips with it.
  const repo = tmpDir('awos-sdd06-gsd-done-');
  try {
    writeGsdState(repo, 'complete'); // terminal
    writeGsdPhase(repo, '01-init', ['01-01-PLAN.md']);
    writeGsdPhase(repo, '02-next', ['02-01-PLAN.md']);
    const r = detectStaleSpecs(repo);
    assert.equal(
      r.status,
      'PASS',
      '0 of 2 judged records active once STATE.md reads "complete" (terminal) → PASS'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// GitHub Spec Kit detection — SDD-01 (code 2800) and the framework registry.
//
// Spec Kit's markers are `.specify` and `specs`. `.specify/` is unique enough
// to stand alone; `specs/` is not — Jest, Mocha and RSpec projects all keep
// test suites there. A bare test directory must not be credited as an adopted
// spec practice (and must not flip topology.has_spec_workflow, which un-SKIPs
// the rest of the dimension).
// ---------------------------------------------------------------------------

test('Spec Kit: a bare specs/ directory holding only test files is not an adopted spec practice', () => {
  const repo = tmpDir('awos-sdd01-speckit-jest-');
  try {
    writeRepo(repo, {
      'specs/user.spec.js':
        "describe('user', () => {\n  it('works', () => {\n    expect(1).toBe(1);\n  });\n});\n",
    });
    const found = detectSpecFrameworks(repo).map((f) => f.framework.id);
    assert.ok(
      !found.includes('spec-kit'),
      `a specs/ directory of Jest tests is not GitHub Spec Kit — "specs" is a conventional test-suite name, so the marker needs a real spec record behind it; got ${JSON.stringify(found)}`
    );
    const r = DETECTORS[2800](repo);
    assert.notEqual(
      r.status,
      'PASS',
      `SDD-01 must not award spec-driven credit to a repo whose only "spec" content is a Jest test directory; got ${r.status} with evidence ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('Spec Kit: .specify/ alone is enough — the install marker is unambiguous', () => {
  const repo = tmpDir('awos-sdd01-speckit-specify-');
  try {
    writeRepo(repo, {
      '.specify/templates/spec-template.md': '# Spec template\n',
    });
    const found = detectSpecFrameworks(repo).map((f) => f.framework.id);
    assert.ok(
      found.includes('spec-kit'),
      `.specify/ is Spec Kit's own installation directory and must qualify on its own, got ${JSON.stringify(found)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('Spec Kit: a specs/ directory holding real spec records qualifies without .specify/', () => {
  // The layout `specify init` produces: specs/NNN-feature/spec.md. Records may
  // be spec.md alone — the full spec/plan/tasks triad is not required, and a
  // real Spec Kit repo often has only spec.md at this stage.
  const repo = tmpDir('awos-sdd01-speckit-records-');
  try {
    writeRepo(repo, {
      'specs/001-user-onboarding/spec.md':
        '# User onboarding\n\n## Requirements\n\nUsers can sign up.\n',
    });
    const found = detectSpecFrameworks(repo).map((f) => f.framework.id);
    assert.ok(
      found.includes('spec-kit'),
      `specs/001-user-onboarding/spec.md is a genuine Spec Kit record and must be recognized, got ${JSON.stringify(found)}`
    );
    assert.equal(
      DETECTORS[2800](repo).status,
      'PASS',
      'a repo with real spec records under specs/ has adopted a spec-driven practice'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
