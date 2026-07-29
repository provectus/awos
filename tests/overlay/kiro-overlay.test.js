'use strict';

/**
 * Unit Tests for installOverlay() end-to-end scenarios
 *
 * Tests valid skill install, missing frontmatter skip, idempotent reinstall,
 * valid agent install, missing skill dep skip, steering file content,
 * MCP new entry, MCP conflict skip, create from scratch, env var preservation.
 *
 * Validates: Requirements 4.1–4.5, 5.1–5.6, 6.1–6.6, 10.1–10.7
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { installOverlay } = require('../../.awos-adapters/lib/installers/kiro');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-kiro-overlay-test-'));
}

function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Create a source file in tempDir and return the absolute path.
 */
function createSourceFile(tempDir, relativePath, content) {
    const fullPath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return fullPath;
}

// ---------------------------------------------------------------------
// Skill Installation Tests
// ---------------------------------------------------------------------

describe('installOverlay() — Skill Installation', () => {
    let tempDir;
    let projectRoot;
    let sourceDir;

    beforeEach(() => {
        tempDir = createTempDir();
        projectRoot = path.join(tempDir, 'project');
        sourceDir = path.join(tempDir, 'source');
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.mkdirSync(sourceDir, { recursive: true });
    });

    afterEach(() => {
        removeTempDir(tempDir);
    });

    it('valid skill with proper YAML frontmatter is copied to .kiro/skills/{name}/{filename}', async () => {
        const skillContent = '---\nname: my-cool-skill\ndescription: A test skill\n---\n\n# My Cool Skill\n\nSkill body content here.\n';
        const sourcePath = createSourceFile(sourceDir, 'skills/my-cool-skill.md', skillContent);

        const resources = [
            {
                name: 'my-cool-skill',
                type: 'skill',
                absolutePath: sourcePath,
                source: 'company',
            },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Verify file was copied to the correct location
        const targetPath = path.join(projectRoot, '.kiro', 'skills', 'my-cool-skill', 'my-cool-skill.md');
        assert.ok(fs.existsSync(targetPath), 'Skill file should exist at target path');

        // Verify content is preserved
        const installedContent = fs.readFileSync(targetPath, 'utf8');
        assert.strictEqual(installedContent, skillContent);

        // Verify result
        assert.ok(result.skills.includes('my-cool-skill'));
        assert.strictEqual(result.errors.length, 0);
        assert.strictEqual(result.warnings.length, 0);
    });

    it('skill missing YAML frontmatter is skipped with warning, other resources still install', async () => {
        // Skill without frontmatter
        const noFrontmatterContent = '# No Frontmatter Skill\n\nThis file has no YAML frontmatter.\n';
        const noFrontmatterPath = createSourceFile(sourceDir, 'skills/no-frontmatter.md', noFrontmatterContent);

        // Valid skill
        const validContent = '---\nname: valid-skill\n---\n\n# Valid Skill\n\nBody.\n';
        const validPath = createSourceFile(sourceDir, 'skills/valid-skill.md', validContent);

        const resources = [
            {
                name: 'no-frontmatter',
                type: 'skill',
                absolutePath: noFrontmatterPath,
                source: 'company',
            },
            {
                name: 'valid-skill',
                type: 'skill',
                absolutePath: validPath,
                source: 'company',
            },
        ];

        const result = await installOverlay(projectRoot, resources);

        // The invalid skill was skipped
        assert.ok(!result.skills.includes('no-frontmatter'));
        assert.ok(result.warnings.some(w => w.includes('no-frontmatter') && w.includes('frontmatter')));

        // The valid skill was still installed
        assert.ok(result.skills.includes('valid-skill'));
        const validTarget = path.join(projectRoot, '.kiro', 'skills', 'valid-skill', 'valid-skill.md');
        assert.ok(fs.existsSync(validTarget));
    });

    it('skill missing name field in frontmatter is skipped with warning', async () => {
        const content = '---\ndescription: No name field here\n---\n\n# Nameless\n\nBody.\n';
        const sourcePath = createSourceFile(sourceDir, 'skills/nameless.md', content);

        const resources = [
            {
                name: 'nameless-skill',
                type: 'skill',
                absolutePath: sourcePath,
                source: 'company',
            },
        ];

        const result = await installOverlay(projectRoot, resources);

        assert.ok(!result.skills.includes('nameless-skill'));
        assert.ok(result.warnings.some(w => w.includes('nameless-skill') && w.includes('name')));
        assert.strictEqual(result.errors.length, 0);
    });

    it('idempotent reinstall succeeds without error, file content identical', async () => {
        const skillContent = '---\nname: idempotent-skill\n---\n\n# Idempotent\n\nBody.\n';
        const sourcePath = createSourceFile(sourceDir, 'skills/idempotent-skill.md', skillContent);

        const resources = [
            {
                name: 'idempotent-skill',
                type: 'skill',
                absolutePath: sourcePath,
                source: 'company',
            },
        ];

        // First install
        const result1 = await installOverlay(projectRoot, resources);
        assert.ok(result1.skills.includes('idempotent-skill'));
        assert.strictEqual(result1.errors.length, 0);

        // Second install (idempotent)
        const result2 = await installOverlay(projectRoot, resources);
        assert.ok(result2.skills.includes('idempotent-skill'));
        assert.strictEqual(result2.errors.length, 0);

        // Content is still identical
        const targetPath = path.join(projectRoot, '.kiro', 'skills', 'idempotent-skill', 'idempotent-skill.md');
        const installedContent = fs.readFileSync(targetPath, 'utf8');
        assert.strictEqual(installedContent, skillContent);
    });
});

// ---------------------------------------------------------------------
// Agent Installation Tests
// ---------------------------------------------------------------------

describe('installOverlay() — Agent Installation', () => {
    let tempDir;
    let projectRoot;
    let sourceDir;

    beforeEach(() => {
        tempDir = createTempDir();
        projectRoot = path.join(tempDir, 'project');
        sourceDir = path.join(tempDir, 'source');
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.mkdirSync(sourceDir, { recursive: true });
    });

    afterEach(() => {
        removeTempDir(tempDir);
    });

    it('valid agent with existing skill deps generates steering file', async () => {
        // Create skill source
        const skillContent = '---\nname: dep-skill\n---\n\n# Dep Skill\n\nBody.\n';
        const skillPath = createSourceFile(sourceDir, 'skills/dep-skill.md', skillContent);

        // Create agent source
        const agentContent = '---\nname: test-agent\ndescription: Test agent description\nskills: dep-skill\n---\n\n# Test Agent\n\nAgent body.\n';
        const agentPath = createSourceFile(sourceDir, 'agents/test-agent.md', agentContent);

        const resources = [
            {
                name: 'dep-skill',
                type: 'skill',
                absolutePath: skillPath,
                source: 'company',
            },
            {
                name: 'test-agent',
                type: 'agent',
                absolutePath: agentPath,
                source: 'company',
            },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Agent was installed
        assert.ok(result.agents.includes('test-agent'));
        assert.strictEqual(result.errors.length, 0);

        // Steering file was generated
        const steeringPath = path.join(projectRoot, '.kiro', 'steering', 'test-agent.md');
        assert.ok(fs.existsSync(steeringPath), 'Steering file should exist');
    });

    it('steering file content starts with inclusion: manual frontmatter and references declared skills', async () => {
        // Create skill sources
        const skill1Content = '---\nname: skill-alpha\n---\n\n# Skill Alpha\n\nBody.\n';
        const skill1Path = createSourceFile(sourceDir, 'skills/skill-alpha.md', skill1Content);

        const skill2Content = '---\nname: skill-beta\n---\n\n# Skill Beta\n\nBody.\n';
        const skill2Path = createSourceFile(sourceDir, 'skills/skill-beta.md', skill2Content);

        // Create agent referencing both skills
        const agentContent = '---\nname: multi-skill-agent\ndescription: Agent with multiple skills\nskills: skill-alpha, skill-beta\n---\n\n# Multi Skill Agent\n\nBody.\n';
        const agentPath = createSourceFile(sourceDir, 'agents/multi-skill-agent.md', agentContent);

        const resources = [
            { name: 'skill-alpha', type: 'skill', absolutePath: skill1Path, source: 'company' },
            { name: 'skill-beta', type: 'skill', absolutePath: skill2Path, source: 'company' },
            { name: 'multi-skill-agent', type: 'agent', absolutePath: agentPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        assert.ok(result.agents.includes('multi-skill-agent'));

        // Read and verify steering file content
        const steeringPath = path.join(projectRoot, '.kiro', 'steering', 'multi-skill-agent.md');
        const steeringContent = fs.readFileSync(steeringPath, 'utf8');

        // Must start with inclusion: manual frontmatter
        assert.ok(
            steeringContent.startsWith('---\ninclusion: manual\n---'),
            `Expected steering to start with "---\\ninclusion: manual\\n---", got: "${steeringContent.slice(0, 50)}"`
        );

        // Must reference all declared skills
        assert.ok(steeringContent.includes('skill-alpha'), 'Steering should reference skill-alpha');
        assert.ok(steeringContent.includes('skill-beta'), 'Steering should reference skill-beta');
    });

    it('agent with missing skill dependency is skipped with warning identifying missing skill', async () => {
        // Agent references a skill that doesn't exist in overlay or on disk
        const agentContent = '---\nname: orphan-agent\ndescription: Has missing deps\nskills: nonexistent-skill\n---\n\n# Orphan Agent\n\nBody.\n';
        const agentPath = createSourceFile(sourceDir, 'agents/orphan-agent.md', agentContent);

        const resources = [
            { name: 'orphan-agent', type: 'agent', absolutePath: agentPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Agent was skipped
        assert.ok(!result.agents.includes('orphan-agent'));

        // Warning identifies the missing skill
        assert.ok(
            result.warnings.some(w => w.includes('nonexistent-skill')),
            `Expected warning about "nonexistent-skill", got: ${JSON.stringify(result.warnings)}`
        );

        // No steering file generated
        const steeringPath = path.join(projectRoot, '.kiro', 'steering', 'orphan-agent.md');
        assert.ok(!fs.existsSync(steeringPath), 'No steering file should be generated for skipped agent');
    });

    it('agent idempotent reinstall overwrites without error', async () => {
        const skillContent = '---\nname: idem-skill\n---\n\n# Idem Skill\n\nBody.\n';
        const skillPath = createSourceFile(sourceDir, 'skills/idem-skill.md', skillContent);

        const agentContent = '---\nname: idem-agent\ndescription: Idempotent agent\nskills: idem-skill\n---\n\n# Idem Agent\n\nBody.\n';
        const agentPath = createSourceFile(sourceDir, 'agents/idem-agent.md', agentContent);

        const resources = [
            { name: 'idem-skill', type: 'skill', absolutePath: skillPath, source: 'company' },
            { name: 'idem-agent', type: 'agent', absolutePath: agentPath, source: 'company' },
        ];

        // First install
        const result1 = await installOverlay(projectRoot, resources);
        assert.ok(result1.agents.includes('idem-agent'));
        assert.strictEqual(result1.errors.length, 0);

        // Second install (idempotent)
        const result2 = await installOverlay(projectRoot, resources);
        assert.ok(result2.agents.includes('idem-agent'));
        assert.strictEqual(result2.errors.length, 0);

        // Steering file still exists with correct content
        const steeringPath = path.join(projectRoot, '.kiro', 'steering', 'idem-agent.md');
        assert.ok(fs.existsSync(steeringPath));
        const content = fs.readFileSync(steeringPath, 'utf8');
        assert.ok(content.startsWith('---\ninclusion: manual\n---'));
    });
});

// ---------------------------------------------------------------------
// MCP Installation Tests
// ---------------------------------------------------------------------

describe('installOverlay() — MCP Installation', () => {
    let tempDir;
    let projectRoot;
    let sourceDir;

    beforeEach(() => {
        tempDir = createTempDir();
        projectRoot = path.join(tempDir, 'project');
        sourceDir = path.join(tempDir, 'source');
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.mkdirSync(sourceDir, { recursive: true });
    });

    afterEach(() => {
        removeTempDir(tempDir);
    });

    it('new MCP entry with no existing mcp.json creates the file with mcpServers key', async () => {
        const mcpContent = JSON.stringify({
            'new-analytics-mcp': {
                command: 'npx',
                args: ['-y', '@company/analytics-mcp'],
                env: { API_KEY: 'some-value' },
            },
        });
        const mcpPath = createSourceFile(sourceDir, 'mcps/analytics.json', mcpContent);

        const resources = [
            { name: 'new-analytics-mcp', type: 'mcp', absolutePath: mcpPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Verify mcp.json was created
        const mcpFilePath = path.join(projectRoot, '.kiro', 'settings', 'mcp.json');
        assert.ok(fs.existsSync(mcpFilePath), 'mcp.json should be created');

        // Parse and verify structure
        const mcpConfig = JSON.parse(fs.readFileSync(mcpFilePath, 'utf8'));
        assert.ok(mcpConfig.mcpServers, 'Should have mcpServers key');
        assert.ok(mcpConfig.mcpServers['new-analytics-mcp'], 'Should contain the new entry');
        assert.strictEqual(mcpConfig.mcpServers['new-analytics-mcp'].command, 'npx');
        assert.deepStrictEqual(mcpConfig.mcpServers['new-analytics-mcp'].args, ['-y', '@company/analytics-mcp']);

        // Verify result
        assert.ok(result.mcps.includes('new-analytics-mcp'));
        assert.strictEqual(result.errors.length, 0);
    });

    it('MCP merge with existing entries (no conflict) preserves both original and new entries', async () => {
        // Set up existing mcp.json
        const existingConfig = {
            mcpServers: {
                'existing-server': {
                    command: 'node',
                    args: ['server.js'],
                    env: { PORT: '3000' },
                },
            },
        };
        const mcpDir = path.join(projectRoot, '.kiro', 'settings');
        fs.mkdirSync(mcpDir, { recursive: true });
        fs.writeFileSync(path.join(mcpDir, 'mcp.json'), JSON.stringify(existingConfig, null, 2));

        // New overlay MCP entry
        const newMcpContent = JSON.stringify({
            'overlay-server': {
                command: 'python',
                args: ['serve.py'],
                env: { HOST: 'localhost' },
            },
        });
        const mcpPath = createSourceFile(sourceDir, 'mcps/overlay.json', newMcpContent);

        const resources = [
            { name: 'overlay-mcp', type: 'mcp', absolutePath: mcpPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Read result
        const mcpConfig = JSON.parse(fs.readFileSync(path.join(mcpDir, 'mcp.json'), 'utf8'));

        // Both entries present
        assert.ok(mcpConfig.mcpServers['existing-server'], 'Existing entry should be preserved');
        assert.ok(mcpConfig.mcpServers['overlay-server'], 'New entry should be added');

        // Existing entry unchanged
        assert.strictEqual(mcpConfig.mcpServers['existing-server'].command, 'node');
        assert.deepStrictEqual(mcpConfig.mcpServers['existing-server'].args, ['server.js']);

        // New entry correctly added
        assert.strictEqual(mcpConfig.mcpServers['overlay-server'].command, 'python');

        assert.ok(result.mcps.includes('overlay-server'));
        assert.strictEqual(result.errors.length, 0);
    });

    it('MCP conflict (same server name) is skipped with warning, existing entry preserved', async () => {
        // Set up existing mcp.json with a server called "conflicting-server"
        const existingConfig = {
            mcpServers: {
                'conflicting-server': {
                    command: 'node',
                    args: ['original.js'],
                    env: { ORIGINAL: 'true' },
                },
            },
        };
        const mcpDir = path.join(projectRoot, '.kiro', 'settings');
        fs.mkdirSync(mcpDir, { recursive: true });
        fs.writeFileSync(path.join(mcpDir, 'mcp.json'), JSON.stringify(existingConfig, null, 2));

        // Overlay tries to install same server name
        const conflictContent = JSON.stringify({
            'conflicting-server': {
                command: 'python',
                args: ['new.py'],
                env: { NEW: 'true' },
            },
        });
        const mcpPath = createSourceFile(sourceDir, 'mcps/conflict.json', conflictContent);

        const resources = [
            { name: 'conflict-mcp', type: 'mcp', absolutePath: mcpPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Existing entry preserved (not overwritten)
        const mcpConfig = JSON.parse(fs.readFileSync(path.join(mcpDir, 'mcp.json'), 'utf8'));
        assert.strictEqual(mcpConfig.mcpServers['conflicting-server'].command, 'node');
        assert.deepStrictEqual(mcpConfig.mcpServers['conflicting-server'].args, ['original.js']);
        assert.strictEqual(mcpConfig.mcpServers['conflicting-server'].env.ORIGINAL, 'true');

        // Warning emitted about the conflict
        assert.ok(
            result.warnings.some(w => w.includes('conflicting-server') && w.includes('already exists')),
            `Expected warning about conflict, got: ${JSON.stringify(result.warnings)}`
        );

        // The conflicting entry was not added to result.mcps
        assert.ok(!result.mcps.includes('conflicting-server'));
    });

    it('MCP creates file from scratch when .kiro/settings/ does not exist', async () => {
        // Ensure the settings directory doesn't exist
        const settingsDir = path.join(projectRoot, '.kiro', 'settings');
        assert.ok(!fs.existsSync(settingsDir), 'Settings dir should not exist initially');

        const mcpContent = JSON.stringify({
            'brand-new-server': {
                command: 'docker',
                args: ['run', '--rm', 'mcp-server'],
                env: {},
            },
        });
        const mcpPath = createSourceFile(sourceDir, 'mcps/brand-new.json', mcpContent);

        const resources = [
            { name: 'brand-new-mcp', type: 'mcp', absolutePath: mcpPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        // File was created with proper structure
        const mcpFilePath = path.join(settingsDir, 'mcp.json');
        assert.ok(fs.existsSync(mcpFilePath), 'mcp.json should be created from scratch');

        const mcpConfig = JSON.parse(fs.readFileSync(mcpFilePath, 'utf8'));
        assert.ok(mcpConfig.mcpServers, 'Should have mcpServers key');
        assert.ok(mcpConfig.mcpServers['brand-new-server'], 'Should contain the new server');
        assert.strictEqual(mcpConfig.mcpServers['brand-new-server'].command, 'docker');

        assert.ok(result.mcps.includes('brand-new-server'));
        assert.strictEqual(result.errors.length, 0);
    });

    it('environment variable references ${VAR_NAME} are preserved as literal strings in output', async () => {
        const mcpContent = JSON.stringify({
            'env-var-server': {
                command: 'npx',
                args: ['-y', '@company/mcp-server'],
                env: {
                    API_KEY: '${MY_API_KEY}',
                    DB_URL: '${DATABASE_URL}',
                    STATIC_VALUE: 'hardcoded-value',
                    MIXED: 'prefix-${SECRET_TOKEN}-suffix',
                },
            },
        });
        const mcpPath = createSourceFile(sourceDir, 'mcps/env-vars.json', mcpContent);

        const resources = [
            { name: 'env-var-mcp', type: 'mcp', absolutePath: mcpPath, source: 'company' },
        ];

        const result = await installOverlay(projectRoot, resources);

        // Read the output mcp.json
        const mcpFilePath = path.join(projectRoot, '.kiro', 'settings', 'mcp.json');
        const mcpConfig = JSON.parse(fs.readFileSync(mcpFilePath, 'utf8'));

        const env = mcpConfig.mcpServers['env-var-server'].env;

        // All ${...} references preserved as literal strings
        assert.strictEqual(env.API_KEY, '${MY_API_KEY}');
        assert.strictEqual(env.DB_URL, '${DATABASE_URL}');
        assert.strictEqual(env.STATIC_VALUE, 'hardcoded-value');
        assert.strictEqual(env.MIXED, 'prefix-${SECRET_TOKEN}-suffix');

        assert.ok(result.mcps.includes('env-var-server'));
        assert.strictEqual(result.errors.length, 0);
    });
});
