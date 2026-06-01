# 营销规则与定时召回

## 集合 `marketing_rules`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 规则 ID |
| `name` | string | 展示名称 |
| `trigger_type` | string | `payment`（支付后由 `paymentCallback` 间接触发） / `inactivity`（由定时任务扫描） / `manual`（云函数 `hook: 'manual'`） |
| `trigger_value` | string/number | **inactivity**：如 `7` 或 `7天` 表示「注册满 N 天且 N 天内无核销」；**payment**：解析数字为**最低实付金额（分）**，空则不限 |
| `action_type` | string | 当前仅支持 `send_voucher` |
| `action_config` | string / object | 券模板 ID，或 `{ "template_id": "xxx" }` |
| `active` | boolean | 是否启用 |
| `cooldown_days` | number | 可选；同一用户+规则在此天数内不重复触发；未设时 payment 默认 1 天，inactivity 默认与 `trigger_value` 天数一致 |
| `priority` | number | 可选；**数字越大优先级越高**。同一用户同一天（上海日历日）在 `payment` / `inactivity` 路径上**只执行最高优先级且实际发券成功的一条**；其余命中规则会记 `marketing_blocked`，`reason: lower_priority_suppressed` |
| `daily_user_limit` | number | 可选；单用户**当天**（上海日）该规则最多触发次数；超出则不发券并记 `marketing_blocked`，`reason: daily_user_limit` |
| `global_daily_limit` | number | 可选；该规则**当天**全局最多发放次数（见 `marketing_stats.issued_count`）；超出则不发券并记 `marketing_blocked`，`reason: global_daily_limit` |
| `target_tags` | string[] | 可选；**非空**时，用户 `user_tags` / `users.lifecycle_stage` / `users.value_tier` 中须**至少命中其一**才允许触发；未配置或空数组表示不限制。标签口径以 HRMS 为准：生命周期 `prospect` / `new` / `active` / `at_risk` / `dormant` / `churned`，价值层级 `vip` / `regular` / `low` |
| `auto_disable_roi_threshold` | number | 可选；**近 3 日**（上海日）汇总 ROI（`revenue / issued_value`）**持续低于**该阈值且 `issued_value` 样本足够时，`daily_reconcile` 将 **`active=false`** 并写 `analytics_logs`：`rule_auto_disabled` |
| `dynamic_priority` | number | 可选；**动态排序分**，在 `daily_reconcile` 中按近 3 日 ROI 自动升降；执行规则时与 `priority` 二选一参与排序：**有 `dynamic_priority` 用其值，否则用 `priority`** |
| `created_at` | date | 创建时间 |

## 集合 `marketing_rule_fires`（防重复 + 按日计数）

| 字段 | 说明 |
|------|------|
| `user_id` | `users._id` |
| `rule_id` | `marketing_rules._id` |
| `fire_day` | 上海日历日字符串 `YYYY-MM-DD`，用于 `daily_user_limit` 统计 |
| `meta` | 可选附加 |
| `created_at` | 触发时间 |

去重逻辑：若存在「同一 `user_id` + `rule_id`」且 `created_at` 在 **冷却窗口**内，则不再发券。冷却见 `cooldown_days` / 默认规则。

## 集合 `marketing_stats`（按天聚合）

同一 `rule_id` + `date` 下按 **`store_id` + `user_segment`** 分桶（便于新客/老客/高价值等 ROI）。`global_daily_limit` 统计当日该规则**所有分桶** `issued_count` 之和。

| 字段 | 说明 |
|------|------|
| `rule_id` | `marketing_rules._id` |
| `date` | 上海日历日 `YYYY-MM-DD` |
| `store_id` | 发券上下文门店（与 `user_vouchers.store_id` 一致；无则 `''`） |
| `user_segment` | 发券时刻用户生命周期分群：`prospect` / `new` / `active` / `at_risk` / `dormant` / `churned`（以 HRMS lifecycle 为准；`value_tier` 只用于规则筛选，不覆盖统计分群） |
| `issued_count` | 当日该规则发放张数（营销发券成功时 `+1`） |
| `issued_value` | 当日发放券的**面值合计**（**分**；取 `voucher_templates.value` × 张数） |
| `cost` | 当日券**成本**合计（**分**；模板有 `cost_fen` 则用其累加，否则默认与面值增量相同） |
| `used_count` | 当日带 `marketing_rule_id` 的券被核销次数（`verifyVoucher` 成功时 `+1`） |
| `revenue` | 当日核销关联金额累计（**分**；写入**与发券相同的** `store_id` + `user_segment` 桶；`user_segment` 优先用券上 `marketing_user_segment`） |
| `roi` | `revenue / issued_value`（`issued_value` 为 0 时为 `null`）；由定时 **`daily_reconcile`** 按行刷新 |
| `updated_at` | 更新时间 |

## 拦截埋点 `analytics_logs`

当规则因标签、限额、优先级等原因未发券时，写入：

- `action`: `marketing_blocked`
- `metadata` 建议包含：`rule_id`、`reason`（如 `target_tags_mismatch`、`daily_user_limit`、`global_daily_limit`、`lower_priority_suppressed`、**`marketing_frequency_cap`**（近 7 日营销发券已达 3 次，第 4 次起拦截））、`trigger_type` 等

## 云函数 `runMarketingEngine`

| `hook` | 说明 |
|--------|------|
| `post_payment` | 入参：`user_id`, `openid`, `order_id`, `store_id`, `amount_fen`, `is_first_order`。先校验近 7 日 `marketing_rule_fires` **是否已达 3 次**（**≥3 则整单营销跳过**，`marketing_blocked` / `marketing_frequency_cap`）。规则按 `priority` 降序；**同一用户同一天仅一条成功发券**；成功时累加 `marketing_stats`（`issued_count`、`issued_value`、`cost`），并 `syncMarketingTouchAfterFire` |
| `inactivity_scan` | 全量扫描；同上优先级与单日一条；命中用户先 **`updateUserTags`**（写入 HRMS 生命周期标签，如 `dormant` / `churned`），再校验频控后发券 |
| `manual` | 入参：`user_id`, `rule_id`, 可选 `openid`、`store_id`；频控 + `tryExecuteRule`；成功后 **`updateUserTags`** |
| `daily_reconcile` | 可选 `limit`（默认 300，最大 500）、`skip`：分批 **全量重算** `users` 的 `total_spent_30d` / `visit_count_30d` 并写 `last_30d_reset_at`；对**上海当日与昨日**的 `marketing_stats` 重算 **`roi`**；**规则维护**：近 3 日 ROI 低于 `auto_disable_roi_threshold` 则自动关规则（`rule_auto_disabled`）；并按 ROI 调整各规则 **`dynamic_priority`** |

支付成功时：**`paymentCallback`** 先 **`applyPaymentIncrement30d`**（见下）、**`updateUserTags`**，再调用 **`runMarketingEngine`**。核销成功：**`verifyVoucher`** 先 **`applyVisitIncrement30d`**，再 **`updateUserTags`**。

### 30 天指标：增量 + 日切全量兜底（最终一致）

- **`users.last_30d_reset_at`**：字符串，上海日历日 `YYYY-MM-DD`，表示该日是否已做过「日切对齐」。
- **支付成功**：若 `last_30d_reset_at` ≠ 当日上海日 → 先 **`recomputeUserActivity30dFull`**（扫 `Orders` + `voucher_logs`），再写当日 `last_30d_reset_at`（本笔订单已入 `Orders`，全量结果已含本笔）；若已为当日 → **`total_spent_30d += 本单金额`**。
- **核销成功**：同理，日切则全量重算（已写入的 `voucher_logs` 会计入）；否则 **`visit_count_30d += 1`**。
- **定时**：`dailyCheckInactiveUsers` 会调用 **`daily_reconcile`**（默认每轮最多处理 400 个 `users`，可多次调大 `skip` 扫完全库），修正漂移。

## 定时任务 `dailyCheckInactiveUsers`

- 默认 **每天 9:00**（cron：`0 0 9 * * * *`；若上传报错请按当前微信文档调整位数）。
- 顺序调用：`inactivity_scan` → `daily_reconcile`（30d 兜底 + **roi**）→ 云函数 **`monitorSystem`**（见下）。
- 部署后需在云开发控制台确认**定时触发器**已启用；并**上传部署** `monitorSystem`（被本函数 `callFunction` 调用）。

## 云函数 `monitorSystem`

- 扫描近 **24h** `analytics_logs`，阈值可改代码内常量。
- 异常时写入集合 **`system_alerts`**（`type`、`alert_date`、`severity`、`message`、`metadata`、`notified` 预留企微推送）。
- 类型示例：`verify_fail_spike`、`marketing_blocked_spike`、`verify_fail_rate`。

## 集合 `user_tags`

| 字段 | 说明 |
|------|------|
| `user_id` | `users._id` |
| `tag` | HRMS 生命周期标签：`prospect` / `new` / `active` / `at_risk` / `dormant` / `churned`；可选 HRMS 价值层级标签：`vip` / `regular` / `low` |
| `updated_at` | 更新时间 |

**分段标签（自动，统一函数 `updateUserTags`）**

以下标签由 **`updateUserTags(user_id)`** 统一计算：先删除该用户在 `user_tags` 中的**托管标签**，再按 HRMS 规则重写，同时同步 `users.lifecycle_stage` / `users.value_tier`。

- **`prospect`**：累计下单数为 0。
- **`new`**：累计下单 1 次，且最近 14 天内到店/支付/核销。
- **`active`**：累计下单 ≥ 2 次，且最近 14 天内到店/支付/核销。
- **`at_risk`**：最近 14-30 天未到店/支付/核销。
- **`dormant`**：30 天以上未到店/支付/核销，且累计下单 ≥ 2 次。
- **`churned`**：30 天以上未到店/支付/核销，且历史仅下过 1 单。
- **`vip` / `regular` / `low`**：价值层级按 HRMS `value_tier` 写入；小程序不再用 30 天消费阈值自造 VIP/高低价值。

同步时机：**`paymentCallback`**（带 `is_first_order`、`single_pay_fen`）、**`verifyVoucher`**、**`runMarketingEngine`**（`inactivity_scan` 命中用户 / `manual` 发券后 / `daily_reconcile` 每用户兜底）。

**`users.last_verify_at`** 等仍由核销云函数单独更新；标签以 `updateUserTags` 读库结果为准。

## `users` 扩展字段

| 字段 | 说明 |
|------|------|
| `last_payment_at` | 最近一次支付成功时间（`paymentCallback`） |
| `last_verify_at` | 最近一次券被核销时间（`verifyVoucher`） |
| `total_spent_30d` | 近 30 天已支付订单实付合计（分）；**增量** + 日切全量兜底 |
| `visit_count_30d` | 近 30 天核销次数；**增量** + 日切全量兜底 |
| `last_30d_reset_at` | 上海日 `YYYY-MM-DD`，上次日切全量对齐日期 |
| `last_active_at` | 最近一次更新 30d 指标或相关写库时间 |
| `last_marketing_at` | 最近一次营销发券（`marketing_rule_fires` 写入后同步） |
| `marketing_touch_count_7d` | 近 7 天营销发券次数（与 `marketing_rule_fires` 统计同步；**达到 3 次后**不再发券） |

## 示例 `marketing_rules` 文档

**支付满赠券（满 5000 分），高优先级、每人每天 1 张、全局每天 500 张**

```json
{
  "_id": "mkt_pay_bonus",
  "name": "实付满50元送券",
  "trigger_type": "payment",
  "trigger_value": 5000,
  "action_type": "send_voucher",
  "action_config": "tpl_bonus_10",
  "active": true,
  "priority": 10,
  "daily_user_limit": 1,
  "global_daily_limit": 500,
  "target_tags": [],
  "cooldown_days": 7,
  "created_at": { "$date": "2026-03-29T00:00:00.000Z" }
}
```

**仅 dormant 用户的召回**

```json
{
  "_id": "mkt_dormant_winback",
  "name": "7天未核销召回",
  "trigger_type": "inactivity",
  "trigger_value": "7天",
  "action_type": "send_voucher",
  "action_config": "tpl_recall_20",
  "active": true,
  "priority": 5,
  "target_tags": ["dormant"],
  "created_at": { "$date": "2026-03-29T00:00:00.000Z" }
}
```

**仅 VIP 高价值券**

```json
{
  "_id": "mkt_vip_only",
  "name": "VIP专享券",
  "trigger_type": "payment",
  "trigger_value": 0,
  "action_type": "send_voucher",
  "action_config": "tpl_vip",
  "active": true,
  "priority": 20,
  "target_tags": ["vip"]
}
```

## `user_vouchers` 营销发券字段

营销发放的券会带：

- `order_id`：`mkt:{ruleId}:{voucherId}`
- `marketing_rule_id`：规则 `_id`

## 云函数 `getMarketingDashboard`

只读聚合，供小程序/管理端展示（**请在业务侧限制为店长/运营调用**）。

返回结构概要：

- `date`：上海当日
- `today.summary`：今日全量发券数、核销数、收入（分）、面值合计
- `today.rules[]`：每条规则今日汇总 + `by_segment`（各分群 issued/used/revenue/roi）
- `last_7d.rules[]`：近 7 日按规则汇总
- `top_rules_by_roi`：近 7 日 ROI 前十（`issued_value` 至少 5000 分才参与，避免样本过小）

调用：`wx.cloud.callFunction({ name: 'getMarketingDashboard', data: {} })`。

## 一键安装云函数依赖（本地）

在项目根目录执行：

```bash
./scripts/deploy-cloudfunctions.sh
```

然后在**微信开发者工具**中：云开发 → 右键各云函数目录 → **上传并部署：云端安装依赖**（或已本地 `npm install` 时用「上传并部署：所有文件」）。

**说明**：数据库集合与索引仍需在云开发控制台创建；若不便自行运维，可将环境交给有权限的同事，按 `docs/DEPLOY_COMMANDS.md` 上传云函数即可，**无需手写运维脚本**。
