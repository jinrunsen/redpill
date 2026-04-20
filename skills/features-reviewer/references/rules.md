# Features 评审规则完整清单

本文件是 `features-reviewer` skill 的规则底座。评审时按四大类逐项检查，每条规则都标注了严重度、判定方法、以及可用的正反依据。

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
> 顶层目录 `features/<bad>/` 使用了非领域维度命名。应将其下的文件按业务领域重新分配到 `features/<domain-a>/`、`features/<domain-b>/` 等，并把 `<bad>` 的语义改用标签表达（例如 `@layer-<bad>`）。

### R1.2 禁止按 user story ID 命名 feature 文件 [Critical]

**规则**：Feature 文件名应反映业务能力（如 `checkout.feature`、`refund_policy.feature`），不得使用 story/ticket ID（如 `US-1234.feature`、`JIRA-5678.feature`、`STORY-42.feature`）。

**根因**：User story 是交付工具，feature 是文档工具，两者生命周期不同——story 完成后会被丢弃，feature 要伴随产品演进。一个 feature 通常被多个 story 触及，一个 story 也可能涉及多个 feature。

**判定方法**：文件名正则匹配 `^(US|JIRA|STORY|TICKET|TASK|#)[-_]?\d+` → Critical

**修改建议模板**：
> 文件 `<path>` 使用 story ID 命名。建议基于文件内 scenario 的共同业务主题重命名为能力名（如 `refund_policy.feature`），并把 story ID 放入 scenario 描述或 tag（`@story-US-1234`）作为可追溯性链接。

### R1.3 `_technical/` 目录的文件占比不得超过总数 10% [Warning]

**规则**：技术场景应严格限制数量。《实例化需求》明确指出 SbE 不适合纯技术问题，这类场景过多会稀释活文档的业务价值。

**判定方法**：`_technical/` 下的文件数 / `features/` 总文件数 > 10% → Warning；> 20% → Critical

**修改建议模板**：
> `_technical/` 占比 X%，超出健康阈值。建议把真正的技术测试（框架自检、部署校验、内部工具）下沉到单元或集成测试层，只在有"跨领域、需要业务可读性"的技术场景才保留在这里。

### R1.4 `_shared/` 使用合理性 [Info]

**规则**：`_shared/` 用于被多个领域引用的通用能力（如"发送邮件"、"审计日志"）。如果某个能力只被一个领域使用，不应该放在 `_shared/`。

**判定方法**：这条难以完全自动化，需要结合 step definition 分析或文件内容的引用关系推断。

**修改建议模板**（当检测到疑似误用时）：
> `_shared/<file>` 看起来只被 `features/<domain>/` 下的文件引用。如果确实是单一领域的，应移回对应领域目录；如果确实跨领域，保留。

### R1.5 目录深度建议 [Info]

**规则**：层级深度建议 2–4 层（`features/<domain>/<sub-capability>/<feature>.feature`）。太浅会导致单个目录下文件过多；太深会让导航变得困难。

**判定方法**：
- 任何 `.feature` 文件路径深度 > 5 层 → Info
- 任何顶层领域目录下文件数 > 20 个（且无子目录）→ Info（建议按子能力拆分）

### R1.6 文件命名后缀约定 [Warning]

**规则**：按本项目约定，后缀承载了辅助语义：
- `<name>.feature` — 主场景容器
- `<name>_boundaries.feature` — 边界压缩文件（大量 Scenario Outline 的集中地）
- `<name>_ui.feature` — UI 层专属行为（仅在必须分离时用）

**判定方法**：
- `_boundaries.feature` 文件内的 scenario 没有一个用 Scenario Outline → Warning（文件名和内容不符）
- `_ui.feature` 文件内的 scenario 没有打 `@layer-ui` → Warning

### R1.7 跨 feature 共享行为应抽取 [Warning]

**规则**：如果多个 feature 文件出现相同的 step 序列（如"用户登录"、"初始化订单"），应抽取为独立的 feature 文件放在 `_shared/`，其他 feature 在描述中用相对路径引用。

**判定方法**：需要 step 层面的相似度分析，当前脚本先不实现；在报告中以"建议人工关注：是否有重复的步骤序列需要抽取"的形式提示。

---

## 二、标签体系 (Tag System)

标签分三组，正交设计。每个业务 scenario（非 `_technical/`）应同时带有维度 1 和维度 2 的标签。

**维度 1：测试分层**（互斥，每个 scenario 恰好一个）
- `@layer-api` — 领域服务 / 业务 API 层
- `@layer-ui` — UI 行为层
- `@layer-config` — 配置 / 契约 / 模式校验层
- `@layer-e2e` — 端到端用户旅程

**维度 2：需求视角**（互斥，每个 scenario 恰好一个）
- `@main` — 主场景（核心业务规则的典型示例）
- `@related` — 关联场景（跨 feature 协同）
- `@exception` — 异常场景（错误、拒绝、边界失败）
- `@technical` — 技术场景（仅在 `_technical/` 下出现）

**维度 3：辅助标签**（可选，不互斥）
- `@boundary` — 标记在 `_boundaries.feature` 中使用
- `@story-<ID>` — story/ticket 追溯
- 项目自定义标签

### R2.1 测试分层标签必备 [Warning]

**规则**：`_technical/` 以外的所有业务 scenario 必须恰好带一个 `@layer-*` 标签。

**判定方法**：扫描每个 scenario 继承的所有标签（包括 feature 级的），统计 `@layer-` 前缀的个数。
- 0 个 → Warning
- 2 个及以上 → Critical（互斥维度冲突）

### R2.2 需求视角标签必备 [Warning]

**规则**：同 R2.1，每个业务 scenario 必须恰好带一个视角标签（`@main` / `@related` / `@exception`）。`@technical` 只能出现在 `_technical/` 下的文件。

**判定方法**：
- 视角标签 0 个 → Warning
- 视角标签 2 个及以上 → Critical
- 在非 `_technical/` 目录下出现 `@technical` → Critical

### R2.3 Feature 级标签 vs Scenario 级标签 [Info]

**规则**：当 feature 文件内所有 scenario 共享某个标签时，应提升到 feature 级；当某个 scenario 与其他不同，则标签放 scenario 级。

**判定方法**：这是优化建议，不是硬错误。当发现某个 tag 在一个 feature 内的所有 scenario 上都出现，建议在报告中以 Info 提示"可将 `@layer-api` 提升到 feature 级"。

### R2.4 标签命名一致性 [Info]

**规则**：同一语义标签在全项目内使用同一拼写和同一形式。
- 使用 kebab-case：`@layer-api` 而不是 `@layerApi` 或 `@layer_api`
- 单复数统一：`@boundary` 而不是 `@boundary` 和 `@boundaries` 混用

**判定方法**：
- 收集全部出现过的标签
- 做编辑距离聚类（≤2 的距离视为疑似重复）
- 报告疑似重复的标签对

### R2.5 禁止标签传达实现细节 [Warning]

**规则**：标签用于表达业务维度或测试维度，不用于传达实现技术细节。**不应**出现 `@postgres`、`@redis`、`@kafka`、`@react` 这类纯技术栈标签。

**判定方法**：黑名单匹配常见技术栈关键词 → Warning

### R2.6 `@boundary` 的使用一致性 [Warning]

**规则**：`@boundary` 应且只应出现在 `_boundaries.feature` 文件中，且文件内 scenario 应以 Scenario Outline 为主。

**判定方法**：
- `@boundary` 出现在非 `_boundaries.feature` 文件 → Warning
- `_boundaries.feature` 文件中 scenario 不带 `@boundary` → Warning

---

## 三、场景内容 (Scenario Content)

### R3.1 一个 Scenario 只讲一条规则 [Critical]

**规则**：每个 scenario 应聚焦一条业务规则或一个具体行为。多 When / 多 Then / 多验证点的 scenario 通常是违反此规则的信号。

**判定方法**（启发式，有误判风险）：
- Scenario 内 `When` 出现 ≥ 2 次 → Warning，提示人工确认
- Scenario 内 `Then` + `And` 行数 ≥ 5 行 → Info，提示"验证点过多可能在测多件事"
- Scenario 名称包含"并"、"和"、"以及"、"and"、"also" 等连接词 → Info

**修改建议模板**：
> Scenario `<name>` 包含 N 个 When 步骤，疑似在一个 scenario 中演示多条规则。建议拆分为 N 个独立 scenario，每个聚焦一条规则。

### R3.2 同规则多边界值必须用 Scenario Outline [Critical]

**规则**：同一个业务规则在不同边界值下的多次验证，必须用 `Scenario Outline` + `Examples:` 表格表达，不得复制粘贴成多个 Scenario。

**判定方法**（启发式）：
- 同一 feature 文件内发现 2 个或以上 Scenario，其步骤结构高度相似（行数相同、关键词相同），只有字面量不同 → Warning
- 命名形如 `X - 边界 1`、`X - 边界 2` 或 `X_amount_100`、`X_amount_200` 的连续 Scenario → Warning

**修改建议模板**：
> Scenario `<A>` 和 `<B>` 步骤结构相同，仅参数值不同。建议合并为一个 Scenario Outline，把差异值放入 Examples 表格。这样 (1) 文档更简洁，(2) 新增边界值只需加一行，(3) 读者能一眼看清这条规则的参数空间。

### R3.3 组合覆盖禁止出现在 .feature [Critical]

**规则**：.feature 文件不承担组合覆盖责任。如果一个 Scenario Outline 的 Examples 表超过 15 行，或存在明显的笛卡尔积组合（多列正交变化），应下沉到单元测试层。

**判定方法**：
- 单个 Examples 表行数 > 15 → Warning
- 单个 Examples 表行数 > 30 → Critical
- Examples 列数 ≥ 4 且行数 > 10 → Warning（疑似笛卡尔积）

**修改建议模板**：
> `<file>:<line>` 的 Scenario Outline 有 N 行 Examples，超出 acceptance 层的合理范围。建议保留 3-5 行作为 key examples（典型值 + 边界值各 1-2 个），其余 N-5 行作为参数化/property-based 单元测试在代码层覆盖。.feature 是活文档，不是覆盖矩阵。

### R3.4 场景数据最小相关 [Warning]

**规则**：Scenario 的 Given/When/Then 只展示跟当前规则相关的字段。与规则无关的数据（如用户姓名、订单 ID）应通过 Background 或默认值隐式提供。

**判定方法**（启发式）：
- Given/When/Then 中数据字段数 ≥ 6 且该 feature 无 Background → Info
- 同一 feature 内多个 scenario 在 Given 步骤中重复相同的初始化字段 → Info（建议提取到 Background）

### R3.5 Scenario 名称使用领域语言 [Info]

**规则**：Scenario 名称应描述业务行为，不应包含技术词（HTTP 状态码、表名、类名、API 端点路径）。

**判定方法**：黑名单匹配 `HTTP \d`、`POST /`、`DELETE /`、`SELECT `、`INSERT `、`class `、`function ` 等。例外：`@layer-api` 或 `@layer-config` 层的 scenario 允许部分技术词。

### R3.6 Feature 描述段落存在 [Info]

**规则**：每个 `.feature` 文件的 `Feature:` 行后面应有一段 narrative（`In order to... As a... I want to...` 或自由文本），说明这个能力存在的业务价值。

**判定方法**：`Feature:` 下一行直接是 `Scenario:` 或 `Background:` → Info

### R3.7 Feature 内 Scenario 数量合理 [Info]

**规则**：单个 feature 文件内 scenario 数 > 15 通常意味着该 feature 承载了过多责任，应按子能力拆分。

**判定方法**：scenario 数 > 15 → Info；> 25 → Warning

### R3.8 长 Given/When/Then 链 [Info]

**规则**：单个 scenario 步骤数（含 And/But）> 10 通常意味着场景过于冗长，或者在测多件事。

**判定方法**：步骤总行数 > 10 → Info；> 15 → Warning

---

## 四、分层平衡 (Layer Balance)

### R4.1 UI 层占比上限 [Warning/Critical]

**规则**：带 `@layer-ui` 的 scenario 数量不应超过带 `@layer-api` 的 15%。这直接对应 Gojko Adzic 的核心观点 "automate below the skin of the application"——UI 层脆弱、慢，业务规则应该在 API 层验证。

**判定方法**：
- `UI_count / API_count > 15%` → Warning
- `UI_count / API_count > 30%` → Critical
- `UI_count > API_count` → Critical（测试金字塔倒置，"甜筒冰淇淋"反模式）

**修改建议模板**：
> UI 层 scenario 占 API 层 X%，超出健康阈值。典型原因是用 UI 测试代替业务规则验证。建议对 UI 层 scenario 做分类盘点：(1) 真正验证 UI 交互逻辑（状态切换、条件渲染）的保留；(2) 借 UI 验证业务规则的，下移到 API 层重写；(3) 端到端用户旅程性质的，迁移到 `@layer-e2e`。

### R4.2 E2E 层占比上限 [Warning]

**规则**：`@layer-e2e` 的 scenario 数量不应超过总数的 5%。E2E 运行慢、脆弱，应仅覆盖最关键的用户旅程。

**判定方法**：`E2E_count / total > 5%` → Warning；`> 10%` → Critical

### R4.3 API 层是主阵地 [Warning]

**规则**：`@layer-api` 的 scenario 应占总数的 60-70%。低于 40% 通常意味着测试金字塔形状失衡。

**判定方法**：`API_count / total < 40%` → Warning

### R4.4 Config 层存在性 [Info]

**规则**：对于多服务项目，`@layer-config`（契约测试、配置校验）应占 15-25%。完全没有 config 层 scenario 通常意味着服务间契约没有被守护。

**判定方法**：`config_count == 0` 且发现项目涉及多服务（启发式判断） → Info

### R4.5 视角分布合理性 [Info]

**规则**：
- `@main` 通常应占 50-70%
- `@exception` 通常应占 20-35%
- `@related` 通常应占 5-15%

**判定方法**：
- `exception / total < 10%` → Info（异常场景覆盖可能不足）
- `exception / total > 50%` → Info（异常场景比主场景还多，异常）

---

## 五、未列入规则的判断（需要人工或 LLM 辅助）

以下问题规则无法机械判定，评审时以 Info 级别提示，建议人工或上层 LLM 再次扫描：

- Scenario 中的业务规则是否正确（需领域知识）
- Feature 名称是否真正反映领域能力边界（需领域模型知识）
- 是否存在"用测试代码绕开业务逻辑"的假测试（需看 step definition 实现）
- 领域语言使用是否一致（需跟领域词典对照）
- 是否存在"为了通过测试而写的 scenario"（这类 scenario 没有业务可读性，但语法合法）

---

## 健康度评分公式

用于在报告"执行摘要"输出一个 0-100 的单值指标，让用户快速判断整体状态：

```
score = 100
  - Critical 数 × 10
  - Warning 数 × 3
  - Info 数 × 1
  - max(0, (UI_pct - 15)) × 2       # UI 超标惩罚
  - max(0, (40 - API_pct)) × 1      # API 不足惩罚
  - (1 - 标签覆盖率) × 20           # 标签缺失整体惩罚

score = max(0, min(100, score))
```

- 85+：健康
- 60-84：有改进空间
- 40-59：明显技术债
- < 40：结构性问题，建议优先重构

这个公式只是粗略指示，不要让用户过度关注具体分数，重点看分项问题。
