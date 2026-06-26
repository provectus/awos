import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AgentToolDef {
  id: string;
  displayName: string;
  instructionFiles: string[];
  ruleOrCommandDirs: string[];
  skillDirs: string[];
  mcpConfigPaths: string[];
  hookPaths: string[];
  configDirs: string[];
  commitAttribution: RegExp[];
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    instructionFiles: ['CLAUDE.md'],
    ruleOrCommandDirs: ['.claude/commands'],
    skillDirs: ['.claude/skills'],
    mcpConfigPaths: ['.mcp.json', '.claude/mcp.json'],
    hookPaths: ['.claude/hooks'],
    configDirs: ['.claude'],
    commitAttribution: [/Co-authored-by:.*Claude/i, /claude@anthropic/i],
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    instructionFiles: ['.cursorrules'],
    ruleOrCommandDirs: ['.cursor/rules', '.cursor/commands'],
    skillDirs: [],
    mcpConfigPaths: ['.cursor/mcp.json'],
    hookPaths: [],
    configDirs: ['.cursor'],
    commitAttribution: [/Co-authored-by:.*Cursor/i],
  },
  {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    instructionFiles: ['.github/copilot-instructions.md'],
    ruleOrCommandDirs: ['.github/prompts', '.github/instructions'],
    skillDirs: [],
    mcpConfigPaths: [],
    hookPaths: [],
    configDirs: [],
    commitAttribution: [/Co-authored-by:.*Copilot/i, /copilot.*\[bot\]/i],
  },
  {
    id: 'codex',
    displayName: 'OpenAI Codex',
    instructionFiles: ['AGENTS.md'],
    ruleOrCommandDirs: ['.codex/prompts'],
    skillDirs: [],
    mcpConfigPaths: ['.codex/config.toml'],
    hookPaths: [],
    configDirs: ['.codex'],
    commitAttribution: [/Co-authored-by:.*Codex/i],
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    instructionFiles: ['GEMINI.md'],
    ruleOrCommandDirs: ['.gemini/commands'],
    skillDirs: [],
    mcpConfigPaths: ['.gemini/settings.json'],
    hookPaths: [],
    configDirs: ['.gemini'],
    commitAttribution: [/Co-authored-by:.*Gemini/i],
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    instructionFiles: [],
    ruleOrCommandDirs: ['.kiro/steering', '.kiro/specs'],
    skillDirs: [],
    mcpConfigPaths: ['.kiro/settings/mcp.json'],
    hookPaths: ['.kiro/hooks'],
    configDirs: ['.kiro'],
    commitAttribution: [/Co-authored-by:.*Kiro/i],
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    instructionFiles: ['.windsurfrules'],
    ruleOrCommandDirs: ['.windsurf/rules', '.windsurf/workflows'],
    skillDirs: [],
    mcpConfigPaths: ['.windsurf/mcp_config.json'],
    hookPaths: [],
    configDirs: ['.windsurf'],
    commitAttribution: [/Co-authored-by:.*(Windsurf|Cascade)/i],
  },
  {
    id: 'cline',
    displayName: 'Cline',
    instructionFiles: ['.clinerules'],
    ruleOrCommandDirs: [],
    skillDirs: [],
    mcpConfigPaths: ['.cline/mcp.json'],
    hookPaths: [],
    configDirs: ['.cline'],
    commitAttribution: [/Co-authored-by:.*Cline/i],
  },
];

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const ALL_INSTRUCTION_FILES = uniq(
  AGENT_TOOLS.flatMap((t) => t.instructionFiles)
);
export const ALL_RULE_COMMAND_DIRS = uniq(
  AGENT_TOOLS.flatMap((t) => t.ruleOrCommandDirs)
);
export const ALL_SKILL_DIRS = uniq(AGENT_TOOLS.flatMap((t) => t.skillDirs));
export const ALL_MCP_CONFIG_PATHS = uniq(
  AGENT_TOOLS.flatMap((t) => t.mcpConfigPaths)
);
export const ALL_HOOK_PATHS = uniq(AGENT_TOOLS.flatMap((t) => t.hookPaths));
export const ALL_TOOL_CONFIG_DIRS = uniq(
  AGENT_TOOLS.flatMap((t) => t.configDirs)
);
export const ALL_COMMIT_ATTRIBUTION = AGENT_TOOLS.flatMap(
  (t) => t.commitAttribution
);

export function detectAgentTools(repoPath: string): AgentToolDef[] {
  return AGENT_TOOLS.filter((t) => {
    const paths = [
      ...t.instructionFiles,
      ...t.ruleOrCommandDirs,
      ...t.skillDirs,
      ...t.mcpConfigPaths,
      ...t.hookPaths,
      ...t.configDirs,
    ];
    return paths.some((p) => existsSync(join(repoPath, p)));
  });
}
