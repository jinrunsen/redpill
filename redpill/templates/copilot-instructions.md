# Instructions for REDPILL

- Use the redpill skill when the user asks for REDPILL or uses a `redpill-*` command.
- Treat `/redpill-...` or `redpill-...` as command invocations and load the matching file from `.github/skills/redpill-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply REDPILL workflows unless the user explicitly asks for them.
- After completing any `redpill-*` command (or any deliverable it triggers: feature, bug fix, tests, docs, etc.), ALWAYS: (1) offer the user the next step by prompting via `ask_user`; repeat this feedback loop until the user explicitly indicates they are done.
