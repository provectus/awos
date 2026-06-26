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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    is_multi_service: anyGlob(repoPath, [
      'docker-compose.yml',
      'docker-compose.yaml',
    ])
      ? /services\s*:/.test(
          readIfExists(repoPath, 'docker-compose.yml') ||
            readIfExists(repoPath, 'docker-compose.yaml')
        )
      : (() => {
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
    // Connector-dependent — repo alone cannot prove these. Default false; the
    // orchestrator flips them true after a successful MCP connector fetch.
    has_tracker: Boolean(connectors?.has_tracker),
    has_docs_connector: Boolean(connectors?.has_docs_connector),
    has_incident_source: Boolean(connectors?.has_incident_source),
  };
  return flags;
}
