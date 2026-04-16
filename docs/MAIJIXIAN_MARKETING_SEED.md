# 马己仙广东小馆 · 首家门店营销配置

与现有 `voucher_templates` / `marketing_rules` / `user_tags` / `marketing_stats` 字段兼容。金额均为**分**。

## 一、写入云数据库（推荐）

1. 上传并部署云函数 **`seedMaijixianMarketing`**（云端安装依赖）。
2. 在云开发控制台 → 云函数 → **云端测试**，传入：

```json
{ "confirm": "CONFIRM_SEED_MAIJIXIAN" }
```

3. 返回体中的 **`voucher_templates.keys`** 与 **`marketing_rules.keys`** 即为稳定 `_id`（见下）。

### 券模板 `_id`（规则已引用）

| 用途 | `_id` |
|------|--------|
| 新客 | `mjx_tpl_new_001` |
| 复购 | `mjx_tpl_return_001` |
| 召回 | `mjx_tpl_recall_001` |
| VIP | `mjx_tpl_vip_001` |

### 营销规则 `_id`

| 规则 | `_id` |
|------|--------|
| 新客转化 | `mjx_rule_new_convert` |
| 复购驱动 | `mjx_rule_repurchase` |
| 7天召回 | `mjx_rule_recall_7d` |
| VIP 激励 | `mjx_rule_vip_boost` |

### 与需求差异说明

- 小程序代码要求券模板字段为 **`is_active: true`**，种子数据**不使用** `status`（若你在控制台手搓 JSON，请改成 `is_active`）。
- 已补充 **`price`**（与面值同分，便于 `createPayment` 上架购买）、**`stock: -1`**、**`usage_rule`**。
- 营销发券的过期时间：引擎已支持按模板 **`valid_days`** 计算（未设则默认 30 天）。

### `general` 标签与「复购规则」

规则 2 的 `target_tags` 为 **`["general"]`**。代码已在 `updateUserTags` 中于 **`Users.total_orders >= 2`** 且非 `vip`、非 `new` 时写入 **`general`**，与复购场景一致。

---

## 二、模拟测试：新用户首单支付 5000 分（预期）

**无法在本机代你调用真实云环境**，请在本机微信开发者工具云函数测试中按下列顺序自查。

### 前置

- 已部署：`paymentCallback`、`runMarketingEngine`、种子数据已执行。
- 测试号：`users` + `Users` 中 `total_orders === 0`（真新客）。

### 流程

1. 走真实或测试下单 → 支付成功回调 `paymentCallback`（订单 `paid_amount`/`totalFee` = **5000**）。
2. `paymentCallback` 会：`applyPaymentIncrement30d` → `updateUserTags`（`new` + `is_first_order`）→ `runMarketingEngine` `post_payment`。

### 预期结果

| 检查项 | 预期 |
|--------|------|
| 命中规则 | **新客转化**（`mjx_rule_new_convert`）：`target_tags: new`，`trigger_value: 0` 满足实付；动态排序下 VIP(110) 不命中，new(100) 命中 |
| `user_vouchers` | 新增 1 条，`template_id === mjx_tpl_new_001`，`marketing_rule_id === mjx_rule_new_convert`，`store_id` 与订单一致 |
| `marketing_rule_fires` | 新增 1 条，`rule_id`、`user_id`、`fire_day` 为当日上海日 |
| `analytics_logs` | `action === marketing_triggered`，`metadata.rule_id` 为 `mjx_rule_new_convert` |
| **不会** | 复购规则要求 `general` + 实付≥3000：首单仅有 `new`，**不应**走复购规则 |

### SQL/控制台核对（示例字段）

- `marketing_stats`：当日 `rule_id + date + store_id + user_segment` 分桶（`user_segment` 多为 `new`）`issued_count` +1。

---

## 三、定时任务 `dailyCheckInactiveUsers`

本仓库已包含 **`cloudfunctions/dailyCheckInactiveUsers/config.json`**，默认 **每天 9:00**（上海习惯需结合控制台时区理解）：

```json
{
  "permissions": {
    "openapi": []
  },
  "triggers": [
    {
      "name": "dailyInactiveScan",
      "type": "timer",
      "config": "0 0 9 * * * *"
    }
  ]
}
```

- 若上传后触发器未生效：在云开发控制台 **触发器** 页确认已创建、状态启用。
- 执行顺序（代码已串联）：`inactivity_scan` → `daily_reconcile` → `monitorSystem`。

> 不同基础库/环境对 cron 位数要求可能略有差异；若报错，以[微信云开发定时触发器文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/trigger.html)为准微调。

---

## 四、`getMarketingDashboard` 调用示例

云端测试或小程序：

```javascript
wx.cloud.callFunction({ name: 'getMarketingDashboard', data: {} })
```

### 预期结构（示意）

- `today.summary`：`issued_count`、`used_count`、`revenue_fen`、`issued_value_fen` 等汇总。
- `today.rules`：含 `mjx_rule_*` 与 `by_segment`（有数据后出现）。
- `top_rules_by_roi`：近 7 日 ROI 排序（需 `issued_value` 样本足够才有）。

种子执行后即使尚无流水，`today.rules` 也会列出规则占位（发券数为 0）。

### 返回示例（结构示意，数值随环境变化）

```json
{
  "success": true,
  "date": "2026-03-29",
  "today": {
    "summary": {
      "issued_count": 1,
      "used_count": 0,
      "revenue_fen": 0,
      "issued_value_fen": 2000
    },
    "rules": [
      {
        "rule_id": "mjx_rule_new_convert",
        "name": "新客转化-首单发券",
        "issued_count": 1,
        "used_count": 0,
        "revenue_fen": 0,
        "issued_value_fen": 2000,
        "roi": 0,
        "by_segment": {
          "new": {
            "issued_count": 1,
            "used_count": 0,
            "revenue_fen": 0,
            "issued_value_fen": 2000,
            "roi": 0
          }
        }
      }
    ]
  },
  "last_7d": { "rules": [] },
  "top_rules_by_roi": []
}
```

---

## 五、一键安装依赖

```bash
cd /Users/magainze/store-assistant-miniprogram
./scripts/deploy-cloudfunctions.sh
```

然后在微信开发者工具中上传：**`seedMaijixianMarketing`**、**`runMarketingEngine`**、**`paymentCallback`**、**`getMarketingDashboard`**、**`dailyCheckInactiveUsers`** 等。

---

## 六、自检云函数 `verifyMaijixianSetup`（替代手工逐项查库）

我（AI）无法直连你的云环境；部署本函数后，**一次调用**可返回你问题清单里的结构化结果。

### 1）只检查 4 模板 + 4 规则是否存在、关键字段是否一致

云函数测试参数：

```json
{
  "confirm": "CONFIRM_VERIFY_MJX",
  "check_data_only": true
}
```

### 2）完整链路：同步 `new` 标签 → `post_payment` 5000 分 → 校验券/fires/埋点 → 复购未触 → 可选模拟核销 → `marketing_stats` → `getMarketingDashboard`

需真实 **`users._id`** 与 **`openid`**（建议该用户在 `Users` 里 `total_orders === 0` 或接受报告中的提示）：

```json
{
  "confirm": "CONFIRM_VERIFY_MJX",
  "run_integration": true,
  "simulate_verify": true,
  "user_id": "你的users文档_id",
  "openid": "你的小程序openid"
}
```

返回中含 **`part1_data_check`**、**`part3_*`**、**`part4_repurchase_should_not_trigger`**、**`part5_stats_after_issue`** / **`part7_stats_after_verify`**、**`part7_getMarketingDashboard`** 及 **`summary_for_human`**。

### 3）一直报「3 秒超时 / statusCode 433」

说明云端 **`verifyMaijixianSetup` 的执行超时仍是默认 3s**（`skip_dashboard` 也救不了：子调用 `runMarketingEngine` 冷启动 + 本函数后续 DB 仍可能超过 3s）。请任选其一：

1. **上传部署时带上** `cloudfunctions/verifyMaijixianSetup/config.json`（已含 `"timeout": 60`），并重新上传该云函数。  
2. 打开 **[腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)** → 你的环境 → **云函数** → **`verifyMaijixianSetup`** → **函数配置 / 高级配置** → 将 **执行超时时间** 改为 **60 秒**（与开发者工具里显示一致后再测）。  
3. **分步测（仍限 3s 时）**：  
   - 先单独云端测试 **`runMarketingEngine`**，入参示例：
     ```json
     {
       "hook": "post_payment",
       "user_id": "你的users._id",
       "openid": "你的openid",
       "order_id": "test_mjx_manual",
       "store_id": "store_maijixian_001",
       "amount_fen": 5000,
       "is_first_order": true
     }
     ```
   - 再测 **`verifyMaijixianSetup`**，在原有 JSON 上增加 **`"skip_engine_call": true`**、**`"skip_dashboard": true`**：本函数**不再**嵌套调用引擎，只读库核对券 / fires / 埋点（**前提**：上一步已成功发过券）。

**说明**：`simulate_verify` 在云内**模拟核销**（`staff_id` 为占位），用于联调统计与 `users` 字段；正式验收仍建议用真实店员端调 `verifyVoucher`。

**安全**：勿对生产开放给普通用户；联调后可下架或删除该云函数。
