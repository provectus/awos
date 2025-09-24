# **Agentic Workflow Operating System for Coding Assistance**

This framework outlines a structured approach to leveraging Large Language Models (LLMs) for high-quality code generation, moving beyond basic prompting to a spec-driven development methodology.

## Quick Start
1. Install AWOS in a newly created directory
```
$ npx @provectusinc/awos
```
This command will install everything you need to start working on your product.

2. Run Claude Code 
3. Use the commands in the following order:
- `/awos:product`
- `/awos:roadmap`
- `/awos:architecture`
- `/awos:spec`
- `/awos:tech`
- `/awos:tasks`
- `/awos:implement`

## **Rationale: Why Spec-Driven Development is Key for LLM Code Generation**

Generating high-quality code with LLMs necessitates a departure from simply immediately jumping straight into writing code, which can be a terrible idea if the solution hasn't been thoroughly conceptualized. LLMs, much like human developers, require complete and well-organized information about the problem, the desired solution, and environmental constraints . Without this structured context, LLMs can produce wrong code or behave like confused interns.

Spec-driven development, facilitated by detailed technical specifications, provides this essential context, forcing upfront thinking and ensuring a clear design. Technical specifications outline how you’re going to address a technical problem by designing and building a solution for it. The benefits are immense:

* **Increased Project Success:** Writing a technical spec increases the chances of having a successful project, service, or feature that all stakeholders involved are satisfied with.  
* **Reduced Errors and Liabilities:** It decreases the chances of something going horribly wrong during implementation and even after you’ve launched your product. It helps catch exceptional cases of the solution that you may have neglected, reducing your liability. Problems are best fixed during planning, not after code is written.  
* **Enhanced Documentation and Communication:** Technical specs serve as documentation for the project and provide a straightforward and efficient way to communicate project design ideas between a team and other stakeholders.  
* **Improved Collaboration and Ownership:** By writing a technical spec, engineers are forced to examine a problem before going straight into code. The whole team can collaboratively solve a problem and create a solution, fostering investment and ownership. It also helps newer teammates unfamiliar with the project can onboard themselves and contribute to the implementation earlier.  
* **Superior Product and Scope Management:** Investing in a technical spec ultimately results in a superior product by aligning the team, managing complexity, preventing scope/feature creep, and setting priorities. It ensures only the most impactful and urgent parts of a project go out first.  
* **Consistency and Alignment:** This framework ensures agents build your way, not their way by capturing your standards, your stack, and the unique details of your codebase. 

In essence, context engineering aims to provide the LLM with the maximally high-quality context for code generation, enabling it to move from raw output to production-ready, high-quality code.

## **The Flow: A Structured Approach to LLM Agentic Development**

This framework outlines a 7-step sequential workflow, guiding LLM agents from project initiation to code implementation, ensuring comprehensive context and quality outputs.

### **1\. Scaffold the Project with Framework Configuration**

The initial step in this framework is to establish a standardized and consistent environment for LLM-driven code generation across a team and project. This ensures that LLMs produce consistent and high-quality results regardless of the specific environment.

For a new project, setting up this environment is designed to be as simple as possible. Developers can initiate the project scaffolding by running a single command, for example, using `npx` or `uvx`.

This command automates the creation of all necessary configuration files, rules, best practices, and agent definitions within the project's root directory (e.g., `.awos/`). This streamlined setup eliminates the need for manual configuration, allowing teams to quickly begin development with a pre-configured, standardized LLM environment.

This scaffolding process establishes the foundational layer, embedding the team's agreed-upon guidelines directly into the project's structure, and preparing the command structure for the LLM agents to operate within.

### **2\. Describe Application: What It Should Do (Business/Product Context Only)**

This step focuses on defining the high-level business and product context. It clarifies *what* is being built and *why*, without delving into technical implementation details.

* **Mission Definition:** The primary output is a `mission.md` file, outlining "What you're building, for whom, and why it matters". A clear mission helps agents validate their output and understand 'what type of thing we don't need'. This should be a high-level description of the application's purpose.  
* **Human Review:** It is important to review and edit the generated documentation to ensure it accurately reflects your vision and goals.

This step provides the LLM with the overarching business context, crucial for understanding the product's purpose and making contextually relevant decisions.

### **3\. Create (and Maintain) the Roadmap with High-Level Features and Their Order**

Following the application description, a roadmap is established to guide feature development.

* **Feature Outline:** The roadmap details features shipped, in progress, and planned. It should list business-level features without technical details. For example, make authorization, then dashboard, then personal account. The roadmap should be decomposed into manageable chunks, where an epic like “dashboard with financial metrics” contains individual widgets as specs. This decomposition is ideally a collaborative process involving product and technical stakeholders.  
* **Living Document:** While initially generated by a product planning command, the roadmap is a "living map" that requires human review and updates to ensure it reflects actual progress and priorities.  
* **Agent Interaction:** If a spec creation command is invoked without specific feature details, the agent will consult the roadmap to identify the next uncompleted feature. The roadmap provides the sequential context for feature implementation.  
* **Technical Involvement:** While primarily business-focused, technical input is inevitable during roadmap decomposition to ensure feasibility and logical sequencing. The roadmap should push teams to think ahead, planning several points ahead, and may even highlight features needing clarification.

This roadmap guides the LLM on *what to build next*, maintaining a strategic focus on product development.

### **4\. Architecture Decision Records (ADRs) – with Technical Details**

ADRs are a critical component of planning, documenting the *how* from a technical perspective. They provide the LLM with historical and current architectural context.

* **Key Decisions:** ADRs capture key architectural and technical choices (with rationale). This includes the chosen tech stack (frameworks, libraries, tools, database, hosting preferences).  
* **Rationale:** Documenting *why* certain decisions were made is crucial for preventing the LLM from contradicting past choices or proposing suboptimal solutions. ADRs help the LLM understand how *you* build and the technical landscape of what you're building.  
* **Evolutionary Document:** Similar to the roadmap, ADRs are dynamic. They may become "not true" as projects evolve, necessitating mechanisms to compact or summarize historical ADRs to provide only relevant, up-to-date context. Regular maintenance of ADR files is a best practice to keep the framework aligned with evolving project needs. ADRs should be created after the initial product description and roadmap to allow technical teams to review and refine the architecture based on product goals.

ADRs ensure the LLM understands the underlying technical constraints and decisions, enabling it to generate code consistent with the project's architecture.

### **5\. Specifications – Feature Descriptions**

Specifications are comprehensive documents that describe a major change to the system, such as a new feature, a significant rearchitecture, or a substantial modification to existing functionality. They serve as a detailed blueprint, ensuring clarity and alignment before implementation.

Each specification consists of two key parts:

* **Functional Requirements:** This section answers the "what" and "why" of the proposed change. It outlines the goals for the feature, user stories, and success criteria from a business or user perspective. It focuses on the desired outcome and the problem it solves.  
* **Technical Considerations:** This section describes the "how" of the solution. It details the technical design and implementation approach, including elements like API design, database changes, UI requirements, pseudocode, flowcharts, error states, and considerations for scalability, recovery, and future requirements.

All specifications, encompassing both their functional and technical aspects, are subject to a rigorous review and approval process. This process is akin to a common code review, involving relevant team members and stakeholders. This ensures that the proposed changes are aligned with business objectives, technically sound, and adhere to established best practices before any code is written.

Well-crafted specifications are crucial for preventing issues by addressing problems during the planning phase, rather than after code has been developed. They provide the LLM with the granular detail needed for accurate and high-quality code generation.

### **6\. Creating Tasks – Comprehensive List of Tasks for LLMs**

Once specifications are approved, they are broken down into a comprehensive, step-by-step list of tasks. This granular breakdown is essential for LLM execution.

* **Task Breakdown:** The spec includes a "Tasks Breakdown" – a trackable step-by-step implementation plan with dependencies.  
* **Command:** A task creation command is used to generate this task list based on the feature spec.  
* **Review:** It's important to give this tasks list a close review to ensure all the steps follow your spec, are in a logical order and everything looks as you'd expect.  
* **Atomic Nature:** The tasks should be atomic enough for an LLM agent to execute individually, minimizing misinterpretations and large, unmanageable steps.

This detailed task list provides the LLM with an executable plan, breaking down complex features into manageable, trackable units.

### **7\. Implementation – Code Generation**

The final stage involves the LLM executing the predefined tasks and generating the code.

* **Execution Command:** A task execution command initiates the implementation. It proceeds with implementing every task in order, delegating to subagents where appropriate.  
* **Automated Workflow:** The agent's execution process involves writing and running tests, marking tasks as complete, updating the product roadmap after milestones, documenting completed work, and committing changes to Git.  
* **Subagents:** This stage heavily leverages specialized subagents for specific, atomic operations, enhancing reliability and performance.  
* **Human Oversight:** While agents perform the coding, "trust the process" by reviewing and refining rather than micromanaging. If the implementation is unsatisfactory, it's often better to revert and redo with better planning than to ask the agent to fix incorrectly implemented code.

This step culminates in the generation of high-quality, spec-compliant code, with integrated testing and documentation updates.

## **The Content of the Framework**

The framework's operational success relies on a set of core components: framework commands, predefined subagents and standards, the underlying tools, and useful hooks for continuous improvement.

### **1\. Framework Commands Implementing the Flow**

The framework uses specific commands to drive the described flow:

* `/product`
* `/roadmap`
* `/adr`  
* `/spec`  
* `/tasks`
* `/implement`

These commands provide a consistent interface for interacting with the LLM agents, ensuring adherence to the defined workflow.

### **2\. Set of Predefined Subagents**

The framework leverages specialized subagents and embeds organizational standards and best practices directly into the LLM's context.

* **Utility Subagents:** subagent for working with git, file system, shell, etc.  
* **Context Fetcher:** This subagent is a specialized component that understands the project's documentation structure. Its role is to provide the main coding agents with *only* the necessary information from the project's documentation. This approach offers several key benefits. It offloads knowledge from the main agent's memory, ensuring it receives precise, up-to-date context without being overwhelmed. All project documentation is kept in the repository, making it accessible to both human developers and agents. Agents receive accurate and consistent information directly from project documentation, reducing errors. By delivering targeted context, the context-fetcher allows the main agent to focus on the coding task, improving overall efficiency.  
* **Predefined Agents:** agents with specialized roles such as architects, developers, and testers. These roles are defined through specific instructions and standards tailored to their function within the development process

### **3\. Must-Have MCP Servers**

This framework necessitates the use of specific, high-performance MCP servers. Examples of such essential servers include Serena or Context7, with the final, definitive list of required providers to be specified as the framework evolves.

### **4\. Useful Hooks**

TBD

