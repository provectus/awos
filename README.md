# **Agentic Workflow Operating System for Coding Assistance**

This framework outlines a structured approach to leveraging LLMs for high-quality code generation, moving beyond basic prompting to a spec-driven development methodology.

## 🚀 Quick Start: Your First Project with `awos`

Welcome to **`awos`**[^1]! This guide will walk you through building a new software product from idea to implementation using a series of simple commands.

### Step 1: Install `awos`

First, open your terminal, create a new directory for your project, and run this single command. It will set up everything you need.

```sh
npx @provectusinc/awos
```

### Step 2: Follow the Workflow

**`awos`** guides you through a logical, step-by-step process. You'll use a series of "agents" to define, plan, and build your product. Run the commands in the following order.

1. `/awos:product`
- **What it does**: Creates the high-level Product Definition.
- **Think of it as**: Your project's main ID card. It answers the big questions: _What_ are we building, _why_, and for _who_?
- Audience: Product Owner (Non-Technical)

2. `/awos:roadmap`
- **What it does**: Creates the Product Roadmap.
- **Think of it as**: Your project's GPS. It lays out the features you will build and in what order.
- Audience: Product Manager (Non-Technical)

3. `/awos:architecture`
- **What it does**: Defines the System Architecture.
- **Think of it as**: Your project's building blueprint. It decides the technology stack, databases, infrastructure, etc.
- Audience: Solution Architect (Technical)

4. `/awos:spec`
- **What it does**: Creates a detailed Functional Specification for a single feature from the roadmap.
- **Think of it as**: A detailed plan for one room in your house. It describes exactly what the feature does for a user.
- Audience: Product Analyst (Non-Technical)

5. `/awos:tech`
- **What it does**: Creates the Technical Specification.
- **Think of it as**: The builder's instructions for that one room. It explains _how_ to build the feature.
- Audience: Tech Lead (Technical)

6. `/awos:tasks`
- **What it does**: Breaks the technical spec into a Task List.
- **Think of it as**: The step-by-step construction checklist for engineers to follow.
- Audience: Tech Lead (Technical)

7. `/awos:implement`
- **What it does**: Executes tasks (finally, actual code generation).
- **Think of it as**: The project foreman. This agent delegates the coding work to sub-agents and tracks progress.
- Audience: Team Lead (Technical)

### Step 3: You're Awesome

That's it! By following these steps, you can systematically turn your vision into a well-defined and fully implemented product.

## The `awos` Philosophy

The **`awos`** framework is built on a simple but powerful idea: AI agents, like human developers, need clear context to do great work. Without a structured plan, even the most advanced LLM can act like a confused intern. **`awos`** provides a step-by-step workflow that transforms your vision into a detailed blueprint that AI agents can understand and execute flawlessly. This process ensures the AI's incredible speed is channeled into building the right software, correctly, on the first try.

➡️ [Read more about the philosophy behind **`awos`**](docs/rationale.md)

## The `awos` Document Structure

The **`awos`** workflow is built on a clear document structure that creates a traceable path from a high-level idea to a single line of code. By storing the project's entire state in files like the **Product Definition**, **Roadmap**, and **Specifications**, the entire process becomes idempotent. This is a powerful feature: you can clear your chat history at any time, and an **`awos`** agent can instantly restore the full project context from this single source of truth. This ensures that both humans and AI agents always have exactly the context they need to build the right thing.

➡️ [Learn more about the purpose of each document](docs/document-structure.md)

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

[^1]: The Russian word «авось» (a-VOHS’) doesn’t have a direct equivalent in English — it’s a very culturally loaded concept. It’s a mix of hope, chance, and fatalism, often with a sense of “let’s do it and maybe it will work out.”
