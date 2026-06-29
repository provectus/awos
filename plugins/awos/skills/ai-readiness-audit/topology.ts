// ---------------------------------------------------------------------------
// topology.ts — deterministic project-topology flags.
//
// Produces the boolean flags that `references/standards.toml` `applies_when`
// expressions gate on (e.g. `topology.has_http_api`). These were previously
// authored by the LLM project-topology pass; computing them in the engine keeps
// the whole audit deterministic and headless-robust.
//
// Connector-dependent flags (has_tracker, has_docs_connector, has_incident_source)
// cannot be derived from the repo alone — they default to false and are patched
// by the orchestrator when an MCP connector is available.
// ---------------------------------------------------------------------------
import {
  existsSync,
  readFileSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { iterFiles, grep } from './detectors/_base.ts';
import { detectCiConfigPath } from './ci_platforms.ts';
import {
  ALL_INSTRUCTION_FILES,
  ALL_TOOL_CONFIG_DIRS,
  ALL_RULE_COMMAND_DIRS,
  ALL_SKILL_DIRS,
  ALL_MCP_CONFIG_PATHS,
} from './agent_tools.ts';
import { ALL_SOURCE_GLOBS } from './languages.ts';

export type TopologyFlags = Record<string, boolean>;

/** True if any of the given repo-relative paths exists. */
function anyPath(repoPath: string, names: string[]): boolean {
  return names.some((n) => existsSync(join(repoPath, n)));
}

/** True if any source file matches the pattern — full language registry. */
const CODE_GLOBS = ALL_SOURCE_GLOBS;

function codeMatches(repoPath: string, pattern: RegExp): boolean {
  try {
    return grep(repoPath, pattern, CODE_GLOBS).length > 0;
  } catch {
    return false;
  }
}

/** True if any file matching the globs exists. */
function anyGlob(repoPath: string, globs: string[]): boolean {
  try {
    return iterFiles(repoPath, globs).length > 0;
  } catch {
    return false;
  }
}

function readIfExists(repoPath: string, rel: string): string {
  try {
    return readFileSync(join(repoPath, rel), 'utf8');
  } catch {
    return '';
  }
}

const PKG_MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'setup.py',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'Gemfile',
];

const LOCKFILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'uv.lock',
  'Gemfile.lock',
  'go.sum',
  'composer.lock',
];

export function computeTopology(
  repoPath: string,
  connectors?: {
    has_tracker?: boolean;
    has_docs_connector?: boolean;
    has_incident_source?: boolean;
  }
): TopologyFlags {
  const settings = readIfExists(repoPath, '.claude/settings.json');

  const hasPackageEcosystem = anyPath(repoPath, PKG_MANIFESTS);
  const hasHttpApi = codeMatches(
    repoPath,
    /\b(fastapi|flask|django|express|@nestjs|gin-gonic|fiber|spring(framework|boot)?|sinatra|rails|actix_web|axum|aiohttp|starlette)\b/i
  );
  const hasApi =
    hasHttpApi ||
    anyGlob(repoPath, ['openapi.json', 'openapi.yaml', 'swagger.json']) ||
    codeMatches(
      repoPath,
      /\b(graphql|grpc|@grpc|protobuf|router\.(get|post|put))\b/i
    );

  // Two or more independent build roots (manifests in subdirectories) → monorepo.
  const manifestHits = (() => {
    try {
      return iterFiles(repoPath, [
        'package.json',
        'pyproject.toml',
        'go.mod',
        'Cargo.toml',
        'pom.xml',
      ]).length;
    } catch {
      return 0;
    }
  })();
  const isMonorepo =
    anyPath(repoPath, [
      'pnpm-workspace.yaml',
      'turbo.json',
      'lerna.json',
      'nx.json',
    ]) || manifestHits >= 2;

  const flags: TopologyFlags = {
    has_topology: true,
    has_ci: detectCiConfigPath(repoPath) !== null,
    // has_ai_agent_files and has_agent_instruction_files are semantically
    // identical (both used by standards.toml). Both are kept but share the
    // same registry-driven expression. Pending future consolidation.
    has_ai_agent_files:
      anyPath(repoPath, [...ALL_INSTRUCTION_FILES, ...ALL_TOOL_CONFIG_DIRS]) ||
      anyGlob(repoPath, ALL_INSTRUCTION_FILES),
    has_agent_instruction_files:
      anyPath(repoPath, [...ALL_INSTRUCTION_FILES, ...ALL_TOOL_CONFIG_DIRS]) ||
      anyGlob(repoPath, ALL_INSTRUCTION_FILES),
    has_commands_or_skills: anyPath(repoPath, [
      ...ALL_RULE_COMMAND_DIRS,
      ...ALL_SKILL_DIRS,
    ]),
    has_hooks:
      /"hooks"\s*:/.test(settings) ||
      anyPath(repoPath, ['.pre-commit-config.yaml', '.husky']),
    has_mcp_config:
      anyPath(repoPath, ALL_MCP_CONFIG_PATHS) ||
      /"mcpServers"\s*:/.test(settings),
    has_lockfiles: anyPath(repoPath, LOCKFILES),
    has_package_ecosystem: hasPackageEcosystem,
    has_package_manifests: hasPackageEcosystem,
    has_dependency_automation: anyPath(repoPath, [
      '.github/dependabot.yml',
      '.github/dependabot.yaml',
      'renovate.json',
      '.renovaterc',
      '.renovaterc.json',
    ]),
    has_db:
      anyPath(repoPath, [
        'migrations',
        'alembic.ini',
        'alembic',
        'prisma',
        'db/migrate',
      ]) ||
      codeMatches(
        repoPath,
        /\b(sqlalchemy|piccolo|prisma|typeorm|sequelize|mongoose|gorm|psycopg2?|asyncpg|knex|django\.db)\b/i
      ),
    has_http_api: hasHttpApi,
    has_api: hasApi,
    has_ml_layer:
      codeMatches(
        repoPath,
        /\b(torch|tensorflow|sklearn|scikit-learn|transformers|keras|xgboost|lightgbm|huggingface)\b/i
      ) || anyGlob(repoPath, ['*.ipynb', '*.pt', '*.h5', '*.onnx', '*.pkl']),
    uses_auth: codeMatches(
      repoPath,
      /\b(jwt|oauth2?|passport|keycloak|auth0|@login_required|authenticate|bearer\s+token|rbac)\b/i
    ),
    uses_env_vars:
      anyPath(repoPath, ['.env', '.env.example']) ||
      anyGlob(repoPath, ['.env', '.env.*']) ||
      codeMatches(
        repoPath,
        /\b(os\.environ|os\.getenv|process\.env|dotenv|godotenv)\b/
      ),
    handles_secrets:
      anyPath(repoPath, ['.env']) ||
      anyGlob(repoPath, ['.env', '.env.*']) ||
      codeMatches(
        repoPath,
        /\b(keyvault|secretsmanager|secret_?manager|hashicorp.?vault|SECRET_KEY|API_KEY|getSecret)\b/i
      ),
    is_monorepo: isMonorepo,
    is_multi_service: (() => {
      const composeText =
        readIfExists(repoPath, 'docker-compose.yml') ||
        readIfExists(repoPath, 'docker-compose.yaml');
      if (composeText) {
        // Count entries under a top-level `services:` block (2+ → multi-service).
        // Walk lines; stop at next non-indented key so volumes/networks don't inflate count.
        const m = composeText.match(/^services:[ \t]*\n([\s\S]*)/m);
        if (m) {
          let serviceCount = 0;
          for (const line of m[1].split('\n')) {
            if (/^\S/.test(line) && line.trim() !== '') break;
            if (/^\s{2}\w[\w.-]*:[ \t]*$/.test(line)) serviceCount++;
          }
          if (serviceCount >= 2) return true;
        }
      }
      // Otherwise multi-service when 2+ Dockerfiles exist anywhere in the repo.
      try {
        return iterFiles(repoPath, ['Dockerfile']).length >= 2;
      } catch {
        return false;
      }
    })(),
    has_multiple_layers:
      isMonorepo ||
      [
        anyPath(repoPath, ['frontend', 'web', 'ui', 'client']),
        anyPath(repoPath, ['backend', 'api', 'server', 'src']),
        anyPath(repoPath, ['infra', 'infrastructure', 'terraform', 'deploy']),
      ].filter(Boolean).length >= 2,
    is_not_library:
      hasApi ||
      anyPath(repoPath, ['Dockerfile', 'docker-compose.yml']) ||
      anyGlob(repoPath, [
        'main.py',
        'main.go',
        'app.py',
        'server.ts',
        'index.ts',
        'manage.py',
      ]),
    has_python:
      anyGlob(repoPath, ['*.py']) ||
      anyPath(repoPath, [
        'pyproject.toml',
        'setup.py',
        'requirements.txt',
        'Pipfile',
      ]),
    // Connector-dependent — repo alone cannot prove these. Default false; the
    // orchestrator flips them true after a successful MCP connector fetch.
    has_tracker: Boolean(connectors?.has_tracker),
    has_docs_connector: Boolean(connectors?.has_docs_connector),
    has_incident_source: Boolean(connectors?.has_incident_source),
  };
  return flags;
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

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
    importRx:
      /(?:^\s*(?:from|import)\s+(?:graphql|graphene|strawberry)\b|from\s+['"](?:graphql|graphene|strawberry)['"])/m,
  },
  {
    name: 'gRPC',
    deps: ['grpcio', 'grpc', '@grpc/grpc-js'],
    importRx:
      /(?:\bimport\s+grpc\b|from\s+['"](?:@grpc\/|grpc)[^'"]*['"]|require\s*\(\s*['"](?:@grpc\/|grpc)[^'"]*['"]\))/,
  },
];

/** Concatenated text of all present dependency manifests (for substring scan). */
function manifestText(repoPath: string): string {
  return MANIFESTS.map((m) => readIfExists(repoPath, m)).join('\n');
}

/** Escape special regex characters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `dep` appears in `manifests` as a whole package token — i.e. not
 * flanked by alphanumerics or underscores. Package separators (`-`, `.`, `/`,
 * `@`, quotes, spaces, version operators) all count as boundaries, so:
 *   - "rails" inside "guardrails-ai" → NO match (preceded by "d")
 *   - "express" inside "expression"  → NO match (followed by "i")
 *   - "spring-boot" inside "spring-boot-starter-web" → MATCH ("-" is a boundary)
 *   - "express" in `{"express":"^4"}` → MATCH (flanked by quotes)
 */
function manifestHasDep(manifests: string, dep: string): boolean {
  return new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegex(dep)}(?![A-Za-z0-9_])`
  ).test(manifests);
}

/**
 * Detect frameworks/stack components from dependency manifests and import
 * statements (never bare prose). Returns name + evidence, deduped, stable order.
 */
export function detectFrameworks(repoPath: string): DetectedFramework[] {
  const manifests = manifestText(repoPath);
  const out: DetectedFramework[] = [];
  for (const fw of FRAMEWORKS) {
    const depHit = fw.deps.find((d) => manifestHasDep(manifests, d));
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

// ---------------------------------------------------------------------------
// Linked repository detection
// ---------------------------------------------------------------------------

export interface LinkedRepo {
  name: string;
  kind: 'symlink' | 'submodule';
  via: string;
}

/**
 * Name a linked repo from a resolved target path: prefer the nearest ancestor
 * dir containing a `.git` entry (its basename); else the segment before the
 * first dotfile/tool-config segment; else the leaf.
 */
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

/**
 * Detect linked (externally-referenced) repositories by scanning:
 *  1. `.gitmodules` — each `url =` entry is a submodule.
 *  2. Symlinks under agent-tool config dirs (e.g. `.claude/`, `.cursor/`)
 *     that point outside the repo root — treated as linked repos.
 *
 * Returns an array of unique `LinkedRepo` records keyed by `name`.
 */
export function detectLinkedRepos(repoPath: string): LinkedRepo[] {
  const found = new Map<string, LinkedRepo>();

  // 1. Parse .gitmodules for submodule URLs.
  const gm = readIfExists(repoPath, '.gitmodules');
  for (const m of gm.matchAll(/url\s*=\s*(\S+)/g)) {
    const url = m[1];
    const name =
      url
        .replace(/\.git$/, '')
        .split(/[\\/]/)
        .pop() || url;
    found.set(name, { name, kind: 'submodule', via: '.gitmodules' });
  }

  // 2. Symlinks under agent-tool config dirs whose resolved target is OUTSIDE
  //    the repo root. Recurses up to 2 levels deep so nested paths like
  //    `.claude/skills/<name>` are found. Symlinks pointing within the repo
  //    (e.g. local convenience links) are ignored.
  //    The repo root is resolved via realpathSync to handle /tmp → /private/tmp
  //    style platform aliases before comparison.
  const realRepoRoot = (() => {
    try {
      return realpathSync(repoPath).replace(/\/+$/, '');
    } catch {
      return repoPath.replace(/\/+$/, '');
    }
  })();

  function scanDirForOutsideSymlinks(
    dirPath: string,
    viaPrefix: string,
    depth: number
  ): void {
    let entries: string[] = [];
    try {
      entries = readdirSync(dirPath);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dirPath, e);
      const via = `${viaPrefix}/${e}`;
      try {
        const stat = lstatSync(p);
        if (stat.isSymbolicLink()) {
          // Resolve the target and check whether it lands outside the repo root.
          let realTarget: string;
          try {
            realTarget = realpathSync(p).replace(/\/+$/, '');
          } catch {
            // Dangling symlink — target doesn't exist; use the raw link value for
            // the name but record it only if it looks like an absolute outside path.
            const rawTarget = readlinkSync(p);
            if (!rawTarget.startsWith(realRepoRoot)) {
              const name = linkedRepoName(rawTarget.replace(/\/+$/, ''));
              if (!found.has(name)) {
                found.set(name, { name, kind: 'symlink', via });
              }
            }
            continue;
          }
          // Only record if the resolved target is outside the repo root.
          if (
            !realTarget.startsWith(realRepoRoot + '/') &&
            realTarget !== realRepoRoot
          ) {
            const name = linkedRepoName(realTarget);
            if (!found.has(name)) {
              found.set(name, { name, kind: 'symlink', via });
            }
          }
        } else if (stat.isDirectory() && depth > 0) {
          // Recurse one more level; never follow symlink-directories (lstatSync used).
          scanDirForOutsideSymlinks(p, via, depth - 1);
        }
      } catch {
        /* unreadable entry — skip */
      }
    }
  }

  for (const dir of ALL_TOOL_CONFIG_DIRS) {
    scanDirForOutsideSymlinks(join(repoPath, dir), dir, 1);
  }

  // Also scan AWOS framework dirs (context/, .awos/) for outside symlinks.
  const AWOS_FRAMEWORK_DIRS = ['context', '.awos'];
  for (const dir of AWOS_FRAMEWORK_DIRS) {
    scanDirForOutsideSymlinks(join(repoPath, dir), dir, 1);
  }

  return [...found.values()];
}
