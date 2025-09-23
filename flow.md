# Workflow Overview

This document outlines agentic workflow. It is designed to help you understand the process and how to use the framework.

## Overview
This flowchart visualizes the three key phases of your agentic workflow:

**Foundation & Strategy:** This initial phase sets the project's direction. It involves defining the product, creating a feature roadmap, and establishing the technical architecture. Each step produces a critical document that requires human review and input.

**Iterative Development Cycle:** This is the core loop where features are built. It begins by selecting a feature from the roadmap, creating a detailed specification, and getting it approved. Only after approval does the agent, armed with the full context from all foundational documents, generate the code.

**Retrospective & Planning:** This phase closes the loop, incorporating your note about working in milestones. After a milestone is complete, a retrospective is held, and the process feeds back into updating the roadmap to plan for the next cycle.


## Flow Diagram

```mermaid
graph TD
subgraph "Phase 1: Foundation & Strategy"
A[Start: User has a new project idea] --> B(Run /product command);
B --> C["📄 product-definition.md<br/>(What you're building, for whom, why)"];
C --> D{Human Review & Edit};
D --> E(Run /roadmap command);
E --> F["📄 roadmap.md<br/>(High-level features, order)"];
F --> G{Human Review & Prioritization};
G --> H(Run /architecture command);
H --> I["📄 architecture.md<br/>(Tech stack, key decisions, rationale)"];
I --> J{Human Review & Maintenance};
end

subgraph "Phase 2: Iterative Development Cycle (Per Milestone)"
    J --> K[Select next feature from roadmap.md];
    K --> L(Run /spec for the feature);
    L -- Gathers Context --> C;
    L -- Gathers Context --> F;
    L -- Gathers Context --> I;
    L --> M["📄 feature-spec.md<br/>(Functional Requirements & Technical Design)"];
    M --> N{Rigorous Spec Review & Approval};
    N -- No --> L;
    N -- Yes --> O[AGENT: Generate Code];
    O -- Reads Context --> C;
    O -- Reads Context --> F;
    O -- Reads Context --> I;
    O -- Reads Context --> M;
    O --> P["</> Production-Ready Code"];
end

subgraph "Phase 3: Retrospective & Planning"
    P --> Q[Milestone Complete];
    Q --> R{Human: Conduct Retrospective &<br/>Compact Completed Specs};
    R --> S[Plan Next Milestone];
    S --> F;
end

style C fill:#f9f,stroke:#333,stroke-width:2px
style F fill:#f9f,stroke:#333,stroke-width:2px
style I fill:#f9f,stroke:#333,stroke-width:2px
style M fill:#ccf,stroke:#333,stroke-width:2px
style P fill:#cfc,stroke:#333,stroke-width:2px

```
