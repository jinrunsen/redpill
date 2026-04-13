---
type: prompt
name: redpill:forensics
description: Post-mortem investigation for failed REDPILL workflows — analyzes git history, artifacts, and state to diagnose what went wrong
argument-hint: "[problem description]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
---

<objective>
Investigate what went wrong during a REDPILL workflow execution. Analyzes git history, `.redpill/` artifacts, and file system state to detect anomalies and generate a structured diagnostic report.

Purpose: Diagnose failed or stuck workflows so the user can understand root cause and take corrective action.
Output: Forensic report saved to `.redpill/forensics/`, presented inline, with optional issue creation.
</objective>

<execution_context>
@~/.claude/redpill/workflows/forensics.md
</execution_context>

<context>
**Data sources:**
- `git log` (recent commits, patterns, time gaps)
- `git status` / `git diff` (uncommitted work, conflicts)
- `.redpill/STATE.md` (current position, session history)
- `.redpill/ROADMAP.md` (phase scope and progress)
- `.redpill/phases/*/` (PLAN.md, SUMMARY.md, VERIFICATION.md, CONTEXT.md)
- `.redpill/reports/SESSION_REPORT.md` (last session outcomes)

**User input:**
- Problem description: $ARGUMENTS (optional — will ask if not provided)
</context>

<process>
Read and execute the forensics workflow from @~/.claude/redpill/workflows/forensics.md end-to-end.
</process>

<success_criteria>
- Evidence gathered from all available data sources
- At least 4 anomaly types checked (stuck loop, missing artifacts, abandoned work, crash/interruption)
- Structured forensic report written to `.redpill/forensics/report-{timestamp}.md`
- Report presented inline with findings, anomalies, and recommendations
- Interactive investigation offered for deeper analysis
- GitHub issue creation offered if actionable findings exist
</success_criteria>

<critical_rules>
- **Read-only investigation:** Do not modify project source files during forensics. Only write the forensic report and update STATE.md session tracking.
- **Redact sensitive data:** Strip absolute paths, API keys, tokens from reports and issues.
- **Ground findings in evidence:** Every anomaly must cite specific commits, files, or state data.
- **No speculation without evidence:** If data is insufficient, say so — do not fabricate root causes.
</critical_rules>
