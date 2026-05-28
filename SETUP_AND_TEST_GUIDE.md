# 门店私域助手 - 配置与测试完整指南

## 📋 前置条件检查

- ✅ 微信小程序账号已开通
- ✅ 微信开发者工具已安装
- ✅ 已开通微信云开发
- ✅ 本地 Node.js 环境（建议 v14+）

---

## 🔧 步骤 1：云开发环境配置

### 1.1 获取云环境 ID

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入「开发」→「云开发」
3. 若未开通环境，点击「开通云开发」（建议选择基础版）
4. 复制环境 ID（格式：`cloud1-xxx`）

### 1.2 配置小程序项目

1. 打开微信开发者工具
2. 导入项目：选择 `/Users/magainze/store-assistant-miniprogram` 目录
3. 确认 AppID：`wx8cb030fad5998252`
4. 在 `app.js:7` 修改云环境 ID：

```javascript
var CLOUD_ENV_ID = '你的环境ID'; // 例如 'cloud1-AbcDef'
```

---

## 🗄️ 步骤 2：创建数据库集合

### 2.1 必需集合（在云开发控制台创建）

| 集合名 | 用途 | 索引建议 |
|--------|------|----------|
| `users` | 统一用户身份 | `openid`（唯一） |
| `staff` | 店员/店长 | `openid` + `active` |
| `voucher_templates` | 券模板 | - |
| `user_vouchers` | 用户券 | `user_id` + `created_at`, `order_id` |
| `voucher_logs` | 核销记录 | `staff_id` + `created_at`, `voucher_id` + `created_at` |
| `Orders` | 订单 | - |
| `analytics_logs` | 埋点日志 | `action` + `created_at` |
| `marketing_rules` | 营销规则 | - |
| `marketing_rule_fires` | 营销触发去重 | - |
| `marketing_stats` | 营销统计 | - |
| `user_tags` | 用户标签 | - |
| `system_alerts` | 系统告警 | - |

### 2.2 可选集合（扫码功能）

| 集合名 | 用途 |
|--------|------|
| `Users` | 老会员表 |
| `LegacyMembers` | 老会员迁移 |
| `ScanLogs` | 扫码日志 |
| `user_arrival_logs` | 到店记录 |

---

## ⚙️ 步骤 3：创建测试数据

### 3.1 插入测试员工（在 `staff` 集合）

```json
{
  "_id": "staff_001",
  "openid": "测试用微信号 openid",
  "name": "测试员工",
  "role": "manager",
  "store_id": "store_test_001",
  "active": true,
  "created_at": {"$date": "2026-04-02T00:00:00.000Z"}
}
```

**获取 openid 的方法：**
1. 在小程序中调用 `wx.cloud.getOpenId()` 获取
2. 或在云函数日志中查看

### 3.2 插入测试券模板（在 `voucher_templates` 集合）

```json
{
  "_id": "test_voucher_100",
  "name": "100元测试代金券",
  "type": "cash",
  "value": 10000,
  "usage_rule": "全场通用，不找零",
  "valid_days": 30,
  "price": 100,
  "stock": -1,
  "sold_count": 0,
  "is_active": true,
  "store_ids": ["store_test_001"],
  "min_spend": 0,
  "valid_time_range": {"start": "00:00", "end": "23:59"},
  "valid_weekdays": [1, 2, 3, 4, 5, 6, 7],
  "created_at": {"$date": "2026-04-02T00:00:00.000Z"}
}
```

### 3.3 插入测试营销规则（在 `marketing_rules` 集合）

```json
{
  "_id": "mkt_test_payment",
  "name": "测试支付满赠",
  "trigger_type": "payment",
  "trigger_value": 0,
  "action_type": "send_voucher",
  "action_config": "test_voucher_100",
  "active": true,
  "priority": 10,
  "daily_user_limit": 1,
  "global_daily_limit": 100,
  "target_tags": [],
  "cooldown_days": 7,
  "created_at": {"$date": "2026-04-02T00:00:00.000Z"}
}
```

---

## 📤 步骤 4：部署云函数

### 4.1 安装本地依赖（已执行 ✅）

```bash
cd /Users/magainze/store-assistant-miniprogram
./scripts/deploy-cloudfunctions.sh
```

### 4.2 在微信开发者工具中上传云函数

对以下目录依次右键 → **「上传并部署：云端安装依赖」**：

**核心功能（必须）**
- `cloudfunctions/createPayment`
- `cloudfunctions/paymentCallback`
- `cloudfunctions/getUserVouchers`
- `cloudfunctions/verifyVoucher`
- `cloudfunctions/revertVoucher`
- `cloudfunctions/saveUserPhone`
- `cloudfunctions/getStaffProfile`

**营销功能（推荐）**
- `cloudfunctions/runMarketingEngine`
- `cloudfunctions/dailyCheckInactiveUsers` - 需配置定时触发器
- `cloudfunctions/monitorSystem`
- `cloudfunctions/getMarketingDashboard`
- `cloudfunctions/getMarketingRules`
- `cloudfunctions/updateMarketingRule`

**工具函数**
- `cloudfunctions/migrateUsers` - 用户迁移（一次性）
- `cloudfunctions/seedMaijixianMarketing` - 营销种子数据
- `cloudfunctions/verifyMaijixianSetup` - 验证配置

**到店识别**
- `cloudfunctions/detectUserArrival`
- `cloudfunctions/getRecentArrivals`
- `cloudfunctions/ensureUserDoc`
- `cloudfunctions/getCallerOpenId`

**桌位码功能**
- `cloudfunctions/batchTableCodes`
- `cloudfunctions/exportTableCodesPdf` - PDF 导出依赖 `pdf-lib`，请务必使用「上传并部署：云端安装依赖」或先执行 `npm install`

### 4.3 配置定时触发器

1. 在云开发控制台进入「云函数」
2. 找到 `dailyCheckInactiveUsers`
3. 点击「触发器」→「添加触发器」
4. 设置 Cron 表达式：`0 0 9 * * * *`（每天 9:00）
5. 点击确认

---

## 🧪 步骤 5：功能测试清单

### 5.1 用户端测试

#### 测试 1：首页加载
- [ ] 打开小程序，首页正常显示
- [ ] 检查控制台无错误
- [ ] 验证 `app.js` 中的参数解析

#### 测试 2：用户注册/登录
- [ ] 点击授权获取手机号
- [ ] 检查 `users` 集合是否新增记录
- [ ] 验证 `openid` 和 `phone` 字段

#### 测试 3：券列表查看
- [ ] 进入「我的券」页面
- [ ] 若已发券，列表正常显示
- [ ] 验证券状态（unused/used/expired）

#### 测试 4：券详情与二维码
- [ ] 点击某张券进入详情
- [ ] 检查 Canvas 二维码是否正常显示
- [ ] 二维码内容格式：`voucher:{券ID}`

---

### 5.2 支付功能测试

#### 测试 5：创建支付订单
```javascript
// 在小程序中调用
wx.cloud.callFunction({
  name: 'createPayment',
  data: {
    voucher_id: 'test_voucher_100',
    quantity: 1,
    store_id: 'store_test_001'
  }
})
```
- [ ] 返回支付参数正常
- [ ] 调起微信支付成功
- [ ] 检查 `Orders` 集合新增记录

#### 测试 6：支付回调
- [ ] 完成支付
- [ ] 检查 `Orders.payment_status` 变为 `paid`
- [ ] 检查 `user_vouchers` 集合新增记录
- [ ] 验证 `analytics_logs` 有 `payment_success` 记录

#### 测试 7：营销发券
- [ ] 支付成功后自动发券
- [ ] 检查 `marketing_stats` 统计更新
- [ ] 验证 `marketing_rule_fires` 去重记录

---

### 5.3 员工端测试

#### 测试 8：员工身份验证
```javascript
// 调用云函数检查
wx.cloud.callFunction({
  name: 'getStaffProfile',
  data: {}
})
```
- [ ] 返回 `is_staff: true`
- [ ] 返回 `role: 'manager'`
- [ ] 返回正确的 `store_id`

#### 测试 9：核销功能
1. 进入核销页面 `pages/staff/verify`
2. 点击扫码按钮
3. 扫描券详情页的二维码
4. 检查：
- [ ] 核销成功提示
- [ ] `user_vouchers.status` 变为 `used`
- [ ] `voucher_logs` 新增记录
- [ ] `analytics_logs` 有 `verify_success` 记录

#### 测试 10：重复核销防护
- [ ] 再次扫描已核销的券
- [ ] 提示「券已使用」
- [ ] 不会重复核销

#### 测试 11：撤销核销（仅 manager）
```javascript
wx.cloud.callFunction({
  name: 'revertVoucher',
  data: {
    voucher_id: '券ID'
  }
})
```
- [ ] 撤销成功
- [ ] `user_vouchers.status` 变回 `unused`
- [ ] `voucher_logs.reverted` 变为 `true`

---

### 5.4 营销功能测试

#### 测试 12：支付后发券
- [ ] 完成支付
- [ ] 自动触发 `runMarketingEngine`
- [ ] 符合规则的收到营销券

#### 测试 13：用户标签更新
- [ ] 支付后检查 `user_tags` 集合
- [ ] 验证标签：`vip`/`new`/`high_value` 等
- [ ] 检查 `users` 集合的 30 天指标

#### 测试 14：营销看板
```javascript
wx.cloud.callFunction({
  name: 'getMarketingDashboard',
  data: {}
})
```
- [ ] 返回今日营销数据
- [ ] 返回近 7 日趋势
- [ ] 返回 ROI 排行

---

### 5.5 系统监控测试

#### 测试 15：到店识别
- [ ] 用户扫码进入
- [ ] 调用 `detectUserArrival`
- [ ] 检查 `user_arrival_logs` 新增记录
- [ ] 10 分钟内重复调用应去重

#### 测试 16：员工端到店列表
- [ ] 调用 `getRecentArrivals`
- [ ] 显示最近到店用户
- [ ] 包含：用户名、等级、偏好菜、标签

#### 测试 17：定时任务
- [ ] 检查 `dailyCheckInactiveUsers` 日志
- [ ] 验证召回扫描执行
- [ ] 验证 ROI 计算
- [ ] 检查 `monitorSystem` 告警

---

## 🔍 步骤 6：数据一致性检查

### 6.1 支付链路检查

**期望数据流：**
```
用户支付 → Orders.paid → user_vouchers 新增 → analytics_logs 记录 → marketing_stats 更新
```

**检查 SQL（云开发控制台）：**
```javascript
// 检查订单与券关联
db.collection('Orders').where({
  payment_status: 'paid'
}).get()

// 检查券与用户关联
db.collection('user_vouchers').where({
  user_id: '用户ID'
}).get()

// 检查营销触发
db.collection('marketing_rule_fires').where({
  user_id: '用户ID'
}).orderBy('created_at', 'desc').get()
```

### 6.2 核销链路检查

**期望数据流：**
```
扫码核销 → user_vouchers.used → voucher_logs 新增 → analytics_logs 记录 → 30天指标更新
```

**检查 SQL：**
```javascript
// 检查核销记录
db.collection('voucher_logs').where({
  staff_id: '员工ID'
}).orderBy('created_at', 'desc').get()

// 检查用户核销历史
db.collection('voucher_logs').where({
  user_id: '用户ID',
  action: 'verify'
}).get()
```

---

## ❌ 常见问题排查

### 问题 1：云函数报错 -501000
**原因**：云环境 ID 错误或环境状态异常
**解决**：
1. 检查 `app.js` 中的 `CLOUD_ENV_ID`
2. 登录云开发控制台确认环境状态

### 问题 2：支付失败
**检查项**：
- [ ] 微信支付商户号配置
- [ ] 支付目录设置
- [ ] 云函数 `createPayment` 返回的参数
- [ ] 网络连接正常

### 问题 3：核销报错「员工未授权」
**解决**：
1. 确认当前用户的 openid 已在 `staff` 集合中
2. 检查 `active: true`
3. 验证 `store_id` 匹配

### 问题 4：券详情二维码不显示
**检查项**：
- [ ] `utils/weapp.qrcode.js` 文件存在
- [ ] 券状态为 `unused`
- [ ] Canvas 组件正常渲染

### 问题 5：营销不发券
**排查**：
```javascript
// 检查规则是否启用
db.collection('marketing_rules').where({
  active: true
}).get()

// 检查用户标签
db.collection('user_tags').where({
  user_id: '用户ID'
}).get()

// 检查营销触发记录
db.collection('marketing_rule_fires').where({
  user_id: '用户ID'
}).orderBy('created_at', 'desc').get()

// 检查营销拦截
db.collection('analytics_logs').where({
  action: 'marketing_blocked'
}).orderBy('created_at', 'desc').get()
```

---

## 📊 测试报告模板

完成测试后，记录以下信息：

| 测试项 | 结果 | 备注 |
|--------|------|------|
| 云环境配置 | ✅/❌ | |
| 数据库集合创建 | ✅/❌ | 共 X 个集合 |
| 云函数部署 | ✅/❌ | 共 Y 个函数 |
| 用户注册/登录 | ✅/❌ | |
| 支付流程 | ✅/❌ | |
| 券发放 | ✅/❌ | |
| 券核销 | ✅/❌ | |
| 营销发券 | ✅/❌ | |
| 用户标签 | ✅/❌ | |
| 系统监控 | ✅/❌ | |
| 数据一致性 | ✅/❌ | |

---

## 🎯 上线前检查清单

- [ ] 所有测试用例通过
- [ ] 生产环境云环境 ID 已配置
- [ ] 微信支付商户号已配置
- [ ] 券模板数据已导入
- [ ] 营销规则已配置
- [ ] 员工账号已创建
- [ ] 定时触发器已配置
- [ ] 错误监控已设置
- [ ] 性能测试通过
- [ ] 备份方案已准备

---

## 📞 技术支持

- 项目仓库：[store-assistant-miniprogram](https://github.com/davidatjfs-cyber/store-assistant-miniprogram)
- 问题反馈：在仓库 Issues 中提交
- 技术文档：详见项目 `docs/` 目录

**文档版本**：v1.0.0
**最后更新**：2026-04-02
