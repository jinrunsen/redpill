# Features 评审正反示例 (v2)

本文件给出具体的好/坏对比，用于评审时参照判断。所有示例使用 v2 冒号格式标签。

---

## 示例 1：顶层目录组织

### ❌ 坏：按测试类型分层

```
features/
├── ui/
│   ├── login.feature
│   └── checkout.feature
├── api/
│   └── orders.feature
└── e2e/
    └── full_journey.feature
```

### ✅ 好：按业务领域 + 标签表达测试分层

```
features/
├── orders/
│   ├── checkout.feature            # @test-layer:api 主场景
│   ├── checkout_ui.feature         # @test-layer:ui UI 行为
│   └── checkout_boundaries.feature # @boundary 边界压缩
├── payments/
├── user-profile/
├── _shared/
└── _technical/
```

---

## 示例 2：文件命名

### ❌ 坏：按 story ID 命名

```
features/orders/
├── US-1234.feature
└── JIRA-4567.feature
```

### ✅ 好：按业务能力命名，story 追溯用 tag

```
features/orders/
├── checkout.feature
└── refund_policy.feature
```

Story 追溯通过 `@story:JIRA-1234` tag 保留。

---

## 示例 3：标签使用

### ❌ 坏：没有标签 / 混乱

```gherkin
Feature: 订单结算

  Scenario: 用户提交订单
    Given ...
```

```gherkin
@smoke @regression @postgres @critical-path
Feature: 订单结算
  ...
```

### ✅ 好：多维正交标签（v2 冒号格式）

```gherkin
@test-layer:api @by:dev
Feature: 订单结算

  @spec:main @exec:regression @story:JIRA-1234
  Scenario: 用户结算购物车
    Given 购物车有 2 件商品
    When 用户提交订单
    Then 订单状态为"已创建"

  @spec:exception @nfr:reliability
  Scenario: 库存服务超时时订单进入重试队列
    Given 库存服务响应超时
    When 用户提交订单
    Then 订单状态为"待确认"
    And 进入补偿队列

  @spec:constraint @exec:smoke
  Scenario: 超过购物车上限时拒绝结算
    Given 购物车有 100 件商品（已达上限）
    When 用户再添加一件
    Then 返回错误"购物车已满"
```

**说明**：
- Feature 级 `@test-layer:api @by:dev` 被所有 scenario 继承
- 每个 scenario 精准区分视角：`@spec:main` 成功路径、`@spec:exception` 服务端问题、`@spec:constraint` 用户侧限制
- NFR 属性（`@nfr:reliability`）和执行特征（`@exec:regression`、`@exec:smoke`）按需叠加

---

## 示例 4：同规则多边界值的处理

### ❌ 坏：复制粘贴多个 Scenario

```gherkin
@test-layer:api
Feature: 免运费政策

  @spec:main
  Scenario: 订单金额 499 不免运费
    Given 订单金额是 499
    When 计算运费
    Then 运费是 10

  @spec:main
  Scenario: 订单金额 500 免运费
    Given 订单金额是 500
    When 计算运费
    Then 运费是 0

  @spec:main
  Scenario: 订单金额 1000 免运费
    Given 订单金额是 1000
    When 计算运费
    Then 运费是 0
```

### ✅ 好：Scenario Outline 压缩

```gherkin
@test-layer:api
Feature: 免运费政策

  @spec:main
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

---

## 示例 5：一个 Scenario 讲多条规则

### ❌ 坏

```gherkin
@test-layer:api @spec:main
Scenario: 用户下单并完成支付和发货
  Given 用户已登录
  When 用户提交订单
  Then 订单创建成功
  When 用户完成支付
  Then 订单状态变为"已支付"
  When 系统发货
  Then 订单状态变为"已发货"
```

### ✅ 好：拆成三个聚焦的 Scenario

```gherkin
@test-layer:api
Feature: 订单生命周期

  @spec:main
  Scenario: 用户成功创建订单
    Given 用户已登录
    And 购物车有商品
    When 用户提交订单
    Then 订单状态为"已创建"

  @spec:main
  Scenario: 支付完成后订单状态变更
    Given 存在一个"已创建"的订单
    When 支付成功
    Then 订单状态变为"已支付"

  @spec:related
  Scenario: 发货触发物流通知
    Given 存在一个"已支付"的订单
    When 系统发货
    Then 用户收到物流短信
```

---

## 示例 6：UI 层越界测业务规则

### ❌ 坏

```gherkin
@test-layer:ui @spec:main
Scenario: 结算页面计算免运费
  Given 用户打开结算页
  And 购物车金额是 500 元
  When 用户查看运费区域
  Then 运费显示为"免运费"
```

### ✅ 好：业务规则去 API 层，UI 层只验 UI 行为

```gherkin
# features/orders/shipping_fee.feature
@test-layer:api
Feature: 运费计算

  @spec:main
  Scenario: 满 500 免运费
    Given 订单金额是 500
    When 计算运费
    Then 运费是 0
```

```gherkin
# features/orders/checkout_ui.feature
@test-layer:ui
Feature: 结算页面交互

  @spec:main
  Scenario: 运费为 0 时显示"免运费"文案
    Given 运费计算结果是 0
    When 用户打开结算页
    Then 运费区域显示"免运费"
```

---

## 示例 7：边界 case 密集的文件分离

### ✅ 主文件干净 + 边界文件集中

```gherkin
# features/parsing/date_format.feature
@test-layer:api
Feature: 日期格式解析

  @spec:main
  Scenario: 解析标准 ISO 日期
    When 解析 "2026-04-20"
    Then 得到 2026 年 4 月 20 日

  @spec:constraint
  Scenario: 拒绝明显无效的日期
    When 解析 "not-a-date"
    Then 报错 "无效日期"

  # 详细边界规则见 date_format_boundaries.feature
```

```gherkin
# features/parsing/date_format_boundaries.feature
@test-layer:api @boundary
Feature: 日期格式解析 - 边界条件

  @spec:exception
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
```

---

## 示例 8：技术场景的隔离

### ❌ 坏：技术场景混在业务领域里

```gherkin
# features/orders/cache.feature
@test-layer:config
Feature: 订单缓存
  ...
```

### ✅ 好：技术场景单列

```gherkin
# features/_technical/caching.feature
@spec:technical @test-layer:config
Feature: 订单缓存实现

  Scenario: 缓存命中跳过数据库
    Given 订单 ID=123 已写入缓存
    When 请求订单 123
    Then 从缓存返回
    And 未查询数据库
```

---

## 示例 9：状态流转与 XDD 工作流

### 起草阶段（测试先行）

```gherkin
@test-layer:api @by:qa
Feature: 退款审核流程

  @spec:contract @status:draft
  Scenario: 退款申请触发对账单生成
    # 草稿，下周与财务团队评审
    Given 用户提交退款申请
    When 审核通过
    Then 生成对账单并发送给财务
```

### 评审通过，待实现

```gherkin
  @spec:contract @status:pending @story:JIRA-8888
  Scenario: 退款申请触发对账单生成
    Given 用户提交退款申请
    When 审核通过
    Then 生成对账单并发送给财务
```

### 实现完成（通常省略 @status，默认等同 @status:impl）

```gherkin
  @spec:contract @story:JIRA-8888
  Scenario: 退款申请触发对账单生成
    Given 用户提交退款申请
    When 审核通过
    Then 生成对账单并发送给财务
```

---

## 示例 10：NFR + 执行特征组合

```gherkin
@test-layer:api @by:dev @nfr:reliability @nfr:observability
Feature: 支付服务熔断降级

  @spec:exception @exec:slow @exec:regression @risk:high
  Scenario: 支付网关连续超时触发熔断
    Given 支付网关在最近 10 秒内连续超时 5 次
    When 新的支付请求到达
    Then 直接返回熔断错误，不调用下游
    And 记录熔断事件到可观测性系统
```

**说明**：
- Feature 级 `@nfr:reliability @nfr:observability` 标记整个 feature 关注可靠性和可观测性
- Scenario 级 `@exec:slow` 因为测试需要模拟时间窗口
- `@exec:regression` 标记回归必跑
- `@risk:high` 标记关键风险点

---

## 示例 11：跨 scenario 数据最小相关

### ❌ 坏：无关字段干扰

```gherkin
@test-layer:api @spec:main
Scenario: 金牌会员享受 10% 折扣
  Given 用户：
    | 姓名 | 年龄 | 邮箱 | 注册时间 | 会员等级 | 地址 | 电话 |
    | 张三 | 30 | z@t.com | 2020-01-01 | 金牌 | 北京 | 138... |
  And 商品：
    | 名称 | SKU | 价格 | 类别 | 库存 | 图片 |
    | X    | K01 | 100  | 电子 | 50   | http |
  When 用户下单
  Then 实付金额是 90
```

### ✅ 好：只保留相关字段

```gherkin
@test-layer:api
Feature: 会员折扣政策

  Background:
    # 默认：普通用户、普通商品（除非 scenario 另说）

  @spec:main
  Scenario: 金牌会员享受 10% 折扣
    Given 用户是金牌会员
    And 商品原价 100
    When 用户下单
    Then 实付金额是 90

  @spec:main
  Scenario: 普通用户不享受折扣
    Given 商品原价 100
    When 用户下单
    Then 实付金额是 100
```

---

## 评审时可直接引用这些示例

写修改建议时，可以直接说：

> 参照 `examples.md` 示例 4，把 `checkout.feature` 中第 23-58 行的 5 个重复 Scenario 合并为一个 Scenario Outline。

> 参照 `examples.md` 示例 6，把 `@test-layer:ui` 下涉及业务规则验证的 scenario 下移到 `@test-layer:api`。
