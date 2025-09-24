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

console.log(AWOS_ASCII);
console.log(AWOS_SUBTITLE);


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

async function copyFileIfMissing(src, dest) {
  const srcExists = await pathExists(src);
  if (!srcExists) {
    throw new Error(`Source file not found: ${src}`);
  }
  const destExists = await pathExists(dest);
  if (destExists) return; // don't overwrite
  await ensureDir(path.dirname(dest));
  await fsp.copyFile(src, dest);
}

async function copyDirRecursive(src, dest) {
  const stat = await fsp.stat(src).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Source directory not found: ${src}`);
  }

  // If destination exists, we *do not* overwrite; we skip entirely.
  if (await pathExists(dest)) return;

  await ensureDir(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      await fsp.copyFile(s, d);
    } else if (entry.isSymbolicLink()) {
      const target = await fsp.readlink(s);
      await fsp.symlink(target, d);
    }
  }
}

async function main() {
  // Current working directory (where user wants .claude/.awos created)
  const cwd = process.cwd();

  // Package root = directory where THIS JS file lives
  // (Assumes `commands/` and `templates/` are alongside this file in this package)
  const pkgRoot = __dirname;

  // 1) Ensure `.claude` exists
  const claudeDir = path.join(cwd, ".claude");
  await ensureDir(claudeDir);

  // 1.1) Ensure `.claude/awos` exists
  const claudeCommandAwosDir = path.join(claudeDir, "commands");
  await ensureDir(claudeCommandAwosDir);

  // 1.2) Copy `commands` from this package into `.claude/commands/awos`
  const commandSrc = path.join(pkgRoot, "commands");
  const commandDest = path.join(claudeCommandAwosDir, "awos");
  await copyDirRecursive(commandSrc, commandDest);

  // 2) Ensure `.awos` exists
  const awosDir = path.join(cwd, ".awos");
  await ensureDir(awosDir);

  // 2.1) Copy `templates/` directory from this package into `.awos/templates` (skip if exists)
  const templatesSrc = path.join(pkgRoot, "templates");
  const templatesDest = path.join(awosDir, "templates");
  await copyDirRecursive(templatesSrc, templatesDest);

  const scriptSrc = path.join(pkgRoot, "scripts");
  const scriptDest = path.join(awosDir, "scripts");
  await copyDirRecursive(scriptSrc, scriptDest);

  const agentSrc = path.join(pkgRoot, "subagents");
  const agentDest = path.join(claudeDir, "agents");
  await copyDirRecursive(agentSrc, agentDest);

  console.log("Setup completed:");
  console.log(`- Ensured: ${claudeDir}`);
  console.log(`- Ensured: ${claudeCommandAwosDir}`);
  console.log(`- Copied dir (if missing): ${commandSrc} -> ${commandDest}`);
  console.log(`- Copied dir (if missing): ${templatesSrc} -> ${templatesDest}`);
}

main().catch((err) => {
  console.error("Error during setup:", err.message);
  process.exit(1);
});
