# Product Roadmap: AWOS

_This roadmap outlines our strategic direction based on customer needs and business goals. It focuses on the "what" and "why," not the technical "how."_

---

### Phase 1: Core Framework (Complete)

_The foundational features that form the core of AWOS - all implemented._

- [x] **Sequential Workflow Commands**
  - [x] **Product Definition (`/awos:product`):** Interactive command to define product vision, audience, and scope
  - [x] **Roadmap Planning (`/awos:roadmap`):** Command to create and manage feature roadmaps
  - [x] **Architecture Definition (`/awos:architecture`):** Command to define tech stack and system design
  - [x] **Functional Specification (`/awos:spec`):** Command to create detailed feature specifications
  - [x] **Technical Specification (`/awos:tech`):** Command to define implementation approach
  - [x] **Task Breakdown (`/awos:tasks`):** Command to break specs into implementable tasks
  - [x] **Implementation (`/awos:implement`):** Command to delegate coding to subagents

- [x] **Document-Driven State**
  - [x] **Template System:** Pre-built templates for all specification types
  - [x] **Context Directory Structure:** Organized storage for product, spec, and architecture docs
  - [x] **Idempotent Operations:** Full context restoration from markdown files alone

- [x] **Specialized Subagents**
  - [x] **React Expert:** Domain specialist for React/frontend development
  - [x] **Python Expert:** Domain specialist for Python backend development
  - [x] **Kotlin Expert:** Domain specialist for Kotlin/JVM development

- [x] **Installation & Updates**
  - [x] **NPX Installer:** Simple `npx @provectusinc/awos` setup command
  - [x] **Migration System:** Safe updates that preserve user customizations
  - [x] **Customization Layer:** `.claude/` directory for user-specific modifications

---

### Phase 2: Multi-Repository Registry (Complete)

_Enable AWOS to work across multiple repositories, allowing shared context between frontend, backend, and infrastructure codebases._

- [x] **Registry Command (`/awos:registry`)**
  - [x] **Interactive Repo Registration:** Prompt user to choose between local folder or GitHub repository
  - [x] **Local Repository Support:** Use CLI commands to analyze local repos (no MCP required)
  - [x] **GitHub Repository Support:** Integrate with official GitHub MCP server for remote repo access
  - [x] **MCP Availability Check:** Detect if GitHub MCP is configured; guide user to add it if missing
  - [x] **Repo Analysis Engine:** Scan README.md, CLAUDE.md, context/ directory, and documentation files
  - [x] **Registry File Management:** Create/update `context/registry.md` with repo metadata
  - [x] **Stale Repo Detection:** Check accessibility of repos not updated in over a week
  - [x] **Bidirectional Relationships:** Track dependencies and "Used by" relationships

- [x] **Registry Data Model**
  - [x] **Basic Repo Info:** Store repo name, type (local/github), path or URL, status, last updated
  - [x] **Tech Stack Detection:** Identify languages, frameworks, and tools used
  - [x] **Architecture Summary:** Extract key architectural decisions and patterns
  - [x] **Linked Specifications:** Reference related specs and features across repos
  - [x] **AWOS Context Detection:** Parse product vision, roadmap phase, and specs for AWOS-enabled repos

---

### Phase 3: Cross-Repository Integration

_Update existing commands to leverage registry information for intelligent multi-repo awareness._

- [ ] **Read-Only Context Integration**
  - [ ] **Registry-Aware Product Definition:** `/awos:product` considers related repos when defining scope
  - [ ] **Registry-Aware Architecture:** `/awos:architecture` references tech decisions from linked repos
  - [ ] **Registry-Aware Specs:** `/awos:spec` and `/awos:tech` understand cross-repo dependencies

- [ ] **Cross-Repository Search**
  - [ ] **Spec Search Across Repos:** Find relevant specifications in linked repositories
  - [ ] **Code Pattern Search:** Search for implementation patterns in related codebases
  - [ ] **MCP-Based GitHub Search:** Use GitHub MCP to search remote repos
  - [ ] **CLI-Based Local Search:** Use grep/find for local repo searches

- [ ] **Synchronized Specifications**
  - [ ] **Cross-Repo References:** Specs can link to and reference specs in other repos
  - [ ] **Dependency Tracking:** Track which specs depend on features in other repos
  - [ ] **Change Impact Analysis:** Identify affected repos when a spec changes

---

### Phase 4: Future Enhancements

_Features planned for future consideration based on user feedback._

- [ ] **Additional Subagents**
  - [ ] **Go Expert:** Domain specialist for Go backend development
  - [ ] **TypeScript Expert:** Domain specialist for Node.js/TypeScript development
  - [ ] **Infrastructure Expert:** Domain specialist for Terraform/CloudFormation/IaC

- [ ] **Extended Registry Capabilities**
  - [ ] **Private GitHub Repos:** Support for authenticated access to private repositories
  - [ ] **GitLab Support:** Extend registry to support GitLab-hosted repositories
  - [ ] **Monorepo Detection:** Intelligent handling of monorepo structures within registry
