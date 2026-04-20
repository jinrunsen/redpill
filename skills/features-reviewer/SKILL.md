---
name: features-reviewer
description: Review a BDD `features/` directory against Specification-by-Example best practices and the project's three-dimension classification model (business domain folder hierarchy + test-layer tags + requirement-perspective tags). Use this skill whenever the user asks to review, audit, check, evaluate, or lint `.feature` files, Gherkin scenarios, BDD specifications, feature file organization, tag usage, or feature folder structure — even if they don't say the word "review" (phrasings like "is my features folder organized correctly", "check my gherkin tags", "我的 feature 文件有问题吗", "评审一下我的 features" all trigger this skill). Produces a structured Markdown report listing concrete issues with file paths, severity, rationale, and suggested fixes.
---

# Features Reviewer

评审一个 BDD `features/` 目录的组织方式、标签使用和场景编写质量，按照《实例化需求》(Specification by Example) 的原则和本项目约定的三维分类模型给出结构化的改进报告。

## 适用场景

当用户提供一个 `features/` 目录（或子目录）并要求评审、审查、检查、lint 其中的 `.feature` 文件时使用。典型触发词：评审、review、audit、check、组织是否合理、标签是否正确、是否符合规范、health check。

不适用于：修改业务逻辑代码、生成新的 feature 文件、执行测试、分析测试失败原因。

## 评审的核心原则

本 skill 执行的评审建立在三个不可妥协的基础原则上。理解这些原则比记住具体规则更重要，因为规则是为了服务这些原则而存在的。

**原则 1：目录结构的主轴只有一个，就是业务领域。** 《实例化需求》第 11 章、以及 Gojko Adzic 发起的 #GivenWhenThenWithStyle 社区调查都明确指向这一点：按业务能力（functional area / capability）分组是活文档组织的唯一合理主轴。其他任何切分方式（按测试类型、按系统组件、按 user story）都会泄露"解决方案域"，破坏 feature 文件作为业务活文档的核心价值。

**原则 2：跨切关注点用标签表达，不用目录重复表达。** 测试分层（UI/API/Config/E2E）和需求视角（主/关联/异常/技术）是正交于领域的跨切维度，天然适合用 tag 索引而不是目录层级。

**原则 3：acceptance 层只保留 key examples，不追求组合覆盖。** 大量边界 case 属于单元测试层的职责。.feature 文件里的场景是"活文档"，读者读它是为了理解业务规则，不是为了看穷尽式的覆盖矩阵。

所有具体规则最终都服务于"读者读 feature 能正确理解业务"这个终极目标。评审时遇到规则没覆盖的情况，回到这个目标做判断。

## 评审工作流

### 第一步：读取完整规则集

在开始评审之前，必读 `references/rules.md` 获取完整的检查清单。规则分四大类：

1. **路径与文件组织** (Path Organization) — 目录层级、命名、_shared/_technical 使用
2. **标签体系** (Tag System) — 三组正交标签的必备性、冲突检测
3. **场景内容** (Scenario Content) — 一条 scenario 一个规则、Scenario Outline 的使用、数据相关性
4. **分层平衡** (Layer Balance) — UI/API/Config/E2E 的比例约束

需要看正反示例时读 `references/examples.md`。

### 第二步：运行扫描脚本收集客观指标

先跑一次扫描脚本获取所有客观可度量的数据，避免靠肉眼估算比例和数量：

```bash
python scripts/scan.py <features-dir> --output /tmp/features-scan.json
```

脚本输出 JSON，包含：
- 每个 feature 文件的路径、所有 scenario、所有 tag、所有 Scenario Outline 及其 Examples 行数
- 分层分布（@layer-* 的计数和占比）
- 视角分布（@main / @related / @exception / @technical 的计数）
- 未标签的 scenario 列表
- 疑似按非领域维度命名的目录（如包含 `ui/`、`api/`、`smoke/` 这类纯技术词作为顶层目录）
- 疑似按 user story ID 命名的文件（如 `US-1234.feature`、`STORY-123.feature`）

用这份 JSON 驱动后续的定性评审，不要凭印象报数字。

### 第三步：按规则类别逐项检查

对照 `references/rules.md` 的四大类规则，把扫描结果里的每一条异常标记为三个严重度之一：

- **Critical（红）**：违反核心原则，严重损害活文档价值或可维护性。必须修。
- **Warning（黄）**：不符合推荐做法，会累积债务。建议修。
- **Info（蓝）**：风格或一致性问题，酌情处理。

严重度判定的经验法则：
- 破坏了"目录按领域组织"主轴 → Critical
- 破坏了"一个 scenario 只讲一条规则"原则 → Critical
- 缺少测试分层或需求视角的必备标签 → Warning
- UI 层场景占比超过 API 层的 15% → Warning（超过 30% 则升级为 Critical）
- 标签拼写不一致（如 `@layer-api` 和 `@layerApi` 混用） → Info

### 第四步：生成报告

用下面的模板输出 Markdown 报告。报告要既能让人读（决策用），也能让 AI agent 读（自动化修复用）——所以每一条问题都要给出 file path、行号（如有）、问题陈述、修改建议三要素齐全。

## 报告结构模板

严格按照下面的结构生成报告，不要擅自调整章节顺序或跳过章节。如果某个章节没有发现问题，保留章节标题并写"未发现问题"，这样读者能确信这部分被检查过了。

```markdown
# Features 目录评审报告

**评审对象**：<features-dir 绝对路径>
**评审时间**：<ISO 时间戳>
**评审基准**：《实例化需求》+ 本项目三维分类模型

## 一、执行摘要

- **扫描 .feature 文件**：N 个
- **Scenario 总数**：M 个（其中 Scenario Outline: X 个，普通 Scenario: Y 个）
- **发现问题总数**：K 个（Critical: A，Warning: B，Info: C）
- **测试分层分布**：API P% / UI Q% / Config R% / E2E S%（健康阈值：UI ≤ API × 15%）
- **需求视角分布**：Main P% / Related Q% / Exception R% / Technical S%
- **健康度评分**：XX / 100

**一句话结论**：<整体判断，例如 "领域目录主轴清晰，但标签体系覆盖率仅 40%，且 UI 层场景超标，需要优先治理">

## 二、关键问题（Top 5）

按影响面×修复成本排序，列出最值得优先处理的 5 个问题。

1. **[Critical]** <问题摘要> —— 影响 N 个文件
   - 示例：`features/orders/checkout.feature:12` ...
   - 建议：...

## 三、分类问题清单

### 3.1 路径与文件组织

#### Critical
- `<file or folder path>`：<问题描述>
  - **根因**：<为什么这违反了原则>
  - **修改建议**：<具体的重构动作，给出目标路径或目标结构>

#### Warning
...

#### Info
...

### 3.2 标签体系

（同上结构）

### 3.3 场景内容

（同上结构）

### 3.4 分层平衡

（同上结构）

## 四、度量数据

### 4.1 测试分层分布

| 层级 | Scenario 数 | 占比 | 健康阈值 | 状态 |
|------|------------|------|---------|------|
| @layer-api | ... | ...% | 60-70% | ✅/⚠️/❌ |
| @layer-ui | ... | ...% | 5-10% | ✅/⚠️/❌ |
| @layer-config | ... | ...% | 15-25% | ✅/⚠️/❌ |
| @layer-e2e | ... | ...% | ≤5% | ✅/⚠️/❌ |
| 未标层级 | ... | ...% | 0% | ✅/⚠️/❌ |

### 4.2 需求视角分布

（类似的表格）

### 4.3 标签覆盖率

| 维度 | 已标注 Scenario 数 | 总数 | 覆盖率 |
|------|-------------------|------|-------|
| 测试分层 | ... | ... | ...% |
| 需求视角 | ... | ... | ...% |
| 两个维度都有 | ... | ... | ...% |

### 4.4 目录层级深度分布

顶层领域数、平均层级深度、最深路径示例。

## 五、修改优先级建议

按"三周迭代"的节奏给出建议：

### 第一周（止血）
必须修的 Critical 项，列具体动作清单。

### 第二周（补齐基础设施）
标签覆盖率提升、_shared/ 抽取、目录重构。

### 第三周（内容质量）
Scenario 拆分、边界 case 下沉、数据精简。

## 六、未触及的盲区

本次评审**不能**识别的问题（需要人工或其他工具补充）：

- Step Definitions 是否真的实现了 scenario 描述的行为（需要运行测试才能判断）
- 业务规则本身是否正确（需要领域专家 review）
- 性能和可靠性（需要运行层的观察）
- step 文本是否真的用了领域语言（需要领域词典对比）
```

## 生成报告时的几条硬约束

**约束 1：每条问题必须给出 file path。** 不允许出现 "有些 feature 文件没打标签" 这种泛泛陈述。要写成 "`features/orders/checkout.feature` 的 Scenario `提交订单` 没有 @layer-* 标签"。报告的价值在于可执行性，失去具体路径就失去可执行性。

**约束 2：每条 Critical 问题必须给出具体的修改动作。** 不能只说"建议重构"，要说"建议把 `features/ui/` 下的 23 个文件按业务领域重新分配到 `features/orders/`、`features/payments/`、`features/shipping/`，并给每个 scenario 添加 `@layer-ui` 标签"。

**约束 3：报告语言与输入语言一致。** 用户用中文提问就用中文写报告，用英文就用英文。代码、路径、标签名保持原样。

**约束 4：不要自动修改任何文件。** 本 skill 只产出报告，不动用户的 features 目录。如果用户随后明确要求"按报告改一下"，那是另一轮对话的事。

**约束 5：不确定的问题标注为 Info 而不是 Warning 或 Critical。** 例如无法判断 scenario 是否真的在测多条规则时（因为需要业务知识），降级为 Info 并说明需要人工确认。

## 如果 features/ 目录很大（>100 个文件）

直接一把梭评审会产出太长的报告，用户消化不了。这种情况下：

1. 先跑脚本生成度量快照
2. 给用户看执行摘要和 Top 5 关键问题
3. 询问用户希望先深入哪个领域/哪类问题，再按子集产出详细清单

避免一次吐 2 万字报告。

## 常见误判场景

这些场景容易被规则机械执行误伤，需要人工/LLM 判断介入：

- **`_shared/` 下的文件** 本就允许跨领域复用，不要报"领域归属不清"。
- **`_technical/` 下的文件** 本就允许违反"业务视角主导"的原则，但数量要严格控制（建议 ≤ 总数 10%）。
- **Scenario Outline 的 Examples 表** 本身就是大量边界的合法表达形式，不要当作"场景重复"报警。
- **step 里的技术术语**（如 "HTTP 200"、"cache hit"）在 @layer-api 或 @layer-config 层的 feature 里是合理的；在 @layer-e2e 或业务主场景里才算问题。
- **只有一个 scenario 的 feature 文件** 不一定是反模式——某些能力确实只有一个关键示例就够了。

## 参考资料

- `references/rules.md` — 完整规则清单（评审前必读）
- `references/examples.md` — 好坏对比示例
- `scripts/scan.py` — 度量采集脚本
