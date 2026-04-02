# Redpill Finish Branch 工作流

完成分支工作，归档设计文档，合并或创建 PR。

引用 @skills/redpill/finishing-branch/SKILL.md 的逻辑。

## 步骤

### 1. 最终验证

运行所有测试确认通过：

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd run-all
```

如果有失败的场景：
→ 显示失败详情
→ 提示："有 N 个场景未通过。建议运行 /redpill:run 或 /redpill:debug 先修复。"
→ 询问用户是否仍要继续。

### 2. 归档设计文档

将 WIP 设计文档移动到归档目录：

```bash
mkdir -p .redpill/archive/designs/
mv .redpill/wip/designs/*.md .redpill/archive/designs/ 2>/dev/null || true
```

### 3. 清理 WIP 文件

清理临时工作文件：
- `.redpill/wip/` 下的临时文件
- `.continue-here.md` 文件
- `HANDOFF.json` 文件

```bash
rm -f .redpill/HANDOFF.json
rm -f .redpill/phases/*/.continue-here*.md 2>/dev/null || true
```

### 4. 更新状态

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state update
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" progress update --milestone "branch-complete"
```

### 5. 提交归档

```bash
git add .redpill/
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "docs: 归档设计文档，完成分支"
```

### 6. 合并或创建 PR

向用户展示选项：

```
分支工作已完成。

场景结果：X/Y 通过
设计文档已归档。

请选择操作：
1. 创建 Pull Request
2. 合并到主分支（merge）
3. 合并到主分支（rebase）
4. 暂不操作（稍后手动处理）
```

**创建 PR：**
```bash
gh pr create --title "[Feature Name]" --body "## 变更摘要\n\n[自动生成的摘要]"
```

**合并（merge）：**
```bash
git checkout main
git merge [branch-name]
```

**合并（rebase）：**
```bash
git checkout main
git rebase [branch-name]
```

### 7. 清理 Worktree（如适用）

如果是在 worktree 中工作：
```bash
# 回到主项目目录
cd [main-project-dir]
git worktree remove ../[worktree-dir]
```

### 8. 输出摘要

```
分支已完成。

操作: [PR 创建 / 已合并 / 暂不操作]
场景: X/Y 通过
设计文档: 已归档到 .redpill/archive/designs/
```
