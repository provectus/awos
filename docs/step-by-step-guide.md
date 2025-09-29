# `awos` Workflow: A Detailed Guide

Welcome to the detailed guide for **`awos`**. This document will walk you through each step of the framework, from initial idea to final implementation.

**`awos`** is a framework for Claude Code designed to help you build software using a spec-driven development paradigm. This means we will carefully define what we are building before we ask an AI agent to build it.

_This guide assumes you are starting a greenfield application (a brand new project). A guide for integrating **`awos`** with existing codebases will be available in the future._

## Step 1: Project Setup & Installation

### Before You Begin (Prerequisites)

To start, you need three things:

- **Node.js & npm**: These are required only to install and update the **`awos`** framework using the npx command. The agents themselves do not use Node.js to operate.

- **Claude Code**: The framework is built and tested for the Claude Code environment.

- **A Core Idea**: You don't need a full business plan, but you should have a clear, one-sentence idea of the problem you want to solve. For example, "I want to build a simple mobile app to track my daily water intake."

### The Installation

First, create a new, empty directory for your project. Inside that directory, run the following command in your terminal:

```bash
npx @provectusinc/awos
```

This single command sets up your entire project. It creates the necessary directory structure, installs the **`awos`** commands and sub-agents into your Claude Code environment, and adds a few utility scripts. After the command finishes with a success message, your setup is complete and you are ready to start defining your application.

### Understanding the Folder Structure

The installer creates three important directories. Understanding their purpose is key to using **`awos`** effectively.

1. **The `.awos` Folder (The Engine Room)**
   - **Purpose**: This folder contains the core prompts, templates, and scripts that make the **`awos`** agents work. It is the "engine" of the framework.

   - **Who owns it**: The **`awos`** team. This folder will be updated when you update the framework to bring you new features and improved agents.

   - **Should you edit it?** It is highly recommended that you **do not** modify the files in this directory, as your changes will be overwritten during the next update.

2. **The `.claude` Folder (The Control Panel)**
   - **Purpose**: This is a Claude Code-specific directory. **`awos`** places files here that tell Claude Code how to use the agents and commands from the `.awos` folder.

   - **Who owns it**: You (the project team).

   - **Should you edit it?** Yes! This is where you can customize the framework. You can add your own commands or create custom agents that are specific to your project, extending the core **`awos`** functionality.

3. **The `context` Folder (The Project's Brain)**
   - **Purpose**: This is the most important directory for your team. It contains all the documents that define your product: the product definition, roadmap, architecture, specifications, and task lists. This is the persistent "memory" of your project.

   - **Who owns it**: You (the project team).

   - **Should you edit it?** Yes. This is where you and the **`awos`** agents will work every day. All documents created by the agents are saved here, and you are expected to review, edit, and contribute to them directly.

### Your Next Step

Now that your project is set up and you understand the structure, you are ready to begin. The first step in the **`awos`** workflow is to define your product.

Start by running the first command in your Claude Code chat:

```
/awos:product
```

## Step 2: Defining Your Product

Everything starts with a clear idea. The Product Definition is the foundation upon which your entire application will be built. Getting this step right is the most important factor for success.

This document will guide you through the process of turning your initial idea into a solid, non-technical product definition that will guide all future work.

### The Tool for the Job: `/awos:product`

You don't have to write the product definition from scratch. The `/awos:product` command starts an interactive session with an AI assistant. This agent acts like a product manager, asking you questions to help transform your core idea into a structured `product-definition.md` document. It will be saved in your `context/product/` directory.

### Best Practices for a Great Product Definition

To create a high-quality product definition, you and the agent must follow these simple but crucial rules.

1. **Focus on "What" and "Why," Not "How"**
   This document must be completely free of technical details. It's about the business and user goals, not the implementation.
   - **Bad Example** 👎: "We will build a mobile app using React Native that connects to a PostgreSQL database on AWS to store a user's daily water intake."

   - **Good Example** 👍: "We want to help users track their daily water intake to improve their health habits. The product will be a simple mobile app where users can log their water consumption."

2. **Be Clear and Explicit**
   The better you define the product now, the better the results will be in all future steps. Ambiguity is your enemy.
   - **Bad Example** 👎: "The app should be for everyone and have social features."

   - **Good Example** 👍: "The target audience is health-conscious adults aged 25-40. The primary social feature will be the ability to share daily progress with a select group of friends."

3. **Define Clear Boundaries**
   Knowing what you are not building is just as important as knowing what you are. The AI agent will help you create an "In-Scope" and "Out-of-Scope" list.
   - **Bad Example** 👎: "The app will track water, and we might add other drinks later."

   - **Good Example** 👍: "In-Scope: Tracking plain water intake in milliliters or ounces. Out-of-Scope: Tracking other types of drinks (like coffee, juice, or soda) and nutritional information."

4. **Keep it High-Level (Don't Dive into Details)**
   This is the 10,000-foot view of your product. We are defining the forest, not the individual trees. We will define every little detail for each feature later in the specification step.
   - **Bad Example** 👎: "The main screen will have a big blue button with a water drop icon. Clicking it opens a modal with a slider from 0 to 500ml, and another button that says 'Log Water'."

   - **Good Example** 👍: "The core functionality will be a simple interface for users to quickly log their water consumption throughout the day."

### Your Role: Review, Align, and Revisit

The AI assistant is a powerful partner, but you are the expert on your product. Your oversight is essential.

1. **Review and Align Before You Proceed**
   You must **carefully check the content** generated by the assistant. Edit and change anything that is not perfectly accurate. The AI helps you write, but you are the final author. Before moving to the next step, it is highly recommended that you **share the `product-definition.md` file with your stakeholders or product owners**. Getting everyone aligned now will save a huge amount of time later.

2. **Revisit After Each Milestone**
   A product vision can (and will) evolve. After you complete a major phase on your roadmap, take a few minutes to come back to your product definition. Check if it is still accurate and corresponds to your current vision. This ensures your project's "guiding star" remains clear and prevents your team from slowly drifting off course.

### Your Next Step

Once you are happy with your `product-definition.md` file, your project's foundation is set. Now you can move on to planning the order in which you will build the features.

The next command to run in your Claude Code chat is:

```
/awos:roadmap
```

## Step 3: Creating Your Roadmap

With a clear product definition, you now know what you're building. The roadmap is where you decide the order in which you'll build it. It's an ordered list of the significant changes—like new features or reworks of existing ones—that will take your product from its current state to its future vision.

A well-defined roadmap helps your team align on priorities and provides the necessary context for the AI agents to begin planning the implementation of each feature.

### The Tool for the Job: `/awos:roadmap`

The `/awos:roadmap` command starts a session with an AI assistant that acts as a product strategist. It will read your product-definition.md and help you brainstorm and structure the features into a clear, phased roadmap.md file in your `context/product/` directory.

### Best Practices for a Great Roadmap

A good roadmap is a balancing act. It needs to be detailed enough to be useful but high-level enough to be flexible. Follow these practices to create an effective roadmap.

1.  **Keep it High-Level**
    The roadmap is not the place for tiny details. Focus on the major features and user outcomes, not the specific tasks. All the fine details will be defined later in the specification for each feature.
    - **Bad Example** 👎: A list of small tasks like "Add 'username' field to the signup form," "Create a 'submit' button," or "Design the logo."

    - **Good Example** 👍: A single, high-level feature that includes all of those details, such as "Implement User Sign-Up and Login."

2.  **Define Complete, Valuable Chunks of Work**
    Each item on the roadmap should be a complete piece of functionality that, once finished, could ideally be deployed and used. Think of it as a "vertical slice" that delivers end-to-end value, not a technical "horizontal layer." These items will become the basis for your specifications.
    - **Bad Example** 👎: Breaking the work into technical layers like "Phase 1: Build the backend API" and "Phase 2: Build the frontend UI."

    - **Good Example** 👍: Breaking the work into valuable user experiences like "Phase 1: Users can sign up, log in, and view a welcome screen" and "Phase 2: Users can create and view their first water intake log."

3.  **Treat it as a Living Document**
    A roadmap is a guide, not a rigid, unchangeable contract. While you should try to keep it stable during a development cycle (a "milestone"), it's crucial to revisit and adapt it as you learn more from your users and the market.
    - **Bad Example** 👎: Sticking to the original roadmap for six months, even when user feedback clearly shows that a feature planned for later is much more important.

    - **Good Example** 👍: After launching Phase 1, the team gets together to review the roadmap. Based on user data, they decide to move a key feature from Phase 3 into Phase 2 to respond to customer needs.

### Your Next Step

Once your roadmap is defined, you have a clear plan for what to build first. Before you dive into the details of that first feature, you need to establish the technical foundation for the entire project.

The next command to run in your Claude Code chat is:

```
/awos:architecture
```

## Step 4: Defining the Architecture

With your product defined and your roadmap in place, you know what to build and in what order. Now it's time for the first step in defining how you will build it.

The Architecture Document is the high-level technical blueprint for your entire project. Think of it as deciding on the foundational rules and materials for a new house before you start building the rooms. Will it have a concrete or a wood foundation? Will the electrical system be 110V or 220V? These are the kinds of foundational decisions this document will capture for your software.

### The Tool for the Job: `/awos:architecture`

The `/awos:architecture` command starts a session with an AI assistant that acts as a Solution Architect. It will carefully read your product definition and roadmap to propose a technical foundation for your project. This includes the technology stack, databases, infrastructure choices, and more. The output is the architecture.md file in your `context/product/` directory.

### Best Practices for a Great Architecture Document

This document will be the primary technical guide for all future development by both humans and AI agents. It's crucial to keep it clear, accurate, and focused.

1.  **Define the High-Level Technical Blueprint**
    This document should only contain the foundational, cross-cutting technical decisions that affect the entire project or multiple features. Avoid low-level details that belong in a specific feature's technical specification.

    - **Bad Example** 👎: "The user profile page will use a useState hook to manage its loading state." (This is a specific implementation detail, not a global architectural rule).

    - **Good Example** 👍: "All backend services will be written in Python using the FastAPI framework." or "We will use PostgreSQL as our primary relational database."

2.  **It Must Reflect the Current State Only**
    This document is a living blueprint, not a historical log. Its job is to tell agents and developers how the system works right now. Do not clutter it with details about options you considered, why you rejected them, or decisions that are no longer relevant.

    - **Bad Example** 👎: A long paragraph explaining that you considered building your own auth system, then tried a different provider, and finally settled on Auth0, with pros and cons for each. (This is an ADR, not a blueprint).

    - **Good Example** 👍: A clean section that simply states: - Authentication Provider: Auth0.

3.  Keep It Updated Religiously
    Because all AI agents and developers will use this document as their source of truth, it must be **100% accurate at all times**. An outdated architecture document is worse than no document at all, as it will lead to incorrect implementations.

    - **Bad Example** 👎: A developer starts using a new library in a feature, but the architecture.md file is never updated. Future agents have no idea this library is now part of the official stack.

    - **Good Example** 👍: The team decides to add a Redis cache. The _first_ step they take is updating the architecture.md file to include Redis under the "Data Storage" section.

### Your Role: The Final Authority

The AI assistant will propose a sound architecture based on your product goals, but your team has the final say. You must carefully review, align on, and approve every decision in this document. This blueprint will be the foundation for all future technical work, so it's critical that the entire engineering team agrees with the approach.

### Your Next Step

With the foundational blueprint of your project defined, you are now ready to zoom in and start planning your first feature. Take the first item from Phase 1 of your roadmap and prepare to describe it in detail.

The next command to run in your Claude Code chat is:

```
/awos:spec
```
