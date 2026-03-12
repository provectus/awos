---
name: code-architecture
title: Code Architecture
description: Evaluates whether the codebase follows a coherent architectural pattern with clear module boundaries and SRP
severity: high
depends-on: [project-topology]
---

# Code Architecture

Audits the internal structure of each detected application layer. Checks whether code is organized around a recognizable architectural pattern (FSD, Clean Architecture, Hexagonal, MVC, modular, etc.) or is an unstructured "ball of mud" with tangled imports and no clear boundaries.

Uses the topology artifact to know which layers exist and what technologies they use, then adapts checks accordingly.

## Checks

### ARCH-01: Declared or recognizable architectural pattern

- **What:** The project follows a declared or recognizable architectural pattern
- **How:** For each layer detected in the topology artifact:
  1. Check CLAUDE.md, README.md, or `docs/` for an explicitly declared architecture (e.g., "We use Feature-Sliced Design", "Clean Architecture", "Hexagonal", "MVC")
  2. If no declaration, analyze the directory structure for recognizable patterns:
     - **FSD:** `app/`, `pages/`, `widgets/`, `features/`, `entities/`, `shared/` layers
     - **Clean Architecture:** `domain/`, `application/`, `infrastructure/`, `presentation/` separation
     - **Hexagonal:** `ports/`, `adapters/`, `core/` or `domain/` separation
     - **MVC/MVVM:** `models/`, `views/`, `controllers/` or `viewmodels/`
     - **Modular:** Clear module boundaries with index/barrel files
     - **DDD:** `domain/`, `application/`, `infrastructure/` with aggregates and value objects
  3. If no pattern is recognizable, note it as "unstructured"
- **Pass:** Architecture is explicitly declared in docs OR a clear pattern is recognizable from the directory structure
- **Warn:** A pattern is partially recognizable but inconsistently applied (some areas follow it, others don't)
- **Fail:** No recognizable pattern — flat file structure or random nesting with no clear organization principle
- **Severity:** high

### ARCH-02: Module boundaries are respected

- **What:** Code modules have clear boundaries and don't have tangled cross-imports
- **How:** For each detected layer, sample the import/dependency graph:
  1. Pick 5-10 representative source files
  2. Analyze their imports — do they follow a top-down or layered import direction?
  3. Check for circular import patterns or imports that violate the declared architecture (e.g., a `shared/` module importing from `features/`, an `entity` importing from `pages/`)
  4. If the project has barrel/index files, check whether internal module files are imported directly by external modules (bypassing the public API)
- **Pass:** Imports follow a consistent direction; no layer violations detected in the sample
- **Warn:** 1-2 import violations found in the sample, but the general direction is consistent
- **Fail:** Widespread tangled imports — no clear direction, modules import each other freely
- **Severity:** high

### ARCH-03: Single Responsibility Principle in modules

- **What:** Modules/directories serve a single clear purpose rather than being catch-all dumping grounds
- **How:** For each detected layer:
  1. List the top-level module directories (first 2 levels of nesting)
  2. For each module, check: does its name clearly indicate its purpose? Do the files inside it relate to that purpose?
  3. Look for "god modules" — directories with 30+ files or mixing unrelated concerns (e.g., `utils/` with 50 files covering auth, formatting, networking, validation all together)
  4. Check for overly generic names that hide mixed concerns: `helpers/`, `common/`, `misc/`, `general/`
- **Pass:** Modules have clear, descriptive names and focused contents; no god modules
- **Warn:** 1-2 overly broad modules found, but most are well-scoped
- **Fail:** Multiple god modules or catch-all directories with mixed concerns
- **Severity:** medium

### ARCH-04: Separation of concerns across layers

- **What:** Business logic, data access, and presentation are separated — not mixed in the same files
- **How:** Sample 5-10 files from the main application layer(s). Check whether:
  1. Business/domain logic is mixed with UI rendering (e.g., React components containing fetch calls, SQL queries, and JSX all in one file)
  2. Data access code is interleaved with request handling (e.g., controllers that contain raw SQL or ORM queries inline)
  3. Configuration, business rules, and infrastructure are separated or tangled
     Look for anti-patterns: 500+ line files that handle multiple concerns, components that directly call APIs AND render AND manage state all inline.
- **Pass:** Clear separation — business logic, data access, and presentation/transport live in distinct files or layers
- **Warn:** Mostly separated, but 1-2 files mix concerns significantly
- **Fail:** Widespread mixing — most files handle multiple concerns (fetch + render + state + business logic in one file)
- **Skip-When:** Topology shows the project is a library (libraries may legitimately have simpler structure)
- **Severity:** high

### ARCH-05: Consistent file and directory naming conventions

- **What:** The project follows consistent naming conventions for files and directories
- **How:** For each detected layer, check:
  1. File naming: is it consistently camelCase, PascalCase, kebab-case, or snake_case? Or a mix?
  2. Test file colocation: are test files colocated with source (`Button.test.tsx` next to `Button.tsx`) or in a separate `__tests__/` directory? Is this consistent?
  3. Component/class naming: do file names match their default export names?
  4. Directory naming: consistent casing and naming pattern
- **Pass:** Consistent naming conventions across the layer (one pattern, consistently applied)
- **Warn:** Mostly consistent but with 3-5 deviations
- **Fail:** No consistent naming convention — mixed patterns with no clear standard
- **Severity:** medium

### ARCH-06: Reasonable file sizes

- **What:** Source files are reasonably sized, indicating proper decomposition
- **How:** For each detected layer, count lines in source files (exclude generated code, migrations, lock files). Flag:
  - Files over 500 lines as candidates for decomposition
  - Files over 1000 lines as definite issues
    Calculate what percentage of source files exceed 500 lines.
- **Pass:** Less than 5% of source files exceed 500 lines
- **Warn:** 5-15% of source files exceed 500 lines
- **Fail:** More than 15% of source files exceed 500 lines, or any file exceeds 2000 lines
- **Severity:** medium
