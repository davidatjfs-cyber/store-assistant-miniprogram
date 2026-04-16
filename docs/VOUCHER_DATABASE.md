# 核销系统 · 云开发数据库集合说明

在微信开发者工具 → 云开发 → 数据库中创建下列集合（名称需与代码一致）。以下为字段说明、索引建议与示例文档。

营销相关集合与定时任务说明另见 **`docs/MARKETING.md`**。

---

## 1. `voucher_templates`（券模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 文档 ID，下单时作为 `voucher_id` 传入 |
| `name` | string | 券名称（展示用） |
| `type` | string | `cash` 代金券 / `discount` 折扣 / `times` 次卡 |
| `value` | number | 面值含义随类型：现金券为金额（分）、折扣为折扣比例（如 88 表示 8.8 折）、次卡为次数 |
| `usage_rule` | string | 使用规则说明 |
| `valid_days` | number | 模板建议有效天数（发券逻辑里当前实现为支付后固定 30 天，可与模板并存供展示） |
| `price` | number | 售价（分），`createPayment` 必填 |
| `stock` | number | 库存；`-1` 表示不限 |
| `sold_count` | number | 已售数量（可选，默认 0） |
| `is_active` | boolean | 是否上架 |
| `store_ids` | array | 允许核销的门店 ID 列表；**非空**时仅在列表内门店可核销；**空或省略**表示不限制（仍受 `user_vouchers.store_id` 与员工门店约束） |
| `min_spend` | number | 最低消费门槛（**分**）；大于 0 时核销需传 `order_amount_fen` |
| `valid_time_range` | object | 每日可用时段，如 `{ "start": "09:00", "end": "22:30" }`（按 **Asia/Shanghai**）；`start > end` 视为跨日 |
| `valid_weekdays` | array | 可用星期，`1`–`7` 表示周一至周日 |
| `cost_fen` | number | 可选；单张券**成本**（分）；营销统计 `marketing_stats.cost` 优先用此字段，缺省时用 `value` 作成本近似 |
| `created_at` | date | 创建时间 |
| `updated_at` | date | 更新时间（可选） |

**示例文档：**

```json
{
  "_id": "tpl_cash_100",
  "name": "100 元代金券",
  "type": "cash",
  "value": 10000,
  "usage_rule": "全场通用，不找零，单笔限用 1 张",
  "valid_days": 30,
  "store_ids": ["hongchao_daning", "store_002"],
  "min_spend": 5000,
  "valid_time_range": { "start": "10:00", "end": "22:00" },
  "valid_weekdays": [1, 2, 3, 4, 5, 6, 7],
  "price": 8800,
  "stock": 500,
  "sold_count": 12,
  "is_active": true,
  "created_at": { "$date": "2026-03-01T08:00:00.000Z" }
}
```

---

## 2. `user_vouchers`（用户券）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 用户券唯一 ID；二维码内容为 `voucher:{_id}` |
| `user_id` | string | **`users._id`**（统一身份，勿再直接存 openid） |
| `template_id` | string | 对应 `voucher_templates._id` |
| `order_id` | string | 来源订单 `Orders._id`（幂等发券、对账） |
| `store_id` | string | 购券/下单时的来源门店（与 `Orders.store_id` 一致）；**非空**时仅可在该门店核销 |
| `status` | string | `unused` / `used` / `expired` |
| `expire_at` | date | 过期时间（支付成功发券：当前时间 + 30 天） |
| `used_at` | date | 核销时间；未核销为 `null` |
| `qr_code` | string | 扫码内容，格式 `voucher:{voucher_id}` |
| `marketing_rule_id` | string | 可选；营销引擎发放的券对应 `marketing_rules._id` |
| `marketing_user_segment` | string | 可选；营销发券时的用户分群（`vip` / `new` / `inactive` 等），核销统计 `marketing_stats` 时优先用此字段与发券 `store_id` 对齐分桶 |
| `created_at` | date | 发券时间 |
| `updated_at` | date | 最后更新时间（核销、过期标记等时写入，可选） |

**建议索引：** `user_id`；`order_id`；`qr_code`（唯一，若控制台支持）；`status` + `expire_at`（定时任务扫过期时可用）。

**示例文档：**

```json
{
  "_id": "uv_abc123",
  "user_id": "usr_doc_id_from_users",
  "template_id": "tpl_cash_100",
  "order_id": "order_doc_id_here",
  "store_id": "hongchao_daning",
  "status": "unused",
  "expire_at": { "$date": "2026-04-28T12:00:00.000Z" },
  "used_at": null,
  "qr_code": "voucher:uv_abc123",
  "created_at": { "$date": "2026-03-29T12:00:00.000Z" }
}
```

---

## 3. `voucher_logs`（核销记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 日志 ID |
| `voucher_id` | string | `user_vouchers._id` |
| `user_id` | string | 券所属用户 **`users._id`** |
| `store_id` | string | 实际核销门店（与员工 `store_id` 及模板规则一致） |
| `staff_id` | string | 核销员工 **`staff._id`** |
| `action` | string | `verify` |
| `reverted` | boolean | 是否已撤销核销（`revertVoucher`） |
| `reverted_at` | date | 撤销时间（可选） |
| `reverted_by_staff_id` | string | 执行撤销的管理员 `staff._id`（可选） |
| `created_at` | date | 核销时间 |

**建议索引：** `voucher_id` + `created_at`；`staff_id` + `created_at`（防刷与审计）。

**示例文档：**

```json
{
  "_id": "log_xyz",
  "voucher_id": "uv_abc123",
  "user_id": "usr_doc_id_from_users",
  "store_id": "hongchao_daning",
  "staff_id": "stf_doc_id",
  "action": "verify",
  "reverted": false,
  "created_at": { "$date": "2026-03-29T14:30:00.000Z" }
}
```

---

## 4. `users`（统一用户身份）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | **user_id**，被 `user_vouchers.user_id` 引用 |
| `openid` | string | 小程序 openid，唯一业务键 |
| `external_userid` | string | 企微 external_userid，可空 |
| `phone` | string | 手机号 |
| `last_payment_at` | date | 可选；最近一次支付成功（`paymentCallback`） |
| `last_verify_at` | date | 可选；最近一次券核销（`verifyVoucher`） |
| `total_spent_30d` | number | 可选；近 30 天已支付订单实付合计（**分**）；增量 + 日切全量兜底，见 `docs/MARKETING.md` |
| `visit_count_30d` | number | 可选；近 30 天核销次数（非撤销的 `verify`）；同上 |
| `last_active_at` | date | 可选；最近一次更新 30 天指标（支付/核销后） |
| `last_30d_reset_at` | string | 可选；上海日 `YYYY-MM-DD`，上次日切全量对齐（见 `docs/MARKETING.md`） |
| `last_marketing_at` | date | 可选；最近一次营销发券时间 |
| `marketing_touch_count_7d` | number | 可选；近 7 日营销发券次数（与引擎同步） |
| `user_score` | number | 可选；**0–100** 行为分（近 30 天消费、核销频次、最近活跃综合；`paymentCallback` / `verifyVoucher` / `daily_reconcile` 用户批次更新） |
| `created_at` | date | 创建时间 |
| `updated_at` | date | 更新时间（可选） |

**索引建议：** `openid` 唯一（或唯一索引）。

---

## 5. `staff`（店员 / 店长）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 员工文档 ID，写入 `voucher_logs.staff_id` |
| `openid` | string | 小程序登录 openid，与 `verifyVoucher` 上下文一致 |
| `name` | string | 展示名 |
| `role` | string | `staff` \| `manager`（**仅 manager 可调用 `revertVoucher`**） |
| `store_id` | string | 归属门店；核销时以此为准（可与前端传入 `store_id` 交叉校验） |
| `active` | boolean | 是否在职 |

**索引建议：** `openid` + `active`。

---

## 6. `analytics_logs`（埋点）

| 字段 | 类型 | 说明 |
|------|------|------|
| `user_id` | string | 相关 `users._id`；无则空字符串 |
| `action` | string | 如 `payment_success`、`voucher_issued`、`verify_success`、`verify_fail`、`verify_reverted`、**`marketing_blocked`**、**`rule_auto_disabled`**（规则因 ROI 自动关闭） |
| `metadata` | object | 结构化附加字段 |
| `created_at` | date | 记录时间 |

---

## 7. `marketing_stats`（营销按日统计）

按 **上海日历日** 聚合，字段与写入时机见 **`docs/MARKETING.md`**。含 `issued_count`、`issued_value`、`cost`、`used_count`、`revenue`（分）、**`roi`**（定时任务刷新）。

---

## 7b. `system_alerts`（系统告警）

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 如 `verify_fail_spike`、`marketing_blocked_spike`、`verify_fail_rate` |
| `alert_date` | string | 上海日 `YYYY-MM-DD`，同日同类型去重 |
| `severity` | string | 如 `warning`、`critical` |
| `message` | string | 可读说明 |
| `metadata` | object | 指标明细 |
| `notified` | boolean | 预留企微等渠道，默认 `false` |
| `created_at` | date | 创建时间 |

由云函数 **`monitorSystem`**（通常随 `dailyCheckInactiveUsers` 定时触发）写入。

---

## 8. 与现有 `Orders` 的衔接

- `createPayment` 支持传入 **`store_id`**，写入订单。
- 支付成功后，`paymentCallback` 会更新订单，并写入：

- `user_voucher_ids`：`string[]`，对应本次发放的 `user_vouchers._id`
- 其他原有字段（`payment_status`、`paid_at` 等）保持不变逻辑

---

## 9. 完整测试流程与数据变化

### 步骤 1：用户支付

- **操作**：小程序调用 `createPayment`，用户完成微信支付。
- **检查 `Orders`**：`payment_status` 由 `pending` 在回调成功后变为 `paid`；`paid_at`、`transaction_id`、`user_voucher_ids` 有值。
- **检查 `voucher_templates`**：若 `stock !== -1`，库存减少 `quantity`，`sold_count` 增加。

### 步骤 2：自动发券

- **操作**：微信触发 `paymentCallback`。
- **检查 `users`**：存在对应 `openid` 的文档，`paymentCallback` 已 `ensureUser`。
- **检查 `analytics_logs`**：含 `payment_success`、`voucher_issued`（仅本次新发的张数 > 0 时）。
- **检查 `user_vouchers`**：新增记录数 = 购买数量；`user_id` 为 `users._id`；`store_id` 与订单一致；`status` 均为 `unused`；`expire_at` ≈ 发券时间 +30 天；`qr_code` 为 `voucher:{该条 _id}`；`order_id` 对应订单 `_id`。
- **幂等**：同一订单重复回调不应新增重复券；`user_voucher_ids` 与库中 `order_id` 记录一致。

### 步骤 3：用户查看二维码

- **操作**：进入 `pages/voucher/list` → 点击券 → `pages/voucher/detail`。
- **检查**：`getUserVouchers` 返回列表含该券；详情页 Canvas 二维码内容与 `qr_code` 一致。

### 步骤 4：员工扫码

- **操作**：`pages/staff/verify` → 若模板有 `min_spend` 填写「本单消费金额（分）」→ `wx.scanCode`。
- **检查**：`verifyVoucher` 入参含 `qr_code`、可选 `store_id`、`order_amount_fen`；调用者 `OPENID` 必须在 **`staff` 且 `active: true`**。

### 步骤 5：核销成功

- **检查 `user_vouchers`**：对应 `_id` 的 `status` 变为 `used`，`used_at` 有值。
- **检查 `voucher_logs`**：新增 `action: verify`，`staff_id` 为 **`staff._id`**，`user_id` 为 **`users._id`**，`store_id` 为实际核销门店。
- **检查 `analytics_logs`**：`verify_success`；失败路径为 `verify_fail`。
- **再次扫码**：应提示已使用或失败，不可重复核销。

### 步骤 6（可选）：过期

- 将某券 `expire_at` 改为过去时间且 `status` 仍为 `unused`，调用 `verifyVoucher` 应返回过期错误；可用定时云函数将 `unused` 且过期的券批量改为 `expired`（本仓库未实现定时任务，可自行扩展）。

---

## 10. `verifyVoucher` 防作弊与审计

| 能力 | 实现说明 |
|------|----------|
| 店员身份 | 必须在 **`staff` 集合**中存在 `openid` + `active: true`，否则拒绝。 |
| 同一券不可重复核销 | `where({ _id, status: 'unused' }).update(...)`。 |
| 核销时间 | `user_vouchers.used_at`、`voucher_logs.created_at` 使用 `db.serverDate()`。 |
| `voucher_logs.staff_id` | 存 **`staff._id`**（非 openid）。 |
| 门店 | 优先使用员工 `staff.store_id`；若前端传入 `store_id` 与员工门店不一致则拒绝；模板 `store_ids`、券 `store_id` 按规则校验，错误返回 **「该券不可在本门店使用」**。 |
| 模板规则 | `valid_weekdays`、`valid_time_range`（上海时区）、`min_spend`（需 `order_amount_fen`）。 |
| 短时频繁请求 | 同一 **`staff._id`** 在 **3 秒** 内 `voucher_logs` 超过 **8 条** →「操作过于频繁」。 |

---

## 11. 数据库索引建议（云控制台）

- `users`：`openid`
- `staff`：`openid` + `active`
- `user_vouchers`：`user_id` + `created_at`（与 `getUserVouchers` 一致）
- `user_vouchers`：`order_id`
- `voucher_logs`：`staff_id` + `created_at`
- `voucher_logs`：`voucher_id` + `created_at`（`revertVoucher`、审计）
- `analytics_logs`：`action` + `created_at`（可选）

---

## 12. 从旧集合 `Vouchers` 迁移

若你此前使用集合名 `Vouchers`，请在数据库中将数据导出后导入为 `voucher_templates`，或逐条复制，并保证 `_id` 与订单里 `voucher_id` 一致。

---

## 13. 小程序二维码绘制说明

详情页使用 `utils/weapp.qrcode.js`（自 [weapp-qrcode](https://github.com/yingye/weapp-qrcode) MIT 打包），与根目录 `npm` 依赖 `weapp-qrcode` 同源；可直接运行，无需再执行「构建 npm」。若需升级版本，可 `npm update weapp-qrcode` 后重新复制 `node_modules/weapp-qrcode/dist/weapp.qrcode.common.js` 覆盖 `utils/weapp.qrcode.js`。
