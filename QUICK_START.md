# 🚀 快速入门 - 5分钟开始测试

## 前提条件

✅ 已阅读 `SETUP_AND_TEST_GUIDE.md`  
✅ 已运行配置检查脚本 `./scripts/check-setup.sh`

---

## 第一步：配置云环境 ID（2分钟）

### 1.1 获取云环境 ID

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入「开发」→「云开发」
3. 若未开通，点击「开通云开发」（选择基础版即可）
4. 复制环境 ID（格式：`cloud1-xxx`）

### 1.2 修改配置文件

打开 `app.js`，找到第 7 行：

```javascript
var CLOUD_ENV_ID = 'YOUR_CLOUD_ENV_ID'; // 替换为你的云环境 ID
```

例如：
```javascript
var CLOUD_ENV_ID = 'cloud1-abc123def456';
```

**提示**：也可以留空，会自动使用小程序默认云环境（需已创建）。

---

## 第二步：创建数据库集合（1分钟）

### 2.1 在云开发控制台创建集合

进入云开发控制台 → 数据库 → 创建以下集合：

**必需集合（复制粘贴以下列表）：**
```
users
staff
voucher_templates
user_vouchers
voucher_logs
Orders
analytics_logs
marketing_rules
marketing_rule_fires
marketing_stats
user_tags
system_alerts
```

**可选集合（扫码功能）：**
```
Users
LegacyMembers
ScanLogs
user_arrival_logs
```

### 2.2 快速创建测试数据

1. 在云开发控制台 → 云函数 → 创建新云函数
2. 命名为 `seedTestData`
3. 将 `cloudfunctions/seedTestData/index.js` 内容复制进去
4. 保存并部署
5. 在「测试」面板调用：
```json
{
  "action": "seed_test_data"
}
```

**注意**：需要将 `TEST_OPENID_HERE` 替换为实际的 openid。获取方法：
- 在小程序中调用 `wx.cloud.getOpenId()` 获取
- 或在云函数日志中查看

---

## 第三步：上传云函数（2分钟）

### 3.1 在微信开发者工具中操作

1. 打开项目（导入 `/Users/magainze/store-assistant-miniprogram`）
2. 对以下云函数目录右键 → **「上传并部署：云端安装依赖」**：

**核心功能（必须）：**
```
cloudfunctions/createPayment
cloudfunctions/paymentCallback
cloudfunctions/saveUserPhone
cloudfunctions/getUserVouchers
cloudfunctions/verifyVoucher
cloudfunctions/revertVoucher
cloudfunctions/getStaffProfile
```

**营销功能（推荐）：**
```
cloudfunctions/runMarketingEngine
cloudfunctions/dailyCheckInactiveUsers
cloudfunctions/monitorSystem
cloudfunctions/getMarketingDashboard
cloudfunctions/getMarketingRules
cloudfunctions/updateMarketingRule
cloudfunctions/seedTestData
```

### 3.2 配置定时触发器

1. 进入云开发控制台 → 云函数 → `dailyCheckInactiveUsers`
2. 点击「触发器」→「添加触发器」
3. Cron 表达式：`0 0 9 * * * *`（每天 9:00）
4. 点击确认

---

## 第四步：开始测试（可选）

### 4.1 获取测试账号的 openid

1. 在小程序中添加临时测试代码：
```javascript
wx.cloud.getOpenId().then(res => {
  console.log('openid:', res.openid)
  // 将这个 openid 复制到 staff 集合中
})
```
2. 运行小程序，在控制台查看 openid

### 4.2 配置测试员工

在云开发控制台 → `staff` 集合 → 新增记录：
```json
{
  "_id": "staff_001",
  "openid": "你的openid",
  "name": "测试员工",
  "role": "manager",
  "store_id": "store_test_001",
  "active": true,
  "created_at": {"$date": "2026-04-02T00:00:00.000Z"}
}
```

### 4.3 快速测试清单

- [ ] 打开小程序，首页正常显示
- [ ] 获取用户手机号
- [ ] 查看「我的券」页面
- [ ] 创建测试券模板
- [ ] 测试支付流程
- [ ] 测试核销功能
- [ ] 检查数据一致性

---

## 🎯 下一步

1. **完整测试**：按照 `SETUP_AND_TEST_GUIDE.md` 进行全面测试
2. **功能了解**：阅读 `README.md` 了解所有功能
3. **部署上线**：完成所有测试后，准备生产环境部署

---

## 🆘 常见问题

### Q: 云函数上传失败
**A:** 检查是否在微信开发者工具中已登录，确保网络连接正常

### Q: 数据库集合创建报错
**A:** 集合名区分大小写，确保与代码中一致

### Q: 支付功能无法使用
**A:** 需要在微信支付商户平台配置支付目录和回调 URL

### Q: 如何获取 openid
**A:** 在小程序中调用 `wx.cloud.getOpenId()` 或在云函数日志中查看

---

## 📞 技术支持

- 详细文档：`SETUP_AND_TEST_GUIDE.md`
- 数据库说明：`docs/VOUCHER_DATABASE.md`
- 营销系统：`docs/MARKETING.md`
- 问题反馈：[GitHub Issues](https://github.com/davidatjfs-cyber/store-assistant-miniprogram/issues)

---

**最后更新**：2026-04-02
**文档版本**：v1.0.0
