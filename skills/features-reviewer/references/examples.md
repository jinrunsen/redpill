# Features 评审正反示例

本文件给出具体的好/坏对比，用于评审时参照判断，以及给用户写修改建议时作为可引用的样板。

---

## 示例 1：顶层目录组织

### ❌ 坏：按测试类型分层

```
features/
├── ui/
│   ├── login.feature
│   ├── checkout.feature
│   └── profile.feature
├── api/
│   ├── orders.feature
│   └── payments.feature
└── e2e/
    └── full_journey.feature
```

**问题**：顶层目录泄露了"测试实现方式"而非"业务能力"。读者从目录树看不出这个系统是做什么的。新增一个"退款"能力时，它的 scenario 要被拆到三个目录下，无法聚合成一份活文档。

### ✅ 好：按业务领域分层 + 标签表达测试分层

```
features/
├── orders/
│   ├── checkout.feature          # @layer-api 主场景
│   ├── checkout_ui.feature       # @layer-ui UI 行为
│   └── checkout_boundaries.feature  # @layer-api @boundary 边界压缩
├── payments/
│   ├── authorization.feature
│   └── refund.feature
├── user-profile/
│   └── profile_update.feature
├── _shared/
│   └── notifications.feature     # 跨领域：发邮件/发短信
└── _technical/
    └── cache_invalidation.feature
```

**说明**：读者从目录树直接看到系统的业务版图（orders、payments、user-profile）。测试分层通过标签承担。`_shared/` 放真正被多个领域复用的能力。`_technical/` 严格限量。

---

## 示例 2：文件命名

### ❌ 坏：按 story ID 命名

```
features/orders/
├── US-1234.feature
├── US-1235.feature
├── JIRA-4567.feature
└── STORY-89.feature
```

**问题**：story 是计划工具，生命周期短。几个月后这些 ID 对读者没有任何语义。一个 feature 往往由多个 story 组成，用单一 story ID 命名文件会让后续 story 无处安放。

### ✅ 好：按业务能力命名

```
features/orders/
├── checkout.feature
├── refund_policy.feature
├── discount_codes.feature
└── order_cancellation.feature
```

**追溯**：story ID 用 tag 保留：`@story-US-1234 @story-US-1235`。

---

## 示例 3：标签使用

### ❌ 坏：没有标签 / 标签维度混乱

```gherkin
Feature: 订单结算

  Scenario: 用户提交订单
    Given 购物车有 2 件商品
    When 用户点击结算
    Then 创建订单
```

```gherkin
@smoke @regression @postgres @critical-path
Feature: 订单结算
  ...
```

**问题**：
- 第一个完全没标签，无法按维度筛选、无法统计分层。
- 第二个标签混乱：`@smoke`/`@regression` 是测试执行分组（该在 CI 配置里），`@postgres` 是实现细节，`@critical-path` 语义模糊。没有给出测试分层和需求视角。

### ✅ 好：三维正交标签

```gherkin
@layer-api
Feature: 订单结算

  @main
  Scenario: 用户结算购物车
    Given 购物车有 2 件商品
    When 用户提交订单
    Then 订单状态为"已创建"

  @exception
  Scenario: 库存不足时拒绝结算
    Given 购物车有 2 件商品
    And 其中商品 A 库存不足
    When 用户提交订单
    Then 订单创建失败
    And 返回库存不足提示

  @related @story-US-1234
  Scenario: 结算后触发库存扣减
    Given 购物车有 2 件商品
    When 用户提交订单
    Then 订单创建成功
    And 商品 A 的库存减 1
    And 商品 B 的库存减 1
```

**说明**：
- Feature 级标签 `@layer-api` 被所有 scenario 继承——全文件都是 API 层。
- 每个 scenario 单独打视角标签。
- `@story-*` 作为可追溯性标签附加，不影响分类。

---

## 示例 4：同规则多边界值的处理

### ❌ 坏：复制粘贴多个 Scenario

```gherkin
@layer-api
Feature: 免运费政策

  @main
  Scenario: 订单金额 499 元不免运费
    Given 订单金额是 499
    When 计算运费
    Then 运费是 10

  @main
  Scenario: 订单金额 500 元免运费
    Given 订单金额是 500
    When 计算运费
    Then 运费是 0

  @main
  Scenario: 订单金额 501 元免运费
    Given 订单金额是 501
    When 计算运费
    Then 运费是 0

  @main
  Scenario: 订单金额 1000 元免运费
    Given 订单金额是 1000
    When 计算运费
    Then 运费是 0
```

**问题**：四个 scenario 结构完全相同，只有参数不同。这样表达 (1) 冗长，(2) 新增一个边界需要复制整段，(3) 读者看不到这条规则的参数空间。

### ✅ 好：Scenario Outline 压缩

```gherkin
@layer-api
Feature: 免运费政策

  @main
  Scenario Outline: 根据订单金额计算运费
    Given 订单金额是 <金额>
    When 计算运费
    Then 运费是 <运费>

    Examples: 边界附近
      | 金额 | 运费 |
      | 499  | 10   |
      | 500  | 0    |
      | 501  | 0    |

    Examples: 典型值
      | 金额 | 运费 |
      | 100  | 10   |
      | 1000 | 0    |
```

**说明**：
- 规则"≥500 免运费"在 Examples 表格里一目了然（499→10, 500→0）。
- Examples 按语义分组（边界附近 / 典型值），比平铺更清晰。
- 新增边界值只要加一行。
- 总行数不超过 15 行（R3.3），仍在 acceptance 层的合理范围。

**什么时候这个规则需要更多覆盖？** 比如"金额 × 会员等级 × 促销组合"的笛卡尔积（3×4×5=60 组合），这就超出 acceptance 层的职责了，应该下沉到单元测试用 property-based 测试或参数化测试覆盖——在 .feature 里只保留 3-5 个关键组合。

---

## 示例 5：一个 Scenario 讲多条规则

### ❌ 坏：把多个规则塞进一个 Scenario

```gherkin
@layer-api @main
Scenario: 用户下单并完成支付和发货
  Given 用户已登录
  And 购物车有商品
  When 用户提交订单
  Then 订单创建成功
  When 用户完成支付
  Then 订单状态变为"已支付"
  And 库存扣减
  When 系统发货
  Then 订单状态变为"已发货"
  And 触发物流短信
```

**问题**：三个独立的业务规则（订单创建、支付完成、发货）被塞进一个 scenario。任何一条规则变化都会影响这个巨型 scenario 的可读性。测试失败时很难定位是哪一步出了问题。

### ✅ 好：拆成三个聚焦的 Scenario

```gherkin
@layer-api
Feature: 订单生命周期

  @main
  Scenario: 用户成功创建订单
    Given 用户已登录
    And 购物车有商品
    When 用户提交订单
    Then 订单状态为"已创建"

  @main
  Scenario: 支付完成后订单状态变更
    Given 存在一个"已创建"的订单
    When 支付成功
    Then 订单状态变为"已支付"
    And 对应商品库存扣减

  @main
  Scenario: 发货后订单状态变更
    Given 存在一个"已支付"的订单
    When 系统发货
    Then 订单状态变为"已发货"

  @related
  Scenario: 发货触发物流通知
    Given 存在一个"已支付"的订单
    When 系统发货
    Then 用户收到物流短信
```

**说明**：每个 scenario 有且只有一个"When"（或等价动作），每个只验证一条规则的结果。把"发货触发物流通知"拆到 `@related` 场景，因为它描述的是跨 feature 的协同而非主流程。

---

## 示例 6：UI 层越界测业务规则

### ❌ 坏：用 UI 测试业务规则

```gherkin
@layer-ui @main
Scenario: 结算页面计算免运费
  Given 用户打开结算页
  And 购物车金额是 500 元
  When 用户查看运费区域
  Then 运费显示为"免运费"
  And 总金额显示为 500 元
```

**问题**：真正要验证的是"≥500 免运费"的业务规则。UI 层的这个 scenario 通过 DOM 判断验证业务规则，脆弱、慢、调试困难。UI 改版就会挂。

### ✅ 好：业务规则去 API 层，UI 层只验 UI 行为

```gherkin
# 文件：features/orders/shipping_fee.feature
@layer-api
Feature: 运费计算

  @main
  Scenario: 满 500 免运费
    Given 订单金额是 500
    When 计算运费
    Then 运费是 0
```

```gherkin
# 文件：features/orders/checkout_ui.feature
@layer-ui
Feature: 结算页面交互

  @main
  Scenario: 运费为 0 时显示"免运费"文案
    Given 运费计算结果是 0
    When 用户打开结算页
    Then 运费区域显示"免运费"
```

**说明**：业务规则（≥500 免运费）在 API 层被验证一次，权威；UI 层只验证"运费为 0 时的视觉呈现"这个 UI 自己的责任。两者不重叠，改 UI 不影响业务规则测试。

---

## 示例 7：边界 case 密集的文件分离

### ❌ 坏：主文件被边界 case 淹没

```gherkin
@layer-api
Feature: 日期格式解析

  @main
  Scenario: 解析标准日期
    When 解析 "2026-04-20"
    Then 得到 2026 年 4 月 20 日

  @exception
  Scenario: 闰年 2 月 29 日
    When 解析 "2024-02-29"
    Then 得到 2024 年 2 月 29 日

  @exception
  Scenario: 非闰年 2 月 29 日
    When 解析 "2025-02-29"
    Then 报错 "无效日期"

  @exception
  Scenario: 2 月 30 日
    When 解析 "2026-02-30"
    Then 报错 "无效日期"

  @exception
  Scenario: 13 月
    When 解析 "2026-13-01"
    Then 报错 "无效日期"

  # ...还有 15 个类似的边界 case
```

**问题**：读者想理解"日期格式解析是什么"，被淹没在 20 个 exception scenario 里，找不到主场景。

### ✅ 好：主文件干净 + 边界文件集中

```gherkin
# 文件：features/parsing/date_format.feature
@layer-api
Feature: 日期格式解析

  @main
  Scenario: 解析标准 ISO 日期
    When 解析 "2026-04-20"
    Then 得到 2026 年 4 月 20 日

  @exception
  Scenario: 拒绝明显无效的日期
    When 解析 "not-a-date"
    Then 报错 "无效日期"

  # 详细的边界规则见 date_format_boundaries.feature
```

```gherkin
# 文件：features/parsing/date_format_boundaries.feature
@layer-api @boundary
Feature: 日期格式解析 - 边界条件

  @exception
  Scenario Outline: 边界日期识别
    When 解析 "<输入>"
    Then <结果>

    Examples: 闰年规则
      | 输入        | 结果                    |
      | 2024-02-29  | 得到 2024 年 2 月 29 日 |
      | 2025-02-29  | 报错 "无效日期"          |
      | 2000-02-29  | 得到 2000 年 2 月 29 日 |
      | 1900-02-29  | 报错 "无效日期"          |

    Examples: 月份边界
      | 输入        | 结果             |
      | 2026-00-01  | 报错 "无效日期"  |
      | 2026-13-01  | 报错 "无效日期"  |

    Examples: 日期边界
      | 输入        | 结果             |
      | 2026-04-31  | 报错 "无效日期"  |
      | 2026-02-30  | 报错 "无效日期"  |
```

**说明**：
- 主文件只有 2 个 scenario，读者能立刻建立"这个能力是什么"的心智模型。
- 边界规则集中在 `*_boundaries.feature`，用 Examples 分组呈现参数空间。
- 两个文件都在 `features/parsing/` 领域下，同时出现在活文档的同一个章节，读者能自然地从概览下钻到细节（zoom-in/zoom-out）。

---

## 示例 8：技术场景的隔离

### ❌ 坏：技术场景混在业务领域里

```gherkin
# 文件：features/orders/cache.feature
@layer-config
Feature: 订单缓存

  Scenario: Redis 缓存命中
    Given 订单 ID=123 已写入 Redis
    When 请求订单 123
    Then 从缓存返回
    And 未查询数据库
```

**问题**：这个 scenario 讲的是实现机制（Redis 缓存），不是业务规则。混在 `features/orders/` 里会让读者误以为这是订单领域的能力。

### ✅ 好：技术场景单列

```gherkin
# 文件：features/_technical/caching.feature
@technical @layer-config
Feature: 订单缓存实现

  Scenario: 缓存命中跳过数据库
    Given 订单 ID=123 已写入 Redis
    When 请求订单 123
    Then 从缓存返回
    And 未查询数据库
```

**进一步的问题**：这个 scenario 值得保留在 .feature 里吗？通常**不值得**。这是纯技术行为，用单元测试/集成测试验证更合适。只有当需要对业务方或运维方说明"系统有这个缓存层"时，才值得留在活文档。如果不是，删掉，放进代码层的测试套件。

---

## 示例 9：数据最小相关

### ❌ 坏：无关字段干扰阅读

```gherkin
@layer-api @main
Scenario: 金牌会员享受 10% 折扣
  Given 用户：
    | 姓名   | 年龄 | 邮箱              | 注册时间    | 会员等级 | 地址     | 电话         |
    | 张三   | 30   | zhang@test.com   | 2020-01-01  | 金牌     | 北京     | 13800000000  |
  And 商品：
    | 名称     | SKU      | 价格 | 类别 | 库存 | 图片 URL        |
    | 某商品   | SKU-001  | 100  | 电子 | 50   | http://img...   |
  When 用户下单
  Then 实付金额是 90
```

**问题**：真正参与规则的只有"会员等级=金牌"和"价格=100"两个字段。其他 12 个字段全是噪声，读者要费力才能找到规则关注点。

### ✅ 好：只保留相关字段

```gherkin
@layer-api
Feature: 会员折扣政策

  Background:
    # 默认：普通用户、普通商品，除非 scenario 另外说明

  @main
  Scenario: 金牌会员享受 10% 折扣
    Given 用户是金牌会员
    And 商品原价 100
    When 用户下单
    Then 实付金额是 90

  @main
  Scenario: 普通用户不享受折扣
    Given 商品原价 100
    When 用户下单
    Then 实付金额是 100
```

**说明**：无关字段去掉或移到 Background 的默认值。每个 scenario 只展示跟规则相关的 2-3 个字段。对 LLM 消费 feature 文件来说，这也大幅减少了 prompt 噪声和 token 消耗。

---

## 评审时可直接引用这些示例

写修改建议时，可以直接说：

> 参照 `examples.md` 示例 4，把 `checkout.feature` 中第 23-58 行的 5 个重复 Scenario 合并为一个 Scenario Outline。
