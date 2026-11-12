# System Architecture Overview: [Your Product Name]

---

## 1. [Architectural Area 1: e.g., Application & Technology Stack]

- **[Component Name, e.g., Backend Framework]:** [Technology Choice]
- **[Component Name, e.g., Frontend Framework]:** [Technology Choice]
- **[Component Name]:** [Technology Choice]

---

## 2. [Architectural Area 2: e.g., Data & Persistence]

- **[Component Name, e.g., Primary Database]:** [Technology Choice]
- **[Component Name, e.g., Caching]:** [Technology Choice]
- **[Component Name]:** [Technology Choice]

---

## 3. [Architectural Area 3: e.g., Infrastructure & Deployment]

- **[Component Name, e.g., Cloud Provider]:** [Technology Choice]
- **[Component Name, e.g., Hosting Environment]:** [Technology Choice]
- **[Component Name]:** [Technology Choice]

---

## 4. [Architectural Area 4: e.g., External Services & APIs]

- **[Component Name, e.g., Authentication]:** [Technology Choice]
- **[Component Name, e.g., Payments]:** [Technology Choice]
- **[Component Name]:** [Technology Choice]

---

## 5. [Architectural Area 5: e.g., Observability & Monitoring]

- **[Component Name, e.g., Logging]:** [Technology Choice]
- **[Component Name, e.g., Metrics]:** [Technology Choice]
- **[Component Name]:** [Technology Choice]

---

## 6. Diagrams (C4)

_The same system as the sections above, drawn at two zoom levels. Shapes and colors follow the C4 styling convention: rounded box = person/actor, box = container, cylinder = datastore or queue, trapezoid = external system. State every relationship's direction and protocol on its edge label — the diagram is where ambiguity about who calls whom gets resolved. Omit this section only when the project has a documented reason; the system prompt guidance explains when and how to draw these._

### Context

[One diagram: the system as a single box, the people and external systems that interact with it, one labeled edge per relationship.]

```mermaid
flowchart LR
    user([Primary User]):::person

    system["[Your Product Name]"]:::container

    external[/"[External System]"/]:::external

    user -->|[interaction]| system
    system -->|[integration, protocol]| external

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#999,stroke:#666,color:#fff
```

### Container

[One diagram: the deployable/runnable units inside the system (services, databases, queues) and how they communicate. Keep it to 10 containers or fewer; a labeled edge per relationship, with direction and protocol.]

```mermaid
flowchart LR
    user([Primary User]):::person

    subgraph system["[Your Product Name]"]
        app["[Service Name]<br/>([Technology])"]:::container
        db[("[Datastore Name]")]:::datastore
    end

    user -->|[protocol]| app
    app -->|[reads and writes]| db

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#1168bd,stroke:#0b4884,color:#fff
    classDef datastore fill:#1168bd,stroke:#0b4884,color:#fff
```

[After the diagrams, state in one short paragraph anything the boxes cannot carry: which relationships are one-directional, which libraries are linked into services rather than deployed, and any read-only access paths.]
