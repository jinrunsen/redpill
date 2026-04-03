/**
 * Init — Compound init commands for workflow bootstrapping
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, pathExistsInternal, planningPaths, planningDir, planningRoot, toPosixPath, output, error, checkAgentsInstalled } = require('./core.cjs');

/**
 * Inject `project_root` into an init result object.
 */
function withProjectRoot(cwd, result) {
  result.project_root = cwd;
  const agentStatus = checkAgentsInstalled();
  result.agents_installed = agentStatus.agents_installed;
  result.missing_agents = agentStatus.missing_agents;
  return result;
}

function cmdInitResume(cwd, raw) {
  const config = loadConfig(cwd);

  // Check for interrupted agent
  let interruptedAgentId = null;
  try {
    interruptedAgentId = fs.readFileSync(path.join(planningRoot(cwd), 'current-agent-id.txt'), 'utf-8').trim();
  } catch { /* intentionally empty */ }

  const result = {
    // File existence
    state_exists: fs.existsSync(path.join(planningDir(cwd), 'STATE.md')),
    roadmap_exists: fs.existsSync(path.join(planningDir(cwd), 'ROADMAP.md')),
    project_exists: pathExistsInternal(cwd, '.redpill/PROJECT.md'),
    planning_exists: fs.existsSync(planningRoot(cwd)),

    // File paths
    state_path: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'STATE.md'))),
    roadmap_path: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'ROADMAP.md'))),
    project_path: '.redpill/PROJECT.md',

    // Agent state
    has_interrupted_agent: !!interruptedAgentId,
    interrupted_agent_id: interruptedAgentId,

    // Config
    commit_docs: config.commit_docs,
  };

  output(withProjectRoot(cwd, result), raw);
}

function cmdInitTodos(cwd, area, raw) {
  const config = loadConfig(cwd);
  const now = new Date();

  // List todos (reuse existing logic)
  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');
  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'todos', 'pending', file))),
        });
      } catch { /* intentionally empty */ }
    }
  } catch { /* intentionally empty */ }

  const result = {
    // Config
    commit_docs: config.commit_docs,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Todo inventory
    todo_count: count,
    todos,
    area_filter: area || null,

    // Paths
    pending_dir: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'todos', 'pending'))),
    completed_dir: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'todos', 'completed'))),

    // File existence
    planning_exists: fs.existsSync(planningDir(cwd)),
    todos_dir_exists: fs.existsSync(path.join(planningDir(cwd), 'todos')),
    pending_dir_exists: fs.existsSync(path.join(planningDir(cwd), 'todos', 'pending')),
  };

  output(withProjectRoot(cwd, result), raw);
}

/**
 * Build a formatted agent skills block for injection into Task() prompts.
 */
function buildAgentSkillsBlock(config, agentType, projectRoot) {
  const { validatePath } = require('./security.cjs');

  if (!config || !config.agent_skills || !agentType) return '';

  let skillPaths = config.agent_skills[agentType];
  if (!skillPaths) return '';

  if (typeof skillPaths === 'string') skillPaths = [skillPaths];
  if (!Array.isArray(skillPaths) || skillPaths.length === 0) return '';

  const validPaths = [];
  for (const skillPath of skillPaths) {
    if (typeof skillPath !== 'string') continue;

    const pathCheck = validatePath(skillPath, projectRoot);
    if (!pathCheck.safe) {
      process.stderr.write(`[agent-skills] WARNING: Skipping unsafe path "${skillPath}": ${pathCheck.error}\n`);
      continue;
    }

    const skillMdPath = path.join(projectRoot, skillPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      process.stderr.write(`[agent-skills] WARNING: Skill not found at "${skillPath}/SKILL.md" — skipping\n`);
      continue;
    }

    validPaths.push(skillPath);
  }

  if (validPaths.length === 0) return '';

  const lines = validPaths.map(p => `- @${p}/SKILL.md`).join('\n');
  return `<agent_skills>\nRead these user-configured skills:\n${lines}\n</agent_skills>`;
}

function cmdAgentSkills(cwd, agentType, raw) {
  if (!agentType) {
    output('', raw, '');
    return;
  }

  const config = loadConfig(cwd);
  const block = buildAgentSkillsBlock(config, agentType, cwd);
  if (block) {
    process.stdout.write(block);
  }
  process.exit(0);
}

module.exports = {
  cmdInitResume,
  cmdInitTodos,
  buildAgentSkillsBlock,
  cmdAgentSkills,
};
