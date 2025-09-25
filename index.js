#!/usr/bin/env node

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const AWOS_ASCII = `
   ░███      ░██       ░██     ░██████       ░██████
  ░██░██     ░██       ░██    ░██   ░██     ░██   ░██
 ░██  ░██    ░██  ░██  ░██   ░██     ░██   ░██
░█████████   ░██ ░████ ░██   ░██     ░██    ░████████
░██    ░██   ░██░██ ░██░██   ░██     ░██           ░██
░██    ░██   ░████   ░████    ░██   ░██     ░██   ░██
░██    ░██   ░███     ░███     ░██████       ░██████
`;
const AWOS_SUBTITLE = "Agentic Workflow Operating System for Coding Assistance";

const CONFIG = {
  directories: [
    {
      path: ".claude",
      description: "Claude configuration directory"
    },
    {
      path: ".awos",
      description: "awos configuration directory"
    },
    {
      path: "context",
      description: "A home for project documentation"
    },
    {
      path: "context/product",
      description: "Global product definitions"
    },
    {
      path: "context/spec",
      description: "A home for specifications"
    }
  ],
  copyOperations: [
    {
      source: "commands",
      destination: ".awos/commands",
      patterns: ["*"],
      description: "awos command prompts"
    },
    {
      source: "templates",
      destination: ".awos/templates",
      patterns: ["*"],
      description: "awos templates"
    },
    {
      source: "scripts",
      destination: ".awos/scripts",
      patterns: ["*"],
      description: "awos scripts"
    },
    {
      source: "subagents",
      destination: ".awos/subagents",
      patterns: ["*"],
      description: "awos subagents"
    },
    {
      source: "claude/commands",
      destination: ".claude/commands",
      patterns: ["*"],
      description: "Claude Code commands"
    },
    {
      source: "claude/agents",
      destination: ".claude/agents",
      patterns: ["*"],
      description: "Claude Code agents"
    }
  ]
};

function log(message, type = 'info') {
  const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : '→';
  console.log(`${prefix} ${message}`);
}

async function pathExists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function matchesPattern(filename, pattern) {
  if (pattern === '*') return true;

  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

function matchesAnyPattern(filename, patterns) {
  return patterns.some(pattern => matchesPattern(filename, pattern));
}

async function copyFileWithPatterns(src, dest, patterns) {
  const srcExists = await pathExists(src);
  if (!srcExists) {
    throw new Error(`Source file not found: ${src}`);
  }

  const filename = path.basename(src);
  if (!matchesAnyPattern(filename, patterns)) {
    return false;
  }

  const destExists = await pathExists(dest);
  if (destExists) {
    log(`Skipping existing file: ${dest}`, 'info');
    return false;
  }

  await ensureDir(path.dirname(dest));
  await fsp.copyFile(src, dest);
  log(`Copied file: ${path.basename(src)}`, 'success');
  return true;
}

async function copyDirWithPatterns(src, dest, patterns, description) {
  const stat = await fsp.stat(src).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    log(`Source directory not found: ${src}`, 'error');
    return;
  }

  if (await pathExists(dest)) {
    log(`Directory already exists, skipping: ${dest}`, 'info');
    return;
  }

  await ensureDir(dest);
  log(`Created destination directory: ${dest}`, 'success');

  const entries = await fsp.readdir(src, { withFileTypes: true });
  let copiedCount = 0;

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirWithPatterns(srcPath, destPath, patterns, description);
    } else if (entry.isFile()) {
      const copied = await copyFileWithPatterns(srcPath, destPath, patterns);
      if (copied) copiedCount++;
    } else if (entry.isSymbolicLink()) {
      if (matchesAnyPattern(entry.name, patterns)) {
        const destExists = await pathExists(destPath);
        if (!destExists) {
          const target = await fsp.readlink(srcPath);
          await fsp.symlink(target, destPath);
          log(`Copied symlink: ${entry.name}`, 'success');
          copiedCount++;
        }
      }
    }
  }

  log(`Completed copying ${description}: ${copiedCount} items copied`, 'success');
}

async function main() {
  console.log(AWOS_ASCII);
  console.log(AWOS_SUBTITLE);
  console.log('');

  const cwd = process.cwd();
  const pkgRoot = __dirname;

  log(`Starting AWOS setup in: ${cwd}`, 'info');
  log(`Package root: ${pkgRoot}`, 'info');
  console.log('');

  log('Creating directories...', 'info');
  for (const dir of CONFIG.directories) {
    const fullPath = path.join(cwd, dir.path);
    const exists = await pathExists(fullPath);

    if (!exists) {
      await ensureDir(fullPath);
      log(`Created directory: ${fullPath} (${dir.description})`, 'success');
    } else {
      log(`Directory already exists: ${fullPath}`, 'info');
    }
  }
  console.log('');

  log('Copying files and directories...', 'info');
  for (const op of CONFIG.copyOperations) {
    const srcPath = path.join(pkgRoot, op.source);
    const destPath = path.join(cwd, op.destination);

    log(`Processing ${op.description}...`, 'info');

    await copyDirWithPatterns(srcPath, destPath, op.patterns, op.description);
    console.log('');
  }

  log('AWOS setup completed successfully!', 'success');
}

main().catch((err) => {
  console.error('');
  log(`Error during setup: ${err.message}`, 'error');
  console.error(err.stack);
  process.exit(1);
});
