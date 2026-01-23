# The `awos` Document Structure: A Detailed Guide

The **`awos`** framework is built around a series of documents that create a clear, traceable path from a high-level idea to a single line of code. Each document has a specific purpose and audience. Understanding this structure is key to getting the most out of the system.

### 1. Product Definition

- **Purpose:** This document is the single source of truth for your entire product. It answers the fundamental questions: **What** are we building? **Why** is it important? And **who** is it for?
- **Content:** It contains only business goals, user descriptions (personas), and the core value proposition. It must not contain any technical details.
- **How to Use It:** This is not a document you change daily. However, you should review it periodically to ensure it accurately reflects your business strategy. It is the guiding star for your entire project.

### 2. Roadmap

- **Purpose:** The roadmap contains an ordered list of the features you plan to build. It shows the direction of the project and what is coming next.
- **Content:** Each item on the roadmap should be a feature that is small enough to be described in a single specification.
- **How to Use It:** This is a live document. In active development, plans change constantly. The team is responsible for keeping the roadmap up-to-date in near real-time to reflect the current priorities.

### 3. Architecture

- **Purpose:** This document is the technical blueprint for the project. It describes the foundational rules and technologies that all developers and agents must follow.
- **Content:** It includes decisions about the technology stack, databases, how different modules interact, and integrations with external services—any technical decision that affects more than one task.
- **How to Use It:** AI agents will carefully read this document before planning any implementation. It ensures consistency and adherence to best practices across the entire codebase.

### 4. Functional Specifications

- **Purpose:** This is where an idea from the roadmap is described in complete detail. A specification is created for any significant change (like a new feature or a major refactoring).
- **Content:** Like the product definition, this document focuses on the **what** and **why**, never the **how**. It contains user stories, acceptance criteria, and the scope of the feature.
- **How to Use It:** This is the most important document for alignment. The team must review it with business stakeholders to get approval _before_ any technical planning or coding begins. This ensures everyone agrees on what will be built.
- **Transient by design:** Specs describe the product _before_ implementation. Once a feature is built, the spec may no longer reflect reality—code evolves, decisions change, and that's normal. Don't hesitate to delete completed specs to avoid stale context confusing AI agents. Your code documentation is the true source of truth after implementation.

### 5. Technical Considerations

- **Purpose:** This document is the "how" that corresponds to the "what" of the functional spec. It is the engineering plan for implementing the feature.
- **Content:** It details the technical approach, including changes to the database, APIs, and system components.
- **How to Use It:** It is highly recommended that the engineering team carefully reviews this document before starting work. This helps catch potential issues early and ensures the technical plan is solid.

### 6. Tasks

- **Purpose:** This document breaks down the technical plan into a list of small, manageable coding tasks.
- **Content:** A simple markdown checklist. The most important rule here is that **each task must be runnable and testable.** After a task is complete, the application should still work, and you should be able to see an intermediate result. This prevents long periods of coding without feedback, which can lead to more errors.
- **How to Use It:** This is the direct to-do list for the `/awos:implement` command.

### 7. Code

- **Purpose:** This is the final, tangible output of the entire process.
- **Content:** The source code for your application.
- **How to Use It:** If all the documents above are created with care, you have a very high chance of getting high-quality, working code from the AI agents. Good documentation leads to good code.

## A Hidden Superpower: Your Project's Memory is in the Files

Have you ever had a long chat with an AI and felt that the important context is now buried in the conversation history? What happens if you need to restart the conversation?

The document-centric approach of **`awos`** solves this problem.

Because your foundational decisions—product vision, roadmap, and architecture—are saved in structured text files, the framework is **idempotent during spec work**. This means: **while implementing a feature, you can clear your chat history at any time, and an `awos` agent can restore the complete context (product, roadmap, architecture, and the current spec) just by reading the files.**

Your project's "brain" doesn't live in a fragile conversation; it lives permanently in your Git repository. This means you can always pick up exactly where you left off.

**Note on specs and tasks:** These are _transient_ documents—they guide you through implementation but become stale once the work is done. Your long-term project memory lives in the foundational documents (product, roadmap, architecture) and in your code documentation. After implementation, the code itself is the source of truth.
