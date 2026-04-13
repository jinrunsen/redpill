---
name: redpill:do
description: Route freeform text to the right REDPILL command automatically
argument-hint: "<description of what you want to do>"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<objective>
Analyze freeform natural language input and dispatch to the most appropriate REDPILL command.

Acts as a smart dispatcher — never does the work itself. Matches intent to the best REDPILL command using routing rules, confirms the match, then hands off.

Use when you know what you want but don't know which `/redpill:*` command to run.
</objective>

<execution_context>
@~/.claude/redpill/workflows/do.md
@~/.claude/redpill/references/ui-brand.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the do workflow from @~/.claude/redpill/workflows/do.md end-to-end.
Route user intent to the best REDPILL command and invoke it.
</process>
