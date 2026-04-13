# Git Planning Commit

Commit planning artifacts using the gsd-tools CLI, which automatically checks `commit_docs` config and gitignore status.

## Commit via CLI

Always use `redpill-tools.cjs commit` for `.redpill/` files — it handles `commit_docs` and gitignore checks automatically:

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "docs({scope}): {description}" --files .redpill/STATE.md .redpill/ROADMAP.md
```

The CLI will return `skipped` (with reason) if `commit_docs` is `false` or `.redpill/` is gitignored. No manual conditional checks needed.

## Amend previous commit

To fold `.redpill/` file changes into the previous commit:

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "" --files .redpill/codebase/*.md --amend
```

## Commit Message Patterns

| Command | Scope | Example |
|---------|-------|---------|
| plan-phase | phase | `docs(phase-03): create authentication plans` |
| execute-phase | phase | `docs(phase-03): complete authentication phase` |
| new-milestone | milestone | `docs: start milestone v1.1` |
| remove-phase | chore | `chore: remove phase 17 (dashboard)` |
| insert-phase | phase | `docs: insert phase 16.1 (critical fix)` |
| add-phase | phase | `docs: add phase 07 (settings page)` |

## When to Skip

- `commit_docs: false` in config
- `.redpill/` is gitignored
- No changes to commit (check with `git status --porcelain .redpill/`)
