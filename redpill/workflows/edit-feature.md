<purpose>
Edit an existing `.feature` file in-place, then validate it with
`redpill-feature-reviewer`. Unlike `/redpill:clarify-feature` which stages
output in `.redpill/features/{task_id}-{slug}/`, this command modifies the
target file directly — no task workspace is created.

Two modes, toggled by `--auto`:

- **Default (interactive)**: show current scenarios, ask what to change,
  confirm edits with the user, run reviewer loop interactively.
- **`--auto`**: apply the edit description autonomously, auto-fix technical
  reviewer issues, stash product-decision questions into the file's
  `# TODO: Open questions` block.

Use case: quick in-place refinement of an existing feature file without the
overhead of a task workspace.
</purpose>

<required_reading>
Read STATE.md (if it exists) before any operation to load project context.
Read CLAUDE.md (if it exists) for project conventions.

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-feature-reviewer — Reviews Gherkin spec quality, business language, and
  sample data authenticity. Read-only.
</available_agent_types>

<process>

## 1. Initialize

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init edit-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `verifier_model`, `text_mode`, `redpill_dir_exists`, `state_path`,
`claude_md_path`, `existing_features[]`, `existing_feature_domains[]`,
`has_existing_features`, `tech_stack_hint`, `feature_review_max_rounds`,
`feature_auto_scenario_cap`.

## 2. Parse Arguments

Extract from `$ARGUMENTS`:
- First positional argument → `FEATURE_PATH` (path to the `.feature` file)
- `--auto` → `AUTO_MODE=true`
- `--add <description>` → `ADD_DESCRIPTION=<description>`
- `--text` OR init `text_mode: true` → `TEXT_MODE=true`

Validate `FEATURE_PATH`:
- If empty: error out:
  ```
  A .feature file path is required. Usage:
    /redpill:edit-feature path/to/file.feature [--auto] [--add "description"]
  ```
- If file does not exist: error out:
  ```
  Feature file not found: ${FEATURE_PATH}
  ```

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► EDIT FEATURE ${AUTO_MODE:+(AUTO)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 File: ${FEATURE_PATH}
 Edit: ${ADD_DESCRIPTION:-(interactive)}
```

## 3. Load Context

Read (best-effort, continue on failure):
- `${state_path}` if `redpill_dir_exists` is true
- `${claude_md_path}` if it exists
- `${FEATURE_PATH}` — the file to edit (REQUIRED — fail if unreadable)
- Other files in `existing_features[]` — study step wording for consistency

Use `tech_stack_hint` to calibrate scenario vocabulary.

Infer `DOMAIN` from the file's location: if `FEATURE_PATH` matches
`features/<domain>/...`, extract `<domain>`. Otherwise `DOMAIN=""`.

## 4. Understand Edit Intent

**Interactive mode** — ask the user what to change:

1. Display current feature content summary (feature name, scenario count,
   scenario names).
2. `AskUserQuestion`:
   ```
   header: "Edit"
   question: "What would you like to change in this feature file?"
   options:
     - "Add new scenarios"
     - "Modify existing scenarios"
     - "Review and fix quality issues only"
     - "Rewrite entirely"
     - "Describe changes in text"
   ```
3. Based on selection, gather specifics:
   - "Add new scenarios" → ask what behaviors to add
   - "Modify existing scenarios" → ask which scenario(s) and what to change
   - "Review and fix quality issues only" → skip to step 6 (no content generation)
   - "Rewrite entirely" → ask for the new direction/requirements
   - "Describe changes in text" → free-text input

**Auto mode:**
- If `ADD_DESCRIPTION` is set → use it as the edit intent
- If `ADD_DESCRIPTION` is empty → treat as "review and fix quality issues only"

## 5. Generate Edits

Apply the edit intent to the feature file content. Follow the same content
rules as `/redpill:clarify-feature`:

**Rules (both modes):**
- **所有 Gherkin 内容必须使用中文编写。** Feature 标题、场景名称、
  Given/When/Then 步骤描述、As a/I want/So that 头部——全部中文。
  仅以下内容保留英文：Gherkin 关键词（`Feature:`、`Scenario:`、`Given`、
  `When`、`Then`、`And`、`But`）、标签（`@status-pending`）、
  表格中的技术标识符（字段名、路径、URL）。
- Each new scenario gets `@status-pending`
- All concrete values MUST be realistic domain-appropriate data.
  **Forbidden**: `A`, `B`, `C`, `组 1`, `组 2`, `Foo`, `Bar`, `user1`, `user2`,
  `测试部门`, `xxx 公司`, `示例地址`, `11111`, lorem ipsum.
- Preserve existing scenario tags (e.g., `@status-done`) unless explicitly
  being modified.
- Auto mode: cap new scenarios at `feature_auto_scenario_cap`.

**Interactive mode:**
- Present the proposed changes (diff-style) and confirm with user before applying.

**Auto mode:**
- Apply changes directly.

**"Review and fix quality issues only" mode:**
- Skip this step entirely — go straight to step 6 (reviewer will catch issues).

## 6. Write Changes

Apply edits to `${FEATURE_PATH}` using `Edit` tool for targeted changes or
`Write` tool for full rewrites.

If the edit intent was "Review and fix quality issues only", skip this step
(the file is unchanged — the reviewer in step 7 will find issues to fix).

## 7. Feature Reviewer — Round 1

Record round number: `ROUND=1`.

Display: `◆ Spawning feature-reviewer for: ${FEATURE_PATH} (round ${ROUND}/${feature_review_max_rounds})`

Dispatch the reviewer:

```
Agent(
  subagent_type="redpill-feature-reviewer",
  model="${verifier_model}",
  description="Review feature: ${FEATURE_PATH}",
  prompt="
    <objective>
    Review the Gherkin .feature file for spec quality, business language,
    AND sample data authenticity (no placeholder values — every concrete
    value must be realistic domain-appropriate data).
    </objective>

    <files_to_read>
    - ${FEATURE_PATH}
    </files_to_read>

    <review_emphasis>
    Explicitly audit every sample value in the scenarios. Flag any abstract
    placeholders (A/B/C, 组1/组2, Foo/Bar, user1/user2, '测试部门') as
    CRITICAL auto-fixable issues with a concrete realistic replacement in
    the 'suggestion' field, using domain-appropriate vocabulary.
    </review_emphasis>

    <output_contract>
    Return a <FEATURE_REVIEW> block as specified in your agent definition.
    Every issue MUST have a 'category' field (auto-fixable | product-decision).
    </output_contract>
  "
)
```

Parse the returned `<FEATURE_REVIEW>` YAML block. Extract:
- `verdict`
- `issues[]` split into:
  - `tech_issues[]` — issues with `category: auto-fixable`
  - `product_issues[]` — issues with `category: product-decision`

If the output does not contain a `<FEATURE_REVIEW>` block, retry the reviewer
once. If still missing, abort with:
```
Reviewer returned no <FEATURE_REVIEW> block after 2 attempts. Aborting.
File unchanged: ${FEATURE_PATH}
```

## 8. Process Technical Issues

**Skip this step if `tech_issues[]` is empty.**

**Interactive mode:**

Display the list of technical issues with their suggestions, then use a single
`AskUserQuestion`:
```
header: "Technical fixes"
question: "Apply these ${N} technical fixes from the reviewer?"
options:
  - "Apply all"
  - "Skip all"
  - "Choose individually"
```

- "Apply all" → apply every suggestion via `Edit` on `${FEATURE_PATH}`
- "Skip all" → no changes; record 0 applied
- "Choose individually" → loop, one `AskUserQuestion` per issue:
  ```
  header: "Issue ${id}"
  question: "${description}\nSuggestion: ${suggestion}\nApply?"
  options: ["Apply", "Skip"]
  ```

**Auto mode:**

Apply every `auto-fixable` issue's `suggestion` directly via `Edit` on
`${FEATURE_PATH}`. Track a running count in `AUTO_FIXED`. No user interaction.

## 9. Process Product Issues

**Skip this step if `product_issues[]` is empty.**

**Interactive mode:** For each `product_issue`, use `AskUserQuestion`:
```
header: "Product question"
question: "${description}\n\nReviewer's question: ${question_for_human}\n\nReviewer's suggested direction: ${suggestion_or_"none"}\n\nHow do you want to handle this?"
options:
  - "Accept reviewer's suggestion"
  - "Write my own fix"           (follow-up: free-text)
  - "Ignore — not a real issue"
  - "Defer — record as open question in file"
```

Apply the chosen action:
- Accept → edit the file per the suggestion
- Write my own → edit the file per the user's free-text
- Ignore → do nothing
- Defer → append the question to the `# TODO: Open questions` block at the
  end of the `.feature` file (create the block if missing)

**Auto mode:** Append ALL `product_issues[]` to the `# TODO: Open questions`
block at the end of the `.feature` file. Never modify scenarios based on them.

Block format to append at the end of the `.feature` file:
```gherkin

# ============================================================
# TODO: Open questions for product owner
# ============================================================
# - [${issue_category_tag}] ${description}
#   Question: ${question_for_human}
```

## 10. Review Loop — Round 2 (Conditional)

Trigger Round 2 if **ALL** of the following hold:
- `ROUND < feature_review_max_rounds` (default 2)
- At least one technical fix was applied in step 8 (content changed)
- Round 1 verdict was `NEEDS_REVISION`

Otherwise skip to step 11.

If Round 2 runs:
- Set `ROUND=2`
- Repeat step 7 (fresh reviewer spawn with the updated file)
- Repeat step 8 for any new `tech_issues[]`
- Step 9 is ONLY re-run for NEW product issues not already recorded in
  Round 1 (compare by `description`)

After Round 2, proceed to step 11 regardless of verdict.

## 11. Finalize

### 11a. Commit

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "feat(feature): edit ${FEATURE_FILENAME}" \
  --files "${FEATURE_PATH}"
```

Where `FEATURE_FILENAME` is the basename of `${FEATURE_PATH}` without extension.

### 11b. Display completion banner

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► FEATURE EDITED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 File: ${FEATURE_PATH}
 Scenarios: ${N}
 Review rounds: ${ROUND}/${feature_review_max_rounds}
 Auto-fixed: ${AUTO_FIXED} technical issues
 Open questions: ${OPEN_QUESTIONS} (see TODO block)
```

</process>

<success_criteria>
- [ ] Init JSON parsed; review config loaded
- [ ] `FEATURE_PATH` validated — file exists
- [ ] `--auto` and `--add` flags parsed correctly
- [ ] Feature file read successfully
- [ ] Interactive mode asks what to change; auto mode uses `--add` description
- [ ] Feature content rules enforced (Chinese, realistic data, status tags)
- [ ] Changes written in-place to `${FEATURE_PATH}` (no task workspace created)
- [ ] `redpill-feature-reviewer` spawned; `<FEATURE_REVIEW>` parsed
- [ ] Technical issues handled per mode (batch confirm / auto apply)
- [ ] Product issues NEVER auto-modify scenarios — always land in TODO block or user decision
- [ ] Review loop caps at `feature_review_max_rounds`
- [ ] File committed via `redpill-tools.cjs commit`
- [ ] Completion banner displayed
</success_criteria>
