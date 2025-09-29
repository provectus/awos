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
