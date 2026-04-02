#!/usr/bin/env node

/**
 * Redpill Tools — CLI utility for Redpill (BDD) workflow operations
 *
 * Usage: node redpill-tools.cjs <command> [args] [--raw] [--pick <field>]
 *
 * State Commands:
 *   state init                         Initialize .redpill/ directory structure
 *   state update                       Aggregate data and regenerate STATE.md
 *   state read                         Parse STATE.md as JSON
 *   state position --feature --branch  Update current position in STATE.md
 *   state activity --message <msg>     Append activity entry to STATE.md
 *
 * BDD Commands:
 *   bdd next-failing                   Find first todo/active scenario
 *   bdd regression-check               List all done scenarios
 *   bdd summary                        Aggregate BDD scenario progress
 *   bdd mark-done <feature> <scenario> Mark scenario as done
 *
 * Decisions Commands:
 *   decisions add --title --context ... Add a decision record
 *   decisions list                      List all decisions
 *   decisions get <id>                  Get decision by ID
 *
 * Signals Commands:
 *   signals emit --type --severity ...  Emit a change signal
 *   signals list                        List unresolved signals
 *   signals resolve <id> <resolution>   Resolve a signal
 *   signals collect                     Collect signals from stdin
 *
 * Progress Commands:
 *   progress update                     Update progress with BDD summary
 *   progress history                    Show progress history
 *
 * Utility Commands:
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   commit <message> [--files f1 f2]   Commit planning docs
 *   generate-slug <text>               Convert text to URL-safe slug
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   list-todos [area]                  Count and enumerate pending todos
 *   verify-path-exists <path>          Check file/directory existence
 *   config-ensure-section              Initialize .redpill/config.json
 *
 * Frontmatter CRUD:
 *   frontmatter get <file> [--field k] Extract frontmatter as JSON
 *   frontmatter set <file> --field k   Update single frontmatter field
 *   frontmatter merge <file>           Merge JSON into frontmatter
 *   frontmatter validate <file>        Validate required fields
 *
 * Template:
 *   template select <type>             Select template
 *   template fill <type> [--options]   Fill template
 *
 * Init:
 *   init resume                        All context for resume-project workflow
 *   init todos [area]                  All context for todo workflows
 */

const fs = require('fs');
const path = require('path');

// Resolve lib path relative to this file's location, works both in repo root and installed location
const LIB = fs.existsSync(path.join(__dirname, 'bin', 'lib'))
  ? path.join(__dirname, 'bin', 'lib')   // repo root: ./bin/lib/
  : path.join(__dirname, 'lib');          // installed:  ./lib/ (same dir as this file)

const core = require(path.join(LIB, 'core.cjs'));
const { error, findProjectRoot, getActiveWorkstream } = core;
const config = require(path.join(LIB, 'config.cjs'));
const template = require(path.join(LIB, 'template.cjs'));
const commands = require(path.join(LIB, 'commands.cjs'));
const init = require(path.join(LIB, 'init.cjs'));
const frontmatter = require(path.join(LIB, 'frontmatter.cjs'));

// Lazy-loaded modules — loaded on first use to avoid startup overhead
let _state, _bdd, _decisions, _signals, _progress;
function getState() { return _state || (_state = require(path.join(LIB, 'state.cjs'))); }
function getBdd() { return _bdd || (_bdd = require(path.join(LIB, 'bdd.cjs'))); }
function getDecisions() { return _decisions || (_decisions = require(path.join(LIB, 'decisions.cjs'))); }
function getSignals() { return _signals || (_signals = require(path.join(LIB, 'signals.cjs'))); }
function getProgress() { return _progress || (_progress = require(path.join(LIB, 'progress.cjs'))); }

// ─── Arg parsing helpers ──────────────────────────────────────────────────────

/**
 * Extract named --flag <value> pairs from an args array.
 * Returns an object mapping flag names to their values (null if absent).
 * Flags listed in `booleanFlags` are treated as boolean (no value consumed).
 *
 * parseNamedArgs(args, 'phase', 'plan')        → { phase: '3', plan: '1' }
 * parseNamedArgs(args, [], ['amend', 'force'])  → { amend: true, force: false }
 */
function parseNamedArgs(args, valueFlags = [], booleanFlags = []) {
  const result = {};
  for (const flag of valueFlags) {
    const idx = args.indexOf(`--${flag}`);
    result[flag] = idx !== -1 && args[idx + 1] !== undefined && !args[idx + 1].startsWith('--')
      ? args[idx + 1]
      : null;
  }
  for (const flag of booleanFlags) {
    result[flag] = args.includes(`--${flag}`);
  }
  return result;
}

/**
 * Collect all tokens after --flag until the next --flag or end of args.
 * Handles multi-word values like --name Foo Bar Version 1.
 * Returns null if the flag is absent.
 */
function parseMultiwordArg(args, flag) {
  const idx = args.indexOf(`--${flag}`);
  if (idx === -1) return null;
  const tokens = [];
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    tokens.push(args[i]);
  }
  return tokens.length > 0 ? tokens.join(' ') : null;
}

// ─── Output helper for new-style commands ────────────────────────────────────

/**
 * Output a result object as JSON (or raw stringify for --raw).
 */
function outputResult(result, raw) {
  if (raw) {
    fs.writeSync(1, JSON.stringify(result));
  } else {
    fs.writeSync(1, JSON.stringify(result, null, 2));
  }
}

/**
 * Load bdd.features_dir from config.json (default: 'features')
 */
function loadBddFeaturesDir(cwd) {
  try {
    const configPath = path.join(cwd, '.redpill', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return (cfg.bdd && cfg.bdd.features_dir) || 'features';
  } catch {
    return 'features';
  }
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Optional cwd override for sandboxed subagents running outside project root.
  let cwd = process.cwd();
  const cwdEqArg = args.find(arg => arg.startsWith('--cwd='));
  const cwdIdx = args.indexOf('--cwd');
  if (cwdEqArg) {
    const value = cwdEqArg.slice('--cwd='.length).trim();
    if (!value) error('Missing value for --cwd');
    args.splice(args.indexOf(cwdEqArg), 1);
    cwd = path.resolve(value);
  } else if (cwdIdx !== -1) {
    const value = args[cwdIdx + 1];
    if (!value || value.startsWith('--')) error('Missing value for --cwd');
    args.splice(cwdIdx, 2);
    cwd = path.resolve(value);
  }

  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    error(`Invalid --cwd: ${cwd}`);
  }

  // Resolve worktree root: in a linked worktree, .redpill/ lives in the main worktree.
  // However, in monorepo worktrees where the subdirectory itself owns .redpill/,
  // skip worktree resolution — the CWD is already the correct project root.
  const { resolveWorktreeRoot } = require(path.join(LIB, 'core.cjs'));
  if (!fs.existsSync(path.join(cwd, '.redpill'))) {
    const worktreeRoot = resolveWorktreeRoot(cwd);
    if (worktreeRoot !== cwd) {
      cwd = worktreeRoot;
    }
  }

  // Optional workstream override for parallel milestone work.
  // Priority: --ws flag > REDPILL_WORKSTREAM env var > active-workstream file > null (flat mode)
  const wsEqArg = args.find(arg => arg.startsWith('--ws='));
  const wsIdx = args.indexOf('--ws');
  let ws = null;
  if (wsEqArg) {
    ws = wsEqArg.slice('--ws='.length).trim();
    if (!ws) error('Missing value for --ws');
    args.splice(args.indexOf(wsEqArg), 1);
  } else if (wsIdx !== -1) {
    ws = args[wsIdx + 1];
    if (!ws || ws.startsWith('--')) error('Missing value for --ws');
    args.splice(wsIdx, 2);
  } else if (process.env.REDPILL_WORKSTREAM) {
    ws = process.env.REDPILL_WORKSTREAM.trim();
  } else {
    ws = getActiveWorkstream(cwd);
  }
  // Validate workstream name to prevent path traversal attacks.
  if (ws && !/^[a-zA-Z0-9_-]+$/.test(ws)) {
    error('Invalid workstream name: must be alphanumeric, hyphens, and underscores only');
  }
  // Set env var so all modules (planningDir, planningPaths) auto-resolve workstream paths
  if (ws) {
    process.env.REDPILL_WORKSTREAM = ws;
  }

  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  // --pick <name>: extract a single field from JSON output (replaces jq dependency).
  // Supports dot-notation (e.g., --pick workflow.research) and bracket notation
  // for arrays (e.g., --pick directories[-1]).
  const pickIdx = args.indexOf('--pick');
  let pickField = null;
  if (pickIdx !== -1) {
    pickField = args[pickIdx + 1];
    if (!pickField || pickField.startsWith('--')) error('Missing value for --pick');
    args.splice(pickIdx, 2);
  }

  const command = args[0];

  const HELP_TEXT = `Redpill Tools — BDD 驱动开发框架 CLI 工具

用法: node redpill-tools.cjs <command> [subcommand] [args] [--raw] [--pick <field>] [--cwd <path>]

命令:
  state init              创建 .redpill/ 目录结构
  state update            聚合数据源重新生成 STATE.md
  state read              解析 STATE.md 为 JSON
  state position          更新当前位置（--feature, --branch, --worktree, --lastCommand）
  state activity          追加活动记录（--message "..."）

  bdd summary             扫描 .feature 文件，统计 @status 分布
  bdd next-failing        找到下一个 @status-todo 场景
  bdd regression-check    列出所有 @status-done 场景（用于回归检查）
  bdd mark-done           标记场景为 @status-done

  decisions add           创建决策记录（--source, --title, --context, --decision, --consequences）
  decisions list          列出所有决策
  decisions get           读取单条决策（--id DEC-NNN）

  signals emit            发出变更信号（--type, --severity, --source, --affects, --description）
  signals list            列出未解决信号
  signals resolve         解决信号（--id sig-NNN, --resolution "..."）

  progress update         更新进度快照
  progress history        查看进度历史

  resolve-model <agent>   获取 agent 的 model 配置
  commit <message>        提交规划文档
  generate-slug <text>    生成 URL 安全 slug
  current-timestamp       获取当前时间戳
  list-todos [area]       列出待办事项
  init resume             恢复上次会话上下文
  init todos [area]       获取待办列表上下文

全局参数:
  --raw                   JSON 原始输出
  --pick <field>          提取 JSON 中的指定字段（支持 a.b.c 和 arr[-1] 语法）
  --cwd <path>            指定项目根目录
`;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(HELP_TEXT);
    if (!command) process.exit(1);
    process.exit(0);
  }

  // Multi-repo guard: resolve project root for commands that read/write .redpill/.
  // Skip for pure-utility commands that don't touch .redpill/ to avoid unnecessary
  // filesystem traversal on every invocation.
  const SKIP_ROOT_RESOLUTION = new Set([
    'generate-slug', 'current-timestamp', 'verify-path-exists',
    'verify-summary', 'template', 'frontmatter',
  ]);
  if (!SKIP_ROOT_RESOLUTION.has(command)) {
    cwd = findProjectRoot(cwd);
  }

  // When --pick is active, intercept stdout to extract the requested field.
  if (pickField) {
    const origWriteSync = fs.writeSync;
    const chunks = [];
    fs.writeSync = function (fd, data, ...rest) {
      if (fd === 1) { chunks.push(String(data)); return; }
      return origWriteSync.call(fs, fd, data, ...rest);
    };
    const cleanup = () => {
      fs.writeSync = origWriteSync;
      const captured = chunks.join('');
      let jsonStr = captured;
      if (jsonStr.startsWith('@file:')) {
        jsonStr = fs.readFileSync(jsonStr.slice(6), 'utf-8');
      }
      try {
        const obj = JSON.parse(jsonStr);
        const value = extractField(obj, pickField);
        const result = value === null || value === undefined ? '' : String(value);
        origWriteSync.call(fs, 1, result);
      } catch {
        origWriteSync.call(fs, 1, captured);
      }
    };
    try {
      await runCommand(command, args, cwd, raw);
      cleanup();
    } catch (e) {
      fs.writeSync = origWriteSync;
      throw e;
    }
    return;
  }

  await runCommand(command, args, cwd, raw);
}

/**
 * Extract a field from an object using dot-notation and bracket syntax.
 * Supports: 'field', 'parent.child', 'arr[-1]', 'arr[0]'
 */
function extractField(obj, fieldPath) {
  const parts = fieldPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const bracketMatch = part.match(/^(.+?)\[(-?\d+)]$/);
    if (bracketMatch) {
      const key = bracketMatch[1];
      const index = parseInt(bracketMatch[2], 10);
      current = current[key];
      if (!Array.isArray(current)) return undefined;
      current = index < 0 ? current[current.length + index] : current[index];
    } else {
      current = current[part];
    }
  }
  return current;
}

async function runCommand(command, args, cwd, raw) {
  switch (command) {
    case 'state': {
      const subcommand = args[1];
      const state = getState();
      if (subcommand === 'init') {
        const result = state.stateInit(cwd);
        outputResult(result, raw);
      } else if (subcommand === 'update') {
        const result = state.stateUpdate(cwd);
        outputResult(result, raw);
      } else if (subcommand === 'read') {
        const result = state.stateRead(cwd);
        outputResult(result, raw);
      } else if (subcommand === 'position') {
        const parsedArgs = parseNamedArgs(args, ['feature', 'branch', 'worktree', 'lastCommand']);
        const result = state.statePosition(cwd, parsedArgs);
        outputResult(result, raw);
      } else if (subcommand === 'activity') {
        const message = parseMultiwordArg(args, 'message') || args.slice(2).filter(a => !a.startsWith('--')).join(' ');
        const result = state.stateActivity(cwd, message);
        outputResult(result, raw);
      } else {
        error('Unknown state subcommand. Available: init, update, read, position, activity');
      }
      break;
    }

    case 'bdd': {
      const subcommand = args[1];
      const bdd = getBdd();
      const bddFeaturesDir = loadBddFeaturesDir(cwd);
      if (subcommand === 'next-failing') {
        const result = bdd.bddNextFailing(cwd, bddFeaturesDir);
        outputResult(result, raw);
      } else if (subcommand === 'regression-check') {
        const result = bdd.bddRegressionCheck(cwd, bddFeaturesDir);
        outputResult(result, raw);
      } else if (subcommand === 'summary') {
        const result = bdd.bddSummary(cwd, bddFeaturesDir);
        outputResult(result, raw);
      } else if (subcommand === 'mark-done') {
        const featurePath = args[2];
        const scenarioName = parseMultiwordArg(args, 'scenario') || args.slice(3).filter(a => !a.startsWith('--')).join(' ');
        if (!featurePath) error('bdd mark-done: feature path required');
        if (!scenarioName) error('bdd mark-done: scenario name required');
        const fullPath = path.isAbsolute(featurePath) ? featurePath : path.join(cwd, featurePath);
        const result = bdd.bddMarkDone(fullPath, scenarioName);
        outputResult({ modified: result }, raw);
      } else {
        error('Unknown bdd subcommand. Available: next-failing, regression-check, summary, mark-done');
      }
      break;
    }

    case 'decisions': {
      const subcommand = args[1];
      const decisions = getDecisions();
      if (subcommand === 'add') {
        const parsedArgs = parseNamedArgs(args, ['source', 'scenario', 'title', 'context', 'decision', 'consequences']);
        const result = decisions.decisionsAdd(cwd, parsedArgs);
        outputResult(result, raw);
      } else if (subcommand === 'list') {
        const result = decisions.decisionsList(cwd);
        outputResult(result, raw);
      } else if (subcommand === 'get') {
        const id = args[2];
        if (!id) error('decisions get: id required');
        const result = decisions.decisionsGet(cwd, id);
        outputResult(result, raw);
      } else {
        error('Unknown decisions subcommand. Available: add, list, get');
      }
      break;
    }

    case 'signals': {
      const subcommand = args[1];
      const signals = getSignals();
      if (subcommand === 'emit') {
        const parsedArgs = parseNamedArgs(args, ['type', 'severity', 'source', 'affects', 'description']);
        const result = signals.signalsEmit(cwd, parsedArgs);
        outputResult(result, raw);
      } else if (subcommand === 'list') {
        const result = signals.signalsList(cwd);
        outputResult(result, raw);
      } else if (subcommand === 'resolve') {
        const id = args[2];
        const resolution = parseMultiwordArg(args, 'resolution') || args.slice(3).filter(a => !a.startsWith('--')).join(' ');
        if (!id) error('signals resolve: id required');
        if (!resolution) error('signals resolve: resolution required');
        signals.signalsResolve(cwd, id, resolution);
        outputResult({ resolved: id }, raw);
      } else if (subcommand === 'collect') {
        // Read from stdin
        let stdinText = '';
        try {
          stdinText = fs.readFileSync(0, 'utf-8');
        } catch { /* no stdin */ }
        const result = signals.signalsCollect(cwd, stdinText);
        outputResult(result, raw);
      } else {
        error('Unknown signals subcommand. Available: emit, list, resolve, collect');
      }
      break;
    }

    case 'progress': {
      const subcommand = args[1];
      const progress = getProgress();
      if (subcommand === 'update') {
        const bdd = getBdd();
        const bddFeaturesDir = loadBddFeaturesDir(cwd);
        const bddSummary = bdd.bddSummary(cwd, bddFeaturesDir);
        const result = progress.progressUpdate(cwd, bddSummary);
        outputResult(result, raw);
      } else if (subcommand === 'history') {
        const result = progress.progressHistory(cwd);
        outputResult(result, raw);
      } else {
        error('Unknown progress subcommand. Available: update, history');
      }
      break;
    }

    case 'resolve-model': {
      commands.cmdResolveModel(cwd, args[1], raw);
      break;
    }

    case 'commit': {
      const amend = args.includes('--amend');
      const noVerify = args.includes('--no-verify');
      const filesIndex = args.indexOf('--files');
      const endIndex = filesIndex !== -1 ? filesIndex : args.length;
      const messageArgs = args.slice(1, endIndex).filter(a => !a.startsWith('--'));
      const message = messageArgs.join(' ') || undefined;
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      commands.cmdCommit(cwd, message, files, raw, amend, noVerify);
      break;
    }

    case 'template': {
      const subcommand = args[1];
      if (subcommand === 'select') {
        template.cmdTemplateSelect(cwd, args[2], raw);
      } else if (subcommand === 'fill') {
        const templateType = args[2];
        const { phase, plan, name, type, wave, fields: fieldsRaw } = parseNamedArgs(args, ['phase', 'plan', 'name', 'type', 'wave', 'fields']);
        let fields = {};
        if (fieldsRaw) {
          const { safeJsonParse } = require(path.join(LIB, 'security.cjs'));
          const result = safeJsonParse(fieldsRaw, { label: '--fields' });
          if (!result.ok) error(result.error);
          fields = result.value;
        }
        template.cmdTemplateFill(cwd, templateType, {
          phase, plan, name, fields,
          type: type || 'execute',
          wave: wave || '1',
        }, raw);
      } else {
        error('Unknown template subcommand. Available: select, fill');
      }
      break;
    }

    case 'frontmatter': {
      const subcommand = args[1];
      const file = args[2];
      if (subcommand === 'get') {
        frontmatter.cmdFrontmatterGet(cwd, file, parseNamedArgs(args, ['field']).field, raw);
      } else if (subcommand === 'set') {
        const { field, value } = parseNamedArgs(args, ['field', 'value']);
        frontmatter.cmdFrontmatterSet(cwd, file, field, value !== null ? value : undefined, raw);
      } else if (subcommand === 'merge') {
        frontmatter.cmdFrontmatterMerge(cwd, file, parseNamedArgs(args, ['data']).data, raw);
      } else if (subcommand === 'validate') {
        frontmatter.cmdFrontmatterValidate(cwd, file, parseNamedArgs(args, ['schema']).schema, raw);
      } else {
        error('Unknown frontmatter subcommand. Available: get, set, merge, validate');
      }
      break;
    }

    case 'generate-slug': {
      commands.cmdGenerateSlug(args[1], raw);
      break;
    }

    case 'current-timestamp': {
      commands.cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'list-todos': {
      commands.cmdListTodos(cwd, args[1], raw);
      break;
    }

    case 'verify-path-exists': {
      commands.cmdVerifyPathExists(cwd, args[1], raw);
      break;
    }

    case 'config-ensure-section': {
      config.cmdConfigEnsureSection(cwd, raw);
      break;
    }

    case 'config-set': {
      config.cmdConfigSet(cwd, args[1], args[2], raw);
      break;
    }

    case "config-set-model-profile": {
      config.cmdConfigSetModelProfile(cwd, args[1], raw);
      break;
    }

    case 'config-get': {
      config.cmdConfigGet(cwd, args[1], raw);
      break;
    }

    case 'config-new-project': {
      config.cmdConfigNewProject(cwd, args[1], raw);
      break;
    }

    case 'agent-skills': {
      init.cmdAgentSkills(cwd, args[1], raw);
      break;
    }

    case 'todo': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        commands.cmdTodoComplete(cwd, args[2], raw);
      } else {
        error('Unknown todo subcommand. Available: complete');
      }
      break;
    }

    case 'init': {
      const workflow = args[1];
      switch (workflow) {
        case 'resume':
          init.cmdInitResume(cwd, raw);
          break;
        case 'todos':
          init.cmdInitTodos(cwd, args[2], raw);
          break;
        default:
          error(`Unknown init workflow: ${workflow}\nAvailable: resume, todos`);
      }
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();
