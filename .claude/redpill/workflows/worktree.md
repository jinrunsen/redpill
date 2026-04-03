# Redpill Worktree 工作流

创建隔离的 git worktree 用于功能开发。

引用 @skills/git-worktree/SKILL.md 的逻辑。

## 步骤

### 1. 确定分支名称

从当前上下文确定分支名称：
- 如果 $ARGUMENTS 提供了分支名，直接使用
- 否则从当前 feature 文件推导：`redpill/[feature-area]/[feature-name]`

```bash
# 检查当前分支
git branch --show-current

# 检查是否有未提交的更改
git status --porcelain
```

如果有未提交的更改，提示用户先提交或暂存。

### 2. 创建 Worktree

```bash
# 创建新分支和 worktree
git worktree add ../[project-name]-[feature-name] -b [branch-name]
```

Worktree 位置：与当前项目目录同级，命名为 `[project-name]-[feature-name]`。

### 3. 设置工作环境

进入 worktree 目录：
- 确保 .redpill/ 目录可访问（symlink 或复制）
- 确保 feature 文件和设计文档可用
- 安装依赖（如需要）

```bash
cd ../[project-name]-[feature-name]

# 如果有 package.json
[ -f package.json ] && npm install

# 如果有 requirements.txt
[ -f requirements.txt ] && pip install -r requirements.txt
```

### 4. 输出结果

```
Worktree 已创建。

分支: [branch-name]
位置: ../[project-name]-[feature-name]

下一步：
  cd ../[project-name]-[feature-name]
  /redpill:run — 在隔离环境中开始 BDD 主循环
```
