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

### TOPO-02: Application layer inventory

- **What:** Discover all distinct application layers/components in the project
- **How:** Scan the repository for all identifiable layers. Do NOT limit to predefined categories — detect whatever exists (API/Backend, Frontend, Mobile, CLI, Workers, Data/ETL, Messaging, Shared libraries, Gateway/BFF, etc.). For each detected layer, record: type, framework/technology, root path, and primary language.
- **Pass:** At least one layer detected with type, framework, and path
- **Fail:** N/A — always produces a result
- **Severity:** medium

### TOPO-03: Database and storage detection

- **What:** Detect all database and storage systems used by the project
- **How:** Look for: migration directories (`db/migration/`, `migrations/`, `prisma/`), ORM configs (Prisma, TypeORM, Hibernate/JPA, SQLAlchemy, GORM), `docker-compose` with storage services (postgres, mysql, mongo, redis, elasticsearch, minio, etc.), connection strings or client configurations in code. Record each storage system with its type (relational, document, key-value, search, object storage, etc.).
- **Pass:** Storage systems detected — record types and tools
- **Skip:** No storage layer found
- **Severity:** medium

### TOPO-04: Infrastructure layer detection

- **What:** Detect infrastructure-as-code or deployment configuration
- **How:** Look for: Terraform files (`*.tf`), Kubernetes manifests (`k8s/`, `kubernetes/`, `*.yaml` with `apiVersion`), Docker configs (`Dockerfile`, `docker-compose*.yml`), CDK, Pulumi, CloudFormation, Helm charts, Ansible, serverless configs (serverless.yml, AWS SAM).
- **Pass:** Infrastructure layer detected — record tools
- **Skip:** No infrastructure-as-code found
- **Severity:** medium

### TOPO-05: Language inventory

- **What:** Identify all programming languages used in the project
- **How:** Glob for source files by common extensions: `**/*.kt`, `**/*.java`, `**/*.ts`/`**/*.tsx`, `**/*.js`/`**/*.jsx`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.rb`, `**/*.swift`, `**/*.dart`, `**/*.scala`, `**/*.cs`, `**/*.php`, `**/*.ex`/`**/*.exs`, `**/*.clj`. Count files per language. Exclude build/dependency directories (`node_modules/`, `build/`, `dist/`, `.gradle/`, `target/`, `vendor/`, `venv/`, `.venv/`, `__pycache__/`).
- **Pass:** Language inventory compiled with file counts
- **Fail:** N/A — always produces a result
- **Severity:** medium

### TOPO-06: Inter-layer communication patterns

- **What:** Identify how layers communicate with each other
- **How:** Look for communication indicators: OpenAPI/Swagger specs (REST), `.proto` files (gRPC), GraphQL schemas (`.graphql`, `schema.graphql`), message queue configs (Kafka topics, RabbitMQ exchanges, SQS queues), event schemas, shared contract/DTO packages, API client generators.
- **Pass:** Communication patterns identified
- **Skip:** Single-layer project or no inter-layer communication found
- **Severity:** medium

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
