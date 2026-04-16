# 门店私域助手 - 部署与测试指南

## 📋 目录结构

```
store-assistant-miniprogram/
├── cloudfunctions/
│   ├── createPayment/
│   ├── paymentCallback/
│   ├── saveUserPhone/
│   ├── getUserVouchers/
│   ├── verifyVoucher/
│   ├── revertVoucher/
│   ├── migrateUsers/
│   ├── getStaffProfile/
│   ├── runMarketingEngine/
│   └── dailyCheckInactiveUsers/
├── pages/
│   ├── index/
│   ├── voucher/
│   └── staff/
├── app.js
├── app.json
├── sitemap.json
├── project.config.json
└── README.md
```

---

## 🚀 快速开始

### 步骤 1: 安装云函数依赖

```bash
cd cloudfunctions/createPayment && npm install
cd ../paymentCallback && npm install
cd ../saveUserPhone && npm install
cd ../getUserVouchers && npm install
cd ../verifyVoucher && npm install
cd ../revertVoucher && npm install
cd ../migrateUsers && npm install
cd ../getStaffProfile && npm install
cd ../runMarketingEngine && npm install
cd ../dailyCheckInactiveUsers && npm install
```

### 步骤 2: 配置环境

- 修改 `app.js` 中 `wx.cloud.init` 的 `env` 为你的云环境 ID。
- 修改 `project.config.json` 中的 `appid`（若与当前不一致）。

### 步骤 3: 上传云函数

在微信开发者工具中，对 `createPayment`、`paymentCallback`、`saveUserPhone`、`getUserVouchers`、`verifyVoucher`、`revertVoucher`、`migrateUsers`、`getStaffProfile`、`runMarketingEngine`、`dailyCheckInactiveUsers` 分别：**右键 → 上传并部署：云端安装依赖**。`dailyCheckInactiveUsers` 部署后请在云开发控制台核对**定时触发器**。更完整的命令清单见 **`docs/DEPLOY_COMMANDS.md`**。

### 步骤 4: 初始化数据库

在云开发控制台创建集合，至少包括：

| 集合名 | 说明 |
|--------|------|
| Users | 用户（历史统计/入会，与 `users` 并存） |
| users | 统一身份（openid → user_id，`getUserVouchers` / 发券使用） |
| staff | 店员与店长（`verifyVoucher` / `revertVoucher`） |
| voucher_templates | 券模板（支付链路，`createPayment` 读取） |
| user_vouchers | 用户券（支付成功后由 `paymentCallback` 写入） |
| voucher_logs | 核销记录（`verifyVoucher` / `revertVoucher`） |
| analytics_logs | 埋点（支付成功、发券、核销成功/失败、撤销、`marketing_triggered` 等） |
| marketing_rules | 营销规则（支付/未活跃/手动） |
| marketing_rule_fires | 营销触发去重 |
| user_tags | 用户标签（`new` / `high_value` / `inactive`） |
| Orders | 订单（支付链路，含 `store_id`） |
| LegacyMembers | 老会员（扫码链路） |
| ScanLogs | 扫码日志（扫码链路） |
| Staff | 员工（若使用 `app.js` 内员工校验逻辑） |

权限按业务设置，详见 [云开发数据库权限](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/database/security-rules.html)。

---

## 🧪 测试流程（摘要）

- **扫码 + 手机号**：见 `SCAN_INTERCEPTION_GUIDE.md`。
- **支付 / 券 / 回调**：需配置微信支付与 `voucher_templates` 测试数据；字段与示例见 `docs/VOUCHER_DATABASE.md`。

### 常见问题

1. **云函数 -404011**：检查是否已上传、日志与 `wx-server-sdk` 版本。
2. **支付失败**：检查商户号、`createPayment` 返回的 `payment` 对象、支付目录。
3. **券详情二维码不显示**：检查 `pages/voucher/detail` 中 `canvas-id` 与 `utils/weapp.qrcode.js` 是否已随仓库提交；真机需 `unused` 状态才绘制。

---

## 📞 参考文档

- [微信小程序文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [微信支付](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)

**版本**: v1.0.0  
**最后更新**: 2026-03-26
