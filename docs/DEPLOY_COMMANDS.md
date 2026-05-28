# 部署命令说明

微信云开发**无法由本机 AI 代你完成「上传云函数 / 开通支付」**，必须在 **微信开发者工具** 或 **@cloudbase/cli** 下用你的微信账号操作。下面给出本仓库推荐的本地命令与工具内步骤。

---

## 1. 安装各云函数依赖（本机终端执行）

**一键**（推荐，与第 2 节列表一致）：

```bash
cd /Users/magainze/store-assistant-miniprogram
./scripts/deploy-cloudfunctions.sh
```

或逐目录手动：

```bash
cd /Users/magainze/store-assistant-miniprogram/cloudfunctions/createPayment && npm install
cd ../paymentCallback && npm install
cd ../saveUserPhone && npm install
cd ../getUserVouchers && npm install
cd ../verifyVoucher && npm install
cd ../revertVoucher && npm install
cd ../migrateUsers && npm install
cd ../getStaffProfile && npm install
cd ../runMarketingEngine && npm install
cd ../dailyCheckInactiveUsers && npm install
cd ../monitorSystem && npm install
cd ../getMarketingDashboard && npm install
cd ../seedMaijixianMarketing && npm install
cd ../verifyMaijixianSetup && npm install
cd ../batchTableCodes && npm install
cd ../exportTableCodesPdf && npm install
```

---

## 2. 微信开发者工具内上传云函数

1. 打开本项目目录，选择正确的 **AppID** 与 **云开发环境**。
2. 对下列目录分别：**右键 → 上传并部署：云端安装依赖**（或「上传并部署：所有文件」若你已本地 `npm install`）：
   - `cloudfunctions/createPayment`
   - `cloudfunctions/paymentCallback`
   - `cloudfunctions/saveUserPhone`
   - `cloudfunctions/getUserVouchers`
   - `cloudfunctions/verifyVoucher`
   - `cloudfunctions/revertVoucher`
   - `cloudfunctions/migrateUsers`（迁移完成后可删除部署）
   - `cloudfunctions/getStaffProfile`
   - `cloudfunctions/runMarketingEngine`
   - `cloudfunctions/dailyCheckInactiveUsers`（上传后请在云开发控制台确认**定时触发器**已创建）
   - `cloudfunctions/monitorSystem`（由 `dailyCheckInactiveUsers` 调用；也可单独配定时）
   - `cloudfunctions/getMarketingDashboard`（管理端/看板只读聚合，建议仅店长可调用）
   - `cloudfunctions/seedMaijixianMarketing`（门店营销种子，跑完可下架；见 `docs/MAIJIXIAN_MARKETING_SEED.md`）
   - `cloudfunctions/verifyMaijixianSetup`（自检/联调，见 `docs/MAIJIXIAN_MARKETING_SEED.md` 第六节）
   - `cloudfunctions/batchTableCodes`（桌位码批量生成）
   - `cloudfunctions/exportTableCodesPdf`（桌位码 PDF 导出，依赖 `pdf-lib`，务必选择“云端安装依赖”或先本地 `npm install` 再上传所有文件）

---

## 3. 数据库集合（云开发控制台手动创建）

至少创建：`users`、`staff`、`voucher_templates`、`user_vouchers`、`voucher_logs`、`Orders`、`analytics_logs`，以及营销相关 **`marketing_rules`**、**`marketing_rule_fires`**、**`marketing_stats`**、`user_tags`，告警 **`system_alerts`**，和你业务仍在用的 `Users`、`ScanLogs` 等。字段见 `docs/VOUCHER_DATABASE.md`、`docs/MARKETING.md`、`docs/MIGRATE_USERS.md`。

---

## 4.（可选）使用 CloudBase CLI

若已安装并登录 [CloudBase CLI](https://docs.cloudbase.net/cli-v1/intro)：

```bash
cd /Users/magainze/store-assistant-miniprogram
tcb fn deploy createPayment -e <你的环境ID>
# 对其余云函数名重复执行 deploy
```

具体参数以你安装的 CLI 版本文档为准。

---

## 5. 数据迁移（一次性）

在小程序端或控制台云函数测试调用 `migrateUsers`，详见 `docs/MIGRATE_USERS.md`。
