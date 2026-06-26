---
name: project-topology
title: Project Topology
description: Reconnaissance — detects repository structure, all application layers, and languages to inform later dimensions
severity: medium
---

# Project Topology

Reconnaissance dimension that inventories the project's structure, all application layers, and technology stack. This runs first so all subsequent dimensions can adapt their checks based on what actually exists in the repository.

All checks produce PASS (detected) or SKIP (not detected) — there are no FAIL judgments.

## Checks

### TOPO-01: Repository structure type

- **What:** Determine if this is a monorepo, single-service repo, or library
- **How:** Check for multiple top-level directories with independent build configs (package.json, build.gradle.kts, Cargo.toml, go.mod, pyproject.toml, pom.xml). A monorepo has 2+ independent build roots. A single-service repo has 1. A library has no runnable service entry point.
- **Pass:** Structure type identified (monorepo | single-service | library)
- **Fail:** N/A — always produces a result
- **Severity:** medium
- **Category:** none (recon, unscored)

### TOPO-02: Application layer inventory

- **What:** Discover all distinct application layers/components in the project
- **How:** Scan the repository for all identifiable layers. Do NOT limit to predefined categories — detect whatever exists (API/Backend, Frontend, Mobile, CLI, Workers, Data/ETL, Messaging, Shared libraries, Gateway/BFF, etc.). For each detected layer, record: type, framework/technology, root path, and primary language.
- **Pass:** At least one layer detected with type, framework, and path
- **Fail:** N/A — always produces a result
- **Severity:** medium
- **Category:** none (recon, unscored)

### TOPO-03: Database and storage detection

- **What:** Detect all database and storage systems used by the project
- **How:** Look for: migration directories (`db/migration/`, `migrations/`, `prisma/`), ORM configs (Prisma, TypeORM, Hibernate/JPA, SQLAlchemy, GORM), `docker-compose` with storage services (postgres, mysql, mongo, redis, elasticsearch, minio, etc.), connection strings or client configurations in code. Record each storage system with its type (relational, document, key-value, search, object storage, etc.).
- **Pass:** Storage systems detected — record types and tools
- **Skip:** No storage layer found
- **Severity:** medium
- **Category:** none (recon, unscored)

### TOPO-04: Infrastructure layer detection

- **What:** Detect infrastructure-as-code or deployment configuration
- **How:** Look for: Terraform files (`*.tf`), Kubernetes manifests (`k8s/`, `kubernetes/`, `*.yaml` with `apiVersion`), Docker configs (`Dockerfile`, `docker-compose*.yml`), CDK, Pulumi, CloudFormation, Helm charts, Ansible, serverless configs (serverless.yml, AWS SAM).
- **Pass:** Infrastructure layer detected — record tools
- **Skip:** No infrastructure-as-code found
- **Severity:** medium
- **Category:** none (recon, unscored)

### TOPO-05: Language inventory

- **What:** Identify all programming languages used in the project
- **How:** Glob for source files by common extensions: `**/*.kt`, `**/*.java`, `**/*.ts`/`**/*.tsx`, `**/*.js`/`**/*.jsx`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.rb`, `**/*.swift`, `**/*.dart`, `**/*.scala`, `**/*.cs`, `**/*.php`, `**/*.ex`/`**/*.exs`, `**/*.clj`. Count files per language. Exclude build/dependency directories (`node_modules/`, `build/`, `dist/`, `.gradle/`, `target/`, `vendor/`, `venv/`, `.venv/`, `__pycache__/`).
- **Pass:** Language inventory compiled with file counts
- **Fail:** N/A — always produces a result
- **Severity:** medium
- **Category:** none (recon, unscored)

### TOPO-06: Inter-layer communication patterns

- **What:** Identify how layers communicate with each other
- **How:** Look for communication indicators: OpenAPI/Swagger specs (REST), `.proto` files (gRPC), GraphQL schemas (`.graphql`, `schema.graphql`), message queue configs (Kafka topics, RabbitMQ exchanges, SQS queues), event schemas, shared contract/DTO packages, API client generators.
- **Pass:** Communication patterns identified
- **Skip:** Single-layer project or no inter-layer communication found
- **Severity:** medium
- **Category:** none (recon, unscored)

## Topology Summary

At the end of the artifact, write a structured summary block that later dimensions will parse:

```markdown
## Topology Summary

- **Structure:** monorepo | single-service | library
- **Layers:** (list ALL detected layers, not just predefined categories)
  - [layer-type]: [framework/technology] at [path] (primary language: [lang])
  - [layer-type]: [framework/technology] at [path] (primary language: [lang])
  - …
- **Storage:** [type1] with [tool], [type2] with [tool] | not detected
- **Infrastructure:** [tools] | not detected
- **Languages:** [lang1] (N files), [lang2] (N files), …
- **Communication:** [REST via OpenAPI, gRPC, GraphQL, message queues, etc.] | not detected
- **Service directories:** [dir1], [dir2], …
```

## Topology Flags

The engine computes these topology flags deterministically (`topology.ts`) from the repository, and `audit-core` uses them to evaluate the `applies_when` expressions in `references/standards.toml`. The flags are documented here for reference (the names must match the `applies_when` expressions exactly):

```markdown
## Topology Flags

- `handles_secrets`: true|false (e.g. vault config / .env.example / secret manager client detected)
- `has_agent_instruction_files`: true|false (e.g. any agent instruction file present — CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, .github/copilot-instructions.md, or equivalent for any supported agentic coding tool)
- `has_ai_agent_files`: true|false (e.g. any agent instruction file or config directory present — same as has_agent_instruction_files; both flags are kept for backwards compatibility)
- `has_api`: true|false (e.g. any API layer detected — REST, gRPC, GraphQL, or generic router)
- `has_ci`: true|false (e.g. .github/workflows/, .gitlab-ci.yml, Jenkinsfile, or similar found)
- `has_commands_or_skills`: true|false (e.g. any agent rule/command or skill directory present — .claude/commands/, .cursor/rules/, .gemini/commands/, .claude/skills/, etc.)
- `has_db`: true|false (e.g. migration dirs, ORM config, or docker-compose storage service found)
- `has_dependency_automation`: true|false (e.g. Dependabot, Renovate, or similar config found)
- `has_docs_connector`: true|false (e.g. Confluence/Coda CLI on PATH or MCP server in session)
- `has_hooks`: true|false (e.g. .claude/settings.json hooks or pre-commit hooks detected)
- `has_http_api`: true|false (e.g. FastAPI, Express, Django REST, Spring MVC, or similar found)
- `has_incident_source`: true|false (e.g. PagerDuty/OpsGenie reference or incident tracker detected)
- `has_lockfiles`: true|false (e.g. package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock found)
- `has_mcp_config`: true|false (e.g. any MCP config path present — .mcp.json, .cursor/mcp.json, .kiro/settings/mcp.json, .gemini/settings.json, .cline/mcp.json, etc. — or mcpServers block in settings)
- `has_ml_layer`: true|false (e.g. torch, tensorflow, scikit-learn, huggingface, or model files found)
- `has_multiple_layers`: true|false (e.g. two or more distinct application layers detected)
- `has_package_ecosystem`: true|false (e.g. package.json, pyproject.toml, go.mod, Cargo.toml, or pom.xml found)
- `has_package_manifests`: true|false (e.g. same as has_package_ecosystem — at least one manifest found)
- `has_topology`: true|false (always true — this dimension always runs and produces topology data)
- `has_tracker`: true|false (e.g. Jira project key, Linear URL, GitHub Issues link found in docs/scripts)
- `is_monorepo`: true|false (e.g. two or more independent build roots detected in workspace)
- `is_multi_service`: true|false (e.g. multiple independently deployable services detected)
- `is_not_library`: true|false (e.g. project has a runnable service entry point, not a pure library)
- `uses_auth`: true|false (e.g. OAuth, JWT, session middleware, or auth library import detected)
- `uses_env_vars`: true|false (e.g. process.env / os.environ / .env file or dotenv library found)
```

Every category that declares `applies_when = "topology.<flag>"` in `references/standards.toml` is gated on these engine-computed flags: `audit-core` evaluates the expression directly, and a false flag marks the category SKIP (excluded from the coverage denominator).
