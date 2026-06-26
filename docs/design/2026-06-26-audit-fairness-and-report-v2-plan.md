# Audit fairness + report v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `ai-readiness-audit` engine's scoring fair, its values legible, and its data-sources honest, and fix the detector bugs surfaced by the `onex-discovery-api` run.

**Architecture:** TypeScript engine under `plugins/awos/skills/ai-readiness-audit/`, bundled by esbuild into a committed `dist/cli.js`. Detectors/metrics compute from collector artifacts and a TOML category registry (`references/standards.toml`); topology flags gate each category's `applies_when`. Detection is driven by per-language (`languages.ts`) and per-tool (`agent_tools.ts`) registries — detectors iterate the registry rather than hardcoding tools/languages. The renderer turns `audit.json` into Markdown + HTML deterministically.

**Tech Stack:** TypeScript, Node `node:test` + `tsx`, esbuild, smol-toml, web-tree-sitter (bundled `.wasm` grammars).

## Global Constraints

- Work lands as staged commits on branch `feat/ai-sdlc-metrics` (PR #139).
- Node binary for tests: use a real Node toolchain — `/opt/homebrew/bin/node` locally (the bare `node` may be a Bun shim that breaks `node:test`). CI uses real Node.
- Install deps once before engine tests: `npm ci` (the engine layer needs `tsx`/`esbuild`/`typescript`).
- Run the full engine suite with `npm run test:engine`. Run a single test file with `/opt/homebrew/bin/node --import tsx --test <path/to/file.test.ts>`.
- Run a detector/metric directly against source (no rebuild) with `/opt/homebrew/bin/node --import tsx plugins/awos/skills/ai-readiness-audit/cli.ts <verb> <args>`.
- **After editing any engine `.ts`, rebuild and commit `dist/`:** `npm run build:engine`, then `git add` the regenerated `dist/`. CI runs `git diff --exit-code` on `dist/` and fails on a stale bundle. Each engine task's commit includes the rebuilt `dist/`.
- Every new structural contract (frontmatter key, category code, topology flag) ships with a test in the same task.
- `standards-schema.test.ts` guards that every `applies_when` topology flag is computed in `topology.ts` — new flags must be added there or the guard fails.
- Prettier config is CI-enforced: run `npx prettier --write <changed files>` before committing.
- Markdown prose (specs, dimension `.md`, SKILL.md) is not hard-wrapped at 80 cols; one logical line per paragraph/list item.
- Commit messages: conventional, `feat(audit):` / `fix(audit):` / `docs(audit):`.

Design reference: `docs/design/2026-06-26-audit-fairness-and-report-v2-design.md` (section numbers `§N` below map to it).

---

## Task 1: Shared generated-file ignore set (§5.3)

**Files:**

- Create: `plugins/awos/skills/ai-readiness-audit/generated.ts`
- Create (test): `plugins/awos/skills/ai-readiness-audit/generated.test.ts`

**Interfaces:**

- Produces: `GENERATED_GLOBS: string[]`, `isGeneratedPath(repoRelPath: string): boolean`, `gitattributesGeneratedGlobs(repoPath: string): string[]`. Consumed later by Task 8 (ARCH-06 + complexity/scale) and Task 15 (doc-comment coverage).

- [ ] **Step 1: Write the failing test**

```ts
// generated.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedPath, GENERATED_GLOBS } from './generated.ts';

test('isGeneratedPath flags common generated/vendored artifacts', () => {
  for (const p of [
    'htmlcov/coverage_html_cb_dd2e7eb5.js',
    'app/proto/user_pb2.py',
    'app/proto/user_pb2_grpc.py',
    'src/schema.generated.ts',
    'src/__generated__/types.ts',
    'vendor/lib/x.go',
    'dist/bundle.js',
    'build/out.js',
    '.next/static/chunk.js',
    'node_modules/left-pad/index.js',
    'assets/app.min.js',
  ]) {
    assert.equal(isGeneratedPath(p), true, `expected generated: ${p}`);
  }
});

test('isGeneratedPath leaves hand-written source alone', () => {
  for (const p of ['src/app/main.py', 'internal/handler.go', 'lib/util.ts']) {
    assert.equal(isGeneratedPath(p), false, `expected source: ${p}`);
  }
  assert.ok(GENERATED_GLOBS.length > 0, 'GENERATED_GLOBS must be non-empty');
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/generated.test.ts`
Expected: FAIL — `Cannot find module './generated.ts'`.

- [ ] **Step 3: Implement `generated.ts`**

```ts
// generated.ts — shared set of generated/vendored path patterns excluded from
// fairness-sensitive metrics (file size, complexity, scale, doc coverage).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Glob-ish suffix/dir markers for generated or vendored files. */
export const GENERATED_GLOBS: string[] = [
  '**/htmlcov/**',
  '**/*_pb2.py',
  '**/*_pb2_grpc.py',
  '**/*.generated.*',
  '**/generated/**',
  '**/__generated__/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/node_modules/**',
  '**/*.min.*',
];

// Directory segments that, if present anywhere in the path, mark it generated/vendored.
const DIR_MARKERS = [
  'htmlcov',
  'generated',
  '__generated__',
  'vendor',
  'dist',
  'build',
  '.next',
  'node_modules',
];

/** True if a repo-relative path looks generated or vendored. */
export function isGeneratedPath(repoRelPath: string): boolean {
  const p = repoRelPath.replace(/\\/g, '/');
  const segments = p.split('/');
  if (segments.some((s) => DIR_MARKERS.includes(s))) return true;
  if (/(?:_pb2(?:_grpc)?)\.py$/.test(p)) return true;
  if (/\.generated\.[^/]+$/.test(p)) return true;
  if (/\.min\.[^/]+$/.test(p)) return true;
  return false;
}

/**
 * Extra globs from `.gitattributes` `linguist-generated` entries, if present.
 * Returns the path patterns (left-hand column) marked linguist-generated=true.
 */
export function gitattributesGeneratedGlobs(repoPath: string): string[] {
  const f = join(repoPath, '.gitattributes');
  if (!existsSync(f)) return [];
  const out: string[] = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (
      /linguist-generated(?:=true)?\b/.test(t) &&
      !/linguist-generated=false/.test(t)
    ) {
      const pat = t.split(/\s+/)[0];
      if (pat) out.push(pat);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/generated.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/generated.ts plugins/awos/skills/ai-readiness-audit/generated.test.ts
git add plugins/awos/skills/ai-readiness-audit/generated.ts plugins/awos/skills/ai-readiness-audit/generated.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "feat(audit): shared generated/vendored file ignore set"
```

---

## Task 2: Spec-triad signal (ADP-G1 code 106) always-zero bug (§6.1)

**Problem:** `collectors/git.ts` `TOOLING_CANDIDATES` omits spec dirs, so `raw.tooling_paths` never contains `context/`, and `metrics/adp_g1_tooling_depth.ts` code 106 never fires — despite SDD-04 detecting spec usage. This produced the false "most features not built through the spec triad."

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/collectors/git.ts:72-85`
- Modify: `plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_tooling_depth.ts:45-51`
- Test: `plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_spec_signal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// adp_g1_spec_signal.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collect } from '../collectors/git.ts';
import { compute } from './adp_g1_tooling_depth.ts';

function tmpRepoWithSpec(): string {
  const dir = mkdtempSync(join(tmpdir(), 'awos-spec-'));
  mkdirSync(join(dir, 'context', 'spec', '001-feature'), { recursive: true });
  writeFileSync(
    join(dir, 'context', 'spec', '001-feature', 'functional-spec.md'),
    '# spec\n'
  );
  return dir;
}

test('ADP-G1 code 106 fires when context/spec/ exists', () => {
  const repo = tmpRepoWithSpec();
  const collected = mkdtempSync(join(tmpdir(), 'awos-collected-'));
  try {
    const art = collect(repo, {
      bucket_days: 30,
      lookback_days: 730,
      history_available_days: 0,
    });
    writeFileSync(join(collected, 'git.json'), JSON.stringify(art));
    const res = compute(collected, {}, {});
    assert.ok(
      (res.categories_awarded as number[]).includes(106),
      `code 106 (spec signal) must be awarded for a repo with context/spec/; got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(collected, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_spec_signal.test.ts`
Expected: FAIL — `code 106 must be awarded …` (106 absent).

- [ ] **Step 3a: Add spec dirs to `git.ts` `TOOLING_CANDIDATES`**

In `collectors/git.ts`, change the `TOOLING_CANDIDATES` array (currently lines 72-81) to append the spec-signal paths:

```ts
const TOOLING_CANDIDATES = [
  ...new Set([
    ...ALL_INSTRUCTION_FILES,
    ...ALL_RULE_COMMAND_DIRS,
    ...ALL_SKILL_DIRS,
    ...ALL_HOOK_PATHS,
    ...ALL_MCP_CONFIG_PATHS,
    ...ALL_TOOL_CONFIG_DIRS,
    // Spec-driven adoption signals (ADP-G1 code 106).
    'context/spec',
    'context',
    '.awos',
  ]),
];
```

- [ ] **Step 3b: Tighten code 106 paths in `adp_g1_tooling_depth.ts`**

Replace the code-106 entry (lines 45-50) so it matches the spec-specific signals and drops the over-broad bare `scripts`:

```ts
  // Code 106: spec-driven adoption signals — context/spec, context/, or .awos/
  { paths: ['context/spec', 'context', '.awos'], code: 106 },
```

Update the comment block at the top (line 18) to match: `106 → spec-driven signals (context/spec, context/, .awos/)`.

- [ ] **Step 4: Run the test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_spec_signal.test.ts`
Expected: PASS.

- [ ] **Step 5: Full engine suite, rebuild dist, format, commit**

```bash
npm run test:engine
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/collectors/git.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_tooling_depth.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_spec_signal.test.ts
git add plugins/awos/skills/ai-readiness-audit/collectors plugins/awos/skills/ai-readiness-audit/metrics plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): feed spec dirs into ADP-G1 so code 106 (spec signal) fires"
```

---

## Task 3: PAI-05 — local-only files are meant to be untracked (§6.2)

**Problem:** `detectors/prompt_agent_integrity.ts` flags `.claude/settings.local.json` as "not tracked in git," but local settings are intentionally gitignored.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/agent_tools.ts` (add `localOnlyFiles` to `AgentToolDef`, populate, export `ALL_LOCAL_ONLY_FILES`)
- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.ts` (`listAgentFiles`, ~71-97)
- Test: `plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts` (extend), `plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity_local.test.ts` (new)

**Interfaces:**

- Produces: `AgentToolDef.localOnlyFiles: string[]`; `ALL_LOCAL_ONLY_FILES: string[]`; `isLocalOnlyAgentFile(repoRelPath: string): boolean`.

- [ ] **Step 1: Write the failing test (registry)**

Append to `agent_tools.test.ts`:

```ts
import { ALL_LOCAL_ONLY_FILES, isLocalOnlyAgentFile } from './agent_tools.ts';

test('local-only agent files are recognized and excluded from tracking checks', () => {
  assert.ok(
    ALL_LOCAL_ONLY_FILES.length > 0,
    'registry must declare local-only files'
  );
  assert.equal(
    isLocalOnlyAgentFile('.claude/settings.local.json'),
    true,
    'Claude local settings must be treated as local-only (expected untracked)'
  );
  assert.equal(
    isLocalOnlyAgentFile('.claude/settings.json'),
    false,
    'shared settings must NOT be local-only'
  );
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts`
Expected: FAIL — `ALL_LOCAL_ONLY_FILES` is not exported.

- [ ] **Step 3: Extend the registry**

In `agent_tools.ts`: add `localOnlyFiles: string[]` to the `AgentToolDef` interface (after `commitAttribution`). Add a `localOnlyFiles` entry to each tool — for the `claude` tool use `['.claude/settings.local.json']`; for every other tool use `[]` for now (extend later as conventions emerge). Then add, alongside the other `ALL_*` exports:

```ts
export const ALL_LOCAL_ONLY_FILES = uniq(
  AGENT_TOOLS.flatMap((t) => t.localOnlyFiles)
);

/** True if a repo-relative path is an agent file expected to be git-ignored. */
export function isLocalOnlyAgentFile(repoRelPath: string): boolean {
  const p = repoRelPath.replace(/\\/g, '/');
  return (
    ALL_LOCAL_ONLY_FILES.includes(p) ||
    /(^|\/)settings\.local\.json$/.test(p) ||
    /(^|\/)[^/]*\.local\.(json|toml|ya?ml)$/.test(p)
  );
}
```

- [ ] **Step 4: Run the registry test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing detector test**

```ts
// detectors/prompt_agent_integrity_local.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

test('PAI-05 does not penalize an untracked *.local.json settings file', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-pai05-'));
  try {
    git(repo, 'init', '--quiet');
    git(repo, 'config', 'user.email', 't@e.com');
    git(repo, 'config', 'user.name', 'T');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, 'CLAUDE.md'), '# ctx\n- non-obvious rule\n');
    writeFileSync(join(repo, '.claude', 'settings.json'), '{}\n');
    writeFileSync(
      join(repo, '.claude', 'settings.local.json'),
      '{"local":true}\n'
    );
    writeFileSync(join(repo, '.gitignore'), '.claude/settings.local.json\n');
    git(repo, 'add', 'CLAUDE.md', '.claude/settings.json', '.gitignore');
    git(repo, 'commit', '--quiet', '-m', 'init');

    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2404', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    const ev = JSON.stringify(res.evidence ?? []);
    assert.ok(
      !ev.includes('settings.local.json'),
      `settings.local.json must not be flagged as untracked; evidence: ${ev}`
    );
    assert.notEqual(
      res.status,
      'FAIL',
      'PAI-05 must not FAIL solely on a local-only file'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity_local.test.ts`
Expected: FAIL — evidence still lists `settings.local.json`.

- [ ] **Step 7: Exclude local-only files in the detector**

In `detectors/prompt_agent_integrity.ts`, import the helper at the top with the other `agent_tools` imports:

```ts
import { isLocalOnlyAgentFile } from '../agent_tools.ts';
```

In `listAgentFiles()` (the function returning the agent-file list used by the tracked-in-git check, ~71-97), filter out local-only files before returning. Replace the final `return [...new Set(results)].sort();` with:

```ts
return [...new Set(results)]
  .filter((f) => !isLocalOnlyAgentFile(f.replace(repoPath + '/', '')))
  .sort();
```

If `results` already holds repo-relative paths, drop the `.replace(...)`; pass the repo-relative form to `isLocalOnlyAgentFile`. Read the function first to confirm whether paths are absolute or relative and adjust the argument accordingly.

- [ ] **Step 8: Run the detector test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity_local.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite, rebuild dist, format, commit**

```bash
npm run test:engine
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/agent_tools.ts plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.ts plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity_local.test.ts
git add plugins/awos/skills/ai-readiness-audit/agent_tools.ts plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): PAI-05 excludes local-only agent files (expected untracked)"
```

---

## Task 4: AI-04 — note org/MGM-pushed MCP invisibility (§6.3)

**Problem:** AI-04 only sees repo-committed MCP config; org/MGM-pushed MCP is invisible. Absence should not read as "no MCP."

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.ts` (AI-04 detector, code 2003)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling_ai04.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// detectors/ai_development_tooling_ai04.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('AI-04 evidence explains org-level MCP invisibility when none found in-repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-ai04-'));
  try {
    writeFileSync(join(repo, 'README.md'), '# x\n');
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2003', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    const ev = (res.evidence ?? []).join(' ').toLowerCase();
    assert.ok(
      ev.includes('org') ||
        ev.includes('not visible') ||
        ev.includes('outside the repo'),
      `AI-04 evidence must note repo-only visibility; got: ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling_ai04.test.ts`
Expected: FAIL — no such evidence string.

- [ ] **Step 3: Add the evidence note**

Read the AI-04 detector function in `ai_development_tooling.ts` (the one returning the MCP-config result, category code 2003). On the no-MCP-found branch (currently returns FAIL/WARN with empty or "no MCP config" evidence), append an evidence line:

```ts
'note: only repo-committed MCP config is visible here; org/MGM-pushed MCP servers configured outside the repo are not detectable and may still be in use',
```

Keep the existing status (do not assert a penalty change beyond the note; absence stays as it was, just explained).

- [ ] **Step 4: Run the test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling_ai04.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, rebuild dist, format, commit**

```bash
npm run test:engine && npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.ts plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling_ai04.test.ts
git add plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): AI-04 notes org-level MCP invisibility (absence != none)"
```

---

## Task 5: DOC-04 — stop treating non-paths as filesystem paths (§6.4)

**Problem:** `extractLocalLinks` (`documentation.ts:369-422`) treats any `/...` token as a path, flagging `/api` (route) and `/awos:architecture` (skill name) as missing files.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/documentation.ts:369-422`
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/documentation_doc04.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// detectors/documentation_doc04.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('DOC-04 ignores route/command-like references, flags real dead file links', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-doc04-'));
  try {
    writeFileSync(
      join(repo, 'README.md'),
      [
        '# App',
        'Call the `/api` endpoint. Run `/awos:architecture`.',
        'See [missing doc](./docs/gone.md).',
      ].join('\n') + '\n'
    );
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2203', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    const ev = (res.evidence ?? []).join(' ');
    assert.ok(
      !ev.includes('/api'),
      `/api must not be flagged as a path; got: ${ev}`
    );
    assert.ok(
      !ev.includes('/awos:architecture'),
      `/awos:architecture must not be flagged; got: ${ev}`
    );
    assert.ok(
      ev.includes('docs/gone.md'),
      `genuine dead link must still be flagged; got: ${ev}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/documentation_doc04.test.ts`
Expected: FAIL — `/api` / `/awos:architecture` flagged.

- [ ] **Step 3: Filter extracted references to plausible paths**

In `documentation.ts`, after `extractLocalLinks` collects candidate references, add a predicate and filter before the existence check. Add this helper near `extractLocalLinks`:

```ts
/** A reference is checkable as a filesystem path only if it looks like a file. */
function looksLikeFilePath(ref: string): boolean {
  const r = ref.trim();
  if (r.length === 0) return false;
  if (r.includes(':')) return false; // command/skill names like awos:architecture, URLs
  if (!/\.[A-Za-z0-9]{1,8}$/.test(r)) return false; // must end in a file extension
  return true;
}
```

Then change the consumer that reports missing references so it only reports a ref when `looksLikeFilePath(ref)` is true AND it fails the existing on-disk existence check. (Read lines 369-422 to find where the returned list is filtered/existence-checked; apply `looksLikeFilePath` there.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/documentation_doc04.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, rebuild dist, format, commit**

```bash
npm run test:engine && npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/detectors/documentation.ts plugins/awos/skills/ai-readiness-audit/detectors/documentation_doc04.test.ts
git add plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): DOC-04 only checks references that look like file paths"
```

---

## Task 6: AS-06 — recognize framework-native auth (§5.1)

**Problem:** `application_security.ts` `AUTH_DECORATOR_RX` matches only Flask/Django/Express idioms, so FastAPI dependency-injection auth (`Depends(get_current_user)`) false-FAILs while AS-10 PASSes.

**Files:**

- Create: `plugins/awos/skills/ai-readiness-audit/frameworks.ts` (framework-auth pattern registry)
- Create (test): `plugins/awos/skills/ai-readiness-audit/frameworks.test.ts`
- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/application_security.ts:505-599` (AS-06)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/application_security_as06.test.ts`

**Interfaces:**

- Produces: `FRAMEWORK_AUTH_PATTERNS: RegExp[]` (union of decorator/middleware/DI/guard auth markers), consumed by AS-06.

- [ ] **Step 1: Write the failing registry test**

```ts
// frameworks.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMEWORK_AUTH_PATTERNS } from './frameworks.ts';

const hasAuth = (src: string) =>
  FRAMEWORK_AUTH_PATTERNS.some((rx) => rx.test(src));

test('framework auth patterns recognize DI/guard/decorator idioms', () => {
  assert.ok(
    hasAuth('async def update(user = Depends(get_current_user)):'),
    'FastAPI Depends auth'
  );
  assert.ok(hasAuth('@UseGuards(AuthGuard)'), 'NestJS guard');
  assert.ok(
    hasAuth('@PreAuthorize("hasRole(\'ADMIN\')")'),
    'Spring PreAuthorize'
  );
  assert.ok(hasAuth('[Authorize]'), 'ASP.NET attribute');
  assert.ok(hasAuth('@login_required'), 'Flask/Django decorator');
});

test('framework auth patterns do not match unrelated code', () => {
  assert.equal(hasAuth('def add(a, b):\n    return a + b'), false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/frameworks.test.ts`
Expected: FAIL — `Cannot find module './frameworks.ts'`.

- [ ] **Step 3: Implement `frameworks.ts`**

```ts
// frameworks.ts — framework-native authentication/authorization markers.
// Used by AS-06 so dependency-injection and guard idioms count as protection,
// not just decorator/middleware names.
export const FRAMEWORK_AUTH_PATTERNS: RegExp[] = [
  // FastAPI / Starlette dependency injection
  /Depends\(\s*[A-Za-z_][\w.]*(?:current_user|get_current_user|require_[a-z_]+|auth[\w]*|verify_[a-z_]+)/i,
  /Security\(\s*[A-Za-z_][\w.]*\)/,
  // NestJS guards
  /@UseGuards\(/,
  // Spring Security
  /@PreAuthorize\(|@Secured\(|@RolesAllowed\(/,
  // ASP.NET
  /\[Authorize(?:\([^)]*\))?\]/,
  // Generic decorator/middleware idioms (Flask/Django/Express/etc.)
  /@(?:login_required|auth_required|requires_auth|authenticated|jwt_required|permission_classes|require_[a-z_]+)/i,
  /\b(?:authenticate|isAuthenticated|requireAuth|authMiddleware|bearerAuth|apiKeyAuth|verifyToken|checkAuth|jwt\.verify|auth\.required)\b/i,
];
```

- [ ] **Step 4: Run the registry test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/frameworks.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing AS-06 detector test**

```ts
// detectors/application_security_as06.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('AS-06 treats FastAPI Depends-based auth on mutations as protected', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-as06-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    writeFileSync(
      join(repo, 'app', 'routes.py'),
      [
        'from fastapi import APIRouter, Depends',
        'from .auth import get_current_user',
        'router = APIRouter()',
        '',
        '@router.post("/items")',
        'async def create_item(payload: dict, user = Depends(get_current_user)):',
        '    return payload',
        '',
        '@router.delete("/items/{id}")',
        'async def delete_item(id: int, user = Depends(get_current_user)):',
        '    return {"ok": True}',
      ].join('\n') + '\n'
    );
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '3005', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    assert.notEqual(
      res.status,
      'FAIL',
      `DI-protected mutations must not FAIL AS-06; got ${res.status} / ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/application_security_as06.test.ts`
Expected: FAIL — AS-06 returns FAIL (DI not recognized).

- [ ] **Step 7: Wire the registry into AS-06**

In `detectors/application_security.ts`, import the registry near the top:

```ts
import { FRAMEWORK_AUTH_PATTERNS } from '../frameworks.ts';
```

In the AS-06 function (~505-599), the per-file auth detection currently tests `AUTH_DECORATOR_RX`. Change the "file has auth" decision to also accept any `FRAMEWORK_AUTH_PATTERNS` match. Locate where each mutation-route file's content is tested for auth and replace the single-regex test with:

```ts
const fileHasAuth =
  AUTH_DECORATOR_RX.test(content) ||
  FRAMEWORK_AUTH_PATTERNS.some((rx) => rx.test(content));
```

Use `fileHasAuth` in the existing "auth + mutations" vs "mutation routes without auth" branching.

- [ ] **Step 8: Run the AS-06 test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/application_security_as06.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite, rebuild dist, format, commit**

```bash
npm run test:engine && npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/frameworks.ts plugins/awos/skills/ai-readiness-audit/frameworks.test.ts plugins/awos/skills/ai-readiness-audit/detectors/application_security.ts plugins/awos/skills/ai-readiness-audit/detectors/application_security_as06.test.ts
git add plugins/awos/skills/ai-readiness-audit/frameworks.ts plugins/awos/skills/ai-readiness-audit/frameworks.test.ts plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): AS-06 recognizes framework-native auth (FastAPI DI, guards, attrs)"
```

---

## Task 7: AS-03 — separate "CORS not configured" from "safe" (§5.2)

**Problem:** `application_security.ts:191-279` returns PASS with value 0 when no CORS config is found, conflating "configured and scoped" with "absent."

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/application_security.ts:191-279` (AS-03)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/application_security_as03.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// detectors/application_security_as03.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

function detect(repo: string) {
  return JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '3002', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );
}

test('AS-03 returns N/A (not a value-0 PASS) when no CORS config exists', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-as03-none-'));
  try {
    writeFileSync(join(repo, 'app.py'), 'print("no cors here")\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      `no-CORS must be SKIP/N-A, not PASS; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-03 FAILs on a wildcard origin', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-as03-wild-'));
  try {
    writeFileSync(
      join(repo, 'app.py'),
      'CORSMiddleware(allow_origins=["*"])\n'
    );
    const res = detect(repo);
    assert.equal(res.status, 'FAIL', `wildcard must FAIL; got ${res.status}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/application_security_as03.test.ts`
Expected: FAIL — no-CORS case returns PASS, not SKIP.

- [ ] **Step 3: Distinguish the three states**

In the AS-03 function, the final branch (currently `return PASS, value 0, "no CORS wildcard origin found — either CORS is not configured or origins are restricted"`) must split:

- If a CORS construct was found and it is wildcard → `FAIL` (unchanged).
- If a CORS construct was found and origins are scoped → `PASS` (value = origin count; evidence names them).
- If NO CORS construct was found at all → return a SKIP result (`status: 'SKIP'`, value `null`, evidence `'no CORS configuration found — browsers default to same-origin; check is not applicable'`).

Track whether any CORS keyword (`CORSMiddleware`, `cors(`, `Access-Control-Allow-Origin`, `@CrossOrigin`, etc. — reuse the detector's existing CORS-presence signal) matched. Use that boolean to choose PASS vs SKIP on the non-wildcard path. (`detect`'s SKIP maps to N/A in the renderer.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/application_security_as03.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Full suite, rebuild dist, format, commit**

```bash
npm run test:engine && npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/detectors/application_security.ts plugins/awos/skills/ai-readiness-audit/detectors/application_security_as03.test.ts
git add plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): AS-03 distinguishes unconfigured CORS (N/A) from scoped (PASS)"
```

---

## Task 8: ARCH-06 — exclude generated files, per-language thresholds (§5.3)

**Problem:** `code_architecture.ts:485-570` uses a flat 300-line threshold over `ALL_SOURCE_GLOBS`, counting generated files. Complexity/scale metrics share the no-exclusion issue.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/languages.ts` (add `sizeThreshold?` to `LanguageDef`)
- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.ts:485-570` (ARCH-06)
- Modify: `plugins/awos/skills/ai-readiness-audit/metrics/adp_g10_complexity.ts`, `metrics/adp_g11_scale.ts` (exclude generated files)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/code_architecture_arch06.test.ts`

**Interfaces:**

- Produces: `LanguageDef.sizeThreshold?: number`; helper `sizeThresholdForFile(repoRelPath: string): number` in `languages.ts` (default 300).

- [ ] **Step 1: Write the failing test**

```ts
// detectors/code_architecture_arch06.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;
const bigFile = (n: number) =>
  Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n') + '\n';

test('ARCH-06 ignores generated files when judging file size', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch06-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    mkdirSync(join(repo, 'htmlcov'), { recursive: true });
    writeFileSync(join(repo, 'app', 'main.py'), bigFile(50)); // small, hand-written
    writeFileSync(join(repo, 'htmlcov', 'coverage_html.js'), bigFile(2000)); // generated, huge
    writeFileSync(join(repo, 'app', 'user_pb2.py'), bigFile(2000)); // generated, huge
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2105', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    const ev = (res.evidence ?? []).join(' ');
    assert.ok(
      !ev.includes('htmlcov'),
      `generated htmlcov must be excluded; got ${ev}`
    );
    assert.ok(
      !ev.includes('_pb2'),
      `generated _pb2 must be excluded; got ${ev}`
    );
    assert.equal(
      res.status,
      'PASS',
      `only a small hand-written file remains; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/code_architecture_arch06.test.ts`
Expected: FAIL — generated files counted; status not PASS.

- [ ] **Step 3: Add per-language threshold to `languages.ts`**

Add `sizeThreshold?: number;` to the `LanguageDef` interface. Set values on the verbose-idiom languages (append `sizeThreshold` to these entries): `go: 500`, `java: 500`, `csharp: 500`, `kotlin: 450`, `scala: 450`. Leave others unset (default applies). Add at the bottom, after the `ALL_*` exports:

```ts
import { extname } from 'node:path';

const DEFAULT_SIZE_THRESHOLD = 300;

/** Per-language max reasonable file size (lines); falls back to 300. */
export function sizeThresholdForFile(repoRelPath: string): number {
  const ext = extname(repoRelPath).toLowerCase();
  const lang = LANGUAGES.find((l) =>
    l.sourceGlobs.some((g) => g.toLowerCase().endsWith(ext))
  );
  return lang?.sizeThreshold ?? DEFAULT_SIZE_THRESHOLD;
}
```

(Move the `extname` import to join the existing `node:path` import line rather than adding a second import.)

- [ ] **Step 4: Wire exclusion + threshold into ARCH-06**

In `code_architecture.ts`, import the helpers:

```ts
import { sizeThresholdForFile } from '../languages.ts';
import { isGeneratedPath } from '../generated.ts';
```

In the ARCH-06 function (~485-570): when iterating source files, `continue` (skip) any file where `isGeneratedPath(relPath)` is true. Replace the fixed `LOC_THRESHOLD = 300` comparison with a per-file threshold: `const threshold = sizeThresholdForFile(relPath); if (lineCount > threshold) { ...oversized... }`. The ratio/PASS-WARN-FAIL banding stays the same.

- [ ] **Step 5: Exclude generated files in complexity/scale metrics**

In `metrics/adp_g10_complexity.ts` and `metrics/adp_g11_scale.ts`, import `isGeneratedPath` from `../generated.ts` and skip files for which it returns true in the file-iteration loop (read each metric to find the loop that enumerates source files; add the guard right after the path is known). Run the existing metric tests after to confirm no regression.

- [ ] **Step 6: Run the ARCH-06 test + full suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/code_architecture_arch06.test.ts
npm run test:engine
```

Expected: ARCH-06 test PASS; suite green.

- [ ] **Step 7: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/languages.ts plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_g10_complexity.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_g11_scale.ts plugins/awos/skills/ai-readiness-audit/detectors/code_architecture_arch06.test.ts
git add plugins/awos/skills/ai-readiness-audit/languages.ts plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/metrics plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): ARCH-06 + complexity/scale exclude generated files; per-language size thresholds"
```

---

## Task 9: SEC-05 — multi-ignore-file, stack-relevant, partial credit (§5.4)

**Problem:** `security.ts:306-368` checks only `.gitignore`. A secret type ignored by git but not by Docker can still leak into images; a repo with no such secret files shouldn't be penalized.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/security.ts:306-368` (SEC-05)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/security_sec05.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// detectors/security_sec05.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;
const detect = (repo: string) =>
  JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2604', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );

test('SEC-05 flags a secret file ignored by git but exposed to Docker builds', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-sec05-gap-'));
  try {
    writeFileSync(join(repo, 'server.pem'), 'KEY\n'); // a real secret file exists
    writeFileSync(join(repo, '.gitignore'), '*.pem\n'); // ignored by git
    writeFileSync(join(repo, 'Dockerfile'), 'FROM x\nCOPY . /app\n'); // ...but COPY . into image
    // no .dockerignore → leak
    const res = detect(repo);
    const ev = (res.evidence ?? []).join(' ').toLowerCase();
    assert.ok(
      ev.includes('docker'),
      `must call out the .dockerignore gap; got ${ev}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SEC-05 does not penalize a repo with no secret-type files', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-sec05-none-'));
  try {
    writeFileSync(join(repo, 'main.py'), 'print(1)\n'); // no *.pem/*.key/etc.
    const res = detect(repo);
    assert.notEqual(
      res.status,
      'FAIL',
      `no secret files → must not FAIL; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/security_sec05.test.ts`
Expected: FAIL — no docker awareness; no-secret repo still scored on `.gitignore` coverage.

- [ ] **Step 3: Rework SEC-05**

In `security.ts` SEC-05 (~306-368):

1. Define the secret-type patterns once (keep the existing list: `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `credentials.json`, `secrets.yaml`, `kubeconfig`).
2. Determine which secret types are _relevant_: a type is relevant if a matching file exists in the repo (glob the repo) OR the detected stack implies it. If no type is relevant → return `PASS` with evidence `'no sensitive file types present in this stack — no ignore coverage required'` (not a penalty).
3. For relevant types, check each present ignore file: read `.gitignore`, `.dockerignore`, and `.claudeignore` (and any other `*.ignore`/`.\w+ignore` at repo root). For each relevant type, record whether it is covered in `.gitignore` and (if a `Dockerfile` exists) whether it is covered in `.dockerignore`.
4. Scoring: PASS only if every relevant type is covered in `.gitignore` AND (no Dockerfile, or covered in `.dockerignore`); WARN if covered in git but a Docker-exposure gap exists; FAIL if a relevant type is not ignored anywhere. Evidence names the specific type + the specific ignore file that misses it (e.g. `'*.pem ignored by .gitignore but not .dockerignore — COPY . in Dockerfile would leak it into the image'`).

Add a small helper to test a pattern against an ignore file's lines (exact `*.pem` line or a covering glob).

- [ ] **Step 4: Run the test, verify it passes**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/security_sec05.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Update SEC-05 definition in standards.toml**

In `references/standards.toml`, update `[category.security_sec_05]` `definition` to reflect the broader check:

```
definition = "Sensitive file types present in the stack are excluded from version control AND from container image builds (.gitignore + .dockerignore); inconsistency that would leak a secret into an image is flagged"
```

- [ ] **Step 6: Full suite, rebuild dist, format, commit**

```bash
npm run test:engine && npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/detectors/security.ts plugins/awos/skills/ai-readiness-audit/detectors/security_sec05.test.ts plugins/awos/skills/ai-readiness-audit/references/standards.toml
git add plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/references plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): SEC-05 checks git+docker ignores, gated to present secret types, flags leak gaps"
```

---

## Task 10: SBP-06 — gate to Python, reword (§5.5)

**Problem:** The Python-2 except-syntax check (category `sbp_except_clause_syntax`, code 2706) is `applies_when="always"` but only greps `*.py`.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (`[category.sbp_except_clause_syntax]`)
- Modify: `plugins/awos/skills/ai-readiness-audit/topology.ts` (add `has_python` flag)
- Test: `plugins/awos/skills/ai-readiness-audit/topology.test.ts` (add a case) or extend `standards-schema.test.ts` coverage

- [ ] **Step 1: Write the failing test**

```ts
// topology_has_python.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeTopology } from './topology.ts';

test('has_python is true for a Python repo and false otherwise', () => {
  const py = mkdtempSync(join(tmpdir(), 'awos-py-'));
  const go = mkdtempSync(join(tmpdir(), 'awos-go-'));
  try {
    writeFileSync(join(py, 'main.py'), 'print(1)\n');
    writeFileSync(join(go, 'main.go'), 'package main\n');
    assert.equal(
      computeTopology(py).has_python,
      true,
      'python repo → has_python true'
    );
    assert.equal(
      computeTopology(go).has_python,
      false,
      'go repo → has_python false'
    );
  } finally {
    rmSync(py, { recursive: true, force: true });
    rmSync(go, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/topology_has_python.test.ts`
Expected: FAIL — `has_python` is undefined.

- [ ] **Step 3: Add `has_python` to topology**

In `topology.ts`, inside the `flags` object, add:

```ts
    has_python:
      anyGlob(repoPath, ['*.py']) ||
      anyPath(repoPath, ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile']),
```

- [ ] **Step 4: Gate + reword SBP-06 in standards.toml**

In `[category.sbp_except_clause_syntax]`: change `applies_when = "always"` → `applies_when = "topology.has_python"` and reword the definition:

```
definition = "Python source contains no Python-2 except-clause syntax (except A, B:), which is a SyntaxError under Python 3 (Python repos only)"
```

- [ ] **Step 5: Run topology test + standards-schema guard + suite**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/topology_has_python.test.ts
npm run test:engine
```

Expected: PASS; the `standards-schema.test.ts` guard accepts `has_python` because it's now computed.

- [ ] **Step 6: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_has_python.test.ts plugins/awos/skills/ai-readiness-audit/references/standards.toml
git add plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_has_python.test.ts plugins/awos/skills/ai-readiness-audit/references plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): gate SBP-06 Python-2 syntax check to Python repos"
```

---

## Task 11: SBP-03 — drop stray language names (§5.6)

**Problem:** `[category.software_best_practices_sbp_03]` definition names "TypeScript … Kotlin" but the detector implements Python/Ruby/TypeScript only.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (`[category.software_best_practices_sbp_03]`)
- Modify (if present): the SBP-03 description in `dimensions/software-best-practices.md`
- Test: `plugins/awos/skills/ai-readiness-audit/standards-schema.test.ts` already validates structure; add a grep-style assertion to the Layer-1 lint if available, else rely on prettier + suite.

- [ ] **Step 1: Reword the definition**

In `[category.software_best_practices_sbp_03]`, replace the definition:

```
definition = "The project uses strong typing where the language supports it — e.g. strict-mode type config or a high ratio of type annotations in sampled source"
```

If `dimensions/software-best-practices.md` repeats the "JavaScript and Kotlin" phrasing in the SBP-03 block, update it to the same language-agnostic wording.

- [ ] **Step 2: Verify no "Kotlin"/"JavaScript" remains in SBP-03 text**

Run: `grep -n -A3 'sbp_03' plugins/awos/skills/ai-readiness-audit/references/standards.toml`
Expected: definition contains no "Kotlin"/"JavaScript".

- [ ] **Step 3: Run suite, format, commit**

```bash
npm run test:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/references/standards.toml plugins/awos/skills/ai-readiness-audit/dimensions/software-best-practices.md
git add plugins/awos/skills/ai-readiness-audit/references plugins/awos/skills/ai-readiness-audit/dimensions
git commit -m "docs(audit): reword SBP-03 to be language-agnostic (drop stray JS/Kotlin naming)"
```

(No `dist/` change — TOML/markdown only.)

---

## Task 12: QA-09 — tighten `is_multi_service` (§5.7)

**Problem:** `topology.ts` classifies a single-service FastAPI app as multi-service (so QA-09 wrongly applied). Current logic treats `Dockerfile` count ≥ 2 OR a `docker-compose` with `services:` as multi-service.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/topology.ts:201-215` (`is_multi_service`)
- Test: `plugins/awos/skills/ai-readiness-audit/topology_multi_service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// topology_multi_service.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeTopology } from './topology.ts';

test('a single FastAPI app with one Dockerfile is NOT multi-service', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-single-'));
  try {
    writeFileSync(
      join(repo, 'main.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );
    writeFileSync(join(repo, 'Dockerfile'), 'FROM python\n');
    assert.equal(computeTopology(repo).is_multi_service, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a compose file with 2+ services IS multi-service', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-multi-'));
  try {
    writeFileSync(
      join(repo, 'docker-compose.yml'),
      'services:\n  api:\n    image: a\n  worker:\n    image: b\n'
    );
    assert.equal(computeTopology(repo).is_multi_service, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/topology_multi_service.test.ts`
Expected: the single-service case currently passes only if `Dockerfile` count is 1; the compose case must count ≥ 2 service entries. Confirm which assertion fails and proceed. (If the single Dockerfile repo is already false, strengthen the compose side per Step 3 and keep the regression.)

- [ ] **Step 3: Tighten the logic**

Replace the `is_multi_service` expression (~201-215) with one that requires real evidence of ≥ 2 services:

```ts
    is_multi_service: (() => {
      const composeText =
        readIfExists(repoPath, 'docker-compose.yml') ||
        readIfExists(repoPath, 'docker-compose.yaml');
      if (composeText) {
        // Count entries under a top-level `services:` block (2+ → multi-service).
        const m = composeText.match(/^services:\s*$([\s\S]*?)(?=^\S|\Z)/m);
        const block = m ? m[1] : '';
        const serviceCount = (block.match(/^\s{2}\w[\w.-]*:\s*$/gm) || []).length;
        if (serviceCount >= 2) return true;
      }
      // Otherwise multi-service only when there are 2+ Dockerfiles in distinct dirs.
      try {
        return iterFiles(repoPath, ['Dockerfile']).length >= 2;
      } catch {
        return false;
      }
    })(),
```

A single `Dockerfile` + single (or absent) `services:` entry → `false`, so QA-09 SKIPs.

- [ ] **Step 4: Run the test + suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/topology_multi_service.test.ts
npm run test:engine
```

Expected: PASS.

- [ ] **Step 5: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_multi_service.test.ts
git add plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_multi_service.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): is_multi_service requires 2+ real services so QA-09 skips single-service apps"
```

---

## Task 13: SCS-07 — reword to override hygiene (§5.8)

**Problem:** SCS-07 claims to flag "recently published or suspicious versions" but only checks override presence (unverifiable without a CVE/registry feed).

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (`[category.supply_chain_security_scs_07]`)
- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/supply_chain_security.ts:690-753` (evidence wording)
- Modify (if present): SCS-07 block in `dimensions/supply-chain-security.md`

- [ ] **Step 1: Reword the definition**

In `[category.supply_chain_security_scs_07]`:

```
definition = "Dependency version overrides are tracked, minimal, and justified — present overrides are surfaced for human review (freshness/CVE status is not verified offline)"
```

- [ ] **Step 2: Reword the detector evidence**

In `supply_chain_security.ts` (~690-753), change the WARN evidence string from "review for suspicious or recently-published pins" to:

```ts
'override(s) present — review that each is tracked, minimal, and justified (this check does not verify version freshness or CVEs)',
```

- [ ] **Step 3: Verify wording, run suite**

```bash
grep -n 'recently-published\|suspicious' plugins/awos/skills/ai-readiness-audit/references/standards.toml plugins/awos/skills/ai-readiness-audit/detectors/supply_chain_security.ts || echo "clean"
npm run test:engine
```

Expected: `clean`; suite green.

- [ ] **Step 4: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/references/standards.toml plugins/awos/skills/ai-readiness-audit/detectors/supply_chain_security.ts plugins/awos/skills/ai-readiness-audit/dimensions/supply-chain-security.md
git add plugins/awos/skills/ai-readiness-audit/references plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dimensions plugins/awos/skills/ai-readiness-audit/dist
git commit -m "docs(audit): reframe SCS-07 as override hygiene (drop unverifiable freshness claim)"
```

---

## Task 14: SDD-05 — small weight + partial credit (§5.9)

**Problem:** `[category.spec_driven_development_sdd_05]` is weight 5 and all-or-nothing; small features legitimately skip artifacts.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (`[category.spec_driven_development_sdd_05]` weight)
- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development.ts:597-649` (SDD-05 partial credit)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development_sdd05.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// detectors/spec_driven_development_sdd05.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('SDD-05 gives partial credit (WARN, not FAIL) for a mostly-complete spec set', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-sdd05-'));
  try {
    const d = join(repo, 'context', 'spec', '001-x');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'functional-spec.md'), '# f\n');
    writeFileSync(join(d, 'technical-considerations.md'), '# t\n');
    // tasks.md intentionally missing → 2 of 3
    const res = JSON.parse(
      execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2804', repo], {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      })
    );
    assert.notEqual(
      res.status,
      'FAIL',
      `2-of-3 must not be a hard FAIL; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails (or confirm current behavior)**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development_sdd05.test.ts`
Expected: confirm whether current code returns WARN already (scout reported WARN-on-incomplete). If it already WARNs, the test passes on status; the substantive change is the weight cut + evidence clarity below — adjust the test to assert evidence reports the present/total ratio (e.g. `2/3`) which currently it may not.

- [ ] **Step 3: Add ratio to evidence + cut weight**

In `standards.toml` `[category.spec_driven_development_sdd_05]`: `weight = 5` → `weight = 2`.

In `spec_driven_development.ts` SDD-05 (~597-649), include the present-artifact ratio in evidence so partial completeness is legible, e.g.:

```ts
`${dir} — ${present}/3 spec-triad artifacts present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`,
```

Keep PASS when all dirs are complete; WARN when some are partial (existing behavior), never FAIL solely on a missing optional artifact.

- [ ] **Step 4: Run the test + suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development_sdd05.test.ts
npm run test:engine
```

Expected: PASS.

- [ ] **Step 5: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/references/standards.toml plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development.ts plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development_sdd05.test.ts
git add plugins/awos/skills/ai-readiness-audit/references plugins/awos/skills/ai-readiness-audit/detectors plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): SDD-05 weight 5->2 with present/total artifact ratio in evidence"
```

---

## Task 15: Doc-comment coverage metric family (§4)

**Problem:** Nothing measures in-code documentation. Add doc-comment **coverage** (documented defs ÷ total defs) via the bundled tree-sitter AST, as two categories: public/exported coverage (primary) and overall coverage (secondary).

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/languages.ts` (add `docConvention?` to `LanguageDef` for the languages with a known convention: python, typescript, javascript, go, kotlin, java)
- Create: `plugins/awos/skills/ai-readiness-audit/metrics/adp_g13_doc_coverage.ts` (or a detector under `detectors/documentation.ts` — see note)
- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (two new categories under documentation: codes 2204, 2205)
- Modify: `plugins/awos/skills/ai-readiness-audit/dimensions/documentation.md` (two new `### DOC-05`/`### DOC-06` blocks with `**Category:**` lines)
- Modify: the detector/metric registry in `cli.ts` and `audit_core` wiring so the new categories are computed
- Test: `plugins/awos/skills/ai-readiness-audit/metrics/adp_g13_doc_coverage.test.ts`

**Note on placement:** these are `computed` (AST-derived numeric coverage), so implement as a metric reusing the tree-sitter loader already used by `adp_g10_complexity.ts`. Read `adp_g10_complexity.ts` first to reuse its `.wasm` grammar loading and per-language parser selection — do not add a second grammar-loading path.

**Interfaces:**

- Produces: metric `adp_g13_doc_coverage` returning `categories_awarded` ⊆ `{2204, 2205}` and a `value` = public-symbol coverage ratio; `LanguageDef.docConvention?: { documentableNodeTypes: string[]; exportedTest?: (nodeText: string) => boolean }`.

- [ ] **Step 1: Extend `LanguageDef` with doc-convention hints**

In `languages.ts`, add to the interface:

```ts
  /** AST node types that should carry a doc-comment, for doc-coverage. */
  docConvention?: {
    documentableNodeTypes: string[]; // tree-sitter node type names
  };
```

Populate for the languages whose grammar is bundled and whose convention is well-defined. Example (python): `docConvention: { documentableNodeTypes: ['function_definition', 'class_definition', 'module'] }`. Add analogous entries for typescript/javascript (`function_declaration`, `method_definition`, `class_declaration`), go (`function_declaration`, `method_declaration`, `type_declaration`), java/kotlin (`method_declaration`/`function_declaration`, `class_declaration`). Confirm exact node-type names against the grammar while implementing the metric (Step 3).

- [ ] **Step 2: Write the failing metric test**

```ts
// metrics/adp_g13_doc_coverage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compute } from './adp_g13_doc_coverage.ts';

test('doc-coverage rewards documented definitions over undocumented ones', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-no-'));
  try {
    writeFileSync(
      join(documented, 'a.py'),
      'def f():\n    """Does f."""\n    return 1\n\nclass C:\n    """A class."""\n    pass\n'
    );
    writeFileSync(
      join(bare, 'a.py'),
      'def f():\n    return 1\n\nclass C:\n    pass\n'
    );
    const hi = await compute(documented, {}, { has_python: true }, documented);
    const lo = await compute(bare, {}, { has_python: true }, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented repo must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/metrics/adp_g13_doc_coverage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the metric**

Create `metrics/adp_g13_doc_coverage.ts`. Reuse `adp_g10_complexity.ts`'s grammar-loading helper (import or copy the loader call; do not duplicate the wasm path logic). For each source file (skip `isGeneratedPath`), parse the AST, walk for `docConvention.documentableNodeTypes`, and for each documentable node decide "documented" by the language's convention:

- Python: first child statement of the body is a string/expression-statement docstring.
- TS/JS/Java/Kotlin: a `comment` node beginning with `/**` immediately precedes the node.
- Go: a `comment` node immediately precedes the declaration.

Compute `coverage = documented / total` over all definitions (overall, code 2205) and over exported/public definitions (code 2204 — exported = Python: name not starting with `_`; Go: identifier starts uppercase; TS/JS: `export` keyword present on/around the node; Java/Kotlin: `public` or default). Award 2204 when public coverage ≥ band threshold (PASS ≥ 0.8), 2205 when overall ≥ 0.6 (tune conservatively). Return `makeMetricResult('adp_g13_doc_coverage', publicCoverage, 'coverage', awarded, reliability, sourcesUsed, sourcesMissing)`. `applies_when` SKIP: if no file in a language with a `docConvention` is present, return SKIP (empty sources).

Add an `expression` to the result (see Task 16 for the field) like `"42 of 50 public defs documented = 0.84"`.

- [ ] **Step 5: Register categories + metric**

In `standards.toml`, add under documentation:

```toml
[category.documentation_doc_05]
code = 2204
metric = "adp_g13_doc_coverage"
dimension = "documentation"
weight = 2
method = "computed"
definition = "Public/exported definitions carry doc-comments (docstring/JSDoc/KDoc/Go doc) — coverage of the documented API surface"
applies_when = "always"
sources = ["audit"]
reliability_default = "maximal"
source = "AWOS audit"
source_year = 2026

[category.documentation_doc_06]
code = 2205
metric = "adp_g13_doc_coverage"
dimension = "documentation"
weight = 1
method = "computed"
definition = "Overall definition doc-comment coverage across all source definitions"
applies_when = "always"
sources = ["audit"]
reliability_default = "maximal"
source = "AWOS audit"
source_year = 2026
```

Add `### DOC-05:` and `### DOC-06:` heading blocks with matching `**Category:** 2204` / `**Category:** 2205` lines to `dimensions/documentation.md` (so `audit_core`'s `parseCheckIds` maps them). Register `adp_g13_doc_coverage` in the metric registry that `cli.ts`/`audit_core` consume (find where `adp_g10_complexity` is registered and add the new metric the same way).

- [ ] **Step 6: Run the metric test + suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/metrics/adp_g13_doc_coverage.test.ts
npm run test:engine
```

Expected: PASS.

- [ ] **Step 7: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/languages.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_g13_doc_coverage.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_g13_doc_coverage.test.ts plugins/awos/skills/ai-readiness-audit/references/standards.toml plugins/awos/skills/ai-readiness-audit/dimensions/documentation.md plugins/awos/skills/ai-readiness-audit/cli.ts
git add plugins/awos/skills/ai-readiness-audit/languages.ts plugins/awos/skills/ai-readiness-audit/metrics plugins/awos/skills/ai-readiness-audit/references plugins/awos/skills/ai-readiness-audit/dimensions plugins/awos/skills/ai-readiness-audit/cli.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "feat(audit): doc-comment coverage metric (public + overall) via AST"
```

---

## Task 16: Scoring transparency — Points rename, value rounding, expression tooltips (§3.1)

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/metrics/_base.ts` (`MetricResult` gains `unit?`, `expression?`)
- Modify: `plugins/awos/skills/ai-readiness-audit/audit_core.ts` (`CheckRecord` carries `unit`/`expression`/`source_year`; thread through `buildCheck`)
- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (Check interface; `Wt`→`Points`; round values; Value + Points tooltips)
- Test: `plugins/awos/skills/ai-readiness-audit/render.test.ts` (extend)

- [ ] **Step 1: Write the failing render test**

Append to `render.test.ts` (import `renderHtml` if not already):

```ts
test('html rounds float values to 2dp and labels the Points column', () => {
  const audit = {
    date: '2026-06-26',
    project: 'x',
    audit_total: 1,
    coverage: 1,
    dimensions: [
      {
        dimension: 'quality-assurance',
        date: '2026-06-26',
        score: 0,
        coverage: 0,
        checks: [
          {
            check_id: 'QA-01',
            code: [2500],
            method: 'computed',
            status: 'WARN',
            value: 0.47058823529411764,
            evidence: [],
            weight_awarded: 0,
            weight_max: 8,
            applies: true,
            reliability: { tag: 'maximal', confidence: 'high', note: null },
            source: 'AWOS audit',
            definition: 'coverage',
            hint: 'x',
            expression: '48 test files ÷ 102 modules = 0.47',
            unit: 'ratio',
          },
        ],
      },
    ],
  };
  const html = renderHtml(audit as any);
  assert.ok(
    html.includes('0.47') && !html.includes('0.47058823529411764'),
    'value must be rounded to 2dp'
  );
  assert.ok(html.includes('>Points<'), 'check table header must read "Points"');
  assert.ok(
    html.includes('48 test files ÷ 102 modules = 0.47'),
    'value tooltip must show the expression'
  );
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: FAIL — header is `Wt`, value unrounded, no expression.

- [ ] **Step 3: Add fields to the data path**

- `metrics/_base.ts`: add `unit?: string;` and `expression?: string;` to `MetricResult`; extend `makeMetricResult` with optional trailing params `unit?`, `expression?` that set them when provided.
- `audit_core.ts`: add `unit?: string; expression?: string; source_year?: number;` to `CheckRecord`. In `buildCheck`, for metric-routed checks, carry the metric's `unit`/`expression` if available (thread them from the metric results — store a `Map<code, {unit,expression}>` when iterating metrics in `auditCore`, mirroring `awarded`), and set `source_year: c.source_year`. For detectors, leave `unit`/`expression` undefined.

- [ ] **Step 4: Render changes**

In `render.ts`:

- `Check` interface: add `unit?: string; expression?: string; source_year?: number;`.
- Add a rounding helper:

```ts
function fmtValue(v: string | number | null): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}
```

- In `dimensionPage()`'s check table header (line ~1042) rename `<th>Wt</th>` → `<th>Points</th>`.
- Points cell (line ~1079): enrich the tooltip with standards.toml-derived meta:

```ts
  <td>${tip(
    String(c.weight_awarded) + '/' + String(c.weight_max),
    `Worth up to ${c.weight_max} points · ${c.method}`,
    `${c.definition}${c.source ? ` · ${c.source}` : ''}${c.source_year ? ` (${c.source_year})` : ''}`
  )}</td>
```

- Value cell (line ~1081): round + wrap in a tooltip when an expression exists:

```ts
  <td>${c.expression ? tip(fmtValue(c.value), c.expression, c.unit ? `unit: ${c.unit}` : '') : esc(fmtValue(c.value))}${seriesSvg}</td>
```

- In the Markdown table (line ~563) replace `String(c.value)` with `fmtValue(c.value)`.

- [ ] **Step 5: Run the render test + suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts
npm run test:engine
```

Expected: PASS.

- [ ] **Step 6: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/metrics/_base.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts
git add plugins/awos/skills/ai-readiness-audit/metrics/_base.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "feat(audit): Points column + standards tooltip, 2dp values, value-expression tooltips"
```

---

## Task 17: Connections — linked repos, tech stack, detection conflicts (§1.2, §1.3)

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/topology.ts` (export `detectLinkedRepos(repoPath)`)
- Modify: `plugins/awos/skills/ai-readiness-audit/audit_core.ts` (write `linked_repos`, `tech_stack`, `detection_conflicts` into audit.json; same in `aggregate`)
- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (always-on Linked repositories block in `connectionsSection`; new Tech Stack section)
- Test: `plugins/awos/skills/ai-readiness-audit/render.test.ts` (extend), `plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts`

**Interfaces:**

- Produces: `detectLinkedRepos(repoPath): { name: string; kind: 'symlink' | 'submodule'; via: string }[]`; `AuditJson.linked_repos?`, `AuditJson.tech_stack?: { languages: string[]; agent_tools: string[]; ci: string[]; frameworks: string[] }`, `AuditJson.detection_conflicts?: { file: string; claimedBy: string[] }[]`.

- [ ] **Step 1: Write the failing render test (always-on linked section + tech stack)**

```ts
test('connections renders Linked repositories even when none, and a Tech Stack section', () => {
  const audit = {
    date: '2026-06-26',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 120,
      },
    ],
    linked_repos: [],
    tech_stack: {
      languages: ['Python'],
      agent_tools: ['Claude Code'],
      ci: ['Azure DevOps'],
      frameworks: ['FastAPI'],
    },
  };
  const html = renderHtml(audit as any);
  assert.ok(
    html.includes('Linked repositories'),
    'linked-repos heading always present'
  );
  assert.ok(
    /no linked repositories detected/i.test(html),
    'explicit empty state'
  );
  assert.ok(
    html.includes('Tech Stack') && html.includes('FastAPI'),
    'tech stack section present'
  );
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: FAIL — no Linked/Tech-Stack output.

- [ ] **Step 3: `detectLinkedRepos` in topology.ts**

Add and export:

```ts
import { lstatSync, readlinkSync, readdirSync } from 'node:fs';

export interface LinkedRepo {
  name: string;
  kind: 'symlink' | 'submodule';
  via: string;
}

export function detectLinkedRepos(repoPath: string): LinkedRepo[] {
  const found = new Map<string, LinkedRepo>();
  // .gitmodules → submodules
  const gm = readIfExists(repoPath, '.gitmodules');
  for (const m of gm.matchAll(/url\s*=\s*(\S+)/g)) {
    const name =
      m[1]
        .replace(/\.git$/, '')
        .split(/[\\/]/)
        .pop() || m[1];
    found.set(name, { name, kind: 'submodule', via: '.gitmodules' });
  }
  // symlinks under agent-tool config dirs pointing outside the repo
  for (const dir of ALL_TOOL_CONFIG_DIRS) {
    const base = join(repoPath, dir);
    let entries: string[] = [];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(base, e);
      try {
        if (lstatSync(p).isSymbolicLink()) {
          const target = readlinkSync(p);
          const name =
            target
              .replace(/\/+$/, '')
              .split(/[\\/]/)
              .filter(Boolean)
              .find((s) => s.includes('-')) || target;
          found.set(name, { name, kind: 'symlink', via: `${dir}/${e}` });
        }
      } catch {
        /* ignore */
      }
    }
  }
  return [...found.values()];
}
```

(Refine the symlink target→repo-name heuristic during implementation; the contract is "distinct linked repo names with how they were found.")

- [ ] **Step 4: Populate audit.json in audit_core**

In `auditCore`, after computing topology and before assembling `audit`, compute:

```ts
import { detectLinkedRepos } from './topology.ts';
import { detectLanguages } from './languages.ts';
import { detectAgentTools } from './agent_tools.ts';
import { detectCiPlatforms } from './ci_platforms.ts'; // use the available CI-detection export
```

Build `tech_stack` from `detectLanguages(repoPath).map(l => l.displayName)`, `detectAgentTools(repoPath).map(t => t.displayName)`, CI platform display names, and a `frameworks` list derived from the topology framework signals (reuse the framework regex already in topology — extract the matched names; if not readily available, set `frameworks: []` and leave a follow-up note). Build `detection_conflicts` by collecting files matched by more than one language's `sourceGlobs` (a quick scan of top-level source files); if expensive, scope to a sample. Add all three to the `audit` object literal and write them. Mirror the additions in `aggregate()` (preserve them like the report blocks: `for (const block of ['headline','insights','recommendations','tech_stack','linked_repos','detection_conflicts'])`).

- [ ] **Step 5: Render — always-on linked section + Tech Stack**

In `render.ts`:

- Extend `AuditJson` with `linked_repos?`, `tech_stack?`, `detection_conflicts?` (typed as above).
- In `connectionsSection()`, after the Connected/Missed groups, always append:

```ts
rows.push('<h3>Linked repositories</h3>');
const linked = audit.linked_repos ?? [];
if (linked.length > 0) {
  rows.push('<ul>');
  for (const r of linked)
    rows.push(
      `<li>${esc(r.name)} <em>(${esc(r.kind)} via ${esc(r.via)})</em></li>`
    );
  rows.push('</ul>');
} else {
  rows.push('<p><em>No linked repositories detected.</em></p>');
}
```

Also make `connectionsSection()` render even when `audit.sources` is empty (drop the early `return ''`; guard each sub-block instead) so the Linked section is always shown.

- Add a `techStackSection()` function and include it in the overview assembly (after `connectionsSection()`), rendering `tech_stack` lists (languages / agent tools / CI / frameworks) and, if `detection_conflicts` is non-empty, a short "Ambiguous detections" note listing `file → claimedBy`.

- [ ] **Step 6: Write the linked-detection unit test**

```ts
// topology_linked.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectLinkedRepos } from './topology.ts';

test('detectLinkedRepos finds git submodules', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-linked-'));
  try {
    writeFileSync(
      join(repo, '.gitmodules'),
      '[submodule "x"]\n  path = vendor/x\n  url = https://example.com/onex-discovery-awos.git\n'
    );
    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'onex-discovery-awos'),
      `got ${JSON.stringify(linked)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 7: Run tests + suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts
npm run test:engine
```

Expected: PASS.

- [ ] **Step 8: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts
git add plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "feat(audit): always-on linked-repos section, Tech Stack section, detection-conflict feedback"
```

---

## Task 18: Data-source resolution protocol docs (§1.1)

**Files:**

- Create: `plugins/awos/skills/ai-readiness-audit/references/connector-shapes.md`
- Modify: `plugins/awos/skills/ai-readiness-audit/SKILL.md` (Step 6 — add the protocol + link)

- [ ] **Step 1: Write `connector-shapes.md`**

Document the exact shapes the orchestrator must produce, copied from `collectors/tracker.ts` and `collectors/docs.ts`:

- `TrackerConnector` `{ tickets?: TicketRecord[]; incident_source?: string | null }` and `TrackerRaw` `{ tickets, type_counts, resolved_count, incident_source }`, with field-by-field annotation and a worked example mapping a Jira issue-search result into `collected/tracker.json`.
- `DocsConnector` `{ pages?: DocPage[] }` and `DocsRaw` `{ pages, page_count, recently_updated_count }`, with a worked example mapping a Confluence page list into `collected/docs.json`.

Include the `TicketRecord` / `DocPage` field definitions verbatim from the source files (read them to copy exact field names/types).

- [ ] **Step 2: Add the protocol to SKILL.md Step 6**

In `SKILL.md`, in the Step 6 section that covers connector metrics, insert the data-source resolution protocol:

> For every non-git source (tracker, docs, incident, and any reachable MCP/integration that maps to a collector):
>
> 1. Attempt to fetch.
> 2. On success → map into the shape in `references/connector-shapes.md`, write `collected/<source>.json`, then run that source's metrics. Mapping reachable data into the documented shape is not fabrication.
> 3. On failure or unclear mapping (auth error, unfamiliar schema, broken dependency, closed port, empty result) → do NOT silently SKIP. Use `AskUserQuestion` to ask: Mark unavailable (record the reason) / Retry with guidance / Show how to fix (doc link). In headless `claude -p` runs (no interactive user), default to marking it unavailable WITH the failure reason and a remediation hint recorded in the report's missed-sources list.
>    Never drop a reachable source without a recorded reason.

Keep the wording plain and declarative (this file is a prompt; avoid CRITICAL/YOU-MUST emphasis per repo conventions).

- [ ] **Step 3: Lint + commit**

```bash
npm run test:lint
npx prettier --write plugins/awos/skills/ai-readiness-audit/references/connector-shapes.md plugins/awos/skills/ai-readiness-audit/SKILL.md
git add plugins/awos/skills/ai-readiness-audit/references/connector-shapes.md plugins/awos/skills/ai-readiness-audit/SKILL.md
git commit -m "docs(audit): connector-shapes reference + data-source resolution protocol in SKILL"
```

(No `dist/` change — docs only. If `test:lint` enforces cross-references, ensure the new `references/connector-shapes.md` link resolves.)

---

## Task 19: Report UX — accordion, scroll restore, list indentation (§2)

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (insights + recommendations accordion; `route()` scroll restore; CSS `ul/li`)
- Test: `plugins/awos/skills/ai-readiness-audit/render.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
test('insights and recommendations render as collapsible accordions; lists have indentation', () => {
  const audit = {
    date: '2026-06-26',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    insights: [
      {
        theme: 'Strong context, weak guardrails',
        severity: 'high',
        weak_areas: ['AI-05', 'SEC-02'],
        so_what: 'risky',
        improves: 'add hooks',
      },
    ],
    recommendations: [
      {
        id: 1,
        priority: 'P0',
        title: 'Add CVE scanning',
        dimension: 'supply-chain-security',
        check_id: 'SCS-06',
        effort: 'S',
        detail: 'use a scanner',
      },
    ],
  };
  const html = renderHtml(audit as any);
  assert.ok(
    html.includes('<details') && html.includes('<summary'),
    'insights/recs use <details>/<summary>'
  );
  assert.ok(
    html.includes('AI-05') && html.includes('SCS-06'),
    'summary shows tags'
  );
  assert.ok(
    /ul\s*\{[^}]*margin/i.test(html) || /ul\s*\{[^}]*padding-left/i.test(html),
    'ul has indentation CSS'
  );
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: FAIL — current insights/recs use `<div>`, no `<details>`; no `ul` indentation rule.

- [ ] **Step 3: Accordion the insights section**

Replace `insightsSection()`'s per-insight `<div class="insight">` block (lines ~935-940) with a `<details>` accordion whose `<summary>` shows the theme + weak-area tags, and whose body holds `so_what` + `improves`:

```ts
rows.push(`<details class="insight" style="border-left-color:${color}">
  <summary><span class="theme">${esc(ins.theme)}</span>${ins.weak_areas.length ? ` <span class="areas">Weak: ${esc(ins.weak_areas.join(', '))}</span>` : ''}</summary>
  <div class="so">${esc(ins.so_what)}</div>
  <div class="improves">→ ${esc(ins.improves)}</div>
</details>`);
```

- [ ] **Step 4: Accordion the recommendations section**

Replace `recommendationsSection()`'s per-rec `<div class="rec">` block (lines ~961-968) with:

```ts
rows.push(`<details class="rec">
  <summary><span class="prio" style="background:${prioColor}">${esc(r.priority)}</span> <span class="rec-title">${esc(r.title)}</span> <span class="rec-where">${esc(r.dimension)} · ${esc(r.check_id)} · effort ${esc(r.effort)}</span></summary>
  ${r.detail ? `<div class="rec-detail">${esc(r.detail)}</div>` : ''}
</details>`);
```

- [ ] **Step 5: Scroll restore + CSS**

In `render.ts` CSS (after the `*{...}` reset, line ~756) add list indentation and accordion cursor:

```css
ul {
  margin: 0.4em 0 0.6em 1.4em;
}
li {
  margin: 0.2em 0;
}
summary {
  cursor: pointer;
}
details {
  margin-bottom: 8px;
}
```

In the inline JS `route()` (lines ~1157-1167), store/restore scroll position:

```js
function route() {
  var h = location.hash.replace(/^#/, '');
  var isDim = h.indexOf('dim/') === 0;
  var ov = document.getElementById('overview');
  document.querySelectorAll('.dim-page').forEach(function (p) {
    p.style.display = 'none';
  });
  if (isDim) {
    var el = document.getElementById('page-' + h.slice(4));
    if (el) {
      window.__ovScroll = window.scrollY;
      ov.style.display = 'none';
      el.style.display = 'block';
      window.scrollTo(0, 0);
      return;
    }
  }
  ov.style.display = 'block';
  if (typeof window.__ovScroll === 'number') {
    window.scrollTo(0, window.__ovScroll);
  }
}
```

- [ ] **Step 6: Run the test + suite, verify pass**

```bash
/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts
npm run test:engine
```

Expected: PASS.

- [ ] **Step 7: Rebuild dist, format, commit**

```bash
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts
git add plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "feat(audit): collapsible insights/recs, scroll-position restore, list indentation"
```

---

## Task 20: Final verification — rebuild, full suite, prettier, smoke run

**Files:** none new — consolidation.

- [ ] **Step 1: Clean rebuild of the bundle**

```bash
npm run build:engine
git diff --stat plugins/awos/skills/ai-readiness-audit/dist
```

Expected: either no diff (already committed per task) or a final dist commit.

- [ ] **Step 2: Full test suite + format check**

```bash
npm ci
npm test
npx prettier . --check
```

Expected: all layers green; prettier clean.

- [ ] **Step 3: Smoke-run the engine end-to-end against a temp repo**

```bash
TMP=$(mktemp -d)
git -C "$TMP" init -q && echo "# x" > "$TMP/README.md" && git -C "$TMP" add -A && git -C "$TMP" -c user.email=t@e.com -c user.name=t commit -qm init
/opt/homebrew/bin/node plugins/awos/skills/ai-readiness-audit/dist/cli.js audit-core "$TMP" "$TMP/out"
/opt/homebrew/bin/node plugins/awos/skills/ai-readiness-audit/dist/cli.js render "$TMP/out/audit.json" > "$TMP/report.html" 2>/dev/null || true
ls "$TMP/out"
```

Expected: `audit.json` + per-dimension JSON written without error; the new `tech_stack`/`linked_repos`/`sources` keys present in `audit.json`.

- [ ] **Step 4: Re-run the target audit (manual, optional)**

Use the existing harness (`~/code/awos/tmp/audit-runs/...` per project memory) to re-audit `onex-discovery-api` and eyeball: AS-06 no longer false-FAILs, AS-03 shows N/A, ARCH-06 excludes htmlcov/`_pb2`, spec-triad 106 awarded, PAI-05 clean, DOC-04 clean, Points column labeled, values rounded, Linked repositories + Tech Stack sections present, insights/recs collapsible.

- [ ] **Step 5: Commit any final dist/format drift, push**

```bash
git add -A
git commit -m "chore(audit): final dist rebuild + format for fairness/report v2" || echo "nothing to commit"
git push
```

---

## Self-Review

**Spec coverage** (design § → task):

- §1.1 data-source protocol → Task 18. §1.2 linked repos → Task 17. §1.3 tech stack + conflicts → Task 17.
- §2.1 accordion → Task 19. §2.2 scroll restore → Task 19. §2.3 list indentation → Task 19.
- §3.1 Points rename + tooltip + value expression + rounding → Task 16.
- §4 doc-comment coverage → Task 15.
- §5.1 AS-06 → Task 6. §5.2 AS-03 → Task 7. §5.3 ARCH-06/generated/per-lang → Tasks 1 + 8. §5.4 SEC-05 → Task 9. §5.5 SBP-06 → Task 10. §5.6 SBP-03 → Task 11. §5.7 QA-09 → Task 12. §5.8 SCS-07 → Task 13. §5.9 SDD-05 → Task 14.
- §6.1 spec-triad → Task 2. §6.2 PAI-05 → Task 3. §6.3 AI-04 → Task 4. §6.4 DOC-04 → Task 5.
- Registry extensions: `GENERATED_GLOBS` (Task 1), `localOnlyFiles` (Task 3), framework-auth (Task 6), `sizeThreshold` (Task 8), `docConvention` (Task 15). Testing/dist/build constraints applied per task.

No spec section is unassigned.

**Type consistency:** `isGeneratedPath` (Task 1) reused in Tasks 8, 15. `isLocalOnlyAgentFile` (Task 3) used in Task 3 detector. `FRAMEWORK_AUTH_PATTERNS` (Task 6) used in AS-06. `sizeThresholdForFile` (Task 8) used in ARCH-06. `MetricResult.unit/expression` (Task 16) produced by Task 15's metric. `detectLinkedRepos` return type (Task 17) matches its render consumption. `has_python` (Task 10) referenced by SBP-06 gating and validated by the standards-schema guard.

**Sequencing note:** Task 1 precedes 8 and 15 (shared `generated.ts`). Task 16 (fields) and Task 15 (producer of `expression`) are independent but Task 15's `expression` only renders once Task 16 lands — order 15 then 16, or 16 then 15; either works since the field is optional.
