# Features 评审规则完整清单 (v2)

本文件是 `features-reviewer` skill 的规则底座。评审时按五大类逐项检查，每条规则都标注了严重度、判定方法、以及可用的正反依据。

**标签命名规范**：所有分类标签采用 `@<维度前缀>:<值>` 冒号分隔形式。详细标签字典见项目仓库的 `FEATURE_TAGS.md`。

**总则**：规则服务于三条核心原则——(1) 目录主轴只有业务领域；(2) 跨切关注点用标签；(3) acceptance 层只保留 key examples。遇到规则没覆盖的情况，回到原则判断。

---

## 一、路径与文件组织 (Path Organization)

### R1.1 顶层目录必须是业务领域 [Critical]

**规则**：`features/` 的直接子目录应该是业务领域或能力名（如 `orders/`、`payments/`、`user-profile/`），**不能**是测试类型（`ui/`、`api/`、`e2e/`）、需求视角（`main/`、`exception/`）、或系统组件（`frontend/`、`backend/`、`service-a/`）。

**例外**：以下划线开头的约定目录是合法的：
- `_shared/` — 跨领域复用的能力（通知、认证、审计等）
- `_technical/` — 技术场景（严格限制数量）

**判定方法**：
- 扫描 `features/` 的直接子目录名
- 黑名单词：`ui`, `api`, `e2e`, `smoke`, `regression`, `integration`, `unit`, `frontend`, `backend`, `web`, `mobile`, `main`, `exception`, `happy`, `negative`, `positive`
- 任何匹配黑名单且不以 `_` 开头的顶层目录 → Critical

**修改建议模板**：
> 顶层目录 `features/<bad>/` 使用了非领域维度命名。应将其下的文件按业务领域重新分配到 `features/<domain-a>/`、`features/<domain-b>/` 等，并把 `<bad>` 的语义改用标签表达（例如 `@test-layer:<bad>`）。

### R1.2 禁止按 user story ID 命名 feature 文件 [Critical]

**规则**：Feature 文件名应反映业务能力（如 `checkout.feature`、`refund_policy.feature`），不得使用 story/ticket ID（如 `US-1234.feature`、`JIRA-5678.feature`、`STORY-42.feature`）。

**根因**：User story 是交付工具，feature 是文档工具，两者生命周期不同——story 完成后会被丢弃，feature 要伴随产品演进。一个 feature 通常被多个 story 触及，一个 story 也可能涉及多个 feature。

**判定方法**：文件名正则匹配 `^(US|JIRA|STORY|TICKET|TASK)[-_]?\d+` → Critical

**修改建议模板**：
> 文件 `<path>` 使用 story ID 命名。建议基于文件内 scenario 的共同业务主题重命名为能力名（如 `refund_policy.feature`），并把 story ID 放入 scenario tag（`@story:JIRA-1234`）作为可追溯性链接。

### R1.3 `_technical/` 目录的文件占比不得超过总数 10% [Warning]

**规则**：技术场景应严格限制数量。《实例化需求》明确指出 SbE 不适合纯技术问题，这类场景过多会稀释活文档的业务价值。

**判定方法**：`_technical/` 下的文件数 / `features/` 总文件数 > 10% → Warning；> 20% → Critical

### R1.4 `_shared/` 使用合理性 [Info]

**规则**：`_shared/` 用于被多个领域引用的通用能力。如果某个能力只被一个领域使用，不应该放在 `_shared/`。

**判定方法**：这条难以完全自动化，需要结合 step definition 分析或文件内容的引用关系推断。

### R1.5 目录深度建议 [Info]

**规则**：层级深度建议 2–4 层。任何 `.feature` 文件路径深度 > 5 层 → Info；任何顶层领域目录下文件数 > 20 个（且无子目录）→ Info。

### R1.6 文件命名后缀约定 [Warning]

**规则**：
- `<n>.feature` — 主场景容器
- `<n>_boundaries.feature` — 边界压缩文件（大量 Scenario Outline）。必须带 `@boundary` 标签，内容应以 Scenario Outline 为主
- `<n>_ui.feature` — UI 层专属行为。所有 scenario 必须带 `@test-layer:ui`

**判定方法**：
- `_boundaries.feature` 文件内的 scenario 没有一个用 Scenario Outline → Warning
- `_boundaries.feature` 文件（或内部所有 scenario）没有 `@boundary` → Warning
- `_ui.feature` 文件内的 scenario 没有 `@test-layer:ui` → Warning

### R1.7 跨 feature 共享行为应抽取 [Info]

**规则**：如果多个 feature 文件出现相同的 step 序列，应抽取为独立的 feature 文件放在 `_shared/`。当前 scan.py 不做 step 层相似度检测，建议评审时人工关注。

---

## 二、标签体系 (Tag System, v2 冒号格式)

标签分七个维度，每个维度用 `@<prefix>:<value>` 形式表达（Marker 标签 `@boundary` 是例外）。

### R2.1 测试分层标签必备 [Warning / Critical]

**规则**：`_technical/` 以外的所有业务 scenario 必须恰好带一个 `@test-layer:*` 标签。

**合法值**：`@test-layer:api`, `@test-layer:ui`, `@test-layer:config`, `@test-layer:e2e`

**判定方法**：
- 0 个 → Warning（对应 scan 输出 `scenarios_missing_layer_tag`）
- 2 个及以上 → Critical（对应 `layer_tag_conflicts`，互斥维度冲突）

### R2.2 需求视角（@spec:）标签必备 [Warning / Critical]

**规则**：每个业务 scenario 必须恰好带一个 `@spec:*` 标签。`@spec:technical` 只能出现在 `_technical/` 下的文件。

**合法值**：`@spec:main`, `@spec:normal`, `@spec:exception`, `@spec:constraint`, `@spec:testability`, `@spec:contract`, `@spec:related`, `@spec:technical`

**判定方法**：
- 视角标签 0 个 → Warning（对应 `scenarios_missing_spec_tag`）
- 视角标签 2 个及以上 → Critical（对应 `spec_tag_conflicts`）
- 非 `_technical/` 目录下出现 `@spec:technical` → Critical（对应 `technical_tag_outside_technical_dir`）

### R2.3 Feature 级 vs Scenario 级标签 [Info]

**规则**：当 feature 内所有 scenario 共享某标签时，提升到 feature 级；差异化时放 scenario 级。

**判定方法**：优化建议，不是硬错误。

### R2.4 标签命名一致性 [Info]

**规则**：同一语义标签在全项目内使用同一拼写和同一形式：
- 使用冒号分隔维度：`@test-layer:api` 而非 `@test-layer-api` 或 `@testLayer:api`
- kebab-case：`@test-layer:api` 而非 `@testLayer:api`
- 单复数统一

**判定方法**：
- 收集全部标签，去除所有分隔符（`-`, `_`, `:`）后归一化
- 归一化后存在多种原形的组 → Info（对应 `inconsistent_tag_spellings`）

### R2.5 禁止标签传达实现细节 [Warning]

**规则**：标签用于表达业务维度或测试维度，不用于传达实现技术细节。**不应**出现 `@postgres`、`@redis`、`@kafka`、`@react` 这类纯技术栈标签。

**判定方法**：黑名单匹配 → Warning（对应 `tech_stack_tag_usages`）

### R2.6 `@boundary` 的使用一致性 [Warning]

**规则**：`@boundary` 应且只应出现在 `_boundaries.feature` 文件中。

**判定方法**：
- `@boundary` 出现在非 `_boundaries.feature` 文件 → Warning
- `_boundaries.feature` 文件中 scenario 不带 `@boundary` → Warning

### R2.7 旧格式标签迁移 [Warning]

**规则**：项目采用 v2 冒号格式。旧格式（`@main`、`@layer-api`、`@nfr-*` 等）应被迁移。

**判定方法**：scan.py 的 `legacy_tag_usages` 字段列出所有仍在使用旧格式的 scenario，每条给出 `legacy_tag → migrate_to` 的目标。

**修改建议模板**：
> 检测到 N 处旧格式标签。运行 `python scripts/migrate_tags.py features/ --dry-run` 预览变更，确认无误后去掉 `--dry-run` 实际执行。迁移后重新评审。

### R2.8 状态标签一致性 [Info]

**规则**：`@status:*` 维度互斥，每个 scenario 最多一个。

**判定方法**：多个 `@status:*` 同时出现 → Info（对应 `status_tag_conflicts`）

### R2.9 NFR 场景建议带 @exec:* [Info]

**规则**：带 `@nfr:*` 的 scenario 通常需要特殊环境或较长执行时间，建议组合 `@exec:slow` 或 `@exec:hard` 便于 CI 调度。

**判定方法**：有 `@nfr:*` 但无任何 `@exec:*` → Info（对应 `nfr_scenarios_without_exec_tag`）

### R2.10 作者标签冲突 [Info]

**规则**：`@by:*` 维度互斥。

**判定方法**：同一 scenario 出现 `@by:dev` 和 `@by:qa` → Info（对应 `by_tag_conflicts`）

---

## 三、场景内容 (Scenario Content)

### R3.1 一个 Scenario 只讲一条规则 [Critical]

**规则**：每个 scenario 应聚焦一条业务规则或一个具体行为。多 When / 多 Then / 多验证点的 scenario 通常是违反此规则的信号。

**判定方法**（启发式）：
- Scenario 内 `When` 出现 ≥ 2 次 → Warning
- Scenario 内 `Then` + `And` 行数 ≥ 5 行 → Info
- Scenario 名称包含"并"、"和"、"以及"、"and"、"also" → Info

### R3.2 同规则多边界值必须用 Scenario Outline [Critical]

**规则**：同一业务规则的多次验证必须用 Scenario Outline + Examples，不得复制粘贴多个 Scenario。

**判定方法**：同一 feature 内发现结构签名（step_count, when_count, then_and_count）相同的 3+ 个 Scenario → Warning（对应 `similar_scenario_groups_suggesting_outline`）

### R3.3 组合覆盖禁止出现在 .feature [Critical]

**规则**：.feature 不承担组合覆盖责任。Scenario Outline 的 Examples 表行数 > 15 属于异常。

**判定方法**：
- 单个 Examples 行数 > 15 → Warning
- 单个 Examples 行数 > 30 → Critical
- 列数 ≥ 4 且行数 > 10 → Warning（疑似笛卡尔积）

### R3.4 场景数据最小相关 [Info]

**规则**：Scenario 只展示跟当前规则相关的字段。无关字段应通过 Background 或默认值隐式提供。

### R3.5 Scenario 名称使用领域语言 [Info]

**规则**：不应包含 HTTP 状态码、表名、类名、端点路径等技术词。例外：`@test-layer:api` 或 `@test-layer:config` 层允许部分技术词。

### R3.6 Feature 描述段落存在 [Info]

**规则**：每个 `.feature` 文件应在 `Feature:` 行下方有 narrative 段落。

**判定方法**：`features_missing_description` 列出缺失的文件。

### R3.7 Feature 内 Scenario 数量合理 [Info / Warning]

**规则**：单个 feature 内 scenario 数 > 15 → Info；> 25 → Warning（对应 `features_with_too_many_scenarios`）

### R3.8 长 Given/When/Then 链 [Info / Warning]

**规则**：步骤总行数 > 10 → Info；> 15 → Warning（对应 `scenarios_with_long_step_chain`）

---

## 四、分层平衡 (Layer Balance)

### R4.1 UI 层占比上限 [Warning / Critical]

**规则**：`@test-layer:ui` 数量不应超过 `@test-layer:api` 的 15%。

**判定方法**（基于 `layer_distribution.ui_to_api_ratio_pct`）：
- `> 15%` → Warning
- `> 30%` → Critical
- `UI > API` → Critical（金字塔倒置，甜筒反模式）

### R4.2 E2E 层占比上限 [Warning / Critical]

**规则**：`@test-layer:e2e` 不应超过总数 5%。

**判定方法**（基于 `layer_distribution.e2e_to_total_pct`）：
- `> 5%` → Warning
- `> 10%` → Critical

### R4.3 API 层是主阵地 [Warning]

**规则**：`@test-layer:api` 应占总数 60-70%。低于 40% → Warning。

### R4.4 Config 层存在性 [Info]

**规则**：多服务项目 `@test-layer:config` 应占 15-25%。完全为 0 → Info。

### R4.5 视角分布合理性 [Info]

**规则**（基于 `spec_distribution`）：
- `@spec:main` 通常 50-70%
- `@spec:exception` + `@spec:constraint` 通常 20-35%
- `@spec:exception` + `@spec:constraint` < 10% → Info（异常/约束覆盖可能不足）
- `@spec:exception` + `@spec:constraint` > 50% → Info（异常比主场景还多，可能有问题）

### R4.6 flaky 占比控制 [Warning]

**规则**：`@exec:flaky` 的 scenario 占比 > 5% → Warning；> 10% → Critical。长期存在的 flaky 是测试债务。

**判定方法**：基于 `summary.flaky_pct`。

---

## 五、未列入规则的判断（需要人工或 LLM 辅助）

以下问题规则无法机械判定，评审时以 Info 级别提示：

- Scenario 中的业务规则是否正确（需领域知识）
- Feature 名称是否真正反映领域能力边界
- 是否存在"用测试代码绕开业务逻辑"的假测试
- 领域语言使用是否一致（需领域词典对照）
- `@status:pending` 是否长期挂起未清理（需 git blame 时间戳）
- `@by:dev` vs `@by:qa` 的语义和 `@spec:*` 是否匹配（如 `@by:qa` 配 `@spec:main` 可能是研发直接认领了测试写的 scenario，需人工确认）

---

## 健康度评分公式

```
score = 100
  - Critical 数 × 10
  - Warning 数 × 3
  - Info 数 × 1
  - max(0, (UI_pct - 15)) × 2         # UI 超标惩罚
  - max(0, (40 - API_pct)) × 1        # API 不足惩罚
  - (1 - spec_coverage_pct) × 20      # 需求视角覆盖率惩罚
  - (1 - layer_coverage_pct) × 20     # 测试分层覆盖率惩罚
  - min(50, flaky_pct × 3)            # flaky 占比惩罚
  - min(30, legacy_usage_pct × 3)     # 旧格式占比惩罚

score = max(0, min(100, score))
```

- 85+：健康
- 60-84：有改进空间
- 40-59：明显技术债
- < 40：结构性问题，建议优先重构
