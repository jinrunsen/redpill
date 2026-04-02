#!/usr/bin/env node
// redpill-hook-version: {{Redpill_VERSION}}
// BDD Guard — PreToolUse hook
//
// 宪法级约束，拦截两类违规操作：
//
// 1. 禁止修改 config.json 中的 bdd.runner
//    BDD 工具永远是 behave（Python），不可根据项目语言更改。
//
// 2. 禁止 step definitions 中实现领域逻辑
//    step 必须通过 HTTP/gRPC/CLI 调用外部服务，不允许用 Python 模拟业务逻辑。
//
// 触发工具：Write、Edit
// 动作：BLOCK（拒绝操作）

const path = require('path');

// --- 规则 1：禁止修改 bdd.runner ---

// 检测尝试将 runner 改为非 behave 值
const RUNNER_CHANGE_PATTERNS = [
  /"runner"\s*:\s*"(?!behave")[^"]+"/,           // JSON: "runner": "goconvey"
  /['"]runner['"]\s*:\s*['"](?!behave)[^'"]+['"]/,  // 宽松匹配
  /bdd\.runner\s*=\s*['"](?!behave)[^'"]+['"]/,  // 赋值语句
  /runner.*goconvey/i,
  /runner.*cucumber/i,
  /runner.*jest/i,
  /runner.*mocha/i,
  /runner.*vitest/i,
  /runner.*rspec/i,
  /runner.*junit/i,
  /runner.*pytest/i,                              // pytest 是单元测试框架，不是 BDD runner
];

// --- 规则 2：禁止 step definitions 中实现领域逻辑 ---

// step 文件中不应出现的模式（直接实现业务逻辑而非调用外部服务）
const DOMAIN_LOGIC_PATTERNS = [
  // 直接数据库操作
  /(?:cursor|conn|db|session)\s*\.\s*(?:execute|query|insert|update|delete|commit|rollback)\s*\(/,
  // 直接实例化领域对象并调用业务方法
  /(?:service|manager|handler|controller|usecase|interactor)\s*=\s*\w+\s*\(/,
  // 直接导入项目内部模块（非 helpers）
  /from\s+(?:src|internal|pkg|app|domain|core)\b/,
  /import\s+(?:src|internal|pkg|app|domain|core)\b/,
  // 纯 Python 实现业务验证（不调外部接口就做断言）
  /def\s+step_impl.*\n(?:(?!(?:requests|httpx|grpc|subprocess|api_request|context\.(?:response|client|base_url)))[\s\S])*?assert\b/,
];

// 只对 features/steps/ 下的 Python 文件检查规则 2
function isStepFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return /features\/steps\/.*\.py$/.test(normalized) &&
         !normalized.includes('/helpers/');  // helpers 目录不检查
}

function isConfigFile(filePath) {
  const basename = path.basename(filePath);
  return basename === 'config.json' && filePath.includes('.redpill');
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // 只拦截 Write 和 Edit
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    const filePath = data.tool_input?.file_path || '';
    const content = data.tool_input?.content || data.tool_input?.new_string || '';

    if (!content) {
      process.exit(0);
    }

    // --- 检查规则 1：config.json 中的 bdd.runner ---
    if (isConfigFile(filePath)) {
      for (const pattern of RUNNER_CHANGE_PATTERNS) {
        if (pattern.test(content)) {
          const output = {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              decision: 'block',
              reason: '🚫 宪法违规：禁止修改 BDD runner。\n\n' +
                'BDD 工具永远是 behave（Python），不可根据项目语言更改。\n' +
                'behave 从外部黑盒测试服务，与项目内部语言无关。\n\n' +
                '禁止：GoConvey、Cucumber-JVM、Jest、RSpec 等。\n' +
                'config.json 中 bdd.runner 必须是 "behave"，bdd.runner_locked 必须是 true。',
            },
          };
          process.stdout.write(JSON.stringify(output));
          return;
        }
      }
    }

    // --- 检查规则 2：step definitions 中的领域逻辑 ---
    if (isStepFile(filePath)) {
      const findings = [];

      for (const pattern of DOMAIN_LOGIC_PATTERNS) {
        if (pattern.test(content)) {
          findings.push(pattern.source.slice(0, 60) + '...');
        }
      }

      if (findings.length > 0) {
        const output = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            decision: 'block',
            reason: '🚫 宪法违规：step definitions 禁止实现领域逻辑。\n\n' +
              'BDD step 必须通过外部接口（HTTP/gRPC/CLI）调用被测服务，\n' +
              '不允许用 Python 直接实现业务逻辑的模拟版本。\n\n' +
              '检测到的违规模式：\n' +
              findings.map(f => `  - ${f}`).join('\n') + '\n\n' +
              '正确做法：\n' +
              '  ✅ context.response = requests.post(url, json=data)\n' +
              '  ✅ result = api_request(context, "POST", "/users", json=payload)\n' +
              '  ❌ user = UserService().create(name)\n' +
              '  ❌ db.execute("INSERT INTO users ...")\n' +
              '  ❌ from src.domain.user import UserService',
          },
        };
        process.stdout.write(JSON.stringify(output));
        return;
      }
    }

    // 无违规，放行
    process.exit(0);
  } catch {
    // Silent fail — never block on hook errors
    process.exit(0);
  }
});
