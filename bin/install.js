#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Codex config.toml constants
const REDPILL_CODEX_MARKER = '# Redpill Agent Configuration \u2014 managed by redpill installer';
const REDPILL_CODEX_HOOKS_OWNERSHIP_PREFIX = '# Redpill codex_hooks ownership: ';


const CODEX_AGENT_SANDBOX = {
  'redpill-executor': 'workspace-write',
  'redpill-planner': 'workspace-write',
  'redpill-phase-researcher': 'workspace-write',
  'redpill-project-researcher': 'workspace-write',
  'redpill-research-synthesizer': 'workspace-write',
  'redpill-verifier': 'workspace-write',
  'redpill-codebase-mapper': 'workspace-write',
  'redpill-roadmapper': 'workspace-write',
  'redpill-debugger': 'workspace-write',
  'redpill-plan-checker': 'read-only',
  'redpill-integration-checker': 'read-only',
};


// Get version from package.json
const pkg = require('../package.json');

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasOpencode = args.includes('--opencode');
const hasClaude = args.includes('--claude');
const hasCodex = args.includes('--codex');
const hasBoth = args.includes('--both'); // Legacy flag, keeps working
const hasAll = args.includes('--all');
const hasUninstall = args.includes('--uninstall') || args.includes('-u');

// Runtime selection - can be set by flags or interactive prompt
let selectedRuntimes = [];
if (hasAll) {
  selectedRuntimes = ['claude', 'opencode', 'codex'];
} else if (hasBoth) {
  selectedRuntimes = ['claude', 'opencode'];
} else {
  if (hasOpencode) selectedRuntimes.push('opencode');
  if (hasClaude) selectedRuntimes.push('claude');
  if (hasCodex) selectedRuntimes.push('codex');
}

// WSL + Windows Node.js detection
// When Windows-native Node runs on WSL, os.homedir() and path.join() produce
// backslash paths that don't resolve correctly on the Linux filesystem.
if (process.platform === 'win32') {
  let isWSL = false;
  try {
    if (process.env.WSL_DISTRO_NAME) {
      isWSL = true;
    } else if (fs.existsSync('/proc/version')) {
      const procVersion = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
      if (procVersion.includes('microsoft') || procVersion.includes('wsl')) {
        isWSL = true;
      }
    }
  } catch {
    // Ignore read errors — not WSL
  }

  if (isWSL) {
    console.error(`
${yellow}⚠ Detected WSL with Windows-native Node.js.${reset}

This causes path resolution issues that prevent correct installation.
Please install a Linux-native Node.js inside WSL:

  curl -fsSL https://fnm.vercel.app/install | bash
  fnm install --lts

Then re-run: npx redpill-cc@latest
`);
    process.exit(1);
  }
}

// Helper to get directory name for a runtime (used for local/project installs)
function getDirName(runtime) {
  if (runtime === 'opencode') return '.opencode';
  if (runtime === 'codex') return '.codex';
  return '.claude';
}

/**
 * Get the config directory path relative to home directory for a runtime
 * Used for templating hooks that use path.join(homeDir, '<configDir>', ...)
 * @param {string} runtime - 'claude', 'opencode', or 'codex'
 * @param {boolean} isGlobal - Whether this is a global install
 */
function getConfigDirFromHome(runtime, isGlobal) {
  if (!isGlobal) {
    // Local installs use the same dir name pattern
    return `'${getDirName(runtime)}'`;
  }
  // Global installs - OpenCode uses XDG path structure
  if (runtime === 'opencode') {
    // OpenCode: ~/.config/opencode -> '.config', 'opencode'
    // Return as comma-separated for path.join() replacement
    return "'.config', 'opencode'";
  }
  if (runtime === 'codex') return "'.codex'";
  return "'.claude'";
}

/**
 * Get the global config directory for OpenCode
 * OpenCode follows XDG Base Directory spec and uses ~/.config/opencode/
 * Priority: OPENCODE_CONFIG_DIR > dirname(OPENCODE_CONFIG) > XDG_CONFIG_HOME/opencode > ~/.config/opencode
 */
function getOpencodeGlobalDir() {
  // 1. Explicit OPENCODE_CONFIG_DIR env var
  if (process.env.OPENCODE_CONFIG_DIR) {
    return expandTilde(process.env.OPENCODE_CONFIG_DIR);
  }
  
  // 2. OPENCODE_CONFIG env var (use its directory)
  if (process.env.OPENCODE_CONFIG) {
    return path.dirname(expandTilde(process.env.OPENCODE_CONFIG));
  }
  
  // 3. XDG_CONFIG_HOME/opencode
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(expandTilde(process.env.XDG_CONFIG_HOME), 'opencode');
  }
  
  // 4. Default: ~/.config/opencode (XDG default)
  return path.join(os.homedir(), '.config', 'opencode');
}

/**
 * Get the global config directory for a runtime
 * @param {string} runtime - 'claude', 'opencode', or 'codex'
 * @param {string|null} explicitDir - Explicit directory from --config-dir flag
 */
function getGlobalDir(runtime, explicitDir = null) {
  if (runtime === 'opencode') {
    // For OpenCode, --config-dir overrides env vars
    if (explicitDir) {
      return expandTilde(explicitDir);
    }
    return getOpencodeGlobalDir();
  }
  
  if (runtime === 'codex') {
    // Codex: --config-dir > CODEX_HOME > ~/.codex
    if (explicitDir) {
      return expandTilde(explicitDir);
    }
    if (process.env.CODEX_HOME) {
      return expandTilde(process.env.CODEX_HOME);
    }
    return path.join(os.homedir(), '.codex');
  }

  // Claude Code: --config-dir > CLAUDE_CONFIG_DIR > ~/.claude
  if (explicitDir) {
    return expandTilde(explicitDir);
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    return expandTilde(process.env.CLAUDE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.claude');
}

const banner = '\n' + '  Redpill ' + dim + 'v' + pkg.version + reset + '\n' +
  '  A BDD framework for AI-assisted development\n' +
  '  supporting Claude Code, Codex, and OpenCode.\n';

// Parse --config-dir argument
function parseConfigDirArg() {
  const configDirIndex = args.findIndex(arg => arg === '--config-dir' || arg === '-c');
  if (configDirIndex !== -1) {
    const nextArg = args[configDirIndex + 1];
    // Error if --config-dir is provided without a value or next arg is another flag
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${yellow}--config-dir requires a path argument${reset}`);
      process.exit(1);
    }
    return nextArg;
  }
  // Also handle --config-dir=value format
  const configDirArg = args.find(arg => arg.startsWith('--config-dir=') || arg.startsWith('-c='));
  if (configDirArg) {
    const value = configDirArg.split('=')[1];
    if (!value) {
      console.error(`  ${yellow}--config-dir requires a non-empty path${reset}`);
      process.exit(1);
    }
    return value;
  }
  return null;
}
const explicitConfigDir = parseConfigDirArg();
const hasHelp = args.includes('--help') || args.includes('-h');
const forceStatusline = args.includes('--force-statusline');

console.log(banner);

if (hasUninstall) {
  console.log('  Mode: Uninstall\n');
}

// Show help if requested
if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx redpill-cc [options]\n\n  ${yellow}Options:${reset}\n    ${cyan}-g, --global${reset}              Install globally (to config directory)\n    ${cyan}-l, --local${reset}               Install locally (to current directory)\n    ${cyan}--claude${reset}                  Install for Claude Code only\n    ${cyan}--opencode${reset}                Install for OpenCode only\n    ${cyan}--codex${reset}                   Install for Codex only\n    ${cyan}--all${reset}                     Install for all runtimes\n    ${cyan}-u, --uninstall${reset}           Uninstall Redpill (remove all Redpill files)\n    ${cyan}-c, --config-dir <path>${reset}   Specify custom config directory\n    ${cyan}-h, --help${reset}                Show this help message\n    ${cyan}--force-statusline${reset}        Replace existing statusline config\n\n  ${yellow}Examples:${reset}\n    ${dim}# Interactive install (prompts for runtime and location)${reset}\n    npx redpill-cc\n\n    ${dim}# Install for Claude Code globally${reset}\n    npx redpill-cc --claude --global\n\n    ${dim}# Install for Codex globally${reset}\n    npx redpill-cc --codex --global\n\n    ${dim}# Install for OpenCode globally${reset}\n    npx redpill-cc --opencode --global\n\n    ${dim}# Install for all runtimes globally${reset}\n    npx redpill-cc --all --global\n\n    ${dim}# Install to custom config directory${reset}\n    npx redpill-cc --codex --global --config-dir ~/.codex-work\n\n    ${dim}# Install to current project only${reset}\n    npx redpill-cc --claude --local\n\n    ${dim}# Uninstall Redpill from Codex globally${reset}\n    npx redpill-cc --codex --global --uninstall\n\n  ${yellow}Notes:${reset}\n    The --config-dir option is useful when you have multiple configurations.\n    It takes priority over CLAUDE_CONFIG_DIR / CODEX_HOME environment variables.\n`);
  process.exit(0);
}

/**
 * Expand ~ to home directory (shell doesn't expand in env vars passed to node)
 */
function expandTilde(filePath) {
  if (filePath && filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Build a hook command path using forward slashes for cross-platform compatibility.
 * On Windows, $HOME is not expanded by cmd.exe/PowerShell, so we use the actual path.
 */
function buildHookCommand(configDir, hookName) {
  // Use forward slashes for Node.js compatibility on all platforms
  // Do NOT wrap path in quotes — Claude Code hook executor does not use a shell,
  // so quotes would become literal characters in the module path.
  const hooksPath = configDir.replace(/\\/g, '/') + '/hooks/' + hookName;
  return `node ${hooksPath}`;
}

/**
 * Resolve the opencode config file path, preferring .jsonc if it exists.
 */
function resolveOpencodeConfigPath(configDir) {
  const jsoncPath = path.join(configDir, 'opencode.jsonc');
  if (fs.existsSync(jsoncPath)) {
    return jsoncPath;
  }
  return path.join(configDir, 'opencode.json');
}

/**
 * Read and parse settings.json, returning empty object if it doesn't exist
 */
function readSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Write settings.json with proper formatting
 */
function writeSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

// Cache for attribution settings (populated once per runtime during install)
const attributionCache = new Map();

/**
 * Get commit attribution setting for a runtime
 * @param {string} runtime - 'claude', 'opencode', or 'codex'
 * @returns {null|undefined|string} null = remove, undefined = keep default, string = custom
 */
function getCommitAttribution(runtime) {
  // Return cached value if available
  if (attributionCache.has(runtime)) {
    return attributionCache.get(runtime);
  }

  let result;

  if (runtime === 'opencode') {
    const config = readSettings(resolveOpencodeConfigPath(getGlobalDir('opencode', null)));
    result = config.disable_ai_attribution === true ? null : undefined;
  } else if (runtime === 'claude') {
    // Claude Code
    const settings = readSettings(path.join(getGlobalDir('claude', explicitConfigDir), 'settings.json'));
    if (!settings.attribution || settings.attribution.commit === undefined) {
      result = undefined;
    } else if (settings.attribution.commit === '') {
      result = null;
    } else {
      result = settings.attribution.commit;
    }
  } else {
    // Codex currently has no attribution setting equivalent
    result = undefined;
  }

  // Cache and return
  attributionCache.set(runtime, result);
  return result;
}

/**
 * Process Co-Authored-By lines based on attribution setting
 * @param {string} content - File content to process
 * @param {null|undefined|string} attribution - null=remove, undefined=keep, string=replace
 * @returns {string} Processed content
 */
function processAttribution(content, attribution) {
  if (attribution === null) {
    // Remove Co-Authored-By lines and the preceding blank line
    return content.replace(/(\r?\n){2}Co-Authored-By:.*$/gim, '');
  }
  if (attribution === undefined) {
    return content;
  }
  // Replace with custom attribution (escape $ to prevent backreference injection)
  const safeAttribution = attribution.replace(/\$/g, '$$$$');
  return content.replace(/Co-Authored-By:.*$/gim, `Co-Authored-By: ${safeAttribution}`);
}

/**
 * Convert Claude Code frontmatter to opencode format
 * - Converts 'allowed-tools:' array to 'permission:' object
 * @param {string} content - Markdown file content with YAML frontmatter
 * @returns {string} - Content with converted frontmatter
 */
// Color name to hex mapping for opencode compatibility
const colorNameToHex = {
  cyan: '#00FFFF',
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  magenta: '#FF00FF',
  orange: '#FFA500',
  purple: '#800080',
  pink: '#FFC0CB',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
};

// Tool name mapping from Claude Code to OpenCode
// OpenCode uses lowercase tool names; special mappings for renamed tools
const claudeToOpencodeTools = {
  AskUserQuestion: 'question',
  SlashCommand: 'skill',
  TodoWrite: 'todowrite',
  WebFetch: 'webfetch',
  WebSearch: 'websearch',  // Plugin/MCP - keep for compatibility
};


/**
 * Convert a Claude Code tool name to OpenCode format
 * - Applies special mappings (AskUserQuestion -> question, etc.)
 * - Converts to lowercase (except MCP tools which keep their format)
 */
function convertToolName(claudeTool) {
  // Check for special mapping first
  if (claudeToOpencodeTools[claudeTool]) {
    return claudeToOpencodeTools[claudeTool];
  }
  // MCP tools (mcp__*) keep their format
  if (claudeTool.startsWith('mcp__')) {
    return claudeTool;
  }
  // Default: convert to lowercase
  return claudeTool.toLowerCase();
}




function toSingleLine(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function yamlQuote(value) {
  return JSON.stringify(value);
}

function yamlIdentifier(value) {
  const text = String(value).trim();
  if (/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(text)) {
    return text;
  }
  return yamlQuote(text);
}

function extractFrontmatterAndBody(content) {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  return {
    frontmatter: content.substring(3, endIndex).trim(),
    body: content.substring(endIndex + 3),
  };
}

function extractFrontmatterField(frontmatter, fieldName) {
  const regex = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
  const match = frontmatter.match(regex);
  if (!match) return null;
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}



function convertSlashCommandsToCodexSkillMentions(content) {
  let converted = content.replace(/\/redpill:([a-z0-9-]+)/gi, (_, commandName) => {
    return `$redpill-${String(commandName).toLowerCase()}`;
  });
  converted = converted.replace(/\/redpill-help\b/g, '$redpill-help');
  return converted;
}

function convertClaudeToCodexMarkdown(content) {
  let converted = convertSlashCommandsToCodexSkillMentions(content);
  converted = converted.replace(/\$ARGUMENTS\b/g, '{{REDPILL_ARGS}}');
  // Runtime-neutral agent name replacement (#766)
  converted = neutralizeAgentReferences(converted, 'AGENTS.md');
  return converted;
}

function getCodexSkillAdapterHeader(skillName) {
  const invocation = `$${skillName}`;
  return `<codex_skill_adapter>
## A. Skill Invocation
- This skill is invoked by mentioning \`${invocation}\`.
- Treat all user text after \`${invocation}\` as \`{{REDPILL_ARGS}}\`.
- If no arguments are present, treat \`{{REDPILL_ARGS}}\` as empty.

## B. AskUserQuestion → request_user_input Mapping
Redpill workflows use \`AskUserQuestion\` (Claude Code syntax). Translate to Codex \`request_user_input\`:

Parameter mapping:
- \`header\` → \`header\`
- \`question\` → \`question\`
- Options formatted as \`"Label" — description\` → \`{label: "Label", description: "description"}\`
- Generate \`id\` from header: lowercase, replace spaces with underscores

Batched calls:
- \`AskUserQuestion([q1, q2])\` → single \`request_user_input\` with multiple entries in \`questions[]\`

Multi-select workaround:
- Codex has no \`multiSelect\`. Use sequential single-selects, or present a numbered freeform list asking the user to enter comma-separated numbers.

Execute mode fallback:
- When \`request_user_input\` is rejected (Execute mode), present a plain-text numbered list and pick a reasonable default.

## C. Task() → spawn_agent Mapping
Redpill workflows use \`Task(...)\` (Claude Code syntax). Translate to Codex collaboration tools:

Direct mapping:
- \`Task(subagent_type="X", prompt="Y")\` → \`spawn_agent(agent_type="X", message="Y")\`
- \`Task(model="...")\` → omit (Codex uses per-role config, not inline model selection)
- \`fork_context: false\` by default — Redpill agents load their own context via \`<files_to_read>\` blocks

Parallel fan-out:
- Spawn multiple agents → collect agent IDs → \`wait(ids)\` for all to complete

Result parsing:
- Look for structured markers in agent output: \`CHECKPOINT\`, \`PLAN COMPLETE\`, \`SUMMARY\`, etc.
- \`close_agent(id)\` after collecting results from each agent
</codex_skill_adapter>`;
}

function convertClaudeCommandToCodexSkill(content, skillName) {
  const converted = convertClaudeToCodexMarkdown(content);
  const { frontmatter, body } = extractFrontmatterAndBody(converted);
  let description = `Run Redpill workflow ${skillName}.`;
  if (frontmatter) {
    const maybeDescription = extractFrontmatterField(frontmatter, 'description');
    if (maybeDescription) {
      description = maybeDescription;
    }
  }
  description = toSingleLine(description);
  const shortDescription = description.length > 180 ? `${description.slice(0, 177)}...` : description;
  const adapter = getCodexSkillAdapterHeader(skillName);

  return `---\nname: ${yamlQuote(skillName)}\ndescription: ${yamlQuote(description)}\nmetadata:\n  short-description: ${yamlQuote(shortDescription)}\n---\n\n${adapter}\n\n${body.trimStart()}`;
}

/**
 * Convert Claude Code agent markdown to Codex agent format.
 * Applies base markdown conversions, then adds a <codex_agent_role> header
 * and cleans up frontmatter (removes tools/color fields).
 */
function convertClaudeAgentToCodexAgent(content) {
  let converted = convertClaudeToCodexMarkdown(content);

  const { frontmatter, body } = extractFrontmatterAndBody(converted);
  if (!frontmatter) return converted;

  const name = extractFrontmatterField(frontmatter, 'name') || 'unknown';
  const description = extractFrontmatterField(frontmatter, 'description') || '';
  const tools = extractFrontmatterField(frontmatter, 'tools') || '';

  const roleHeader = `<codex_agent_role>
role: ${name}
tools: ${tools}
purpose: ${toSingleLine(description)}
</codex_agent_role>`;

  const cleanFrontmatter = `---\nname: ${yamlQuote(name)}\ndescription: ${yamlQuote(toSingleLine(description))}\n---`;

  return `${cleanFrontmatter}\n\n${roleHeader}\n${body}`;
}

/**
 * Generate a per-agent .toml config file for Codex.
 * Sets required agent metadata, sandbox_mode, and developer_instructions
 * from the agent markdown content.
 */
function generateCodexAgentToml(agentName, agentContent) {
  const sandboxMode = CODEX_AGENT_SANDBOX[agentName] || 'read-only';
  const { frontmatter, body } = extractFrontmatterAndBody(agentContent);
  const frontmatterText = frontmatter || '';
  const resolvedName = extractFrontmatterField(frontmatterText, 'name') || agentName;
  const resolvedDescription = toSingleLine(
    extractFrontmatterField(frontmatterText, 'description') || `Redpill agent ${resolvedName}`
  );
  const instructions = body.trim();

  const lines = [
    `name = ${JSON.stringify(resolvedName)}`,
    `description = ${JSON.stringify(resolvedDescription)}`,
    `sandbox_mode = "${sandboxMode}"`,
    // Agent prompts contain raw backslashes in regexes and shell snippets.
    // TOML literal multiline strings preserve them without escape parsing.
    `developer_instructions = '''`,
    instructions,
    `'''`,
  ];
  return lines.join('\n') + '\n';
}

/**
 * Generate the Redpill config block for Codex config.toml.
 * @param {Array<{name: string, description: string}>} agents
 */
function generateCodexConfigBlock(agents, targetDir) {
  // Use absolute paths when targetDir is provided — Codex ≥0.116 requires
  // AbsolutePathBuf for config_file and cannot resolve relative paths.
  const agentsPrefix = targetDir
    ? path.join(targetDir, 'agents').replace(/\\/g, '/')
    : 'agents';
  const lines = [
    REDPILL_CODEX_MARKER,
    '',
  ];

  for (const { name, description } of agents) {
    lines.push(`[agents.${name}]`);
    lines.push(`description = ${JSON.stringify(description)}`);
    lines.push(`config_file = "${agentsPrefix}/${name}.toml"`);
    lines.push('');
  }

  return lines.join('\n');
}

function stripCodexGsdAgentSections(content) {
  return content.replace(/^\[agents\.redpill-[^\]]+\]\n(?:(?!\[)[^\n]*\n?)*/gm, '');
}

/**
 * Strip Redpill sections from Codex config.toml content.
 * Returns cleaned content, or null if file would be empty.
 */
function stripGsdFromCodexConfig(content) {
  const eol = detectLineEnding(content);
  const markerIndex = content.indexOf(REDPILL_CODEX_MARKER);
  const codexHooksOwnership = getManagedCodexHooksOwnership(content);

  if (markerIndex !== -1) {
    // Has Redpill marker — remove everything from marker to EOF
    let before = content.substring(0, markerIndex);
    before = stripCodexHooksFeatureAssignments(before, codexHooksOwnership);
    // Also strip Redpill-injected feature keys above the marker (Case 3 inject)
    before = before.replace(/^multi_agent\s*=\s*true\s*(?:\r?\n)?/m, '');
    before = before.replace(/^default_mode_request_user_input\s*=\s*true\s*(?:\r?\n)?/m, '');
    before = before.replace(/^\[features\]\s*\n(?=\[|$)/m, '');
    before = before.replace(/^\[agents\]\s*\n(?=\[|$)/m, '');
    before = before.replace(/^(?:\r?\n)+/, '').trimEnd();
    if (!before) return null;
    return before + eol;
  }

  // No marker but may have Redpill-injected feature keys
  let cleaned = content;
  cleaned = stripCodexHooksFeatureAssignments(cleaned, codexHooksOwnership);
  cleaned = cleaned.replace(/^multi_agent\s*=\s*true\s*(?:\r?\n)?/m, '');
  cleaned = cleaned.replace(/^default_mode_request_user_input\s*=\s*true\s*(?:\r?\n)?/m, '');

  // Remove [agents.redpill-*] sections (from header to next section or EOF)
  cleaned = stripCodexGsdAgentSections(cleaned);

  // Remove [features] section if now empty (only header, no keys before next section)
  cleaned = cleaned.replace(/^\[features\]\s*\n(?=\[|$)/m, '');

  // Remove [agents] section if now empty
  cleaned = cleaned.replace(/^\[agents\]\s*\n(?=\[|$)/m, '');

  cleaned = cleaned.replace(/^(?:\r?\n)+/, '').trimEnd();

  if (!cleaned) return null;
  return cleaned + eol;
}

function detectLineEnding(content) {
  const firstNewlineIndex = content.indexOf('\n');
  if (firstNewlineIndex === -1) {
    return '\n';
  }
  return firstNewlineIndex > 0 && content[firstNewlineIndex - 1] === '\r' ? '\r\n' : '\n';
}

function splitTomlLines(content) {
  const lines = [];
  let start = 0;

  while (start < content.length) {
    const newlineIndex = content.indexOf('\n', start);
    if (newlineIndex === -1) {
      lines.push({
        start,
        end: content.length,
        text: content.slice(start),
        eol: '',
      });
      break;
    }

    const hasCr = newlineIndex > start && content[newlineIndex - 1] === '\r';
    const end = hasCr ? newlineIndex - 1 : newlineIndex;
    lines.push({
      start,
      end,
      text: content.slice(start, end),
      eol: hasCr ? '\r\n' : '\n',
    });
    start = newlineIndex + 1;
  }

  return lines;
}

function findTomlCommentStart(line) {
  let i = 0;
  let multilineState = null;

  while (i < line.length) {
    if (multilineState === 'literal') {
      const closeIndex = line.indexOf('\'\'\'', i);
      if (closeIndex === -1) {
        return -1;
      }
      i = closeIndex + 3;
      multilineState = null;
      continue;
    }

    if (multilineState === 'basic') {
      const closeIndex = findMultilineBasicStringClose(line, i);
      if (closeIndex === -1) {
        return -1;
      }
      i = closeIndex + 3;
      multilineState = null;
      continue;
    }

    const ch = line[i];

    if (ch === '#') {
      return i;
    }

    if (ch === '\'') {
      if (line.startsWith('\'\'\'', i)) {
        multilineState = 'literal';
        i += 3;
        continue;
      }
      const close = line.indexOf('\'', i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }

    if (ch === '"') {
      if (line.startsWith('"""', i)) {
        multilineState = 'basic';
        i += 3;
        continue;
      }
      i += 1;
      while (i < line.length) {
        if (line[i] === '\\') {
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  return -1;
}

function isEscapedInBasicString(line, index) {
  let slashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && line[cursor] === '\\') {
    slashCount += 1;
    cursor -= 1;
  }

  return slashCount % 2 === 1;
}

function findMultilineBasicStringClose(line, startIndex) {
  let searchIndex = startIndex;

  while (searchIndex < line.length) {
    const closeIndex = line.indexOf('"""', searchIndex);
    if (closeIndex === -1) {
      return -1;
    }
    if (!isEscapedInBasicString(line, closeIndex)) {
      return closeIndex;
    }
    searchIndex = closeIndex + 1;
  }

  return -1;
}

function advanceTomlMultilineStringState(line, multilineState) {
  let i = 0;
  let state = multilineState;

  while (i < line.length) {
    if (state === 'literal') {
      const closeIndex = line.indexOf('\'\'\'', i);
      if (closeIndex === -1) {
        return state;
      }
      i = closeIndex + 3;
      state = null;
      continue;
    }

    if (state === 'basic') {
      const closeIndex = findMultilineBasicStringClose(line, i);
      if (closeIndex === -1) {
        return state;
      }
      i = closeIndex + 3;
      state = null;
      continue;
    }

    const ch = line[i];

    if (ch === '#') {
      return state;
    }

    if (ch === '\'') {
      if (line.startsWith('\'\'\'', i)) {
        state = 'literal';
        i += 3;
        continue;
      }
      const close = line.indexOf('\'', i + 1);
      if (close === -1) {
        return state;
      }
      i = close + 1;
      continue;
    }

    if (ch === '"') {
      if (line.startsWith('"""', i)) {
        state = 'basic';
        i += 3;
        continue;
      }
      i += 1;
      while (i < line.length) {
        if (line[i] === '\\') {
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  return state;
}

function parseTomlBracketHeader(line, array) {
  let i = 0;

  while (i < line.length && /\s/.test(line[i])) {
    i += 1;
  }

  const open = array ? '[[' : '[';
  const close = array ? ']]' : ']';
  if (!line.startsWith(open, i)) {
    return null;
  }

  i += open.length;
  const start = i;

  while (i < line.length) {
    if (line[i] === '\'' || line[i] === '"') {
      const quote = line[i];
      i += 1;

      while (i < line.length) {
        if (quote === '"' && line[i] === '\\') {
          i += 2;
          continue;
        }

        if (line[i] === quote) {
          i += 1;
          break;
        }

        i += 1;
      }

      continue;
    }

    if (line.startsWith(close, i)) {
      const rawPath = line.slice(start, i).trim();
      const segments = parseTomlKeyPath(rawPath);
      if (!segments) {
        return null;
      }

      i += close.length;
      while (i < line.length && /\s/.test(line[i])) {
        i += 1;
      }

      if (i < line.length && line[i] !== '#') {
        return null;
      }

      return { path: segments.join('.'), segments, array };
    }

    if (line[i] === '#' || line[i] === '\r' || line[i] === '\n') {
      return null;
    }

    i += 1;
  }

  return null;
}

function parseTomlTableHeader(line) {
  return parseTomlBracketHeader(line, true) || parseTomlBracketHeader(line, false);
}

function findTomlAssignmentEquals(line) {
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === '#') {
      return -1;
    }

    if (ch === '\'') {
      i += 1;
      while (i < line.length) {
        if (line[i] === '\'') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      i += 1;
      while (i < line.length) {
        if (line[i] === '\\') {
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '=') {
      return i;
    }

    i += 1;
  }

  return -1;
}

function parseTomlKeyPath(keyText) {
  const segments = [];
  let i = 0;

  while (i < keyText.length) {
    while (i < keyText.length && /\s/.test(keyText[i])) {
      i += 1;
    }

    if (i >= keyText.length) {
      break;
    }

    if (keyText[i] === '\'' || keyText[i] === '"') {
      const quote = keyText[i];
      let segment = '';
      let closed = false;
      i += 1;

      while (i < keyText.length) {
        if (quote === '"' && keyText[i] === '\\') {
          if (i + 1 >= keyText.length) {
            return null;
          }
          segment += keyText[i + 1];
          i += 2;
          continue;
        }

        if (keyText[i] === quote) {
          i += 1;
          closed = true;
          break;
        }

        segment += keyText[i];
        i += 1;
      }

      if (!closed) {
        return null;
      }

      segments.push(segment);
    } else {
      const match = keyText.slice(i).match(/^[A-Za-z0-9_-]+/);
      if (!match) {
        return null;
      }
      segments.push(match[0]);
      i += match[0].length;
    }

    while (i < keyText.length && /\s/.test(keyText[i])) {
      i += 1;
    }

    if (i >= keyText.length) {
      break;
    }

    if (keyText[i] !== '.') {
      return null;
    }

    i += 1;
  }

  return segments.length > 0 ? segments : null;
}

function parseTomlKey(line) {
  const header = parseTomlTableHeader(line);
  if (header) {
    return null;
  }

  const equalsIndex = findTomlAssignmentEquals(line);
  if (equalsIndex === -1) {
    return null;
  }

  const raw = line.slice(0, equalsIndex).trim();
  const segments = parseTomlKeyPath(raw);
  if (!segments) {
    return null;
  }

  return { raw, segments };
}

function getTomlLineRecords(content) {
  const lines = splitTomlLines(content);
  const records = [];
  let currentTablePath = null;
  let multilineState = null;

  for (const line of lines) {
    const startsInMultilineString = multilineState !== null;
    const record = {
      ...line,
      startsInMultilineString,
      tablePath: currentTablePath,
      tableHeader: null,
      keySegments: null,
    };

    if (!startsInMultilineString) {
      const header = parseTomlTableHeader(line.text);
      if (header) {
        record.tableHeader = header;
        currentTablePath = header.path;
      } else {
        const key = parseTomlKey(line.text);
        record.keySegments = key ? key.segments : null;
        record.keyRaw = key ? key.raw : null;
      }
    }

    multilineState = advanceTomlMultilineStringState(line.text, multilineState);
    records.push(record);
  }

  return records;
}

function getTomlTableSections(content) {
  const headerLines = getTomlLineRecords(content).filter((record) => record.tableHeader);

  return headerLines.map((record, index) => ({
    path: record.tableHeader.path,
    array: record.tableHeader.array,
    start: record.start,
    headerEnd: record.end + record.eol.length,
    end: index + 1 < headerLines.length ? headerLines[index + 1].start : content.length,
  }));
}

function collapseTomlBlankLines(content) {
  const eol = detectLineEnding(content);
  return content.replace(/(?:\r?\n){3,}/g, eol + eol);
}

function removeContentRanges(content, ranges) {
  const normalizedRanges = ranges
    .filter((range) => range && range.start < range.end)
    .sort((a, b) => a.start - b.start);

  if (normalizedRanges.length === 0) {
    return content;
  }

  const mergedRanges = [{ ...normalizedRanges[0] }];

  for (let i = 1; i < normalizedRanges.length; i += 1) {
    const current = normalizedRanges[i];
    const previous = mergedRanges[mergedRanges.length - 1];

    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    mergedRanges.push({ ...current });
  }

  let cleaned = '';
  let cursor = 0;

  for (const range of mergedRanges) {
    cleaned += content.slice(cursor, range.start);
    cursor = range.end;
  }

  cleaned += content.slice(cursor);
  return cleaned;
}

function stripCodexHooksFeatureAssignments(content, ownership = null) {
  const lineRecords = getTomlLineRecords(content);
  const tableSections = getTomlTableSections(content);
  const removalRanges = [];
  const featuresSection = tableSections.find((section) => !section.array && section.path === 'features');
  const shouldStripSectionKey = ownership === 'section' || ownership === 'all';
  const shouldStripRootDottedKey = ownership === 'root_dotted' || ownership === 'all';

  if (featuresSection && shouldStripSectionKey) {
    const sectionRecords = lineRecords.filter((record) =>
      !record.tableHeader &&
      record.start >= featuresSection.headerEnd &&
      record.end + record.eol.length <= featuresSection.end
    );

    const codexHookRecords = sectionRecords.filter((record) =>
      !record.startsInMultilineString &&
      record.keySegments &&
      record.keySegments.length === 1 &&
      record.keySegments[0] === 'codex_hooks'
    );

    for (const record of codexHookRecords) {
      removalRanges.push({
        start: record.start,
        end: findTomlAssignmentBlockEnd(content, record),
      });
    }

    if (codexHookRecords.length > 0) {
      const removedStarts = new Set(codexHookRecords.map((record) => record.start));
      const hasRemainingContent = sectionRecords.some((record) => {
        if (removedStarts.has(record.start)) {
          return false;
        }

        const trimmed = record.text.trim();
        return trimmed !== '' && !trimmed.startsWith('#');
      });
      const hasRemainingComments = sectionRecords.some((record) => {
        if (removedStarts.has(record.start)) {
          return false;
        }

        return record.text.trim().startsWith('#');
      });

      if (!hasRemainingContent && !hasRemainingComments) {
        removalRanges.push({
          start: featuresSection.start,
          end: featuresSection.end,
        });
      }
    }
  }

  if (shouldStripRootDottedKey) {
    const rootCodexHookRecords = lineRecords.filter((record) =>
      !record.tableHeader &&
      !record.startsInMultilineString &&
      record.tablePath === null &&
      record.keySegments &&
      record.keySegments.length === 2 &&
      record.keySegments[0] === 'features' &&
      record.keySegments[1] === 'codex_hooks'
    );

    for (const record of rootCodexHookRecords) {
      removalRanges.push({
        start: record.start,
        end: findTomlAssignmentBlockEnd(content, record),
      });
    }
  }

  return removeContentRanges(content, removalRanges);
}

function getManagedCodexHooksOwnership(content) {
  const markerIndex = content.indexOf(REDPILL_CODEX_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = content.slice(markerIndex + REDPILL_CODEX_MARKER.length);
  const match = afterMarker.match(/^\r?\n# Redpill codex_hooks ownership: (section|root_dotted)\r?\n/);
  return match ? match[1] : null;
}

function setManagedCodexHooksOwnership(content, ownership) {
  const markerIndex = content.indexOf(REDPILL_CODEX_MARKER);
  if (markerIndex === -1) {
    return content;
  }

  const eol = detectLineEnding(content);
  const markerEnd = markerIndex + REDPILL_CODEX_MARKER.length;
  const afterMarker = content.slice(markerEnd);
  const normalizedAfterMarker = afterMarker.replace(
    /^\r?\n# Redpill codex_hooks ownership: (?:section|root_dotted)\r?\n/,
    eol
  );

  if (!ownership) {
    return content.slice(0, markerEnd) + normalizedAfterMarker;
  }

  const remainder = normalizedAfterMarker.replace(/^\r?\n/, '');
  return content.slice(0, markerEnd) +
    eol +
    `${REDPILL_CODEX_HOOKS_OWNERSHIP_PREFIX}${ownership}${eol}` +
    remainder;
}

function isLegacyGsdAgentsSection(body) {
  const lineRecords = getTomlLineRecords(body);
  const legacyKeys = new Set(['max_threads', 'max_depth']);
  let sawLegacyKey = false;

  for (const record of lineRecords) {
    if (record.startsInMultilineString) {
      return false;
    }

    if (record.tableHeader) {
      return false;
    }

    const trimmed = record.text.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (!record.keySegments || record.keySegments.length !== 1 || !legacyKeys.has(record.keySegments[0])) {
      return false;
    }

    sawLegacyKey = true;
  }

  return sawLegacyKey;
}

function stripLeakedGsdCodexSections(content) {
  const leakedSections = getTomlTableSections(content)
    .filter((section) =>
      section.path.startsWith('agents.redpill-') ||
      (
        section.path === 'agents' &&
        isLegacyGsdAgentsSection(content.slice(section.headerEnd, section.end))
      )
    );

  if (leakedSections.length === 0) {
    return content;
  }

  let cleaned = '';
  let cursor = 0;

  for (const section of leakedSections) {
    cleaned += content.slice(cursor, section.start);
    cursor = section.end;
  }

  cleaned += content.slice(cursor);
  return collapseTomlBlankLines(cleaned);
}

function normalizeCodexHooksLine(line, key) {
  const leadingWhitespace = line.match(/^\s*/)[0];
  const commentStart = findTomlCommentStart(line);
  const comment = commentStart === -1 ? '' : line.slice(commentStart);
  return `${leadingWhitespace}${key} = true${comment ? ` ${comment}` : ''}`;
}

function findTomlAssignmentBlockEnd(content, record) {
  const equalsIndex = findTomlAssignmentEquals(record.text);
  if (equalsIndex === -1) {
    return record.end + record.eol.length;
  }

  let i = record.start + equalsIndex + 1;
  let arrayDepth = 0;
  let inlineTableDepth = 0;

  while (i < content.length) {
    if (content.startsWith('\'\'\'', i)) {
      const closeIndex = content.indexOf('\'\'\'', i + 3);
      if (closeIndex === -1) {
        return content.length;
      }
      i = closeIndex + 3;
      continue;
    }

    if (content.startsWith('"""', i)) {
      const closeIndex = findMultilineBasicStringClose(content, i + 3);
      if (closeIndex === -1) {
        return content.length;
      }
      i = closeIndex + 3;
      continue;
    }

    const ch = content[i];

    if (ch === '\'') {
      i += 1;
      while (i < content.length) {
        if (content[i] === '\'') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      i += 1;
      while (i < content.length) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        if (content[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '[') {
      arrayDepth += 1;
      i += 1;
      continue;
    }

    if (ch === ']') {
      if (arrayDepth > 0) {
        arrayDepth -= 1;
      }
      i += 1;
      continue;
    }

    if (ch === '{') {
      inlineTableDepth += 1;
      i += 1;
      continue;
    }

    if (ch === '}') {
      if (inlineTableDepth > 0) {
        inlineTableDepth -= 1;
      }
      i += 1;
      continue;
    }

    if (ch === '#') {
      while (i < content.length && content[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (ch === '\n' && arrayDepth === 0 && inlineTableDepth === 0) {
      return i + 1;
    }

    i += 1;
  }

  return content.length;
}

function rewriteTomlKeyLines(content, matches, key) {
  if (matches.length === 0) {
    return content;
  }

  let rewritten = '';
  let cursor = 0;

  matches.forEach((match, index) => {
    rewritten += content.slice(cursor, match.start);
    if (index === 0) {
      const blockEnd = findTomlAssignmentBlockEnd(content, match);
      const blockEol = blockEnd > 0 && content[blockEnd - 1] === '\n'
        ? (blockEnd > 1 && content[blockEnd - 2] === '\r' ? '\r\n' : '\n')
        : '';
      rewritten += normalizeCodexHooksLine(match.text, match.keyRaw || key) + blockEol;
      cursor = blockEnd;
      return;
    }
    cursor = findTomlAssignmentBlockEnd(content, match);
  });

  rewritten += content.slice(cursor);
  return rewritten;
}

/**
 * Merge Redpill config block into an existing or new config.toml.
 * Three cases: new file, existing with Redpill marker, existing without marker.
 */
function mergeCodexConfig(configPath, redpillBlock) {
  // Case 1: No config.toml — create fresh
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, redpillBlock + '\n');
    return;
  }

  const existing = fs.readFileSync(configPath, 'utf8');
  const eol = detectLineEnding(existing);
  const normalizedRedpillBlock = redpillBlock.replace(/\r?\n/g, eol);
  const markerIndex = existing.indexOf(REDPILL_CODEX_MARKER);

  // Case 2: Has Redpill marker — truncate and re-append
  if (markerIndex !== -1) {
    let before = existing.substring(0, markerIndex).trimEnd();
    if (before) {
      // Strip any Redpill-managed sections that leaked above the marker from previous installs
      before = stripLeakedGsdCodexSections(before).trimEnd();

      fs.writeFileSync(configPath, before + eol + eol + normalizedRedpillBlock + eol);
    } else {
      fs.writeFileSync(configPath, normalizedRedpillBlock + eol);
    }
    return;
  }

  // Case 3: No marker — append Redpill block
  let content = stripLeakedGsdCodexSections(existing).trimEnd();
  if (content) {
    content = content + eol + eol + normalizedRedpillBlock + eol;
  } else {
    content = normalizedRedpillBlock + eol;
  }

  fs.writeFileSync(configPath, content);
}

/**
 * Repair config.toml files corrupted by pre-#1346 Redpill installs.
 * Non-boolean keys (e.g. model = "gpt-5.3-codex") that ended up under [features]
 * are relocated before the [features] header so Codex can parse them correctly.
 * Returns the content unchanged if no trapped keys are found.
 */
function repairTrappedFeaturesKeys(content) {
  const eol = detectLineEnding(content);
  const lineRecords = getTomlLineRecords(content);
  const featuresSection = getTomlTableSections(content)
    .find((section) => !section.array && section.path === 'features');

  if (!featuresSection) {
    return content;
  }

  // Find non-boolean key-value lines inside [features] that don't belong there.
  // Boolean keys (codex_hooks, multi_agent, etc.) are legitimate feature flags.
  const trappedLines = lineRecords.filter((record) => {
    if (record.tableHeader || record.startsInMultilineString) return false;
    if (record.tablePath !== 'features') return false;
    if (record.start < featuresSection.headerEnd) return false;
    if (record.end + record.eol.length > featuresSection.end) return false;
    if (!record.keySegments || record.keySegments.length === 0) return false;

    // Check if the value is a boolean — if so, it belongs under [features]
    const equalsIndex = findTomlAssignmentEquals(record.text);
    if (equalsIndex === -1) return false;
    const commentStart = findTomlCommentStart(record.text);
    const valueText = record.text
      .slice(equalsIndex + 1, commentStart === -1 ? record.text.length : commentStart)
      .trim();
    if (valueText === 'true' || valueText === 'false') return false;

    // Skip values that start a multiline string — they may legitimately live
    // under [features] and spanning multiple lines makes relocation unsafe.
    if (valueText.startsWith("'''") || valueText.startsWith('"""')) return false;

    // Non-boolean value — this key is trapped
    return true;
  });

  if (trappedLines.length === 0) {
    return content;
  }

  // Build the relocated text block from trapped lines
  const relocatedText = trappedLines.map((r) => r.text).join(eol) + eol;

  // Remove trapped lines from their current positions (with their EOLs)
  const removalRanges = trappedLines.map((r) => ({
    start: r.start,
    end: r.end + r.eol.length,
  }));
  let cleaned = removeContentRanges(content, removalRanges);

  // Collapse any runs of 3+ blank lines left behind
  cleaned = collapseTomlBlankLines(cleaned);

  // Re-locate the [features] header in the cleaned content
  const cleanedRecords = getTomlLineRecords(cleaned);
  const cleanedFeaturesHeader = cleanedRecords.find(
    (r) => r.tableHeader && r.tableHeader.path === 'features' && !r.tableHeader.array
  );

  if (!cleanedFeaturesHeader) {
    return cleaned;
  }

  // Insert relocated keys before [features]
  const before = cleaned.slice(0, cleanedFeaturesHeader.start);
  const after = cleaned.slice(cleanedFeaturesHeader.start);
  const needsGap = before.length > 0 && !before.endsWith(eol + eol);
  const trailingGap = after.length > 0 && !relocatedText.endsWith(eol + eol) ? eol : '';

  return before + (needsGap ? eol : '') + relocatedText + trailingGap + after;
}

function ensureCodexHooksFeature(configContent) {
  const eol = detectLineEnding(configContent);
  const lineRecords = getTomlLineRecords(configContent);

  const featuresSection = getTomlTableSections(configContent)
    .find((section) => !section.array && section.path === 'features');

  if (featuresSection) {
    const sectionLines = lineRecords
      .filter((record) =>
        !record.tableHeader &&
        !record.startsInMultilineString &&
        record.tablePath === 'features' &&
        record.start >= featuresSection.headerEnd &&
        record.end + record.eol.length <= featuresSection.end &&
        record.keySegments &&
        record.keySegments.length === 1 &&
        record.keySegments[0] === 'codex_hooks'
      );

    if (sectionLines.length > 0) {
      const rewritten = rewriteTomlKeyLines(configContent, sectionLines, 'codex_hooks');
      return {
        content: repairTrappedFeaturesKeys(rewritten),
        ownership: null,
      };
    }

    const sectionBody = configContent.slice(featuresSection.headerEnd, featuresSection.end);
    const needsSeparator = sectionBody.length > 0 && !sectionBody.endsWith('\n') && !sectionBody.endsWith('\r\n');
    const insertPrefix = sectionBody.length === 0 && featuresSection.headerEnd === configContent.length ? eol : '';
    const insertText = `${insertPrefix}${needsSeparator ? eol : ''}codex_hooks = true${eol}`;
    const merged = configContent.slice(0, featuresSection.end) + insertText + configContent.slice(featuresSection.end);
    return {
      content: repairTrappedFeaturesKeys(merged),
      ownership: 'section',
    };
  }

  const rootFeatureLines = lineRecords
    .filter((record) =>
      !record.tableHeader &&
      !record.startsInMultilineString &&
      record.tablePath === null &&
      record.keySegments &&
      record.keySegments[0] === 'features'
    );

  const rootCodexHooksLines = rootFeatureLines
    .filter((record) => record.keySegments.length === 2 && record.keySegments[1] === 'codex_hooks');

  if (rootCodexHooksLines.length > 0) {
    return {
      content: rewriteTomlKeyLines(configContent, rootCodexHooksLines, 'features.codex_hooks'),
      ownership: null,
    };
  }

  const rootFeaturesValueLines = rootFeatureLines
    .filter((record) => record.keySegments.length === 1);

  if (rootFeaturesValueLines.length > 0) {
    return { content: configContent, ownership: null };
  }

  if (rootFeatureLines.length > 0) {
    const lastFeatureLine = rootFeatureLines[rootFeatureLines.length - 1];
    const insertAt = findTomlAssignmentBlockEnd(configContent, lastFeatureLine);
    const prefix = insertAt > 0 && configContent[insertAt - 1] === '\n' ? '' : eol;
    return {
      content: configContent.slice(0, insertAt) +
        `${prefix}features.codex_hooks = true${eol}` +
        configContent.slice(insertAt),
      ownership: 'root_dotted',
    };
  }

  const featuresBlock = `[features]${eol}codex_hooks = true${eol}`;
  if (!configContent) {
    return { content: featuresBlock, ownership: 'section' };
  }
  // Insert [features] before the first table header, preserving bare top-level keys.
  // Prepending would trap them under [features] where Codex expects only booleans (#1202).
  const firstTableHeader = lineRecords.find(r => r.tableHeader);
  if (firstTableHeader) {
    const before = configContent.slice(0, firstTableHeader.start);
    const after = configContent.slice(firstTableHeader.start);
    const needsGap = before.length > 0 && !before.endsWith(eol + eol);
    return {
      content: before + (needsGap ? eol : '') + featuresBlock + eol + after,
      ownership: 'section',
    };
  }
  // No table headers — append [features] after top-level keys
  const needsGap = configContent.length > 0 && !configContent.endsWith(eol + eol);
  return { content: configContent + (needsGap ? eol : '') + featuresBlock, ownership: 'section' };
}

function hasEnabledCodexHooksFeature(configContent) {
  const lineRecords = getTomlLineRecords(configContent);

  return lineRecords.some((record) => {
    if (record.tableHeader || record.startsInMultilineString || !record.keySegments) {
      return false;
    }

    const isSectionKey = record.tablePath === 'features' &&
      record.keySegments.length === 1 &&
      record.keySegments[0] === 'codex_hooks';
    const isRootDottedKey = record.tablePath === null &&
      record.keySegments.length === 2 &&
      record.keySegments[0] === 'features' &&
      record.keySegments[1] === 'codex_hooks';

    if (!isSectionKey && !isRootDottedKey) {
      return false;
    }

    const equalsIndex = findTomlAssignmentEquals(record.text);
    if (equalsIndex === -1) {
      return false;
    }

    const commentStart = findTomlCommentStart(record.text);
    const valueText = record.text.slice(equalsIndex + 1, commentStart === -1 ? record.text.length : commentStart).trim();
    return valueText === 'true';
  });
}


/**
 * Generate config.toml and per-agent .toml files for Codex.
 * Reads agent .md files from source, extracts metadata, writes .toml configs.
 */
function installCodexConfig(targetDir, agentsSrc) {
  const configPath = path.join(targetDir, 'config.toml');
  const agentsTomlDir = path.join(targetDir, 'agents');
  fs.mkdirSync(agentsTomlDir, { recursive: true });

  const agentEntries = fs.readdirSync(agentsSrc).filter(f => f.startsWith('redpill-') && f.endsWith('.md'));
  const agents = [];

  // Compute the Codex Redpill install path (absolute, so subagents with empty $HOME work — #820)
  const codexGsdPath = `${path.resolve(targetDir, 'redpill').replace(/\\/g, '/')}/`;

  for (const file of agentEntries) {
    let content = fs.readFileSync(path.join(agentsSrc, file), 'utf8');
    // Replace full .claude/redpill prefix so path resolves to codex Redpill install
    content = content.replace(/~\/\.claude\/redpill\//g, codexGsdPath);
    content = content.replace(/\$HOME\/\.claude\/redpill\//g, codexGsdPath);
    const { frontmatter } = extractFrontmatterAndBody(content);
    const name = extractFrontmatterField(frontmatter, 'name') || file.replace('.md', '');
    const description = extractFrontmatterField(frontmatter, 'description') || '';

    agents.push({ name, description: toSingleLine(description) });

    const tomlContent = generateCodexAgentToml(name, content);
    fs.writeFileSync(path.join(agentsTomlDir, `${name}.toml`), tomlContent);
  }

  const redpillBlock = generateCodexConfigBlock(agents, targetDir);
  mergeCodexConfig(configPath, redpillBlock);

  return agents.length;
}

/**
 * Runtime-neutral agent name and instruction file replacement.
 * Used by ALL non-Claude runtime converters to avoid Claude-specific
 * references in workflow prompts, agent definitions, and documentation.
 *
 * Replaces:
 * - Standalone "Claude" (agent name) → "the agent"
 *   Preserves: "Claude Code" (product), "Claude Opus/Sonnet/Haiku" (models),
 *   "claude-" (prefixes), "CLAUDE.md" (handled separately)
 * - "CLAUDE.md" → runtime-appropriate instruction file
 * - "Do NOT load full AGENTS.md" → removed (harmful for AGENTS.md runtimes)
 *
 * @param {string} content - File content to neutralize
 * @param {string} instructionFile - Runtime's instruction file ('AGENTS.md', 'GEMINI.md', etc.)
 * @returns {string} Content with runtime-neutral references
 */
function neutralizeAgentReferences(content, instructionFile) {
  let c = content;
  // Replace standalone "Claude" (the agent) but preserve product/model names.
  // Negative lookahead avoids: Claude Code, Claude Opus/Sonnet/Haiku, Claude native, Claude-based
  c = c.replace(/\bClaude(?! Code| Opus| Sonnet| Haiku| native| based|-)\b(?!\.md)/g, 'the agent');
  // Replace CLAUDE.md with runtime-appropriate instruction file
  if (instructionFile) {
    c = c.replace(/CLAUDE\.md/g, instructionFile);
  }
  // Remove instructions that conflict with AGENTS.md-based runtimes
  c = c.replace(/Do NOT load full `AGENTS\.md` files[^\n]*/g, '');
  return c;
}


function convertClaudeToOpencodeFrontmatter(content, { isAgent = false } = {}) {
  // Replace tool name references in content (applies to all files)
  let convertedContent = content;
  convertedContent = convertedContent.replace(/\bAskUserQuestion\b/g, 'question');
  convertedContent = convertedContent.replace(/\bSlashCommand\b/g, 'skill');
  convertedContent = convertedContent.replace(/\bTodoWrite\b/g, 'todowrite');
  // Replace /redpill:command with /redpill-command for opencode (flat command structure)
  convertedContent = convertedContent.replace(/\/redpill:/g, '/redpill-');
  // Replace ~/.claude and $HOME/.claude with OpenCode's config location
  convertedContent = convertedContent.replace(/~\/\.claude\b/g, '~/.config/opencode');
  convertedContent = convertedContent.replace(/\$HOME\/\.claude\b/g, '$HOME/.config/opencode');
  // Replace general-purpose subagent type with OpenCode's equivalent "general"
  convertedContent = convertedContent.replace(/subagent_type="general-purpose"/g, 'subagent_type="general"');
  // Runtime-neutral agent name replacement (#766)
  convertedContent = neutralizeAgentReferences(convertedContent, 'AGENTS.md');

  // Check if content has frontmatter
  if (!convertedContent.startsWith('---')) {
    return convertedContent;
  }

  // Find the end of frontmatter
  const endIndex = convertedContent.indexOf('---', 3);
  if (endIndex === -1) {
    return convertedContent;
  }

  const frontmatter = convertedContent.substring(3, endIndex).trim();
  const body = convertedContent.substring(endIndex + 3);

  // Parse frontmatter line by line (simple YAML parsing)
  const lines = frontmatter.split('\n');
  const newLines = [];
  let inAllowedTools = false;
  let inSkippedArray = false;
  const allowedTools = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // For agents: skip commented-out lines (e.g. hooks blocks)
    if (isAgent && trimmed.startsWith('#')) {
      continue;
    }

    // Detect start of allowed-tools array
    if (trimmed.startsWith('allowed-tools:')) {
      inAllowedTools = true;
      continue;
    }

    // Detect inline tools: field (comma-separated string)
    if (trimmed.startsWith('tools:')) {
      if (isAgent) {
        // Agents: strip tools entirely (not supported in OpenCode agent frontmatter)
        inSkippedArray = true;
        continue;
      }
      const toolsValue = trimmed.substring(6).trim();
      if (toolsValue) {
        // Parse comma-separated tools
        const tools = toolsValue.split(',').map(t => t.trim()).filter(t => t);
        allowedTools.push(...tools);
      }
      continue;
    }

    // For agents: strip skills:, color:, memory:, maxTurns:, permissionMode:, disallowedTools:
    if (isAgent && /^(skills|color|memory|maxTurns|permissionMode|disallowedTools):/.test(trimmed)) {
      inSkippedArray = true;
      continue;
    }

    // Skip continuation lines of a stripped array/object field
    if (inSkippedArray) {
      if (trimmed.startsWith('- ') || trimmed.startsWith('#') || /^\s/.test(line)) {
        continue;
      }
      inSkippedArray = false;
    }

    // For commands: remove name: field (opencode uses filename for command name)
    // For agents: keep name: (required by OpenCode agents)
    if (!isAgent && trimmed.startsWith('name:')) {
      continue;
    }

    // Strip model: field — OpenCode doesn't support Claude Code model aliases
    // like 'haiku', 'sonnet', 'opus', or 'inherit'. Omitting lets OpenCode use
    // its configured default model. See #1156.
    if (trimmed.startsWith('model:')) {
      continue;
    }

    // Convert color names to hex for opencode (commands only; agents strip color above)
    if (trimmed.startsWith('color:')) {
      const colorValue = trimmed.substring(6).trim().toLowerCase();
      const hexColor = colorNameToHex[colorValue];
      if (hexColor) {
        newLines.push(`color: "${hexColor}"`);
      } else if (colorValue.startsWith('#')) {
        // Validate hex color format (#RGB or #RRGGBB)
        if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(colorValue)) {
          // Already hex and valid, keep as is
          newLines.push(line);
        }
        // Skip invalid hex colors
      }
      // Skip unknown color names
      continue;
    }

    // Collect allowed-tools items
    if (inAllowedTools) {
      if (trimmed.startsWith('- ')) {
        allowedTools.push(trimmed.substring(2).trim());
        continue;
      } else if (trimmed && !trimmed.startsWith('-')) {
        // End of array, new field started
        inAllowedTools = false;
      }
    }

    // Keep other fields
    if (!inAllowedTools) {
      newLines.push(line);
    }
  }

  // For agents: add required OpenCode agent fields
  // Note: Do NOT add 'model: inherit' — OpenCode does not recognize the 'inherit'
  // keyword and throws ProviderModelNotFoundError. Omitting model: lets OpenCode
  // use its default model for subagents. See #1156.
  if (isAgent) {
    newLines.push('mode: subagent');
  }

  // For commands: add tools object if we had allowed-tools or tools
  if (!isAgent && allowedTools.length > 0) {
    newLines.push('tools:');
    for (const tool of allowedTools) {
      newLines.push(`  ${convertToolName(tool)}: true`);
    }
  }

  // Rebuild frontmatter (body already has tool names converted)
  const newFrontmatter = newLines.join('\n').trim();
  return `---\n${newFrontmatter}\n---${body}`;
}


/**
 * Copy commands to a flat structure for OpenCode
 * OpenCode expects: command/redpill-help.md (invoked as /redpill-help)
 * Source structure: commands/redpill/help.md
 * 
 * @param {string} srcDir - Source directory (e.g., commands/redpill/)
 * @param {string} destDir - Destination directory (e.g., command/)
 * @param {string} prefix - Prefix for filenames (e.g., 'redpill')
 * @param {string} pathPrefix - Path prefix for file references
 * @param {string} runtime - Target runtime ('claude' or 'opencode')
 */
function copyFlattenedCommands(srcDir, destDir, prefix, pathPrefix, runtime) {
  if (!fs.existsSync(srcDir)) {
    return;
  }
  
  // Remove old redpill-*.md files before copying new ones
  if (fs.existsSync(destDir)) {
    for (const file of fs.readdirSync(destDir)) {
      if (file.startsWith(`${prefix}-`) && file.endsWith('.md')) {
        fs.unlinkSync(path.join(destDir, file));
      }
    }
  } else {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    
    if (entry.isDirectory()) {
      // Recurse into subdirectories, adding to prefix
      // e.g., commands/redpill/debug/start.md -> command/redpill-debug-start.md
      copyFlattenedCommands(srcPath, destDir, `${prefix}-${entry.name}`, pathPrefix, runtime);
    } else if (entry.name.endsWith('.md')) {
      // Flatten: help.md -> redpill-help.md
      const baseName = entry.name.replace('.md', '');
      const destName = `${prefix}-${baseName}.md`;
      const destPath = path.join(destDir, destName);

      let content = fs.readFileSync(srcPath, 'utf8');
      const globalClaudeRegex = /~\/\.claude\//g;
      const globalClaudeHomeRegex = /\$HOME\/\.claude\//g;
      const localClaudeRegex = /\.\/\.claude\//g;
      const opencodeDirRegex = /~\/\.opencode\//g;
      // Protect CLI tool paths from replacement
      const CLI_PH = '___REDPILL_CLI_PATH___';
      content = content.replace(/\$HOME\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PH);
      content = content.replace(/~\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PH);
      content = content.replace(globalClaudeRegex, pathPrefix);
      content = content.replace(globalClaudeHomeRegex, pathPrefix);
      content = content.replace(localClaudeRegex, `./${getDirName(runtime)}/`);
      content = content.replace(opencodeDirRegex, pathPrefix);
      content = content.replace(new RegExp(CLI_PH, 'g'), '$HOME/.claude/redpill/bin/redpill-tools.cjs');
      content = processAttribution(content, getCommitAttribution(runtime));
      content = convertClaudeToOpencodeFrontmatter(content);

      fs.writeFileSync(destPath, content);
    }
  }
}

function listCodexSkillNames(skillsDir, prefix = 'redpill-') {
  if (!fs.existsSync(skillsDir)) return [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
    .filter(entry => fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort();
}

function copyCommandsAsCodexSkills(srcDir, skillsDir, prefix, pathPrefix, runtime) {
  if (!fs.existsSync(srcDir)) {
    return;
  }

  fs.mkdirSync(skillsDir, { recursive: true });

  // Remove previous Redpill Codex skills to avoid stale command skills.
  const existing = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of existing) {
    if (entry.isDirectory() && entry.name.startsWith(`${prefix}-`)) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true });
    }
  }

  function recurse(currentSrcDir, currentPrefix) {
    const entries = fs.readdirSync(currentSrcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(currentSrcDir, entry.name);
      if (entry.isDirectory()) {
        recurse(srcPath, `${currentPrefix}-${entry.name}`);
        continue;
      }

      if (!entry.name.endsWith('.md')) {
        continue;
      }

      const baseName = entry.name.replace('.md', '');
      const skillName = `${currentPrefix}-${baseName}`;
      const skillDir = path.join(skillsDir, skillName);
      fs.mkdirSync(skillDir, { recursive: true });

      let content = fs.readFileSync(srcPath, 'utf8');
      const globalClaudeRegex = /~\/\.claude\//g;
      const globalClaudeHomeRegex = /\$HOME\/\.claude\//g;
      const localClaudeRegex = /\.\/\.claude\//g;
      const codexDirRegex = /~\/\.codex\//g;
      // Protect CLI tool paths from replacement
      const CLI_PH2 = '___REDPILL_CLI_PATH___';
      content = content.replace(/\$HOME\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PH2);
      content = content.replace(/~\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PH2);
      content = content.replace(globalClaudeRegex, pathPrefix);
      content = content.replace(globalClaudeHomeRegex, pathPrefix);
      content = content.replace(localClaudeRegex, `./${getDirName(runtime)}/`);
      content = content.replace(codexDirRegex, pathPrefix);
      content = content.replace(new RegExp(CLI_PH2, 'g'), '$HOME/.claude/redpill/bin/redpill-tools.cjs');
      content = processAttribution(content, getCommitAttribution(runtime));
      content = convertClaudeCommandToCodexSkill(content, skillName);

      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    }
  }

  recurse(srcDir, prefix);
}


/**
 * Recursively copy directory, replacing paths in .md files
 * Deletes existing destDir first to remove orphaned files from previous versions
 * @param {string} srcDir - Source directory
 * @param {string} destDir - Destination directory
 * @param {string} pathPrefix - Path prefix for file references
 * @param {string} runtime - Target runtime ('claude', 'opencode', 'codex')
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix, runtime, isCommand = false, isGlobal = false) {
  const isOpencode = runtime === 'opencode';
  const isCodex = runtime === 'codex';
  const dirName = getDirName(runtime);

  // Clean install: remove existing destination to prevent orphaned files
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix, runtime, isCommand, isGlobal);
    } else if (entry.name.endsWith('.md')) {
      let content = fs.readFileSync(srcPath, 'utf8');
      const globalClaudeRegex = /~\/\.claude\//g;
      const globalClaudeHomeRegex = /\$HOME\/\.claude\//g;
      const localClaudeRegex = /\.\/\.claude\//g;
      // Replace paths, but preserve CLI tool references — they always live at ~/.claude/
      // Use a placeholder to protect CLI tool paths from replacement
      const CLI_PLACEHOLDER = '___REDPILL_CLI_PATH___';
      content = content.replace(/\$HOME\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PLACEHOLDER);
      content = content.replace(/~\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PLACEHOLDER);
      content = content.replace(globalClaudeRegex, pathPrefix);
      content = content.replace(globalClaudeHomeRegex, pathPrefix);
      content = content.replace(localClaudeRegex, `./${dirName}/`);
      // Restore CLI tool paths to canonical $HOME form
      content = content.replace(new RegExp(CLI_PLACEHOLDER, 'g'), '$HOME/.claude/redpill/bin/redpill-tools.cjs');
      content = processAttribution(content, getCommitAttribution(runtime));

      // Convert frontmatter for opencode compatibility
      if (isOpencode) {
        content = convertClaudeToOpencodeFrontmatter(content);
        fs.writeFileSync(destPath, content);
      } else if (isCodex) {
        content = convertClaudeToCodexMarkdown(content);
        fs.writeFileSync(destPath, content);
      } else {
        fs.writeFileSync(destPath, content);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clean up orphaned files from previous Redpill versions
 */
function cleanupOrphanedFiles(configDir) {
  const orphanedFiles = [
    'hooks/redpill-notify.sh',  // Removed in v1.6.x
    'hooks/statusline.js',  // Renamed to redpill-statusline.js in v1.9.0
  ];

  for (const relPath of orphanedFiles) {
    const fullPath = path.join(configDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ${green}✓${reset} Removed orphaned ${relPath}`);
    }
  }
}

/**
 * Clean up orphaned hook registrations from settings.json
 */
function cleanupOrphanedHooks(settings) {
  const orphanedHookPatterns = [
    'redpill-notify.sh',  // Removed in v1.6.x
    'hooks/statusline.js',  // Renamed to redpill-statusline.js in v1.9.0
    'redpill-intel-index.js',  // Removed in v1.9.2
    'redpill-intel-session.js',  // Removed in v1.9.2
    'redpill-intel-prune.js',  // Removed in v1.9.2
    // Clean up old GSD hooks (from get-shit-done installation)
    'gsd-context-monitor',
    'gsd-statusline',
    'gsd-check-update',
    'gsd-prompt-guard',
    'gsd-workflow-guard',
    'gsd-tools',
  ];

  let cleanedHooks = false;

  // Check all hook event types (Stop, SessionStart, etc.)
  if (settings.hooks) {
    for (const eventType of Object.keys(settings.hooks)) {
      const hookEntries = settings.hooks[eventType];
      if (Array.isArray(hookEntries)) {
        // Filter out entries that contain orphaned hooks
        const filtered = hookEntries.filter(entry => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            // Check if any hook in this entry matches orphaned patterns
            const hasOrphaned = entry.hooks.some(h =>
              h.command && orphanedHookPatterns.some(pattern => h.command.includes(pattern))
            );
            if (hasOrphaned) {
              cleanedHooks = true;
              return false;  // Remove this entry
            }
          }
          return true;  // Keep this entry
        });
        settings.hooks[eventType] = filtered;
      }
    }
  }

  if (cleanedHooks) {
    console.log(`  ${green}✓${reset} Removed orphaned hook registrations`);
  }

  // Fix old statusline paths
  if (settings.statusLine && settings.statusLine.command) {
    const cmd = settings.statusLine.command;
    if (/hooks[\/\\]statusline\.js/.test(cmd)) {
      settings.statusLine.command = cmd.replace(
        /hooks([\/\\])statusline\.js/,
        'hooks$1redpill-statusline.js'
      );
      console.log(`  ${green}✓${reset} Updated statusline path (hooks/statusline.js → hooks/redpill-statusline.js)`);
    } else if (cmd.includes('gsd-statusline')) {
      // Replace old GSD statusline with redpill
      settings.statusLine.command = cmd.replace(/gsd-statusline/g, 'redpill-statusline')
                                       .replace(/get-shit-done/g, 'redpill');
      console.log(`  ${green}✓${reset} Replaced GSD statusline with Redpill statusline`);
    }
  }

  return settings;
}

/**
 * Validate hook field requirements to prevent silent settings.json rejection.
 *
 * Claude Code validates the entire settings file with a strict Zod schema.
 * If ANY hook has an invalid schema (e.g., type: "agent" missing "prompt"),
 * the ENTIRE settings.json is silently discarded — disabling all plugins,
 * env vars, and other configuration.
 *
 * This defensive check removes invalid hook entries and cleans up empty
 * event arrays to prevent this. It validates:
 *   - agent hooks require a "prompt" field
 *   - command hooks require a "command" field
 *   - entries must have a valid "hooks" array (non-array/missing is removed)
 *
 * @param {object} settings - The settings object (mutated in place)
 * @returns {object} The same settings object
 */
function validateHookFields(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object') return settings;

  let fixedHooks = false;
  const emptyKeys = [];

  for (const [eventType, hookEntries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(hookEntries)) continue;

    // Pass 1: validate each entry, building a new array without mutation
    const validated = [];
    for (const entry of hookEntries) {
      // Entries without a hooks sub-array are structurally invalid — remove them
      if (!entry.hooks || !Array.isArray(entry.hooks)) {
        fixedHooks = true;
        continue;
      }

      // Filter invalid hooks within the entry
      const validHooks = entry.hooks.filter(h => {
        if (h.type === 'agent' && !h.prompt) {
          fixedHooks = true;
          return false;
        }
        if (h.type === 'command' && !h.command) {
          fixedHooks = true;
          return false;
        }
        return true;
      });

      // Drop entries whose hooks are now empty
      if (validHooks.length === 0) {
        fixedHooks = true;
        continue;
      }

      // Build a clean copy instead of mutating the original entry
      validated.push({ ...entry, hooks: validHooks });
    }

    settings.hooks[eventType] = validated;

    // Collect empty event arrays for removal (avoid delete during iteration)
    if (validated.length === 0) {
      emptyKeys.push(eventType);
      fixedHooks = true;
    }
  }

  // Pass 2: remove empty event arrays
  for (const key of emptyKeys) {
    delete settings.hooks[key];
  }

  if (fixedHooks) {
    console.log(`  ${green}✓${reset} Fixed invalid hook entries (prevents settings.json schema rejection)`);
  }

  return settings;
}

/**
 * Uninstall Redpill from the specified directory for a specific runtime
 * Removes only Redpill-specific files/directories, preserves user content
 * @param {boolean} isGlobal - Whether to uninstall from global or local
 * @param {string} runtime - Target runtime ('claude', 'opencode', 'codex')
 */
function uninstall(isGlobal, runtime = 'claude') {
  const isOpencode = runtime === 'opencode';
  const isCodex = runtime === 'codex';
  const dirName = getDirName(runtime);

  // Get the target directory based on runtime and install type
  const targetDir = isGlobal
    ? getGlobalDir(runtime, explicitConfigDir)
    : path.join(process.cwd(), dirName);

  const locationLabel = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  let runtimeLabel = 'Claude Code';
  if (runtime === 'opencode') runtimeLabel = 'OpenCode';
  if (runtime === 'codex') runtimeLabel = 'Codex';

  console.log(`  Uninstalling Redpill from ${cyan}${runtimeLabel}${reset} at ${cyan}${locationLabel}${reset}\n`);

  // Check if target directory exists
  if (!fs.existsSync(targetDir)) {
    console.log(`  ${yellow}⚠${reset} Directory does not exist: ${locationLabel}`);
    console.log(`  Nothing to uninstall.\n`);
    return;
  }

  let removedCount = 0;

  // 1. Remove Redpill commands/skills
  if (isOpencode) {
    // OpenCode: remove command/redpill-*.md files
    const commandDir = path.join(targetDir, 'command');
    if (fs.existsSync(commandDir)) {
      const files = fs.readdirSync(commandDir);
      for (const file of files) {
        if (file.startsWith('redpill-') && file.endsWith('.md')) {
          fs.unlinkSync(path.join(commandDir, file));
          removedCount++;
        }
      }
      console.log(`  ${green}✓${reset} Removed Redpill commands from command/`);
    }
  } else if (isCodex) {
    // Codex: remove skills/redpill-*/SKILL.md skill directories
    const skillsDir = path.join(targetDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      let skillCount = 0;
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('redpill-')) {
          fs.rmSync(path.join(skillsDir, entry.name), { recursive: true });
          skillCount++;
        }
      }
      if (skillCount > 0) {
        removedCount++;
        console.log(`  ${green}✓${reset} Removed ${skillCount} ${runtimeLabel} skills`);
      }
    }

    // Codex: remove Redpill agent .toml config files and config.toml sections
    const codexAgentsDir = path.join(targetDir, 'agents');
    if (fs.existsSync(codexAgentsDir)) {
      const tomlFiles = fs.readdirSync(codexAgentsDir);
      let tomlCount = 0;
      for (const file of tomlFiles) {
        if (file.startsWith('redpill-') && file.endsWith('.toml')) {
          fs.unlinkSync(path.join(codexAgentsDir, file));
          tomlCount++;
        }
      }
      if (tomlCount > 0) {
        removedCount++;
        console.log(`  ${green}✓${reset} Removed ${tomlCount} agent .toml configs`);
      }
    }

    // Codex: clean Redpill sections from config.toml
    const configPath = path.join(targetDir, 'config.toml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const cleaned = stripGsdFromCodexConfig(content);
      if (cleaned === null) {
        fs.unlinkSync(configPath);
        removedCount++;
        console.log(`  ${green}✓${reset} Removed config.toml (was Redpill-only)`);
      } else if (cleaned !== content) {
        fs.writeFileSync(configPath, cleaned);
        removedCount++;
        console.log(`  ${green}✓${reset} Cleaned Redpill sections from config.toml`);
      }
    }
  } else {
    const redpillCommandsDir = path.join(targetDir, 'commands', 'redpill');
    if (fs.existsSync(redpillCommandsDir)) {
      fs.rmSync(redpillCommandsDir, { recursive: true });
      removedCount++;
      console.log(`  ${green}✓${reset} Removed commands/redpill/`);
    }
  }

  // 2. Remove redpill directory
  const redpillDir = path.join(targetDir, 'redpill');
  if (fs.existsSync(redpillDir)) {
    fs.rmSync(redpillDir, { recursive: true });
    removedCount++;
    console.log(`  ${green}✓${reset} Removed redpill/`);
  }

  // 3. Remove Redpill agents (redpill-*.md files only)
  const agentsDir = path.join(targetDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir);
    let agentCount = 0;
    for (const file of files) {
      if (file.startsWith('redpill-') && file.endsWith('.md')) {
        fs.unlinkSync(path.join(agentsDir, file));
        agentCount++;
      }
    }
    if (agentCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${agentCount} Redpill agents`);
    }
  }

  // 4. Remove Redpill hooks
  const hooksDir = path.join(targetDir, 'hooks');
  if (fs.existsSync(hooksDir)) {
    const redpillHooks = ['redpill-statusline.js', 'redpill-check-update.js', 'redpill-check-update.sh', 'redpill-context-monitor.js', 'redpill-prompt-guard.js'];
    let hookCount = 0;
    for (const hook of redpillHooks) {
      const hookPath = path.join(hooksDir, hook);
      if (fs.existsSync(hookPath)) {
        fs.unlinkSync(hookPath);
        hookCount++;
      }
    }
    if (hookCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${hookCount} Redpill hooks`);
    }
  }

  // 5. Remove Redpill package.json (CommonJS mode marker)
  const pkgJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const content = fs.readFileSync(pkgJsonPath, 'utf8').trim();
      // Only remove if it's our minimal CommonJS marker
      if (content === '{"type":"commonjs"}') {
        fs.unlinkSync(pkgJsonPath);
        removedCount++;
        console.log(`  ${green}✓${reset} Removed Redpill package.json`);
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  // 6. Clean up settings.json (remove Redpill hooks and statusline)
  const settingsPath = path.join(targetDir, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    let settings = readSettings(settingsPath);
    let settingsModified = false;

    // Remove Redpill statusline if it references our hook
    if (settings.statusLine && settings.statusLine.command &&
        settings.statusLine.command.includes('redpill-statusline')) {
      delete settings.statusLine;
      settingsModified = true;
      console.log(`  ${green}✓${reset} Removed Redpill statusline from settings`);
    }

    // Remove Redpill hooks from SessionStart
    if (settings.hooks && settings.hooks.SessionStart) {
      const before = settings.hooks.SessionStart.length;
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter(entry => {
        if (entry.hooks && Array.isArray(entry.hooks)) {
          // Filter out Redpill hooks
          const hasGsdHook = entry.hooks.some(h =>
            h.command && (h.command.includes('redpill-check-update') || h.command.includes('redpill-statusline'))
          );
          return !hasGsdHook;
        }
        return true;
      });
      if (settings.hooks.SessionStart.length < before) {
        settingsModified = true;
        console.log(`  ${green}✓${reset} Removed Redpill hooks from settings`);
      }
      // Clean up empty array
      if (settings.hooks.SessionStart.length === 0) {
        delete settings.hooks.SessionStart;
      }
    }

    // Remove Redpill hooks from PostToolUse
    for (const eventName of ['PostToolUse', 'AfterTool']) {
      if (settings.hooks && settings.hooks[eventName]) {
        const before = settings.hooks[eventName].length;
        settings.hooks[eventName] = settings.hooks[eventName].filter(entry => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            const hasGsdHook = entry.hooks.some(h =>
              h.command && h.command.includes('redpill-context-monitor')
            );
            return !hasGsdHook;
          }
          return true;
        });
        if (settings.hooks[eventName].length < before) {
          settingsModified = true;
          console.log(`  ${green}✓${reset} Removed context monitor hook from settings`);
        }
        if (settings.hooks[eventName].length === 0) {
          delete settings.hooks[eventName];
        }
      }
    }

    // Remove Redpill hooks from PreToolUse
    for (const eventName of ['PreToolUse', 'BeforeTool']) {
      if (settings.hooks && settings.hooks[eventName]) {
        const before = settings.hooks[eventName].length;
        settings.hooks[eventName] = settings.hooks[eventName].filter(entry => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            const hasGsdHook = entry.hooks.some(h =>
              h.command && h.command.includes('redpill-prompt-guard')
            );
            return !hasGsdHook;
          }
          return true;
        });
        if (settings.hooks[eventName].length < before) {
          settingsModified = true;
          console.log(`  ${green}✓${reset} Removed prompt injection guard hook from settings`);
        }
        if (settings.hooks[eventName].length === 0) {
          delete settings.hooks[eventName];
        }
      }
    }

    // Clean up empty hooks object
    if (settings.hooks && Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    if (settingsModified) {
      writeSettings(settingsPath, settings);
      removedCount++;
    }
  }

  // 6. For OpenCode, clean up permissions from opencode.json or opencode.jsonc
  if (isOpencode) {
    const opencodeConfigDir = isGlobal
      ? getOpencodeGlobalDir()
      : path.join(process.cwd(), '.opencode');
    const configPath = resolveOpencodeConfigPath(opencodeConfigDir);
    if (fs.existsSync(configPath)) {
      try {
        const config = parseJsonc(fs.readFileSync(configPath, 'utf8'));
        let modified = false;

        // Remove Redpill permission entries
        if (config.permission) {
          for (const permType of ['read', 'external_directory']) {
            if (config.permission[permType]) {
              const keys = Object.keys(config.permission[permType]);
              for (const key of keys) {
                if (key.includes('redpill')) {
                  delete config.permission[permType][key];
                  modified = true;
                }
              }
              // Clean up empty objects
              if (Object.keys(config.permission[permType]).length === 0) {
                delete config.permission[permType];
              }
            }
          }
          if (Object.keys(config.permission).length === 0) {
            delete config.permission;
          }
        }

        if (modified) {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          removedCount++;
          console.log(`  ${green}✓${reset} Removed Redpill permissions from ${path.basename(configPath)}`);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }

  if (removedCount === 0) {
    console.log(`  ${yellow}⚠${reset} No Redpill files found to remove.`);
  }

  console.log(`
  ${green}Done!${reset} Redpill has been uninstalled from ${runtimeLabel}.
  Your other files and settings have been preserved.
`);
}

/**
 * Parse JSONC (JSON with Comments) by stripping comments and trailing commas.
 * OpenCode supports JSONC format via jsonc-parser, so users may have comments.
 * This is a lightweight inline parser to avoid adding dependencies.
 */
function parseJsonc(content) {
  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  // Remove single-line and block comments while preserving strings
  let result = '';
  let inString = false;
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];

    if (inString) {
      result += char;
      // Handle escape sequences
      if (char === '\\' && i + 1 < content.length) {
        result += next;
        i += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      i++;
    } else {
      if (char === '"') {
        inString = true;
        result += char;
        i++;
      } else if (char === '/' && next === '/') {
        // Skip single-line comment until end of line
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
      } else if (char === '/' && next === '*') {
        // Skip block comment
        i += 2;
        while (i < content.length - 1 && !(content[i] === '*' && content[i + 1] === '/')) {
          i++;
        }
        i += 2; // Skip closing */
      } else {
        result += char;
        i++;
      }
    }
  }

  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(result);
}

/**
 * Configure OpenCode permissions to allow reading Redpill reference docs
 * This prevents permission prompts when Redpill accesses the redpill directory
 * @param {boolean} isGlobal - Whether this is a global or local install
 */
function configureOpencodePermissions(isGlobal = true) {
  // For local installs, use ./.opencode/
  // For global installs, use ~/.config/opencode/
  const opencodeConfigDir = isGlobal
    ? getOpencodeGlobalDir()
    : path.join(process.cwd(), '.opencode');
  // Ensure config directory exists
  fs.mkdirSync(opencodeConfigDir, { recursive: true });

  const configPath = resolveOpencodeConfigPath(opencodeConfigDir);

  // Read existing config or create empty object
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      config = parseJsonc(content);
    } catch (e) {
      // Cannot parse - DO NOT overwrite user's config
      const configFile = path.basename(configPath);
      console.log(`  ${yellow}⚠${reset} Could not parse ${configFile} - skipping permission config`);
      console.log(`    ${dim}Reason: ${e.message}${reset}`);
      console.log(`    ${dim}Your config was NOT modified. Fix the syntax manually if needed.${reset}`);
      return;
    }
  }

  // Ensure permission structure exists
  if (!config.permission) {
    config.permission = {};
  }

  // Build the Redpill path using the actual config directory
  // Use ~ shorthand if it's in the default location, otherwise use full path
  const defaultConfigDir = path.join(os.homedir(), '.config', 'opencode');
  const redpillPath = opencodeConfigDir === defaultConfigDir
    ? '~/.config/opencode/redpill/*'
    : `${opencodeConfigDir.replace(/\\/g, '/')}/redpill/*`;
  
  let modified = false;

  // Configure read permission
  if (!config.permission.read || typeof config.permission.read !== 'object') {
    config.permission.read = {};
  }
  if (config.permission.read[redpillPath] !== 'allow') {
    config.permission.read[redpillPath] = 'allow';
    modified = true;
  }

  // Configure external_directory permission (the safety guard for paths outside project)
  if (!config.permission.external_directory || typeof config.permission.external_directory !== 'object') {
    config.permission.external_directory = {};
  }
  if (config.permission.external_directory[redpillPath] !== 'allow') {
    config.permission.external_directory[redpillPath] = 'allow';
    modified = true;
  }

  if (!modified) {
    return; // Already configured
  }

  // Write config back
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${green}✓${reset} Configured read permission for Redpill docs`);
}

/**
 * Verify a directory exists and contains files
 */
function verifyInstalled(dirPath, description) {
  if (!fs.existsSync(dirPath)) {
    console.error(`  ${yellow}✗${reset} Failed to install ${description}: directory not created`);
    return false;
  }
  try {
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      console.error(`  ${yellow}✗${reset} Failed to install ${description}: directory is empty`);
      return false;
    }
  } catch (e) {
    console.error(`  ${yellow}✗${reset} Failed to install ${description}: ${e.message}`);
    return false;
  }
  return true;
}

/**
 * Verify a file exists
 */
function verifyFileInstalled(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`  ${yellow}✗${reset} Failed to install ${description}: file not created`);
    return false;
  }
  return true;
}

/**
 * Install to the specified directory for a specific runtime
 * @param {boolean} isGlobal - Whether to install globally or locally
 * @param {string} runtime - Target runtime ('claude', 'opencode', 'codex')
 */

// ──────────────────────────────────────────────────────
// Local Patch Persistence
// ──────────────────────────────────────────────────────

const PATCHES_DIR_NAME = 'redpill-local-patches';
const MANIFEST_NAME = 'redpill-file-manifest.json';

/**
 * Compute SHA256 hash of file contents
 */
function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively collect all files in dir with their hashes
 */
function generateManifest(dir, baseDir) {
  if (!baseDir) baseDir = dir;
  const manifest = {};
  if (!fs.existsSync(dir)) return manifest;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      Object.assign(manifest, generateManifest(fullPath, baseDir));
    } else {
      manifest[relPath] = fileHash(fullPath);
    }
  }
  return manifest;
}

/**
 * Write file manifest after installation for future modification detection
 */
function writeManifest(configDir, runtime = 'claude') {
  const isOpencode = runtime === 'opencode';
  const isCodex = runtime === 'codex';
  const redpillDir = path.join(configDir, 'redpill');
  const commandsDir = path.join(configDir, 'commands', 'redpill');
  const opencodeCommandDir = path.join(configDir, 'command');
  const codexSkillsDir = path.join(configDir, 'skills');
  const agentsDir = path.join(configDir, 'agents');
  const manifest = { version: pkg.version, timestamp: new Date().toISOString(), files: {} };

  const redpillHashes = generateManifest(redpillDir);
  for (const [rel, hash] of Object.entries(redpillHashes)) {
    manifest.files['redpill/' + rel] = hash;
  }
  if (!isOpencode && !isCodex && fs.existsSync(commandsDir)) {
    const cmdHashes = generateManifest(commandsDir);
    for (const [rel, hash] of Object.entries(cmdHashes)) {
      manifest.files['commands/redpill/' + rel] = hash;
    }
  }
  if (isOpencode && fs.existsSync(opencodeCommandDir)) {
    for (const file of fs.readdirSync(opencodeCommandDir)) {
      if (file.startsWith('redpill-') && file.endsWith('.md')) {
        manifest.files['command/' + file] = fileHash(path.join(opencodeCommandDir, file));
      }
    }
  }
  if (isCodex && fs.existsSync(codexSkillsDir)) {
    for (const skillName of listCodexSkillNames(codexSkillsDir)) {
      const skillRoot = path.join(codexSkillsDir, skillName);
      const skillHashes = generateManifest(skillRoot);
      for (const [rel, hash] of Object.entries(skillHashes)) {
        manifest.files[`skills/${skillName}/${rel}`] = hash;
      }
    }
  }
  // Skills are not installed — no manifest tracking needed.
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (file.startsWith('redpill-') && file.endsWith('.md')) {
        manifest.files['agents/' + file] = fileHash(path.join(agentsDir, file));
      }
    }
  }
  // Track hook files so saveLocalPatches() can detect user modifications
  // Hooks are only installed for runtimes that use settings.json (not Codex)
  if (!isCodex) {
    const hooksDir = path.join(configDir, 'hooks');
    if (fs.existsSync(hooksDir)) {
      for (const file of fs.readdirSync(hooksDir)) {
        if (file.startsWith('redpill-') && file.endsWith('.js')) {
          manifest.files['hooks/' + file] = fileHash(path.join(hooksDir, file));
        }
      }
    }
  }

  fs.writeFileSync(path.join(configDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Detect user-modified Redpill files by comparing against install manifest.
 * Backs up modified files to redpill-local-patches/ for reapply after update.
 */
function saveLocalPatches(configDir) {
  const manifestPath = path.join(configDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return [];

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return []; }

  const patchesDir = path.join(configDir, PATCHES_DIR_NAME);
  const modified = [];

  for (const [relPath, originalHash] of Object.entries(manifest.files || {})) {
    const fullPath = path.join(configDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const currentHash = fileHash(fullPath);
    if (currentHash !== originalHash) {
      const backupPath = path.join(patchesDir, relPath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(fullPath, backupPath);
      modified.push(relPath);
    }
  }

  if (modified.length > 0) {
    const meta = {
      backed_up_at: new Date().toISOString(),
      from_version: manifest.version,
      files: modified
    };
    fs.writeFileSync(path.join(patchesDir, 'backup-meta.json'), JSON.stringify(meta, null, 2));
    console.log('  ' + yellow + 'i' + reset + '  Found ' + modified.length + ' locally modified Redpill file(s) — backed up to ' + PATCHES_DIR_NAME + '/');
    for (const f of modified) {
      console.log('     ' + dim + f + reset);
    }
  }
  return modified;
}

/**
 * After install, report backed-up patches for user to reapply.
 */
function reportLocalPatches(configDir, runtime = 'claude') {
  const patchesDir = path.join(configDir, PATCHES_DIR_NAME);
  const metaPath = path.join(patchesDir, 'backup-meta.json');
  if (!fs.existsSync(metaPath)) return [];

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return []; }

  if (meta.files && meta.files.length > 0) {
    const reapplyCommand = runtime === 'opencode'
      ? '/redpill-reapply-patches'
      : runtime === 'codex'
        ? '$redpill-reapply-patches'
        : '/redpill:reapply-patches';
    console.log('');
    console.log('  ' + yellow + 'Local patches detected' + reset + ' (from v' + meta.from_version + '):');
    for (const f of meta.files) {
      console.log('     ' + cyan + f + reset);
    }
    console.log('');
    console.log('  Your modifications are saved in ' + cyan + PATCHES_DIR_NAME + '/' + reset);
    console.log('  Run ' + cyan + reapplyCommand + reset + ' to merge them into the new version.');
    console.log('  Or manually compare and merge the files.');
    console.log('');
  }
  return meta.files || [];
}

function install(isGlobal, runtime = 'claude') {
  const isOpencode = runtime === 'opencode';
  const isCodex = runtime === 'codex';
  const dirName = getDirName(runtime);
  const src = path.join(__dirname, '..');

  // Get the target directory based on runtime and install type
  const targetDir = isGlobal
    ? getGlobalDir(runtime, explicitConfigDir)
    : path.join(process.cwd(), dirName);

  const locationLabel = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  // Path prefix for file references in markdown content (e.g. redpill-tools.cjs).
  // Replaces $HOME/.claude/ or ~/.claude/ so the result is <pathPrefix>redpill/bin/...
  // For global installs: use $HOME/ so paths expand correctly inside double-quoted
  // shell commands (~ does NOT expand inside double quotes, causing MODULE_NOT_FOUND).
  // For local installs: use resolved absolute path (may be outside $HOME).
  const resolvedTarget = path.resolve(targetDir).replace(/\\/g, '/');
  const homeDir = os.homedir().replace(/\\/g, '/');
  const pathPrefix = isGlobal && resolvedTarget.startsWith(homeDir)
    ? '$HOME' + resolvedTarget.slice(homeDir.length) + '/'
    : `${resolvedTarget}/`;

  let runtimeLabel = 'Claude Code';
  if (isOpencode) runtimeLabel = 'OpenCode';
  if (isCodex) runtimeLabel = 'Codex';

  console.log(`  Installing for ${cyan}${runtimeLabel}${reset} to ${cyan}${locationLabel}${reset}\n`);

  // Track installation failures
  const failures = [];

  // Save any locally modified Redpill files before they get wiped
  saveLocalPatches(targetDir);

  // Clean up orphaned files from previous versions
  cleanupOrphanedFiles(targetDir);

  // OpenCode uses command/ (flat), Codex uses skills/, Claude uses commands/redpill/
  if (isOpencode) {
    // OpenCode: flat structure in command/ directory
    const commandDir = path.join(targetDir, 'command');
    fs.mkdirSync(commandDir, { recursive: true });
    
    // Copy commands/redpill/*.md as command/redpill-*.md (flatten structure)
    const redpillSrc = path.join(src, 'commands', 'redpill');
    copyFlattenedCommands(redpillSrc, commandDir, 'redpill', pathPrefix, runtime);
    if (verifyInstalled(commandDir, 'command/redpill-*')) {
      const count = fs.readdirSync(commandDir).filter(f => f.startsWith('redpill-')).length;
      console.log(`  ${green}✓${reset} Installed ${count} commands to command/`);
    } else {
      failures.push('command/redpill-*');
    }
  } else if (isCodex) {
    const skillsDir = path.join(targetDir, 'skills');
    const redpillSrc = path.join(src, 'commands', 'redpill');
    copyCommandsAsCodexSkills(redpillSrc, skillsDir, 'redpill', pathPrefix, runtime);
    const installedSkillNames = listCodexSkillNames(skillsDir);
    if (installedSkillNames.length > 0) {
      console.log(`  ${green}✓${reset} Installed ${installedSkillNames.length} skills to skills/`);
    } else {
      failures.push('skills/redpill-*');
    }
  } else {
    // Claude Code: nested structure in commands/ directory
    const commandsDir = path.join(targetDir, 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    
    const redpillSrc = path.join(src, 'commands', 'redpill');
    const redpillDest = path.join(commandsDir, 'redpill');
    copyWithPathReplacement(redpillSrc, redpillDest, pathPrefix, runtime, true, isGlobal);
    if (verifyInstalled(redpillDest, 'commands/redpill')) {
      console.log(`  ${green}✓${reset} Installed commands/redpill`);
    } else {
      failures.push('commands/redpill');
    }
  }

  // Copy framework directories from redpill/ (workflows, references, templates)
  const frameworkDirs = ['workflows', 'references', 'templates'];
  for (const dir of frameworkDirs) {
    const dirSrc = path.join(src, 'redpill', dir);
    if (fs.existsSync(dirSrc)) {
      const dirDest = path.join(targetDir, 'redpill', dir);
      copyWithPathReplacement(dirSrc, dirDest, pathPrefix, runtime, false, isGlobal);
      if (verifyInstalled(dirDest, `redpill/${dir}`)) {
        console.log(`  ${green}✓${reset} Installed redpill/${dir}`);
      } else {
        failures.push(`redpill/${dir}`);
      }
    }
  }

  // Copy CLI tools (redpill-tools.cjs + bin/lib/) — ALWAYS to ~/.claude/
  // CLI tools live at a fixed global location so prompts can use a stable path:
  //   node "$HOME/.claude/redpill/bin/redpill-tools.cjs"
  // This path never needs replacement regardless of --local or --global.
  const cliToolsSrc = path.join(src, 'redpill', 'bin', 'redpill-tools.cjs');
  if (fs.existsSync(cliToolsSrc)) {
    const globalClaudeDir = path.join(os.homedir(), '.claude');
    const binDest = path.join(globalClaudeDir, 'redpill', 'bin');
    fs.mkdirSync(binDest, { recursive: true });
    const libSrc = path.join(src, 'redpill', 'bin', 'lib');
    const libDest = path.join(binDest, 'lib');
    if (fs.existsSync(libSrc)) {
      // CLI lib modules don't need path replacement — they don't contain prompt paths
      const libEntries = fs.readdirSync(libSrc, { withFileTypes: true });
      fs.mkdirSync(libDest, { recursive: true });
      for (const entry of libEntries) {
        if (entry.isFile()) {
          fs.copyFileSync(path.join(libSrc, entry.name), path.join(libDest, entry.name));
        }
      }
    }
    // Copy the CLI entry point (no path replacement needed — lib path resolved via __dirname)
    fs.copyFileSync(cliToolsSrc, path.join(binDest, 'redpill-tools.cjs'));
    console.log(`  ${green}✓${reset} Installed CLI tools to ~/.claude/redpill/bin/`);
  }

  // Skills are NOT installed — they live in the source repo only (gitignored).
  // Agent definitions reference skills via @ paths, but skills content is
  // embedded in agent prompts at runtime, not read from disk by the installer.

  // Copy agents to agents directory
  const agentsSrc = path.join(src, 'agents');
  if (fs.existsSync(agentsSrc)) {
    const agentsDest = path.join(targetDir, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });

    // Remove old Redpill agents (redpill-*.md) before copying new ones
    if (fs.existsSync(agentsDest)) {
      for (const file of fs.readdirSync(agentsDest)) {
        if (file.startsWith('redpill-') && file.endsWith('.md')) {
          fs.unlinkSync(path.join(agentsDest, file));
        }
      }
    }

    // Copy new agents
    const agentEntries = fs.readdirSync(agentsSrc, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        let content = fs.readFileSync(path.join(agentsSrc, entry.name), 'utf8');
        // Replace ~/.claude/ and $HOME/.claude/ as they are the source of truth in the repo
        // Protect CLI tool paths — they always live at ~/.claude/
        const CLI_PH_AGENT = '___REDPILL_CLI_PATH___';
        content = content.replace(/\$HOME\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PH_AGENT);
        content = content.replace(/~\/\.claude\/redpill\/bin\/redpill-tools\.cjs/g, CLI_PH_AGENT);
        const dirRegex = /~\/\.claude\//g;
        const homeDirRegex = /\$HOME\/\.claude\//g;
        content = content.replace(dirRegex, pathPrefix);
        content = content.replace(homeDirRegex, pathPrefix);
        content = content.replace(new RegExp(CLI_PH_AGENT, 'g'), '$HOME/.claude/redpill/bin/redpill-tools.cjs');
        content = processAttribution(content, getCommitAttribution(runtime));
        // Convert frontmatter for runtime compatibility (agents need different handling)
        if (isOpencode) {
          content = convertClaudeToOpencodeFrontmatter(content, { isAgent: true });
        } else if (isCodex) {
          content = convertClaudeAgentToCodexAgent(content);
        }
        const destName = entry.name;
        fs.writeFileSync(path.join(agentsDest, destName), content);
      }
    }
    if (verifyInstalled(agentsDest, 'agents')) {
      console.log(`  ${green}✓${reset} Installed agents`);
    } else {
      failures.push('agents');
    }
  }

  // Copy CHANGELOG.md
  const changelogSrc = path.join(src, 'CHANGELOG.md');
  const changelogDest = path.join(targetDir, 'redpill', 'CHANGELOG.md');
  if (fs.existsSync(changelogSrc)) {
    fs.copyFileSync(changelogSrc, changelogDest);
    if (verifyFileInstalled(changelogDest, 'CHANGELOG.md')) {
      console.log(`  ${green}✓${reset} Installed CHANGELOG.md`);
    } else {
      failures.push('CHANGELOG.md');
    }
  }

  // Write VERSION file
  const versionDest = path.join(targetDir, 'redpill', 'VERSION');
  fs.writeFileSync(versionDest, pkg.version);
  if (verifyFileInstalled(versionDest, 'VERSION')) {
    console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);
  } else {
    failures.push('VERSION');
  }

  // Install redpill-tools as global CLI command via symlink (always, since CLI is always at ~/.claude/)
  {
    const globalClaudeDir = path.join(os.homedir(), '.claude');
    const toolsCjs = path.join(globalClaudeDir, 'redpill', 'bin', 'redpill-tools.cjs');
    if (fs.existsSync(toolsCjs)) {
      // Create a shell wrapper script
      const wrapperPath = path.join(globalClaudeDir, 'redpill', 'bin', 'redpill-tools');
      fs.writeFileSync(wrapperPath, `#!/usr/bin/env node\nrequire('./redpill-tools.cjs');\n`);
      fs.chmodSync(wrapperPath, 0o755);

      // Symlink to /usr/local/bin
      const symlinkTarget = '/usr/local/bin/redpill-tools';
      try {
        if (fs.existsSync(symlinkTarget) || fs.lstatSync(symlinkTarget).isSymbolicLink()) {
          fs.unlinkSync(symlinkTarget);
        }
      } catch (e) { /* doesn't exist, fine */ }
      try {
        fs.symlinkSync(wrapperPath, symlinkTarget);
        console.log(`  ${green}✓${reset} Installed redpill-tools to /usr/local/bin/`);
      } catch (e) {
        console.log(`  ${yellow}⚠${reset} Could not symlink to /usr/local/bin/: ${e.message}`);
        console.log(`    Run manually: sudo ln -sf ${wrapperPath} /usr/local/bin/redpill-tools`);
      }
    }
  }

  if (!isCodex) {
    // Write package.json to force CommonJS mode for Redpill scripts
    // Prevents "require is not defined" errors when project has "type": "module"
    // Node.js walks up looking for package.json - this stops inheritance from project
    const pkgJsonDest = path.join(targetDir, 'package.json');
    fs.writeFileSync(pkgJsonDest, '{"type":"commonjs"}\n');
    console.log(`  ${green}✓${reset} Wrote package.json (CommonJS mode)`);

    // Copy hooks — prefer dist/ (bundled) but fallback to hooks/ (source)
    const hooksDistSrc = path.join(src, 'hooks', 'dist');
    const hooksSrc = fs.existsSync(hooksDistSrc) ? hooksDistSrc : path.join(src, 'hooks');
    if (fs.existsSync(hooksSrc)) {
      const hooksDest = path.join(targetDir, 'hooks');
      fs.mkdirSync(hooksDest, { recursive: true });
      const hookEntries = fs.readdirSync(hooksSrc);
      const configDirReplacement = getConfigDirFromHome(runtime, isGlobal);
      let hookCount = 0;
      for (const entry of hookEntries) {
        const srcFile = path.join(hooksSrc, entry);
        if (fs.statSync(srcFile).isFile()) {
          const destFile = path.join(hooksDest, entry);
          const existed = fs.existsSync(destFile);
          // Template .js files to replace '.claude' with runtime-specific config dir
          // and stamp the current Redpill version into the hook version header
          if (entry.endsWith('.js')) {
            let content = fs.readFileSync(srcFile, 'utf8');
            content = content.replace(/'\.claude'/g, configDirReplacement);
            content = content.replace(/\{\{Redpill_VERSION\}\}/g, pkg.version);
            fs.writeFileSync(destFile, content);
            // Ensure hook files are executable (fixes #1162 — missing +x permission)
            try { fs.chmodSync(destFile, 0o755); } catch (e) { /* Windows doesn't support chmod */ }
          } else {
            fs.copyFileSync(srcFile, destFile);
          }
          const action = existed ? 'Updated' : 'Installed';
          console.log(`  ${green}✓${reset} ${action} hook: ${entry}`);
          hookCount++;
        }
      }
      if (hookCount === 0) {
        failures.push('hooks');
      }
    }
  }

  // Clear stale update cache so next session re-evaluates hook versions
  // targetDir is e.g. ~/.claude/redpill/, parent is the config dir
  const updateCacheFile = path.join(path.dirname(targetDir), 'cache', 'redpill-update-check.json');
  try { fs.unlinkSync(updateCacheFile); } catch (e) { /* cache may not exist yet */ }

  if (failures.length > 0) {
    console.error(`\n  ${yellow}Installation incomplete!${reset} Failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  // Write file manifest for future modification detection
  writeManifest(targetDir, runtime);
  console.log(`  ${green}✓${reset} Wrote file manifest (${MANIFEST_NAME})`);

  // Report any backed-up local patches
  reportLocalPatches(targetDir, runtime);

  // Verify no leaked .claude paths in non-Claude runtimes
  if (runtime !== 'claude') {
    const leakedPaths = [];
    function scanForLeakedPaths(dir) {
      if (!fs.existsSync(dir)) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          return; // skip inaccessible directories
        }
        throw err;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanForLeakedPaths(fullPath);
        } else if ((entry.name.endsWith('.md') || entry.name.endsWith('.toml')) && entry.name !== 'CHANGELOG.md') {
          let content;
          try {
            content = fs.readFileSync(fullPath, 'utf8');
          } catch (err) {
            if (err.code === 'EPERM' || err.code === 'EACCES') {
              continue; // skip inaccessible files
            }
            throw err;
          }
          const matches = content.match(/(?:~|\$HOME)\/\.claude\b/g);
          if (matches) {
            leakedPaths.push({ file: fullPath.replace(targetDir + '/', ''), count: matches.length });
          }
        }
      }
    }
    scanForLeakedPaths(targetDir);
    if (leakedPaths.length > 0) {
      const totalLeaks = leakedPaths.reduce((sum, l) => sum + l.count, 0);
      console.warn(`\n  ${yellow}⚠${reset}  Found ${totalLeaks} unreplaced .claude path reference(s) in ${leakedPaths.length} file(s):`);
      for (const leak of leakedPaths.slice(0, 5)) {
        console.warn(`     ${dim}${leak.file}${reset} (${leak.count})`);
      }
      if (leakedPaths.length > 5) {
        console.warn(`     ${dim}... and ${leakedPaths.length - 5} more file(s)${reset}`);
      }
      console.warn(`  ${dim}These paths may not resolve correctly for ${runtimeLabel}.${reset}`);
    }
  }

  if (isCodex) {
    // Generate Codex config.toml and per-agent .toml files
    const agentCount = installCodexConfig(targetDir, agentsSrc);
    console.log(`  ${green}✓${reset} Generated config.toml with ${agentCount} agent roles`);
    console.log(`  ${green}✓${reset} Generated ${agentCount} agent .toml config files`);

    // Add Codex hooks (SessionStart for update checking) — requires codex_hooks feature flag
    const configPath = path.join(targetDir, 'config.toml');
    try {
      let configContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
      const eol = detectLineEnding(configContent);
      const codexHooksFeature = ensureCodexHooksFeature(configContent);
      configContent = setManagedCodexHooksOwnership(codexHooksFeature.content, codexHooksFeature.ownership);

      // Add SessionStart hook for update checking
      const updateCheckScript = path.resolve(targetDir, 'redpill', 'hooks', 'redpill-update-check.js').replace(/\\/g, '/');
      const hookBlock =
        `${eol}# Redpill Hooks${eol}` +
        `[[hooks]]${eol}` +
        `event = "SessionStart"${eol}` +
        `command = "node ${updateCheckScript}"${eol}`;

      if (hasEnabledCodexHooksFeature(configContent) && !configContent.includes('redpill-update-check')) {
        configContent += hookBlock;
      }

      fs.writeFileSync(configPath, configContent, 'utf-8');
      console.log(`  ${green}✓${reset} Configured Codex hooks (SessionStart)`);
    } catch (e) {
      console.warn(`  ${yellow}⚠${reset}  Could not configure Codex hooks: ${e.message}`);
    }

    return { settingsPath: null, settings: null, statuslineCommand: null, runtime };
  }

  // Configure statusline and hooks in settings.json
  const postToolEvent = 'PostToolUse';
  const settingsPath = path.join(targetDir, 'settings.json');
  const settings = validateHookFields(cleanupOrphanedHooks(readSettings(settingsPath)));
  const statuslineCommand = isGlobal
    ? buildHookCommand(targetDir, 'redpill-statusline.js')
    : 'node ' + dirName + '/hooks/redpill-statusline.js';
  const updateCheckCommand = isGlobal
    ? buildHookCommand(targetDir, 'redpill-check-update.js')
    : 'node ' + dirName + '/hooks/redpill-check-update.js';
  const contextMonitorCommand = isGlobal
    ? buildHookCommand(targetDir, 'redpill-context-monitor.js')
    : 'node ' + dirName + '/hooks/redpill-context-monitor.js';
  const promptGuardCommand = isGlobal
    ? buildHookCommand(targetDir, 'redpill-prompt-guard.js')
    : 'node ' + dirName + '/hooks/redpill-prompt-guard.js';
  const bddGuardCommand = isGlobal
    ? buildHookCommand(targetDir, 'redpill-bdd-guard.js')
    : 'node ' + dirName + '/hooks/redpill-bdd-guard.js';

  // Configure SessionStart hook for update checking (skip for opencode)
  if (!isOpencode) {
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.SessionStart) {
      settings.hooks.SessionStart = [];
    }

    const hasGsdUpdateHook = settings.hooks.SessionStart.some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('redpill-check-update'))
    );

    if (!hasGsdUpdateHook) {
      settings.hooks.SessionStart.push({
        hooks: [
          {
            type: 'command',
            command: updateCheckCommand
          }
        ]
      });
      console.log(`  ${green}✓${reset} Configured update check hook`);
    }

    // Configure post-tool hook for context window monitoring
    if (!settings.hooks[postToolEvent]) {
      settings.hooks[postToolEvent] = [];
    }

    const hasContextMonitorHook = settings.hooks[postToolEvent].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('redpill-context-monitor'))
    );

    if (!hasContextMonitorHook) {
      settings.hooks[postToolEvent].push({
        matcher: 'Bash|Edit|Write|MultiEdit|Agent|Task',
        hooks: [
          {
            type: 'command',
            command: contextMonitorCommand,
            timeout: 10
          }
        ]
      });
      console.log(`  ${green}✓${reset} Configured context window monitor hook`);
    } else {
      // Migrate existing context monitor hooks: add matcher and timeout if missing
      for (const entry of settings.hooks[postToolEvent]) {
        if (entry.hooks && entry.hooks.some(h => h.command && h.command.includes('redpill-context-monitor'))) {
          let migrated = false;
          if (!entry.matcher) {
            entry.matcher = 'Bash|Edit|Write|MultiEdit|Agent|Task';
            migrated = true;
          }
          for (const h of entry.hooks) {
            if (h.command && h.command.includes('redpill-context-monitor') && !h.timeout) {
              h.timeout = 10;
              migrated = true;
            }
          }
          if (migrated) {
            console.log(`  ${green}✓${reset} Updated context monitor hook (added matcher + timeout)`);
          }
        }
      }
    }

    // Configure PreToolUse hook for prompt injection detection
    const preToolEvent = 'PreToolUse';
    if (!settings.hooks[preToolEvent]) {
      settings.hooks[preToolEvent] = [];
    }

    const hasPromptGuardHook = settings.hooks[preToolEvent].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('redpill-prompt-guard'))
    );

    if (!hasPromptGuardHook) {
      settings.hooks[preToolEvent].push({
        matcher: 'Write|Edit',
        hooks: [
          {
            type: 'command',
            command: promptGuardCommand,
            timeout: 5
          }
        ]
      });
      console.log(`  ${green}✓${reset} Configured prompt injection guard hook`);
    }

    // Configure PreToolUse hook for BDD guard (constitution enforcement)
    const hasBddGuardHook = settings.hooks[preToolEvent].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('redpill-bdd-guard'))
    );

    if (!hasBddGuardHook) {
      settings.hooks[preToolEvent].push({
        matcher: 'Write|Edit',
        hooks: [
          {
            type: 'command',
            command: bddGuardCommand,
            timeout: 5
          }
        ]
      });
      console.log(`  ${green}✓${reset} Configured BDD guard hook`);
    }
  }

  return { settingsPath, settings, statuslineCommand, runtime };
}

/**
 * Apply statusline config, then print completion message
 */
function finishInstall(settingsPath, settings, statuslineCommand, shouldInstallStatusline, runtime = 'claude', isGlobal = true) {
  const isOpencode = runtime === 'opencode';
  const isCodex = runtime === 'codex';

  if (shouldInstallStatusline && !isOpencode && !isCodex) {
    settings.statusLine = {
      type: 'command',
      command: statuslineCommand
    };
    console.log(`  ${green}✓${reset} Configured statusline`);
  }

  // Write settings when runtime supports settings.json
  if (!isCodex) {
    writeSettings(settingsPath, settings);
  }

  // Configure OpenCode permissions
  if (isOpencode) {
    configureOpencodePermissions(isGlobal);
  }

  // For non-Claude runtimes, set resolve_model_ids: "omit" in ~/.redpill/defaults.json
  // so resolveModelInternal() returns '' instead of Claude aliases (opus/sonnet/haiku)
  // that the runtime can't resolve. Users can still use model_overrides for explicit IDs.
  // See #1156.
  if (runtime !== 'claude') {
    const redpillDir = path.join(os.homedir(), '.redpill');
    const defaultsPath = path.join(redpillDir, 'defaults.json');
    try {
      fs.mkdirSync(redpillDir, { recursive: true });
      let defaults = {};
      try { defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')); } catch { /* new file */ }
      if (defaults.resolve_model_ids !== 'omit') {
        defaults.resolve_model_ids = 'omit';
        fs.writeFileSync(defaultsPath, JSON.stringify(defaults, null, 2) + '\n');
        console.log(`  ${green}✓${reset} Set resolve_model_ids: "omit" in ~/.redpill/defaults.json`);
      }
    } catch (e) {
      console.log(`  ${yellow}⚠${reset} Could not write ~/.redpill/defaults.json: ${e.message}`);
    }
  }

  let program = 'Claude Code';
  if (runtime === 'opencode') program = 'OpenCode';
  if (runtime === 'codex') program = 'Codex';

  let command = '/redpill:new-project';
  if (runtime === 'opencode') command = '/redpill-new-project';
  if (runtime === 'codex') command = '$redpill-new-project';
  console.log(`
  ${green}Done!${reset} Open a blank directory in ${program} and run ${cyan}${command}${reset}.

  ${cyan}Join the community:${reset} https://discord.gg/redpill
`);
}

/**
 * Handle statusline configuration with optional prompt
 */
function handleStatusline(settings, isInteractive, callback) {
  const hasExisting = settings.statusLine != null;

  if (!hasExisting) {
    callback(true);
    return;
  }

  if (forceStatusline) {
    callback(true);
    return;
  }

  if (!isInteractive) {
    console.log(`  ${yellow}⚠${reset} Skipping statusline (already configured)`);
    console.log(`    Use ${cyan}--force-statusline${reset} to replace\n`);
    callback(false);
    return;
  }

  const existingCmd = settings.statusLine.command || settings.statusLine.url || '(custom)';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
  ${yellow}⚠${reset} Existing statusline detected\n
  Your current statusline:
    ${dim}command: ${existingCmd}${reset}

  Redpill includes a statusline showing:
    • Model name
    • Current task (from todo list)
    • Context window usage (color-coded)

  ${cyan}1${reset}) Keep existing
  ${cyan}2${reset}) Replace with Redpill statusline
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    const choice = answer.trim() || '1';
    callback(choice === '2');
  });
}


/**
 * Prompt for runtime selection
 */
function promptRuntime(callback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let answered = false;

  rl.on('close', () => {
    if (!answered) {
      answered = true;
      console.log(`\n  ${yellow}Installation cancelled${reset}\n`);
      process.exit(0);
    }
  });

  const runtimeMap = {
    '1': 'claude',
    '2': 'codex',
    '3': 'opencode'
  };
  const allRuntimes = ['claude', 'codex', 'opencode'];

  console.log(`  ${yellow}Which runtime(s) would you like to install for?${reset}\n\n  ${cyan}1${reset}) Claude Code  ${dim}(~/.claude)${reset}
  ${cyan}2${reset}) Codex        ${dim}(~/.codex)${reset}
  ${cyan}3${reset}) OpenCode     ${dim}(~/.config/opencode)${reset} - open source, free models
  ${cyan}4${reset}) All

  ${dim}Select multiple: 1,2 or 1 2${reset}
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const input = answer.trim() || '1';

    // "All" shortcut
    if (input === '4') {
      callback(allRuntimes);
      return;
    }

    // Parse comma-separated, space-separated, or single choice
    const choices = input.split(/[\s,]+/).filter(Boolean);
    const selected = [];
    for (const c of choices) {
      const runtime = runtimeMap[c];
      if (runtime && !selected.includes(runtime)) {
        selected.push(runtime);
      }
    }

    callback(selected.length > 0 ? selected : ['claude']);
  });
}

/**
 * Prompt for install location
 */
function promptLocation(runtimes) {
  if (!process.stdin.isTTY) {
    console.log(`  ${yellow}Non-interactive terminal detected, defaulting to global install${reset}\n`);
    installAllRuntimes(runtimes, true, false);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let answered = false;

  rl.on('close', () => {
    if (!answered) {
      answered = true;
      console.log(`\n  ${yellow}Installation cancelled${reset}\n`);
      process.exit(0);
    }
  });

  const pathExamples = runtimes.map(r => {
    const globalPath = getGlobalDir(r, explicitConfigDir);
    return globalPath.replace(os.homedir(), '~');
  }).join(', ');

  const localExamples = runtimes.map(r => `./${getDirName(r)}`).join(', ');

  console.log(`  ${yellow}Where would you like to install?${reset}\n\n  ${cyan}1${reset}) Global ${dim}(${pathExamples})${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(${localExamples})${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    installAllRuntimes(runtimes, isGlobal, true);
  });
}

/**
 * Install Redpill for all selected runtimes
 */
function installAllRuntimes(runtimes, isGlobal, isInteractive) {
  const results = [];

  for (const runtime of runtimes) {
    const result = install(isGlobal, runtime);
    results.push(result);
  }

  const statuslineRuntimes = ['claude'];
  const primaryStatuslineResult = results.find(r => statuslineRuntimes.includes(r.runtime));

  const finalize = (shouldInstallStatusline) => {
    for (const result of results) {
      const useStatusline = statuslineRuntimes.includes(result.runtime) && shouldInstallStatusline;
      finishInstall(
        result.settingsPath,
        result.settings,
        result.statuslineCommand,
        useStatusline,
        result.runtime,
        isGlobal
      );
    }
  };

  if (primaryStatuslineResult) {
    handleStatusline(primaryStatuslineResult.settings, isInteractive, finalize);
  } else {
    finalize(false);
  }
}

// Test-only exports — skip main logic when loaded as a module for testing
if (process.env.Redpill_TEST_MODE) {
  module.exports = {
    yamlIdentifier,
    getCodexSkillAdapterHeader,
    convertClaudeAgentToCodexAgent,
    generateCodexAgentToml,
    generateCodexConfigBlock,
    stripGsdFromCodexConfig,
    mergeCodexConfig,
    installCodexConfig,
    install,
    convertClaudeCommandToCodexSkill,
    convertClaudeToOpencodeFrontmatter,
    neutralizeAgentReferences,
    REDPILL_CODEX_MARKER,
    CODEX_AGENT_SANDBOX,
    getDirName,
    getGlobalDir,
    getConfigDirFromHome,
    writeManifest,
    reportLocalPatches,
    validateHookFields,
  };
} else {

// Main logic
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (explicitConfigDir && hasLocal) {
  console.error(`  ${yellow}Cannot use --config-dir with --local${reset}`);
  process.exit(1);
} else if (hasUninstall) {
  if (!hasGlobal && !hasLocal) {
    console.error(`  ${yellow}--uninstall requires --global or --local${reset}`);
    process.exit(1);
  }
  const runtimes = selectedRuntimes.length > 0 ? selectedRuntimes : ['claude'];
  for (const runtime of runtimes) {
    uninstall(hasGlobal, runtime);
  }
} else if (selectedRuntimes.length > 0) {
  if (!hasGlobal && !hasLocal) {
    promptLocation(selectedRuntimes);
  } else {
    installAllRuntimes(selectedRuntimes, hasGlobal, false);
  }
} else if (hasGlobal || hasLocal) {
  // Default to Claude if no runtime specified but location is
  installAllRuntimes(['claude'], hasGlobal, false);
} else {
  // Interactive
  if (!process.stdin.isTTY) {
    console.log(`  ${yellow}Non-interactive terminal detected, defaulting to Claude Code global install${reset}\n`);
    installAllRuntimes(['claude'], true, false);
  } else {
    promptRuntime((runtimes) => {
      promptLocation(runtimes);
    });
  }
}

} // end of else block for Redpill_TEST_MODE
