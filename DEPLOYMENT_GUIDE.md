# 门店私域助手 - 部署与测试指南

## 📋 目录结构

```
store-assistant-miniprogram/
├── cloudfunctions/
│   ├── createPayment/
│   ├── paymentCallback/
│   └── saveUserPhone/
├── pages/
│   └── index/
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
```

### 步骤 2: 配置环境

- 修改 `app.js` 中 `wx.cloud.init` 的 `env` 为你的云环境 ID。
- 修改 `project.config.json` 中的 `appid`（若与当前不一致）。

### 步骤 3: 上传云函数

在微信开发者工具中，对 `createPayment`、`paymentCallback`、`saveUserPhone` 分别：**右键 → 上传并部署：云端安装依赖**。

### 步骤 4: 初始化数据库

在云开发控制台创建集合，至少包括：

| 集合名 | 说明 |
|--------|------|
| Users | 用户 |
| Vouchers | 券模板（支付链路） |
| Orders | 订单（支付链路） |
| LegacyMembers | 老会员（扫码链路） |
| ScanLogs | 扫码日志（扫码链路） |
| Staff | 员工（若使用 `app.js` 内员工校验逻辑） |

权限按业务设置，详见 [云开发数据库权限](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/database/security-rules.html)。

---

## 🧪 测试流程（摘要）

- **扫码 + 手机号**：见 `SCAN_INTERCEPTION_GUIDE.md`。
- **支付 / 券 / 回调**：需配置微信支付与 `Vouchers` 测试数据，详见下文常见问题与主 `README.md`。

### 常见问题

1. **云函数 -404011**：检查是否已上传、日志与 `wx-server-sdk` 版本。
2. **支付失败**：检查商户号、`createPayment` 返回的 `payment` 对象、支付目录。
3. **二维码生成失败**：检查 `config.json` 中 `wxacode.getUnlimited` 权限及 `scene` 长度。

---

## 📞 参考文档

- [微信小程序文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [微信支付](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)

**版本**: v1.0.0  
**最后更新**: 2026-03-26
