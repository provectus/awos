'use strict';
/**
 * CLI entry point for the multi-IDE adapter generation pipeline.
 * Orchestrates: parse → IR → emit → validate → write → install → manifest.
 * Zero npm dependencies — Node.js 22+ built-in modules only.
 * @module generate
 */
const { createHash } = require('node:crypto');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { parseAllCommands } = require('./lib/parser.js');
const { serialize } = require('./lib/ir.js');
const { loadProviders, detectProviders } = require('./lib/registry.js');
const { splitIfNeeded } = require('./lib/splitter.js');
const { validate } = require('./lib/validator.js');

// --- Provider Installers ---
// Each provider that needs IDE-native installation has an installer module.
// Installers transform generated adapter files into the IDE's native format.
const installers = {
    kiro: require('./lib/installers/kiro.js'),
};

const MIN_NODE_VERSION = 22;
const WARN_LINE_THRESHOLD = 400;
const SPLIT_LINE_THRESHOLD = 500;
const UPSTREAM_DIRS = ['commands', 'templates', 'scripts', 'src'];

// --- Overlay Directory Scaffolding ---

const OVERLAY_DIR = '.awos-company';
const OVERLAY_SUBDIRS = ['skills', 'agents', 'mcps'];
const EMPTY_MANIFEST = JSON.stringify({ resources: [] }, null, 2) + '\n';

/**
 * Scaffold the .awos-company/ overlay directory in the target project
 * if it does not already exist. Creates subdirectories and an empty
 * manifest.json so the project is ready for company resources.
 *
 * @param {string} projectRoot - Target project root
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false]
 */
async function scaffoldOverlayDirectory(projectRoot, options = {}) {
    const { dryRun = false } = options;
    const overlayDir = path.join(projectRoot, OVERLAY_DIR);
    const manifestPath = path.join(overlayDir, 'manifest.json');

    // If overlay already exists with a manifest, leave it alone
    if (fs.existsSync(manifestPath)) {
        return;
    }

    if (dryRun) {
        console.log(`  Would create ${OVERLAY_DIR}/ with empty manifest in target project`);
        return;
    }

    // Create subdirectories
    for (const sub of OVERLAY_SUBDIRS) {
        await fsp.mkdir(path.join(overlayDir, sub), { recursive: true });
    }

    // Write empty manifest if it doesn't exist
    await fsp.writeFile(manifestPath, EMPTY_MANIFEST, 'utf8');

    console.log(`  Created ${OVERLAY_DIR}/ with empty manifest in target project`);
}

// --- CLI Argument Parsing ---

function parseArgs(argv) {
    const flags = {
        provider: null,
        root: null,
        dryRun: false,
        dumpIr: false,
        detect: false,
        validate: false,
        skipInstall: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--provider' && i + 1 < argv.length) {
            flags.provider = argv[++i];
        } else if (arg === '--root' && i + 1 < argv.length) {
            flags.root = argv[++i];
        } else if (arg === '--dry-run') {
            flags.dryRun = true;
        } else if (arg === '--dump-ir') {
            flags.dumpIr = true;
        } else if (arg === '--detect') {
            flags.detect = true;
        } else if (arg === '--validate') {
            flags.validate = true;
        } else if (arg === '--skip-install') {
            flags.skipInstall = true;
        }
    }
    return flags;
}

// --- Pre-flight Checks ---

function checkNodeVersion() {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    if (major < MIN_NODE_VERSION) {
        return {
            ok: false,
            message:
                `Node.js ${MIN_NODE_VERSION}+ required. ` +
                `Current version: ${process.versions.node}`,
        };
    }
    return { ok: true, message: '' };
}

function resolveCommandsDir(projectRoot) {
    const awosPath = path.join(projectRoot, '.awos', 'commands');
    if (fs.existsSync(awosPath)) return awosPath;
    const rootPath = path.join(projectRoot, 'commands');
    if (fs.existsSync(rootPath)) return rootPath;
    return null;
}

function hasCommandFiles(commandsDir) {
    try {
        const entries = fs.readdirSync(commandsDir);
        return entries.some((e) => e.endsWith('.md'));
    } catch {
        return false;
    }
}

function checkUncommittedChanges(projectRoot) {
    const warnings = [];
    for (const dir of UPSTREAM_DIRS) {
        if (!fs.existsSync(path.join(projectRoot, dir))) continue;
        try {
            const result = execSync(`git status --porcelain "${dir}"`, {
                cwd: projectRoot,
                encoding: 'utf8',
                timeout: 5000,
            }).trim();
            if (result.length > 0) {
                warnings.push(`Warning: uncommitted changes in ${dir}/`);
            }
        } catch {
            // Git not available or not a git repo — skip
        }
    }
    return warnings;
}

// --- Source Hashing ---

async function computeSourceHash(commandsDir) {
    const entries = await fsp.readdir(commandsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();
    const hash = createHash('sha256');
    for (const file of mdFiles) {
        const content = await fsp.readFile(
            path.join(commandsDir, file),
            'utf8'
        );
        hash.update(content);
    }
    return `sha256:${hash.digest('hex')}`;
}

// --- Emitter Dispatch ---

function dispatchEmitter(providerConfig, commands, adaptersRoot) {
    const emitterPath = path.resolve(adaptersRoot, providerConfig.emitter);
    const files = [];
    const warnings = [];
    let emitterModule;
    try {
        emitterModule = require(emitterPath);
    } catch {
        warnings.push(
            `Skipping provider "${providerConfig.name}": ` +
            `emitter module not found (${providerConfig.emitter})`
        );
        return { files, warnings };
    }
    if (typeof emitterModule.emit !== 'function') {
        warnings.push(
            `Skipping provider "${providerConfig.name}": ` +
            `emitter does not export emit()`
        );
        return { files, warnings };
    }
    for (const { ir } of commands) {
        try {
            const result = emitterModule.emit(ir, {
                provider: providerConfig.name,
            });
            if (result && Array.isArray(result.files)) files.push(...result.files);
            if (result && Array.isArray(result.warnings)) {
                for (const w of result.warnings) {
                    warnings.push(typeof w === 'string' ? w : w.message || String(w));
                }
            }
        } catch (err) {
            warnings.push(
                `Error emitting "${ir.name}" for "${providerConfig.name}": ` +
                err.message
            );
        }
    }
    return { files, warnings };
}

// --- File Writing ---

async function writeFiles(provider, files, adaptersRoot) {
    let written = 0;
    const errors = [];
    const providerDir = path.join(adaptersRoot, provider);
    for (const file of files) {
        const fullPath = path.join(providerDir, file.relativePath);
        try {
            await fsp.mkdir(path.dirname(fullPath), { recursive: true });
            await fsp.writeFile(fullPath, file.content, 'utf8');
            written++;
        } catch (err) {
            errors.push(`Permission denied: ${fullPath} — ${err.message}`);
        }
    }
    return { written, errors };
}

// --- Provider Installation ---

async function runInstallers(activeProviders, projectRoot, options = {}) {
    const { dryRun = false } = options;
    const results = {};

    for (const provider of activeProviders) {
        const installer = installers[provider.name];
        if (!installer) continue;

        try {
            const result = await installer.install(projectRoot, { dryRun });
            results[provider.name] = result;
        } catch (err) {
            results[provider.name] = {
                steering: { installed: [], skipped: [], errors: [err.message] },
                hooks: { installed: [], errors: [err.message] },
            };
        }
    }

    return results;
}

function printInstallSummary(installResults) {
    const providers = Object.keys(installResults);
    if (providers.length === 0) return;

    console.log('=== Installation Summary ===\n');
    for (const name of providers) {
        const result = installResults[name];
        const steeringCount = result.steering.installed.length;
        const hookCount = result.hooks.installed.length;
        const errorCount =
            result.steering.errors.length + result.hooks.errors.length;

        console.log(
            `  ${name}: ${steeringCount} steering files, ` +
            `${hookCount} hooks installed` +
            (errorCount > 0 ? ` (${errorCount} errors)` : '')
        );

        if (result.steering.errors.length > 0) {
            for (const e of result.steering.errors) {
                console.log(`    ⚠ ${e}`);
            }
        }
        if (result.hooks.errors.length > 0) {
            for (const e of result.hooks.errors) {
                console.log(`    ⚠ ${e}`);
            }
        }
    }
    console.log('');
}

// --- Manifest Generation ---

async function generateManifest(providerStats, sourceHash, adaptersRoot) {
    const now = new Date().toISOString();
    const manifest = {
        generatedAt: now,
        nodeVersion: process.versions.node,
        sourceHash,
        providers: {},
    };
    for (const [name, stats] of Object.entries(providerStats)) {
        manifest.providers[name] = {
            fileCount: stats.fileCount,
            totalLines: stats.totalLines,
            generatedAt: now,
        };
    }
    await fsp.writeFile(
        path.join(adaptersRoot, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
    );
}

// --- Summary ---

function printSummary(providerStats) {
    console.log('\n=== Generation Summary ===\n');
    for (const [name, stats] of Object.entries(providerStats)) {
        console.log(
            `  ${name}: ${stats.fileCount} files, ${stats.totalLines} lines`
        );
    }
    console.log('');
}

// --- Collect Existing Files for --validate ---

async function collectExistingFiles(dir) {
    const files = [];
    async function walk(currentDir, base) {
        const entries = await fsp.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath, path.join(base, entry.name));
            } else if (entry.isFile()) {
                // Skip non-generated placeholder files
                if (entry.name === '.gitkeep') continue;
                const content = await fsp.readFile(fullPath, 'utf8');
                files.push({
                    relativePath: path.join(base, entry.name),
                    content,
                    lineCount: content.split('\n').length,
                });
            }
        }
    }
    await walk(dir, '');
    return files;
}

// --- Main Pipeline ---

/**
 * @param {string[]} argv - Process arguments (without node and script path)
 * @returns {Promise<{exitCode: number, summary: GenerationSummary}>}
 */
async function main(argv) {
    const flags = parseArgs(argv);
    const projectRoot = flags.root
        ? path.resolve(flags.root)
        : path.resolve(__dirname, '..');
    // Pipeline modules (emitters, providers.json) live alongside this script.
    // Output goes into the target project's .awos-adapters/ directory.
    const pipelineRoot = path.resolve(__dirname);
    const adaptersRoot = flags.root
        ? path.join(projectRoot, '.awos-adapters')
        : path.join(projectRoot, '.awos-adapters');
    const allWarnings = [];
    const allErrors = [];

    // 1. Check Node.js version
    const versionCheck = checkNodeVersion();
    if (!versionCheck.ok) {
        process.stderr.write(versionCheck.message + '\n');
        return {
            exitCode: 1,
            summary: { providers: {}, warnings: [], errors: [versionCheck.message] },
        };
    }

    // 2. Check commands directory
    const commandsDir = resolveCommandsDir(projectRoot);
    if (!commandsDir || !hasCommandFiles(commandsDir)) {
        const msg =
            'Error: .awos/commands/ directory not found or contains no .md ' +
            'files. Ensure AWOS command prompts exist before generating.';
        process.stderr.write(msg + '\n');
        return {
            exitCode: 1,
            summary: { providers: {}, warnings: [], errors: [msg] },
        };
    }

    // 3. Check uncommitted changes (warning only)
    const uncommittedWarnings = checkUncommittedChanges(projectRoot);
    for (const w of uncommittedWarnings) {
        process.stderr.write(w + '\n');
        allWarnings.push(w);
    }

    // 4. Load providers
    const providersPath = path.join(pipelineRoot, 'providers.json');
    let providers;
    try {
        providers = loadProviders(providersPath);
    } catch (err) {
        const { DEFAULT_PROVIDERS } = require('./lib/registry.js');
        providers = [...DEFAULT_PROVIDERS];
        allWarnings.push(`Using default providers: ${err.message}`);
    }

    // 5. --detect
    if (flags.detect) {
        const detected = detectProviders(projectRoot);
        console.log('Detected providers:');
        if (detected.length === 0) {
            console.log('  (none)');
        } else {
            for (const d of detected) {
                console.log(
                    `  ${d.name} (markers: ${d.foundMarkers.join(', ')})`
                );
            }
        }
        return {
            exitCode: 0,
            summary: { providers: {}, warnings: allWarnings, errors: [] },
        };
    }

    // 6. --validate
    if (flags.validate) {
        const violations = [];
        for (const provider of providers) {
            if (!provider.enabled) continue;
            const providerDir = path.join(adaptersRoot, provider.name);
            if (!fs.existsSync(providerDir)) continue;
            const files = await collectExistingFiles(providerDir);
            const results = validate(provider.name, files);
            violations.push(...results);
        }
        if (violations.length === 0) {
            console.log('Validation passed: no violations found.');
            return {
                exitCode: 0,
                summary: { providers: {}, warnings: allWarnings, errors: [] },
            };
        }
        process.stderr.write(
            `Validation failed: ${violations.length} violation(s)\n`
        );
        for (const v of violations) {
            process.stderr.write(
                `  [${v.provider}] ${v.filePath}: ${v.rule}\n` +
                `    Fix: ${v.suggestedFix}\n`
            );
        }
        return {
            exitCode: 1,
            summary: {
                providers: {},
                warnings: allWarnings,
                errors: violations.map((v) => v.rule),
            },
        };
    }

    // 7. Parse all commands
    const { commands, errors: parseErrors } =
        await parseAllCommands(commandsDir);
    for (const err of parseErrors) {
        process.stderr.write(`Parse error: ${err.message}\n`);
        allErrors.push(err.message);
    }
    if (commands.length === 0) {
        const msg = 'Error: no commands could be parsed successfully.';
        process.stderr.write(msg + '\n');
        return {
            exitCode: 1,
            summary: { providers: {}, warnings: allWarnings, errors: [msg] },
        };
    }

    // 8. --dump-ir
    if (flags.dumpIr) {
        const irOutput = commands.map((c) => JSON.parse(serialize(c.ir)));
        process.stdout.write(JSON.stringify(irOutput, null, 2) + '\n');
        return {
            exitCode: 0,
            summary: { providers: {}, warnings: allWarnings, errors: [] },
        };
    }

    // 9. Filter providers by --provider flag
    let activeProviders = providers.filter((p) => p.enabled);
    if (flags.provider) {
        const match = activeProviders.find((p) => p.name === flags.provider);
        if (!match) {
            const available = providers.map((p) => p.name).join(', ');
            const msg =
                `Unknown provider "${flags.provider}". Available: ${available}`;
            process.stderr.write(msg + '\n');
            return {
                exitCode: 1,
                summary: { providers: {}, warnings: allWarnings, errors: [msg] },
            };
        }
        activeProviders = [match];
    }

    // 10. Emit for each provider
    const providerStats = {};
    const allFiles = {};
    for (const provider of activeProviders) {
        const { files, warnings } = dispatchEmitter(
            provider, commands, pipelineRoot
        );
        allWarnings.push(...warnings);
        for (const w of warnings) process.stderr.write(w + '\n');
        // Split files exceeding 500 lines
        let processedFiles = [];
        for (const file of files) {
            processedFiles.push(...splitIfNeeded(file, SPLIT_LINE_THRESHOLD));
        }
        // Warn on files exceeding 400 lines
        for (const file of processedFiles) {
            if (file.lineCount > WARN_LINE_THRESHOLD) {
                const warnMsg =
                    `Warning: ${provider.name}/${file.relativePath} is ` +
                    `${file.lineCount} lines (approaching ${SPLIT_LINE_THRESHOLD} limit)`;
                process.stderr.write(warnMsg + '\n');
                allWarnings.push(warnMsg);
            }
        }
        const totalLines = processedFiles.reduce(
            (sum, f) => sum + f.lineCount, 0
        );
        providerStats[provider.name] = {
            fileCount: processedFiles.length,
            totalLines,
        };
        allFiles[provider.name] = processedFiles;
    }

    // 11. --dry-run (show what would be written AND installed)
    if (flags.dryRun) {
        console.log('Dry run — files that would be written:\n');
        for (const [name, files] of Object.entries(allFiles)) {
            console.log(`  ${name}/`);
            for (const file of files) {
                console.log(`    ${file.relativePath} (${file.lineCount} lines)`);
            }
        }
        printSummary(providerStats);

        if (!flags.skipInstall) {
            console.log('Dry run — files that would be installed:\n');
            const installResults = await runInstallers(
                activeProviders, projectRoot, { dryRun: true }
            );
            printInstallSummary(installResults);
            await scaffoldOverlayDirectory(projectRoot, { dryRun: true });
        }

        return {
            exitCode: 0,
            summary: {
                providers: providerStats, warnings: allWarnings, errors: [],
            },
        };
    }

    // 12. Write files to disk
    for (const [providerName, files] of Object.entries(allFiles)) {
        const { errors } = await writeFiles(providerName, files, adaptersRoot);
        if (errors.length > 0) {
            for (const e of errors) {
                process.stderr.write(e + '\n');
                allErrors.push(e);
            }
            return {
                exitCode: 1,
                summary: {
                    providers: providerStats, warnings: allWarnings, errors: allErrors,
                },
            };
        }
    }

    // 13. Run validation on written files
    for (const [providerName, files] of Object.entries(allFiles)) {
        const violations = validate(providerName, files);
        for (const v of violations) {
            const msg = `[${v.provider}] ${v.filePath}: ${v.rule}`;
            process.stderr.write(`Validation: ${msg}\n`);
            allWarnings.push(msg);
        }
    }

    // 14. Install into IDE-native directories
    if (!flags.skipInstall) {
        const installResults = await runInstallers(
            activeProviders, projectRoot, { dryRun: false }
        );

        // Collect install errors
        for (const [providerName, result] of Object.entries(installResults)) {
            for (const e of result.steering.errors) {
                allWarnings.push(`[${providerName}] install: ${e}`);
            }
            for (const e of result.hooks.errors) {
                allWarnings.push(`[${providerName}] install: ${e}`);
            }
        }

        printInstallSummary(installResults);
    }

    // 15. Scaffold overlay directory in target project if missing
    await scaffoldOverlayDirectory(projectRoot, { dryRun: false });

    // 16. Generate manifest.json
    const sourceHash = await computeSourceHash(commandsDir);
    await generateManifest(providerStats, sourceHash, adaptersRoot);

    // 16. Print summary
    printSummary(providerStats);

    return {
        exitCode: 0,
        summary: {
            providers: providerStats, warnings: allWarnings, errors: allErrors,
        },
    };
}

module.exports = { main };

if (require.main === module) {
    main(process.argv.slice(2)).then(({ exitCode }) => {
        process.exitCode = exitCode;
    });
}
