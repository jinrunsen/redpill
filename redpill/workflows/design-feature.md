<purpose>
Create a technical design document (DESIGN.md) from .feature file scenarios
and project architecture context. Supports two modes via `--auto` flag:

- **Default (interactive)**: dialogue-driven design — explore architecture
  options with the user, discuss trade-offs, confirm decisions before writing.
- **`--auto`**: autonomous design — analyze scenarios and produce the design
  in a single pass. No questions asked.

Both modes produce the same 7-section DESIGN.md and run a tech reviewer loop
(up to `design_review_max_rounds` rounds, default 3). The output is consumed
by `/redpill:bdd-phase` and `/redpill:run-bdd` as the implementation guide.

All design content **must be written in Chinese** (matching the .feature file
language convention). Only technical identifiers (code symbols, file paths,
API routes) remain in English.
</purpose>

<required_reading>
Read STATE.md (if it exists) before any operation to load project context.
Read CLAUDE.md (if it exists) for project conventions.

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-verifier — Reviews technical design for architecture fitness, performance,
  feasibility, and boundary gaps. Read-only in review mode.
</available_agent_types>

<process>

## 1. Initialize

**NOTE:** There is no `init design-feature` handler. Use `init clarify-feature`
which returns all the context this workflow needs (verifier_model, tech_stack_hint,
design_review_max_rounds, existing features, etc.). Do NOT attempt to call
`init design-feature` — it does not exist and will error.

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for project context: `verifier_model`, `state_path`,
`redpill_dir_exists`, `tech_stack_hint`, `design_review_max_rounds`.

## 2. Parse Arguments

Extract from `$ARGUMENTS`:
- `--auto` → `AUTO_MODE=true`
- `--skip-review` → `SKIP_REVIEW=true`
- Remaining text → `FEATURE_ARG` (feature name, slug, task_id, or file path)

## 3. Locate Feature File

Parse `FEATURE_ARG` to find the target feature:

1. If argument is a file path ending in `.feature` → use directly
2. If argument is a task_id (YYMMDD-xxx format) → look in
   `.redpill/features/{task_id}-*/` for the `.feature` file
3. If argument is a slug or name → search `.redpill/features/*/` and
   `features/` recursively for a matching `.feature` file
4. If argument is empty → list available `.feature` files and ask user to pick

If no feature file found:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► ERROR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 No .feature file found for: ${FEATURE_ARG}

 Create one first:
   /redpill:clarify-feature "describe your requirement"
```

Also check for a TASK.md in the same directory to get context (domain,
original description, extends baseline).

Determine `TASK_DIR` and `SLUG`:
- If feature is in `.redpill/features/{task_id}-{slug}/` → use that directory
- Otherwise → `TASK_DIR=.redpill/designs`, `SLUG` derived from feature filename

## 4. Load Project Context

Read (best-effort):
- `${state_path}` — project state
- `./CLAUDE.md` — project conventions
- The feature file itself — all scenarios to design for
- `TASK.md` in the feature's task directory (if exists)
- Existing source code structure (key files, not everything)
- `tech_stack_hint` from init JSON

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► DESIGN FEATURE ${AUTO_MODE:+(AUTO)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Feature: ${FEATURE_FILE}
 Scenarios: ${N}
 Tech stack: ${tech_stack_summary}
 Mode: ${AUTO_MODE ? "autonomous" : "interactive"}
```

## 5. Design — Interactive Mode (default)

**Skip if:** `--auto` flag is set.

Guide the user through a structured design dialogue. One `AskUserQuestion`
at a time:

### 5a. Architecture Approach

Read the feature scenarios, analyze what changes are needed, and present
2-3 architecture options:

```
AskUserQuestion:
  header: "架构方案"
  question: "基于这 ${N} 个场景，以下是可能的实现方案：\n\n
    1. [方案 A] — [优点] / [缺点]\n
    2. [方案 B] — [优点] / [缺点]\n
    3. [方案 C] — [优点] / [缺点]\n\n
    推荐方案 [X]，因为 [理由]。\n\n选择哪个方案？"
  options:
    - "方案 1"
    - "方案 2"
    - "方案 3"
    - "自定义方案"
```

### 5b. API / Interface Design

Based on the chosen architecture, propose API endpoints or interfaces:

```
AskUserQuestion:
  header: "接口设计"
  question: "以下是建议的接口：\n\n[接口列表]\n\n需要调整吗？"
  options:
    - "确认"
    - "需要调整"
```

If "需要调整" → follow-up AskUserQuestion for specifics.

### 5c. Data Model

Propose data model changes (entities, schema, migrations):

```
AskUserQuestion:
  header: "数据模型"
  question: "以下是数据模型变更：\n\n[模型列表]\n\n确认吗？"
  options:
    - "确认"
    - "需要调整"
```

### 5d. Implementation Order + Risks

Present the implementation sequence (mapped to BDD scenarios) and identified
risks. Ask for confirmation:

```
AskUserQuestion:
  header: "实现顺序与风险"
  question: "实现顺序：\n[顺序表]\n\n识别的风险：\n[风险表]\n\n确认并生成设计文档？"
  options:
    - "确认，生成文档"
    - "需要调整顺序"
    - "需要补充风险项"
```

Capture all decisions for inclusion in the design document.

## 6. Design — Auto Mode

**Skip if:** `--auto` flag is NOT set (interactive mode already ran step 5).

Analyze all scenarios in the feature file and produce the design autonomously
in a single pass. No user interaction.

The design must cover the same 7 sections as interactive mode — the only
difference is that Claude makes all design decisions based on project context
instead of asking the user.

## 7. Write Design Document

Write the design to `${TASK_DIR}/${SLUG}-DESIGN.md`.

Format (all prose in Chinese):

```markdown
---
feature: ${FEATURE_NAME}
feature_file: ${FEATURE_FILE}
created: ${ISO_DATE}
scenarios: ${N}
mode: ${AUTO_MODE ? "auto" : "interactive"}
status: draft
---

# 技术设计：${FEATURE_NAME}

## 概述

[设计目标和范围]

## 架构方案

[选择的架构方案及理由]

决策记录：
- 决策 1: [内容] — 理由: [为什么]
- 决策 2: [内容] — 理由: [为什么]

## API / 接口

[接口定义、请求响应格式、路由]

## 数据模型

[新实体、Schema 变更、迁移脚本]

## 服务层

[业务逻辑组织、模块依赖关系]

## 实现顺序

| # | 组件 | 依赖 | 覆盖场景 |
|---|------|------|---------|
| 1 | ... | — | Scenario: "..." |

## 错误处理

[每个场景的失败模式和恢复策略]

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| ... | ... | ... |
```

## 8. Tech Review Loop (max 3 rounds)

**Skip if:** `--skip-review` flag is set.

```
REVIEW_ROUND=1
REVIEW_MAX=${design_review_max_rounds}  # default 3
```

**Loop:**

```
while REVIEW_ROUND <= REVIEW_MAX:

  Display: ◆ Spawning tech reviewer (round ${REVIEW_ROUND}/${REVIEW_MAX})

  Agent(
    subagent_type="redpill-verifier",
    model="${verifier_model}",
    description="Tech review design: ${SLUG} (round ${REVIEW_ROUND})",
    prompt="
      <objective>
      Review the technical design document for architecture fitness,
      performance impact, implementation feasibility, and boundary gaps.
      </objective>

      <files_to_read>
      - ${DESIGN_PATH}
      - ${FEATURE_FILE}
      - ./CLAUDE.md (if exists)
      </files_to_read>

      <review_dimensions>
      1. Architecture fit — does the design follow project conventions?
      2. Performance — any obvious bottlenecks or scaling concerns?
      3. Implementation order — is the sequence logical? Dependencies correct?
      4. Boundary gaps — missing error handling, edge cases not covered?
      5. API design — backwards compatible? Consistent with existing patterns?
      6. Scope — does the design stay within the feature boundary?
      </review_dimensions>

      <output>
      Return ONE of:
      - ## REVIEW PASSED — all dimensions acceptable
      - ## ISSUES FOUND — list issues with severity (BLOCKING / ADVISORY)
      </output>
    "
  )

  if result contains "## REVIEW PASSED":
    Display: ◆ Tech review passed (round ${REVIEW_ROUND})
    break

  if result contains "## ISSUES FOUND":
    Extract BLOCKING and ADVISORY issues

    **Interactive mode:** Present issues to user via AskUserQuestion,
    let them choose which to fix and how.

    **Auto mode:** Auto-fix BLOCKING issues by editing the design document.
    Log ADVISORY issues.

    REVIEW_ROUND++

end while
```

After review loop, update DESIGN.md frontmatter `status: reviewed`.

## 9. Finalize

Update TASK.md (if exists) with design path reference.

Commit:
```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "feat(design): ${AUTO_MODE ? 'auto-generate' : 'create'} technical design for ${SLUG}" \
  --files "${DESIGN_PATH}" "${TASK_DIR}/TASK.md"
```

Display completion:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► DESIGN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Feature: ${FEATURE_FILE}
 Design: ${DESIGN_PATH}
 Mode: ${AUTO_MODE ? "autonomous" : "interactive"}
 Review rounds: ${REVIEW_ROUND}/${REVIEW_MAX}
 Status: reviewed

 Next:
   /redpill:run-bdd ${FEATURE_FILE} --design ${DESIGN_PATH}
   /redpill:bdd-phase {N}
```

</process>

<success_criteria>
- [ ] Feature file located from argument (path, task_id, slug, or user pick)
- [ ] --auto and --skip-review flags parsed correctly
- [ ] Project context loaded (STATE.md, CLAUDE.md, tech_stack_hint)
- [ ] Interactive mode: 4 design dialogue stages (architecture, API, data model, order+risks)
- [ ] Auto mode: single-pass generation covering all 7 sections
- [ ] Design document written in Chinese with 7 sections
- [ ] DESIGN.md frontmatter includes mode (auto/interactive)
- [ ] Tech reviewer spawned (unless --skip-review)
- [ ] Review loop caps at design_review_max_rounds (default 3)
- [ ] Interactive review: issues presented to user for decision
- [ ] Auto review: BLOCKING auto-fixed, ADVISORY logged
- [ ] DESIGN.md status updated to "reviewed" after passing
- [ ] TASK.md updated with design path reference
- [ ] Committed via redpill-tools.cjs
- [ ] Completion banner with next-step suggestions
</success_criteria>
