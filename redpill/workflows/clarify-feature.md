<purpose>
Clarify a feature idea into a Gherkin `.feature` file, then validate it with
`redpill-feature-reviewer`. All work is staged in
`.redpill/features/{task_id}-{slug}/` — a per-task workspace that also holds
future design docs, BDD progress, and BDD summaries for the same feature
lifecycle. Nothing is written to the canonical `features/` tree until a future
`/redpill:archive-feature` command promotes it.

Two modes, toggled by `--auto`:

- **Default (interactive)**: ask clarifying questions, confirm scenarios with
  the user, handle reviewer issues interactively.
- **`--auto`**: analyze the description autonomously, generate up to N
  scenarios (capped by `workflow.feature_auto_scenario_cap`), auto-fix
  technical reviewer issues, stash product-decision questions into a
  `# TODO: Open questions` block at the end of the `.feature` file and in
  `TASK.md`.

Modification flow via `--extends <path>`: copies an existing feature into the
task workspace as a read-only baseline, then overlays new/revised scenarios
on top. The baseline is never mutated — merge happens at archive time.
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
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `verifier_model`, `text_mode`, `redpill_dir_exists`, `state_path`,
`claude_md_path`, `features_task_dir_base`, `task_id`, `existing_features[]`,
`existing_feature_domains[]`, `has_existing_features`, `tech_stack_hint`,
`feature_review_max_rounds`, `feature_auto_scenario_cap`.

## 2. Parse Arguments

Extract from `$ARGUMENTS`:
- `--auto` → `AUTO_MODE=true`
- `--domain <name>` → `DOMAIN=<name>`
- `--extends <path>` → `EXTENDS=<path>`
- `--text` OR init `text_mode: true` → `TEXT_MODE=true`
- Remaining text → `DESCRIPTION`

If `DESCRIPTION` is empty:
- Interactive mode: prompt via `AskUserQuestion`
  ```
  header: "Feature"
  question: "What feature do you want to clarify?"
  ```
- Auto mode: error out:
  ```
  --auto requires a feature description. Usage:
    /redpill:clarify-feature "describe the feature" --auto
  ```

If `EXTENDS` is set, verify the file exists:
```bash
if [[ ! -f "$EXTENDS" ]]; then
  echo "--extends target not found: $EXTENDS"
  exit 1
fi
```

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► CLARIFY FEATURE ${AUTO_MODE:+(AUTO)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Task ID: ${task_id}
 Description: ${DESCRIPTION}
 Domain: ${DOMAIN:-(to be determined)}
 Extends: ${EXTENDS:-none}
```

## 3. Load Context

Read (best-effort, continue on failure):
- `${state_path}` if `redpill_dir_exists` is true
- `${claude_md_path}` if it exists
- Each file in `existing_features[]` — study step wording and avoid duplicate
  scenario names
- `${EXTENDS}` if set — this becomes the baseline for step 7

Use `tech_stack_hint` to calibrate scenario vocabulary (Python/Django vs
Node/Express etc.).

## 4. Understand Intent

**Interactive mode** — one `AskUserQuestion` at a time:

1. Primary role (`As a ...`)
   ```
   header: "Role"
   question: "Who is the primary actor for this feature?"
   ```
2. Core value (`So that ...`)
3. Key behaviors — at minimum: happy path + one error path
4. Known business rules / constraints
5. Edge cases to cover

Capture each answer; they will feed the TASK.md "Clarifications captured"
section in step 7.

**Auto mode** — skip all questions. Claude analyzes `DESCRIPTION` directly
using the loaded context from step 3.

## 5. Determine Domain

Used to fill `target_path` in TASK.md. Does NOT affect the write location in
this workflow — files are always written to the task workspace.

- If `$DOMAIN` already set by flag → use it
- **Interactive mode**: `AskUserQuestion` with `multiSelect: false`:
  ```
  header: "Domain"
  question: "Which domain does this feature belong to?"
  options:
    - existing domain from `existing_feature_domains[]` (one option each)
    - "Create new domain" (follow-up asks for name)
    - "Root (no subdirectory)"
  ```
- **Auto mode**: LLM infers from `DESCRIPTION`. If no existing domain matches
  and inference confidence is low, fall back to root.

Store result as `DOMAIN`. If root, `DOMAIN=""`.

## 6. Generate Feature Content

Construct a `Feature:` block with `As a / I want / So that` header and a list
of scenarios.

**Rules (both modes):**
- Each scenario gets `@status-pending`
- Feature-level: `@status-pending` tag on the `Feature:` line itself
- All concrete values MUST be realistic domain-appropriate data.
  **Forbidden**: `A`, `B`, `C`, `组 1`, `组 2`, `Foo`, `Bar`, `user1`, `user2`,
  `测试部门`, `xxx 公司`, `示例地址`, `11111`, lorem ipsum.
  **Use instead**: region names (`华东区`), department names (`市场办公中心`),
  city names (`上海市`), personal names (`alice`, `张伟`), business-reasonable
  monetary magnitudes. The `DOMAIN` and `tech_stack_hint` should guide the
  vocabulary (an e-commerce system uses e-commerce terms; a medical system
  uses medical terms).

**Interactive mode:**
- Present scenarios one at a time using text or `AskUserQuestion` (text_mode
  aware) with options: "Accept", "Edit", "Remove", "Add another"
- Continue until the user confirms the set

**Auto mode:**
- Generate in a single pass, capped at `feature_auto_scenario_cap` (default 8)
- MUST cover: happy path + at least one error path + key boundary conditions
  when they exist
- Avoid overlap with scenarios already present in `existing_features[]`

## 7. Setup Task Workspace

```bash
FEATURE_NAME="${DESCRIPTION_OR_INFERRED_NAME}"
SLUG=$(echo "$FEATURE_NAME" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]' | sed 's/-\{2,\}/-/g; s/^-//; s/-$//' | cut -c1-40)
TASK_DIR="${features_task_dir_base}/${task_id}-${SLUG}"
mkdir -p "$TASK_DIR"
```

**If `$EXTENDS` is set** — copy the baseline into the workspace, then merge:
```bash
cp "$EXTENDS" "${TASK_DIR}/${SLUG}.feature"
```
Then overlay the newly generated content via name-based merge:
- For each generated scenario, if a scenario with the same name already exists
  in the baseline → replace it
- Otherwise → append to the end (before any existing `# TODO: Open questions`
  block, if present)

**Otherwise** — write a fresh `.feature` file with the generated content.

Compute target path for archive:
```bash
if [[ -n "$DOMAIN" ]]; then
  TARGET_PATH="features/${DOMAIN}/${SLUG}.feature"
else
  TARGET_PATH="features/${SLUG}.feature"
fi
```

Write `${TASK_DIR}/TASK.md` with frontmatter:

```markdown
---
id: ${task_id}
slug: ${SLUG}
description: "${DESCRIPTION}"
created: $(date -u +%Y-%m-%dT%H:%M:%SZ)
domain: ${DOMAIN:-null}
target_path: ${TARGET_PATH}
extends: ${EXTENDS:-null}
status: clarified
review_rounds: 0
auto_fixed: 0
open_questions: 0
---

# Feature Task: ${FEATURE_NAME}

## Original description

${DESCRIPTION}

## Clarifications captured

${INTERACTIVE_CLARIFICATIONS_OR_"autonomous mode — no dialog"}

## Unresolved product questions

(populated after feature-reviewer runs)
```

## 8. Feature Reviewer — Round 1

Record round number: `ROUND=1`.

Display: `◆ Spawning feature-reviewer for: ${SLUG} (round ${ROUND}/${feature_review_max_rounds})`

Dispatch the reviewer. Construct the `files_to_read` lines conditionally
(include the EXTENDS line only if EXTENDS is set):

```
Agent(
  subagent_type="redpill-feature-reviewer",
  model="${verifier_model}",
  description="Review feature: ${SLUG}",
  prompt="
    <objective>
    Review the Gherkin .feature file for spec quality, business language,
    AND sample data authenticity (no placeholder values — every concrete
    value must be realistic domain-appropriate data).
    </objective>

    <files_to_read>
    - ${TASK_DIR}/${SLUG}.feature
    - ${TASK_DIR}/TASK.md (context: original description, domain, extends baseline)
    ${EXTENDS_LINE}
    </files_to_read>

    <review_emphasis>
    Explicitly audit every sample value in the scenarios. Flag any abstract
    placeholders (A/B/C, 组1/组2, Foo/Bar, user1/user2, '测试部门') as
    CRITICAL auto-fixable issues with a concrete realistic replacement in
    the 'suggestion' field, using domain-appropriate vocabulary matching
    the TASK.md domain field.
    </review_emphasis>

    <output_contract>
    Return a <FEATURE_REVIEW> block as specified in your agent definition.
    Every issue MUST have a 'category' field (auto-fixable | product-decision).
    </output_contract>
  "
)
```

Where `EXTENDS_LINE` is `- ${EXTENDS} (baseline for comparison)` if EXTENDS
is set, empty string otherwise.

Parse the returned `<FEATURE_REVIEW>` YAML block. Extract:
- `verdict`
- `issues[]` split into:
  - `tech_issues[]` — issues with `category: auto-fixable`
  - `product_issues[]` — issues with `category: product-decision`

If the output does not contain a `<FEATURE_REVIEW>` block, retry the reviewer
once. If still missing, abort with:
```
Reviewer returned no <FEATURE_REVIEW> block after 2 attempts. Aborting.
Workspace preserved at: ${TASK_DIR}
```

## 9. Process Technical Issues

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

- "Apply all" → apply every suggestion via `Edit` on
  `${TASK_DIR}/${SLUG}.feature`
- "Skip all" → no changes; record 0 applied
- "Choose individually" → loop, one `AskUserQuestion` per issue:
  ```
  header: "Issue ${id}"
  question: "${description}\nSuggestion: ${suggestion}\nApply?"
  options: ["Apply", "Skip"]
  ```

**Auto mode:**

Apply every `auto-fixable` issue's `suggestion` directly via `Edit`. Track a
running count in `AUTO_FIXED`. No user interaction.

## 10. Process Product Issues

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
  end of the `.feature` file (create the block if missing) and to TASK.md's
  "Unresolved product questions" section

**Auto mode:** Append ALL `product_issues[]` to the `# TODO: Open questions`
block at the end of the `.feature` file and to TASK.md. Never modify scenarios
based on them.

Block format to append at the end of the `.feature` file:
```gherkin

# ============================================================
# TODO: Open questions for product owner
# ============================================================
# - [${issue_category_tag}] ${description}
#   Question: ${question_for_human}
# - [${issue_category_tag}] ${description}
#   Question: ${question_for_human}
```

Where `issue_category_tag` is a short tag describing the issue type (e.g.,
`missing-coverage`, `contradiction`, `ambiguity`) derived from the issue's
`description` and `severity`.

Increment `OPEN_QUESTIONS` by the count recorded.

## 11. Review Loop — Round 2 (Conditional)

Trigger Round 2 if **ALL** of the following hold:
- `ROUND < feature_review_max_rounds` (default 2)
- At least one technical fix was applied in step 9 (content changed)
- Round 1 verdict was `NEEDS_REVISION`

Otherwise skip to step 12.

If Round 2 runs:
- Set `ROUND=2`
- Repeat step 8 (fresh reviewer spawn with the updated file)
- Repeat step 9 for any new `tech_issues[]`
- Step 10 is ONLY re-run for NEW product issues not already recorded in
  Round 1 (compare by `description`)

After Round 2, proceed to step 12 regardless of verdict.

## 12. Finalize

### 12a. Update TASK.md frontmatter

Edit `${TASK_DIR}/TASK.md` frontmatter:
- `review_rounds: ${ROUND}`
- `auto_fixed: ${AUTO_FIXED}`
- `open_questions: ${OPEN_QUESTIONS}`
- `status: clarified`

### 12b. Commit

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "feat(feature): clarify ${SLUG} [${task_id}]" \
  --files "${TASK_DIR}/"
```

### 12c. Display completion banner

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► FEATURE CLARIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Task: ${task_id}-${SLUG}
 Workspace: ${TASK_DIR}/
 Feature: ${SLUG}.feature (${N} scenarios)
 Target on archive: ${TARGET_PATH}
 Extends: ${EXTENDS:-none}
 Review rounds: ${ROUND}/${feature_review_max_rounds}
 Auto-fixed: ${AUTO_FIXED} technical issues
 Open questions: ${OPEN_QUESTIONS} (see TODO block + TASK.md)

 Next:
   /redpill:run-bdd ${TASK_DIR}/${SLUG}.feature
   /redpill:design-feature ${task_id}    — technical design (future)
   /redpill:archive-feature ${task_id}   — promote to features/ (future)
```

</process>

<success_criteria>
- [ ] Init JSON parsed; `task_id` and `features_task_dir_base` extracted
- [ ] `--auto`, `--domain`, `--extends` flags parsed correctly
- [ ] Description empty + auto mode → error; description empty + interactive → prompt
- [ ] Interactive mode asks all 5 clarification questions
- [ ] Auto mode skips clarification and generates within `feature_auto_scenario_cap`
- [ ] Domain determined via flag / AskUserQuestion / LLM inference fallback
- [ ] Feature content generated with realistic sample data (no A/B/C placeholders)
- [ ] Task workspace created at `.redpill/features/${task_id}-${SLUG}/`
- [ ] `--extends` copies baseline into workspace untouched; new scenarios merged by name
- [ ] `TASK.md` written with complete frontmatter
- [ ] `redpill-feature-reviewer` spawned; `<FEATURE_REVIEW>` parsed
- [ ] Technical issues handled per mode (batch confirm / auto apply)
- [ ] Product issues NEVER auto-modify scenarios — always land in TODO block or user decision
- [ ] Review loop caps at `feature_review_max_rounds`
- [ ] TASK.md frontmatter updated with review metrics
- [ ] Workspace committed via `redpill-tools.cjs commit` in one atomic commit
- [ ] Completion banner displayed with correct next-step suggestions
</success_criteria>
