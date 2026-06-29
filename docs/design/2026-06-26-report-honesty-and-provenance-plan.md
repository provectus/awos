# Report honesty + provenance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the audit's "Repositories & Connections / Tech Stack" section honest and evidenced — fix mis-named linked repos, false C/C++ & Express, CI false-"Connected", and default-on connector enrichment; show why every claim was made.

**Architecture:** TypeScript audit engine under `plugins/awos/skills/ai-readiness-audit/`, bundled to a committed `dist/cli.js`. Detectors compute from the repo; `audit_core` assembles `audit.json`; `render.ts` renders md + self-contained HTML. `detectors/_base.ts` `grep`/`iterFiles` already prune `DEFAULT_IGNORE` (`.git`,`node_modules`,`dist`,`build`,`.venv`,`__pycache__`,`.next`,`target`); `isGeneratedPath` (`generated.ts`) is a separate ignore list used by ARCH-06/complexity/scale/doc-coverage.

**Tech Stack:** TypeScript, Node `node:test` + `tsx`, esbuild, smol-toml, web-tree-sitter.

## Global Constraints

- Branch `feat/ai-sdlc-metrics` (PR #139); plugin bump to **2.5.0** (Task 8).
- Test runner: **real Node** `/opt/homebrew/bin/node` (bare `node` is a Bun shim that breaks `node:test`). Single engine test: `/opt/homebrew/bin/node --import tsx --test <file>`. Run a detector directly: `/opt/homebrew/bin/node --import tsx plugins/awos/skills/ai-readiness-audit/cli.ts <verb> <args>`.
- After any engine `.ts` edit: `npm run build:engine`, then `git add plugins/awos/skills/ai-readiness-audit/dist`. CI runs `git diff --exit-code` on dist. (`npm ci` first if node_modules missing.)
- Before each commit run the FULL suite, not just engine: `/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts"` AND `/opt/homebrew/bin/node --test tests/lint-prompts.test.js`. (A prior batch had a lint regression slip past engine-only runs.)
- `npx prettier --write <changed files>`; final `npx prettier . --check` clean. TOML is not prettier-formatted (no plugin) — that's expected.
- Markdown prose not hard-wrapped at 80 cols.
- Conventional commits (`fix(audit):` / `feat(audit):` / `docs(audit):`).

Design ref: `docs/design/2026-06-26-report-honesty-and-provenance-design.md` (F1–F5).

---

## Task 1: Expand the generated/ignored dir markers (F4) — `generated.ts`

`isGeneratedPath` (used by ARCH-06, complexity, scale, doc-coverage) omits Python env/cache + common build/vendor dirs, so `.venv` etc. pollute those metrics.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/generated.ts:23-32` (`DIR_MARKERS`)
- Test: `plugins/awos/skills/ai-readiness-audit/generated.test.ts` (extend)

- [ ] **Step 1: Failing test** — append to `generated.test.ts`:

```ts
test('isGeneratedPath ignores Python env/cache and common build dirs', () => {
  for (const p of [
    '.venv/lib/python3.12/site-packages/foo.py',
    'venv/x.py',
    'env/x.py',
    'site-packages/pkg/a.py',
    '.tox/py312/x.py',
    '.mypy_cache/x.json',
    '.pytest_cache/v/cache',
    '.ruff_cache/x',
    '.gradle/x',
    '.terraform/x',
  ]) {
    assert.equal(isGeneratedPath(p), true, `expected generated/ignored: ${p}`);
  }
  // real source stays detected
  assert.equal(isGeneratedPath('src/app/main.py'), false);
});
```

- [ ] **Step 2: Run, expect FAIL** — `/opt/homebrew/bin/node --import tsx --test plugins/awos/skills/ai-readiness-audit/generated.test.ts` → fails on `.venv`/`site-packages`/etc.

- [ ] **Step 3: Implement** — replace `DIR_MARKERS` (lines 23-32) with:

```ts
const DIR_MARKERS = [
  'htmlcov',
  'generated',
  '__generated__',
  'vendor',
  'dist',
  'build',
  '.next',
  'node_modules',
  // Python virtualenvs, installed packages, and tool caches
  '.venv',
  'venv',
  'env',
  'site-packages',
  '.tox',
  '.nox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.eggs',
  // other ecosystem build/cache dirs
  '.gradle',
  '.terraform',
];
```

- [ ] **Step 4: Run, expect PASS** (both the new and existing generated tests).

- [ ] **Step 5: Full suite + build + commit**

```bash
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts" && /opt/homebrew/bin/node --test tests/lint-prompts.test.js
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/generated.ts plugins/awos/skills/ai-readiness-audit/generated.test.ts
git add plugins/awos/skills/ai-readiness-audit/generated.ts plugins/awos/skills/ai-readiness-audit/generated.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): ignore Python env/cache and build dirs in generated-path detection"
```

---

## Task 2: `detectLanguages` requires real source + carries evidence (F4, F5) — `languages.ts`

Repo has `Makefile` (in both C and C++ dep-lists) → false C/C++. Fix: a language is present only if it has ≥1 actual source file outside ignored dirs. Return evidence for provenance.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/languages.ts` (`detectLanguages`, ~182-186)
- Test: `plugins/awos/skills/ai-readiness-audit/languages.test.ts` (update + add)

**Interfaces:**

- Produces: `interface DetectedLanguage { def: LanguageDef; evidence: string }` and `detectLanguages(repoPath: string): DetectedLanguage[]`. Consumed by `audit_core` (Task 6) as `{name: d.def.displayName, evidence: d.evidence}`.

- [ ] **Step 1: Failing test** — replace the existing `detectLanguages` test in `languages.test.ts` and add:

```ts
import { detectLanguages } from './languages.ts';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('detectLanguages requires real source files (Makefile alone is not C/C++)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-lang-'));
  try {
    writeFileSync(join(repo, 'Makefile'), 'test:\n\tpytest\n');
    writeFileSync(join(repo, 'pyproject.toml'), '[project]\nname="x"\n');
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.py'), 'print(1)\n');
    writeFileSync(join(repo, 'src', 'b.py'), 'print(2)\n');
    // a C file ONLY inside an ignored dir must not trigger C
    mkdirSync(join(repo, '.venv'), { recursive: true });
    writeFileSync(join(repo, '.venv', 'native.c'), 'int main(){}\n');

    const langs = detectLanguages(repo);
    const names = langs.map((l) => l.def.displayName).sort();
    assert.deepEqual(
      names,
      ['Python'],
      `only Python expected; got ${names.join(',')}`
    );
    const py = langs.find((l) => l.def.id === 'python');
    assert.match(
      py.evidence,
      /2 .*\.py|2 files/i,
      `evidence should cite the .py count; got "${py.evidence}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run, expect FAIL** — current `detectLanguages` returns `LanguageDef[]` (no `.def`/`.evidence`) and would include C/C++ via Makefile.

- [ ] **Step 3: Implement** — in `languages.ts`, add the import and replace `detectLanguages`:

```ts
import { iterFiles } from './detectors/_base.ts';

export interface DetectedLanguage {
  def: LanguageDef;
  evidence: string;
}

/**
 * A language is "present" when it has at least one real source file (its
 * sourceGlobs) outside ignored dirs (.venv/node_modules/etc., via iterFiles's
 * DEFAULT_IGNORE). Shared build files (Makefile, CMakeLists) alone do NOT count
 * — that produced false C/C++ on Python repos. Evidence cites the source-file
 * count plus any matching dependency manifest.
 */
export function detectLanguages(repoPath: string): DetectedLanguage[] {
  const out: DetectedLanguage[] = [];
  for (const def of LANGUAGES) {
    let count = 0;
    try {
      count = iterFiles(repoPath, def.sourceGlobs).length;
    } catch {
      count = 0;
    }
    if (count === 0) continue;
    const dep = def.depFiles.find(
      (f) => !f.includes('*') && existsSync(join(repoPath, f))
    );
    const ext = def.sourceGlobs[0]?.replace('*', '') ?? '';
    const evidence = `${count} ${ext} file${count === 1 ? '' : 's'}${dep ? ` · ${dep}` : ''}`;
    out.push({ def, evidence });
  }
  return out;
}
```

(`existsSync`/`join` are already imported at the top of `languages.ts`.)

- [ ] **Step 4: Run, expect PASS.** Also update any other `languages.test.ts` assertion that expected the old `LanguageDef[]` return (e.g. `.displayName` directly → `.def.displayName`).

- [ ] **Step 5: Full suite + build + commit**

```bash
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts" && /opt/homebrew/bin/node --test tests/lint-prompts.test.js
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/languages.ts plugins/awos/skills/ai-readiness-audit/languages.test.ts
git add plugins/awos/skills/ai-readiness-audit/languages.ts plugins/awos/skills/ai-readiness-audit/languages.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): detect a language only when it has real source files; carry evidence"
```

Note for Task 6: `audit_core.ts:340` currently does `detectLanguages(repoPath).map((l) => l.displayName)` — that now breaks (no `.displayName`). Task 6 rewrites that line; if you run audit-core before Task 6, expect a type error there. To keep the tree compiling between tasks, in THIS task also update `audit_core.ts:340` minimally to `detectLanguages(repoPath).map((l) => l.def.displayName)` (Task 6 will replace it with the evidence-carrying form).

---

## Task 3: `detectFrameworks` from manifest/import, not prose + evidence (F4/#5, F5) — `topology.ts`

`/\bexpress\b/i` matches English prose ("cannot express") in Python files → false "Express". Fix: detect frameworks from dependency manifests and import statements, never bare words. Return evidence.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/topology.ts` (`FRAMEWORK_SIGNALS`/`detectFrameworks`, ~271-324)
- Test: `plugins/awos/skills/ai-readiness-audit/topology_frameworks.test.ts` (update + add)

**Interfaces:**

- Produces: `interface DetectedFramework { name: string; evidence: string }` and `detectFrameworks(repoPath: string): DetectedFramework[]`. Consumed by `audit_core` (Task 6).

- [ ] **Step 1: Failing test** — update `topology_frameworks.test.ts`:

```ts
test('detectFrameworks: prose "express" does NOT yield Express; manifest dep does', () => {
  const proseRepo = mkdtempSync(join(tmpdir(), 'awos-fw-prose-'));
  const realRepo = mkdtempSync(join(tmpdir(), 'awos-fw-real-'));
  try {
    mkdirSync(join(proseRepo, 'src'), { recursive: true });
    writeFileSync(
      join(proseRepo, 'src', 'm.py'),
      '# Raw DDL because the ORM cannot express multi-column indexes\nx = 1\n'
    );
    writeFileSync(
      join(proseRepo, 'pyproject.toml'),
      '[project]\ndependencies=["fastapi"]\n'
    );
    const prose = detectFrameworks(proseRepo).map((f) => f.name);
    assert.ok(
      !prose.includes('Express'),
      `prose must not yield Express; got ${prose.join(',')}`
    );
    assert.ok(
      prose.includes('FastAPI'),
      `fastapi dep must yield FastAPI; got ${prose.join(',')}`
    );
    const fa = detectFrameworks(proseRepo).find((f) => f.name === 'FastAPI');
    assert.ok(
      fa.evidence && fa.evidence.length > 0,
      'FastAPI must carry evidence'
    );

    writeFileSync(
      join(realRepo, 'package.json'),
      '{"dependencies":{"express":"^4"}}\n'
    );
    const real = detectFrameworks(realRepo).map((f) => f.name);
    assert.ok(
      real.includes('Express'),
      `express dep must yield Express; got ${real.join(',')}`
    );
  } finally {
    rmSync(proseRepo, { recursive: true, force: true });
    rmSync(realRepo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run, expect FAIL** (current returns `string[]` + prose match).

- [ ] **Step 3: Implement** — replace `FRAMEWORK_SIGNALS` + `detectFrameworks` (lines 271-324) with manifest/import detection:

```ts
export interface DetectedFramework {
  name: string;
  evidence: string;
}

// A framework is detected from dependency manifests (package token present) or
// an import/usage statement — never a bare word in prose. `deps` are substrings
// looked for in manifest text; `importRx` is matched against non-ignored source.
interface FrameworkDef {
  name: string;
  deps: string[];
  importRx?: RegExp;
}

const MANIFESTS = [
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'setup.cfg',
  'setup.py',
  'package.json',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'composer.json',
];

const FRAMEWORKS: FrameworkDef[] = [
  {
    name: 'FastAPI',
    deps: ['fastapi'],
    importRx: /^\s*(?:from|import)\s+fastapi\b/m,
  },
  {
    name: 'Flask',
    deps: ['flask', 'Flask'],
    importRx: /^\s*(?:from|import)\s+flask\b/m,
  },
  {
    name: 'Django',
    deps: ['django', 'Django'],
    importRx: /^\s*(?:from|import)\s+django\b/m,
  },
  {
    name: 'Starlette',
    deps: ['starlette'],
    importRx: /^\s*(?:from|import)\s+starlette\b/m,
  },
  {
    name: 'aiohttp',
    deps: ['aiohttp'],
    importRx: /^\s*(?:from|import)\s+aiohttp\b/m,
  },
  {
    name: 'Express',
    deps: ['express'],
    importRx: /(?:require\(\s*['"]express['"]\)|from\s+['"]express['"])/,
  },
  {
    name: 'NestJS',
    deps: ['@nestjs/core', '@nestjs/common'],
    importRx: /@nestjs\//,
  },
  { name: 'Gin', deps: ['gin-gonic/gin'], importRx: /gin-gonic\/gin/ },
  { name: 'Fiber', deps: ['gofiber/fiber'], importRx: /gofiber\/fiber/ },
  {
    name: 'Rails',
    deps: ['rails'],
    importRx: /(?:require\s+['"]rails|Rails\.application)/,
  },
  { name: 'Sinatra', deps: ['sinatra'], importRx: /require\s+['"]sinatra['"]/ },
  {
    name: 'Spring Boot',
    deps: ['spring-boot'],
    importRx: /org\.springframework\.boot/,
  },
  { name: 'Actix', deps: ['actix-web'], importRx: /\bactix_web\b/ },
  { name: 'Axum', deps: ['axum'], importRx: /^\s*use\s+axum\b/m },
  {
    name: 'GraphQL',
    deps: ['graphql', 'graphene', 'strawberry-graphql'],
    importRx: /^\s*(?:from|import)\s+(?:graphql|graphene|strawberry)\b/m,
  },
  {
    name: 'gRPC',
    deps: ['grpcio', 'grpc', '@grpc/grpc-js'],
    importRx: /\bimport\s+grpc\b/,
  },
];

/** Concatenated text of all present dependency manifests (for substring scan). */
function manifestText(repoPath: string): string {
  return MANIFESTS.map((m) => readIfExists(repoPath, m)).join('\n');
}

/**
 * Detect frameworks/stack components from dependency manifests and import
 * statements (never bare prose). Returns name + evidence, deduped, stable order.
 */
export function detectFrameworks(repoPath: string): DetectedFramework[] {
  const manifests = manifestText(repoPath);
  const out: DetectedFramework[] = [];
  for (const fw of FRAMEWORKS) {
    const depHit = fw.deps.find((d) => manifests.includes(d));
    if (depHit) {
      out.push({
        name: fw.name,
        evidence: `dependency "${depHit}" in a manifest`,
      });
      continue;
    }
    if (fw.importRx && codeMatches(repoPath, fw.importRx)) {
      out.push({ name: fw.name, evidence: `imported in source` });
    }
  }
  // AWOS: a context/ directory plus .awos or context/spec.
  if (
    anyPath(repoPath, ['context']) &&
    anyPath(repoPath, ['.awos', 'context/spec'])
  ) {
    out.push({ name: 'AWOS', evidence: 'context/ + .awos/spec layout' });
  }
  return out;
}
```

(`readIfExists`, `anyPath`, `codeMatches` already exist in `topology.ts`.)

- [ ] **Step 4: Run, expect PASS.** Update any other `topology_frameworks.test.ts` case that asserted the old `string[]` shape (`.includes('X')` on names → map `.name` first).

- [ ] **Step 5: Update `audit_core.ts:343`** minimally so the tree compiles: `frameworks: detectFrameworks(repoPath)` now returns objects, not strings; Task 6 rewrites this. For now set `frameworks: detectFrameworks(repoPath).map((f) => f.name)` (Task 6 replaces with the evidence form).

- [ ] **Step 6: Full suite + build + commit**

```bash
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts" && /opt/homebrew/bin/node --test tests/lint-prompts.test.js
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_frameworks.test.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts
git add plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_frameworks.test.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): detect frameworks from manifests/imports not prose; carry evidence"
```

---

## Task 4: Linked-repo naming from the target's repo root (F1) — `topology.ts`

`detectLinkedRepos` names a symlink from its target's last path segment (`skills`) instead of the linked repo root (`onex-discovery-awos`).

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/topology.ts` (`detectLinkedRepos`, the name-derivation in both symlink branches, ~399-420)
- Test: `plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts` (add)

- [ ] **Step 1: Failing test** — add to `topology_linked.test.ts`:

```ts
import { realpathSync, symlinkSync } from 'node:fs';

test('linked repo named from target repo root, not the symlink leaf', () => {
  const root = mkdtempSync(join(tmpdir(), 'awos-link-root-'));
  try {
    // sibling "repo" with a .git marker
    const sibling = join(root, 'onex-discovery-awos');
    mkdirSync(join(sibling, '.git'), { recursive: true });
    mkdirSync(join(sibling, '.claude', 'skills'), { recursive: true });
    // the audited repo with .claude/skills -> ../onex-discovery-awos/.claude/skills
    const repo = join(root, 'onex-discovery-api');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    symlinkSync(
      join(sibling, '.claude', 'skills'),
      join(repo, '.claude', 'skills')
    );

    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'onex-discovery-awos'),
      `expected name onex-discovery-awos; got ${JSON.stringify(linked)}`
    );
    assert.ok(
      !linked.some((r) => r.name === 'skills'),
      'must not be named "skills"'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run, expect FAIL** (`name:"skills"`).

- [ ] **Step 3: Implement** — add a helper near `detectLinkedRepos` and use it for the name in both the resolved-symlink branch (currently `const name = segs[segs.length - 1] ...`) and the dangling branch:

```ts
/** Name a linked repo from a resolved target path: prefer the nearest ancestor
 *  dir containing a `.git` entry (its basename); else the segment before the
 *  first dotfile/tool-config segment; else the leaf. */
function linkedRepoName(realTarget: string): string {
  // 1. nearest ancestor with a .git
  let dir = realTarget;
  for (let i = 0; i < 12; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    try {
      if (existsSync(join(dir, '.git'))) return basename(dir);
    } catch {
      /* ignore */
    }
    dir = parent;
  }
  // 2. segment before the first dotfile segment
  const segs = realTarget.split(/[\\/]/).filter(Boolean);
  const dotIdx = segs.findIndex((s) => s.startsWith('.'));
  if (dotIdx > 0) return segs[dotIdx - 1];
  // 3. leaf
  return segs[segs.length - 1] ?? realTarget;
}
```

Then in the resolved-symlink branch replace `const name = segs[segs.length - 1] ?? realTarget;` with `const name = linkedRepoName(realTarget);` (you can drop the now-unused `segs` there). In the dangling branch, apply `linkedRepoName(rawTarget)` similarly. Ensure `dirname`/`basename` are imported from `node:path` at the top of `topology.ts` (add to the existing import).

- [ ] **Step 4: Run, expect PASS** (+ existing linked tests still green).

- [ ] **Step 5: Full suite + build + commit**

```bash
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts" && /opt/homebrew/bin/node --test tests/lint-prompts.test.js
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts
git add plugins/awos/skills/ai-readiness-audit/topology.ts plugins/awos/skills/ai-readiness-audit/topology_linked.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): name linked repos from the target repo root, not the symlink leaf"
```

---

## Task 5: CI "Connected" honesty (F3) — `ci.ts` + adp_c1/adp_c2

Config-only CI (no runs, no connector) must not read as a live "Connected" source.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/collectors/ci.ts` (the final `makeArtifact('ci', true, …)`, ~62-70)
- Modify: `plugins/awos/skills/ai-readiness-audit/metrics/adp_c1_ci_pass_rate.ts`, `metrics/adp_c2_pipeline_duration.ts` (header comments; verify SKIP)
- Test: `plugins/awos/skills/ai-readiness-audit/collectors/ci_collector.test.ts` (new) — or add to an existing ci test file if present

- [ ] **Step 1: Failing test** — new `collectors/ci_collector.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collect } from './ci.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

test('CI config-only (no runs, no connector) is available:false with a reason', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-ci-'));
  try {
    mkdirSync(join(repo, '.azure-pipelines'), { recursive: true });
    writeFileSync(join(repo, '.azure-pipelines', 'ci.yml'), 'steps: []\n');
    const art = collect(repo, PERIOD);
    assert.equal(
      art.available,
      false,
      'config-only CI must be available:false'
    );
    assert.match(String(art.reason_if_absent), /config detected/i);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('CI with connector runs is available:true', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-ci2-'));
  try {
    const art = collect(repo, PERIOD, { runs: [{ conclusion: 'success' }] });
    assert.equal(art.available, true, 'runs present → available:true');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

(Confirm the Azure config path `.azure-pipelines/ci.yml` is recognized by `detectCiConfigPath`; if not, use a path it recognizes such as `azure-pipelines.yml` at root.)

- [ ] **Step 2: Run, expect FAIL** (config-only currently returns available:true).

- [ ] **Step 3: Implement** — in `ci.ts`, change the tail so config-only without runs is unavailable. Replace lines ~62-70:

```ts
const runs: unknown[] = connector?.runs ?? [];

const raw: CiRaw = {
  config_detected: hasConfig,
  config_path: configPath,
  runs,
};

// Config present but no run data (no connector) → detected, not connected.
if (runs.length === 0) {
  const platform = configPath ? ciPlatformName(configPath) : 'CI';
  return makeArtifact(
    'ci',
    false,
    `${platform} config detected but no run history — supply a CI connector (e.g. Azure DevOps/GitHub Actions API) for pipeline metrics`,
    period,
    raw
  );
}
return makeArtifact('ci', true, null, period, raw);
```

If `ci.ts` has no platform-name helper, derive `platform` inline (e.g. from `configPath`); a generic "CI" is acceptable if a helper isn't readily available — keep it simple. Update the top-of-file doc comment that says "available=true when either condition is met" to reflect the new rule (available=true only with run data).

- [ ] **Step 4: Verify metrics SKIP** — `adp_c1_ci_pass_rate.ts` and `adp_c2_pipeline_duration.ts` already branch on `!artifact.available → SKIP`. Run their tests; update their header comments (the "available=true, config_detected, runs=[] → OK + note" bullet no longer applies) and fix/replace any test that asserted the old config-only "OK + note" outcome to now expect SKIP. Document why (config-only can't yield a pass rate).

- [ ] **Step 5: Run new + metric tests, expect PASS; full suite green.**

- [ ] **Step 6: Build + commit**

```bash
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts" && /opt/homebrew/bin/node --test tests/lint-prompts.test.js
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/collectors/ci.ts plugins/awos/skills/ai-readiness-audit/collectors/ci_collector.test.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_c1_ci_pass_rate.ts plugins/awos/skills/ai-readiness-audit/metrics/adp_c2_pipeline_duration.ts
git add plugins/awos/skills/ai-readiness-audit/collectors plugins/awos/skills/ai-readiness-audit/metrics plugins/awos/skills/ai-readiness-audit/dist
git commit -m "fix(audit): CI config-only is available:false (detected, no run history), not Connected"
```

---

## Task 6: Provenance everywhere in Repositories & Connections (F5) — `audit_core.ts`, `render.ts`, `agent_tools.ts`

Thread evidence into the tech-stack block and render it via the existing `tip()`; render linked-repo + missed-source provenance; guard the "~0 days" note.

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/agent_tools.ts` (`detectAgentTools` → evidence)
- Modify: `plugins/awos/skills/ai-readiness-audit/audit_core.ts` (tech_stack build, ~336-344)
- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (`TechStack` type in `AuditJson`, `techStackSection()`, `connectionsSection()` `~0 days` guard, md tech-stack)
- Test: `plugins/awos/skills/ai-readiness-audit/render.test.ts` (extend)

**Interfaces:**

- Consumes: `DetectedLanguage` (Task 2), `DetectedFramework` (Task 3).
- Produces: `interface TechItem { name: string; evidence: string }`; `AuditJson.tech_stack` groups become `TechItem[]`.

- [ ] **Step 1: `detectAgentTools` evidence (agent_tools.ts)** — change it to return evidence:

```ts
export interface DetectedAgentTool {
  def: AgentToolDef;
  evidence: string;
}

export function detectAgentTools(repoPath: string): DetectedAgentTool[] {
  const out: DetectedAgentTool[] = [];
  for (const t of AGENT_TOOLS) {
    const paths = [
      ...t.instructionFiles,
      ...t.ruleOrCommandDirs,
      ...t.skillDirs,
      ...t.mcpConfigPaths,
      ...t.hookPaths,
      ...t.configDirs,
    ];
    const hit = paths.find((p) => existsSync(join(repoPath, p)));
    if (hit) out.push({ def: t, evidence: hit });
  }
  return out;
}
```

Update `agent_tools.test.ts` cases that expected `AgentToolDef[]` (`.displayName` → `.def.displayName`).

- [ ] **Step 2: Failing render test** — add to `render.test.ts`:

```ts
test('tech stack renders names with evidence tooltips and no ~0 days', () => {
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
    linked_repos: [
      { name: 'onex-discovery-awos', kind: 'symlink', via: '.claude/skills' },
    ],
    tech_stack: {
      languages: [
        { name: 'Python', evidence: '149 .py files · pyproject.toml' },
      ],
      agent_tools: [{ name: 'Claude Code', evidence: '.claude' }],
      ci: [{ name: 'Azure DevOps', evidence: 'azure-pipelines.yml' }],
      frameworks: [
        { name: 'FastAPI', evidence: 'dependency "fastapi" in a manifest' },
      ],
    },
  };
  const html = renderHtml(audit as any);
  assert.ok(html.includes('149 .py files'), 'language evidence shown');
  assert.ok(
    html.includes('dependency &quot;fastapi&quot;') ||
      html.includes('dependency "fastapi"'),
    'framework evidence shown'
  );
  assert.ok(
    html.includes('onex-discovery-awos'),
    'linked repo by repo-root name'
  );
  assert.ok(!/~0 days/.test(html), 'never render ~0 days');
});
```

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Implement render + audit_core + types.**

In `render.ts` `AuditJson` (the `tech_stack?` type): change groups to `TechItem[]`:

```ts
export interface TechItem {
  name: string;
  evidence: string;
}
export interface TechStack {
  languages: TechItem[];
  agent_tools: TechItem[];
  ci: TechItem[];
  frameworks: TechItem[];
}
```

(and `tech_stack?: TechStack;` on `AuditJson`).

In `techStackSection()` render each item name with its evidence via `tip()`:

```ts
function techItemsHtml(items: TechItem[]): string {
  return items.map((i) => tip(i.name, i.evidence, '')).join(', ');
}
```

Use `techItemsHtml(ts.languages)` etc. for each non-empty group (keep the existing empty-group skipping).

In `connectionsSection()` guard the limited-history note (line ~1213-1217): require `s.history_available_days > 0`:

```ts
const limitedNote =
  s.history_available_days !== null &&
  s.history_available_days > 0 &&
  s.history_available_days < LIMITED_HISTORY_DAYS
    ? ` <em>(limited history ~${s.history_available_days} days)</em>`
    : '';
```

In the markdown renderer's Tech Stack section (added in the v2 batch), render `name — evidence` per item (md has no hover).

In `audit_core.ts` (lines ~339-344) build evidence-carrying items:

```ts
const techStack = {
  languages: detectLanguages(repoPath).map((l) => ({
    name: l.def.displayName,
    evidence: l.evidence,
  })),
  agent_tools: detectAgentTools(repoPath).map((t) => ({
    name: t.def.displayName,
    evidence: t.evidence,
  })),
  ci: ciPath ? [{ name: ciDisplayName(ciPath), evidence: ciPath }] : [],
  frameworks: detectFrameworks(repoPath).map((f) => ({
    name: f.name,
    evidence: f.evidence,
  })),
};
```

Also update `aggregate()`'s preservation if it re-derives tech_stack (it preserves the block by key — no shape assumptions — so no change needed; verify).

- [ ] **Step 5: Run render + full suite, expect PASS.**

- [ ] **Step 6: Build + commit**

```bash
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts" && /opt/homebrew/bin/node --test tests/lint-prompts.test.js
npm run build:engine
npx prettier --write plugins/awos/skills/ai-readiness-audit/agent_tools.ts plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts
git add plugins/awos/skills/ai-readiness-audit/agent_tools.ts plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts plugins/awos/skills/ai-readiness-audit/audit_core.ts plugins/awos/skills/ai-readiness-audit/render.ts plugins/awos/skills/ai-readiness-audit/render.test.ts plugins/awos/skills/ai-readiness-audit/dist
git commit -m "feat(audit): evidence/provenance for Tech Stack, frameworks, linked repos; guard ~0 days"
```

---

## Task 7: Connector enrichment is default-on for reachable MCP (F2) — docs

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/SKILL.md` (Step 6.2, ~112-118)
- Modify: `plugins/awos/skills/ai-readiness-audit/references/connector-shapes.md` (add a turnkey recipe)
- Modify (if it frames MCP as needing sources.toml): `plugins/awos/skills/ai-readiness-audit/references/data-sources.md`

- [ ] **Step 1: Rewrite SKILL.md Step 6.2** so reachable tracker/docs MCP is used by default. Replace the current bullet block with declarative guidance:
  - When a tracker/docs MCP (Jira/Confluence/Linear/Coda/GitHub Issues/…) is **reachable**, fetching and mapping it is a normal part of the audit — not optional, and **not** gated on a `sources.toml`. The absence of `sources.toml` never justifies skipping a reachable MCP. (`sources.toml` only configures non-MCP/explicit connectors.)
  - Turnkey recipe: query a bounded recent window (the engine buckets by lookback), map to the shape in `references/connector-shapes.md`, write `context/audits/YYYY-MM-DD/collected/<source>.json`, then `node "${CLAUDE_SKILL_DIR}/dist/cli.js" metric <id> "<repoPath>" "context/audits/YYYY-MM-DD/collected"` for each affected metric and patch the checks; finally re-`aggregate`.
  - Only when a source is genuinely unreachable (no MCP / auth fails / error) record the **actual** reason in `missed_sources` — never the generic "no connector provided" when an MCP was reachable but skipped.
  - Keep the one-bold-rule convention; plain declarative sentences.

- [ ] **Step 2: Add a "Turnkey enrichment" section to `connector-shapes.md`** — a worked, copy-pasteable example: an example Jira JQL + the mapping to `TrackerConnector`, the exact `collected/tracker.json` write, and the `cli.js metric adp_i1 …` / `adp_i2` / `adp_i3` + `aggregate` commands; same for Confluence → `DocsConnector` → `adp_d1`.

- [ ] **Step 3: Reconcile `data-sources.md`** — if it states or implies tracker/docs need a `sources.toml` to be used, correct it to: reachable MCP is used directly; `sources.toml` is for explicit/non-MCP connector config only.

- [ ] **Step 4: Lint + commit** (docs only, no dist)

```bash
/opt/homebrew/bin/node --test tests/lint-prompts.test.js
npx prettier --write plugins/awos/skills/ai-readiness-audit/SKILL.md plugins/awos/skills/ai-readiness-audit/references/connector-shapes.md plugins/awos/skills/ai-readiness-audit/references/data-sources.md
git add plugins/awos/skills/ai-readiness-audit/SKILL.md plugins/awos/skills/ai-readiness-audit/references
git commit -m "docs(audit): reachable tracker/docs MCP is enriched by default (not gated on sources.toml)"
```

---

## Task 8: Version bump, lint contract, full verify + headless re-run

**Files:** `plugins/awos/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `tests/lint-prompts.test.js`

- [ ] **Step 1: Bump 2.4.0 → 2.5.0** in `plugin.json` (`version`) and `marketplace.json` (both `metadata.version` and the awos plugin entry `version`).

- [ ] **Step 2: Update the lint version-contract** — in `tests/lint-prompts.test.js` the test `plugin.json version … equals 2.4.0`: change the test name + the two `'2.4.0'` literals + the description string to `'2.5.0'` ("report honesty + provenance").

- [ ] **Step 3: Full verification**

```bash
npm run build:engine && git diff --exit-code plugins/awos/skills/ai-readiness-audit/dist && echo DIST_OK
/opt/homebrew/bin/node --import tsx --test "plugins/awos/skills/ai-readiness-audit/**/*.test.ts"
/opt/homebrew/bin/node --test tests/lint-prompts.test.js
/opt/homebrew/bin/node --test "tests/installer/*.test.js"
/opt/homebrew/bin/node --test tests/fixtures.test.js
npx prettier . --check
```

All green.

- [ ] **Step 4: Smoke-run engine on the real repo** (no MCP needed — checks F1/F3/F4/F5 deterministically):

```bash
ENGINE=plugins/awos/skills/ai-readiness-audit/dist/cli.js
OUT=$(mktemp -d)
/opt/homebrew/bin/node "$ENGINE" audit-core /path/to/target-repo "$OUT" >/dev/null
/opt/homebrew/bin/node -e "const a=require('$OUT/audit.json'); console.log(JSON.stringify({langs:a.tech_stack.languages, fw:a.tech_stack.frameworks, linked:a.linked_repos, ci:a.sources.find(s=>s.source==='ci')},null,2))"
```

Expected: languages = Python only (no C/C++); frameworks include FastAPI (with evidence) and NOT Express; linked_repos has `onex-discovery-awos`; ci `available:false` with a "config detected, no run history" reason.

- [ ] **Step 5: Commit + push**

```bash
npx prettier --write .claude-plugin/marketplace.json plugins/awos/.claude-plugin/plugin.json tests/lint-prompts.test.js
git add .claude-plugin plugins/awos/.claude-plugin tests/lint-prompts.test.js plugins/awos/skills/ai-readiness-audit/dist
git commit -m "chore(audit): bump plugin to 2.5.0 (report honesty + provenance)"
git push
```

- [ ] **Step 6: Headless re-run for F2 (#2)** — outside this plan's automated scope, run the audit harness against `onex-discovery-api` with the Atlassian MCP reachable and confirm `collected/tracker.json`/`docs.json` are written `available:true` and connector metrics fill. (Controller does this after the branch is green; if still skipped, escalate the deterministic-pre-fetch fallback.)

---

## Self-Review

**Spec coverage:** F1→Task 4; F2→Task 7 (+ Task 8 step 6 verify); F3→Task 5 (+ render guard in Task 6); F4 (.venv markers)→Task 1, (detectLanguages)→Task 2, (detectFrameworks)→Task 3; F5 (provenance)→Task 6. Version bump + lint contract + verify→Task 8. All spec sections covered.

**Type consistency:** `DetectedLanguage{def,evidence}` (Task 2) → consumed Task 6 as `l.def.displayName`/`l.evidence`. `DetectedFramework{name,evidence}` (Task 3) → Task 6 `f.name`/`f.evidence`. `DetectedAgentTool{def,evidence}` (Task 6 step 1) → used same task. `TechItem{name,evidence}`/`TechStack` (Task 6) match the render test fixture. `linkedRepoName` (Task 4) returns string. Tasks 2 & 3 each patch `audit_core` minimally to keep the tree compiling before Task 6 finalizes it.

**Inter-task file collisions:** `topology.ts` edited by Tasks 3 (detectFrameworks) & 4 (detectLinkedRepos) — different functions, sequential. `audit_core.ts` touched by Tasks 2,3 (minimal) & 6 (final) — Task 6 owns the final shape. `render.ts` only Task 6.
