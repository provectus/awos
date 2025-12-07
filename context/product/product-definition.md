# Product Definition: AWOS

- **Version:** 1.0
- **Status:** Active

---

## 1. The Big Picture (The "Why")

### 1.1. Project Vision & Purpose

To transform chaotic AI prompting into systematic spec-driven development, enabling developers and teams to generate high-quality code by providing AI agents with the structured context they need to succeed on the first try.

### 1.2. Target Audience

- Solo developers using AI coding assistants who want consistent, reliable results
- Engineering teams seeking structured AI workflows and shared context
- Technical founders building MVPs with AI assistance
- Business users involved in product roadmap and specification processes
- Anyone who wants to amplify their AI coding experience through spec-driven development

### 1.3. User Personas

- **Persona 1: "Alex the Solo Developer"**
  - **Role:** Freelance full-stack developer using Claude Code for client projects.
  - **Goal:** Wants AI to generate correct code on the first attempt without constant back-and-forth corrections.
  - **Frustration:** AI assistants lack project context, make wrong assumptions, and produce inconsistent results that require extensive rework.

- **Persona 2: "Morgan the Technical Founder"**
  - **Role:** Non-technical founder building an MVP with AI assistance.
  - **Goal:** Wants to translate product vision into working software without deep coding expertise.
  - **Frustration:** No clear methodology for communicating requirements to AI, leading to wasted time and features that don't match the vision.

- **Persona 3: "Jordan the Team Lead"**
  - **Role:** Engineering manager coordinating a small development team.
  - **Goal:** Wants team members aligned on product vision, architecture, and implementation approach.
  - **Frustration:** Each developer prompts AI differently, resulting in inconsistent code quality and architectural decisions.

### 1.4. Success Metrics

- Reduced rework: Users spend significantly less time fixing or regenerating AI output
- First-try success: Higher rate of correct, usable code on the first generation attempt
- Project completion: Users successfully build complete products or features using the workflow
- Quick onboarding: New users can install AWOS and start using it within 5 minutes

---

## 2. The Product Experience (The "What")

### 2.1. Core Features

- **Sequential Workflow Commands:** A guided 7-step path from product vision to code implementation (`/awos:product` through `/awos:implement`)
- **Document-Driven State:** All project context stored in structured markdown files, making the system fully idempotent and resumable
- **Specialized Subagents:** Domain-expert AI agents for specific technologies (React, Python, Kotlin) that receive full context for implementation
- **Extensibility & Customization:** Customizable commands and hooks that allow teams to adapt the workflow to their specific needs
- **Template System:** Pre-built templates for product definitions, roadmaps, architecture, specifications, and task lists

### 2.2. User Journey

**Journey 1: Idea to MVP**
A user with a product idea runs `npx @provectusinc/awos` to install the framework. They then use `/awos:product` to define their vision, `/awos:roadmap` to plan features, `/awos:architecture` to define the tech stack, and proceed through `/awos:spec`, `/awos:tech`, `/awos:tasks`, and finally `/awos:implement` to generate working code.

**Journey 2: Feature Development**
An existing project user runs `/awos:spec` to define a new feature, creates the technical specification with `/awos:tech`, breaks it into tasks with `/awos:tasks`, and delegates implementation to subagents via `/awos:implement`.

**Journey 3: Team Onboarding**
A team lead uses `/awos:product` to document the product vision and `/awos:architecture` to establish technical decisions. These documents become the shared source of truth that all team members reference when working with AI agents.

---

## 3. Project Boundaries

### 3.1. What's In-Scope for this Version

- Full support for Claude Code environment
- Complete set of 7 workflow commands (product, roadmap, architecture, spec, tech, tasks, implement)
- Core domain-expert subagents (React, Python, Kotlin)
- Document templates for all specification types
- Simple `npx` installer with update and migration support
- Customization layer via `.claude/` directory

### 3.2. What's Out-of-Scope (Non-Goals)

- Official support for other AI tools (Cursor, GitHub Copilot, other assistants)
- GUI or web-based interface for managing projects
- Real-time team collaboration features (multi-user sync, permissions)
- Hosted/cloud version of the framework
- Built-in version control or project management integration
