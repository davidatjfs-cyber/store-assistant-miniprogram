# 🚨 云函数创建卡住解决方案

## 问题描述
`seedTestData` 云函数一直显示"创建中"或"上传中"

## 解决方案

### 方案1：删除并重新创建（推荐）

**步骤：**

1. **删除卡住的云函数**
   - 在微信开发者工具中，找到 `cloudfunctions/seedTestData`
   - 右键点击 → 「删除云函数」
   - 确认删除

2. **清理本地缓存**
   ```bash
   # 删除云函数目录中的 node_modules
   rm -rf /Users/magainze/store-assistant-miniprogram/cloudfunctions/seedTestData/node_modules
   ```

3. **重新安装依赖**
   ```bash
   cd /Users/magainze/store-assistant-miniprogram/cloudfunctions/seedTestData
   npm install
   ```

4. **重新上传**
   - 在微信开发者工具中，找到 `cloudfunctions/seedTestData`
   - 右键点击 → 「上传并部署：云端安装依赖」

---

### 方案2：直接在云开发控制台创建（最简单）

**步骤：**

1. **登录云开发控制台**
   - 访问：https://console.cloud.tencent.com/tcb
   - 选择你的小程序环境

2. **创建云函数**
   - 点击「云函数」→「新建云函数」
   - 名称：`seedTestData`
   - 运行环境：Node.js 16
   - 点击「下一步」

3. **上传代码**
   - 选择「本地上传 zip 包」
   - 或选择「在线编辑」粘贴代码

4. **粘贴代码**
   ```javascript
   /**
    * 云开发测试数据种子
    * 使用方法：在云开发控制台 → 云函数 → 新建云函数 → 粘贴此代码 → 运行
    */

   const cloud = require('wx-server-sdk')
   cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

   const db = cloud.database()

   exports.main = async (event, context) => {
     const { action } = event

     try {
       switch (action) {
         case 'seed_test_data':
           return await seedTestData()
         case 'clear_test_data':
           return await clearTestData()
         case 'get_test_summary':
           return await getTestSummary()
         default:
           return { success: false, error: 'Unknown action' }
       }
     } catch (error) {
       console.error('Error:', error)
       return { success: false, error: error.message }
     }
   }

   // 创建测试数据
   async function seedTestData() {
     const results = {}

     // 1. 创建测试员工（已配置你的 openid）
     const staffData = {
       _id: 'staff_test_001',
       openid: 'oea2F1xKNGTua0xmCPcMWu97jlfc',
       name: '测试员工',
       role: 'manager',
       store_id: 'store_test_001',
       active: true,
       created_at: new Date()
     }

     try {
       const existingStaff = await db.collection('staff').doc('staff_test_001').get()
       results.staff = { status: 'exists', message: '测试员工已存在' }
     } catch (e) {
       await db.collection('staff').add({ data: staffData })
       results.staff = { status: 'created', data: staffData }
     }

     // 2. 创建测试券模板
     const voucherTemplateData = {
       _id: 'test_voucher_100',
       name: '100元测试代金券',
       type: 'cash',
       value: 10000,
       usage_rule: '全场通用，不找零',
       valid_days: 30,
       price: 100,
       stock: -1,
       sold_count: 0,
       is_active: true,
       store_ids: ['store_test_001'],
       min_spend: 0,
       valid_time_range: { start: '00:00', end: '23:59' },
       valid_weekdays: [1, 2, 3, 4, 5, 6, 7],
       created_at: new Date()
     }

     try {
       const existingVoucher = await db.collection('voucher_templates').doc('test_voucher_100').get()
       results.voucherTemplate = { status: 'exists', message: '测试券模板已存在' }
     } catch (e) {
       await db.collection('voucher_templates').add({ data: voucherTemplateData })
       results.voucherTemplate = { status: 'created', data: voucherTemplateData }
     }

     // 3. 创建测试营销规则
     const marketingRuleData = {
       _id: 'mkt_test_payment',
       name: '测试支付满赠',
       trigger_type: 'payment',
       trigger_value: 0,
       action_type: 'send_voucher',
       action_config: 'test_voucher_100',
       active: true,
       priority: 10,
       daily_user_limit: 1,
       global_daily_limit: 100,
       target_tags: [],
       cooldown_days: 7,
       created_at: new Date()
     }

     try {
       const existingMarketing = await db.collection('marketing_rules').doc('mkt_test_payment').get()
       results.marketingRule = { status: 'exists', message: '测试营销规则已存在' }
     } catch (e) {
       await db.collection('marketing_rules').add({ data: marketingRuleData })
       results.marketingRule = { status: 'created', data: marketingRuleData }
     }

     // 4. 创建测试用户（已配置你的 openid）
     const userData = {
       _id: 'user_test_001',
       openid: 'oea2F1xKNGTua0xmCPcMWu97jlfc',
       phone: '13800138000',
       created_at: new Date()
     }

     try {
       const existingUser = await db.collection('users').doc('user_test_001').get()
       results.user = { status: 'exists', message: '测试用户已存在' }
     } catch (e) {
       await db.collection('users').add({ data: userData })
       results.user = { status: 'created', data: userData }
     }

     return {
       success: true,
       message: '测试数据创建完成',
       results
     }
   }

   // 清理测试数据
   async function clearTestData() {
     const results = {}

     try {
       await db.collection('staff').doc('staff_test_001').remove()
       results.staff = { status: 'deleted' }
     } catch (e) {
       results.staff = { status: 'not_found' }
     }

     try {
       await db.collection('voucher_templates').doc('test_voucher_100').remove()
       results.voucherTemplate = { status: 'deleted' }
     } catch (e) {
       results.voucherTemplate = { status: 'not_found' }
     }

     try {
       await db.collection('marketing_rules').doc('mkt_test_payment').remove()
       results.marketingRule = { status: 'deleted' }
     } catch (e) {
       results.marketingRule = { status: 'not_found' }
     }

     try {
       await db.collection('users').doc('user_test_001').remove()
       results.user = { status: 'deleted' }
     } catch (e) {
       results.user = { status: 'not_found' }
     }

     return {
       success: true,
       message: '测试数据清理完成',
       results
     }
   }

   // 获取测试数据摘要
   async function getTestSummary() {
     const summary = {}

     try {
       const staffRes = await db.collection('staff').where({ name: '测试员工' }).get()
       summary.staffCount = staffRes.data.length
     } catch (e) {
       summary.staffCount = 0
     }

     try {
       const voucherRes = await db.collection('voucher_templates').where({ name: '100元测试代金券' }).get()
       summary.voucherCount = voucherRes.data.length
     } catch (e) {
       summary.voucherCount = 0
     }

     try {
       const marketingRes = await db.collection('marketing_rules').where({ name: '测试支付满赠' }).get()
       summary.marketingCount = marketingRes.data.length
     } catch (e) {
       summary.marketingCount = 0
     }

     try {
       const userRes = await db.collection('users').where({ phone: '13800138000' }).get()
       summary.userCount = userRes.data.length
     } catch (e) {
       summary.userCount = 0
     }

     return {
       success: true,
       summary
     }
   }
   ```

5. **保存并部署**
   - 点击「保存」
   - 点击「部署」
   - 等待部署完成（约 1-2 分钟）

---

### 方案3：直接创建测试数据（无需云函数）

如果云函数一直创建失败，可以直接在云开发控制台创建测试数据：

**1. 创建测试员工**
在 `staff` 集合中添加：
```json
{
  "_id": "staff_test_001",
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "name": "测试员工",
  "role": "manager",
  "store_id": "store_test_001",
  "active": true,
  "created_at": {"$date": "2026-04-02T00:00:00.000Z"}
}
```

**2. 创建测试券模板**
在 `voucher_templates` 集合中添加：
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

**3. 创建测试营销规则**
在 `marketing_rules` 集合中添加：
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

**4. 创建测试用户**
在 `users` 集合中添加：
```json
{
  "_id": "user_test_001",
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "phone": "13800138000",
  "created_at": {"$date": "2026-04-02T00:00:00.000Z"}
}
```

---

## ✅ 推荐操作

**最快方案：方案3 - 直接创建测试数据**

不需要等待云函数部署，直接在数据库中手动添加测试数据即可开始测试。

---

## 📞 如果还有问题

1. 检查网络连接
2. 重新启动微信开发者工具
3. 清理缓存：工具 → 清除缓存
4. 更新微信开发者工具到最新版本

**文档版本：** v1.0.0
**更新时间：** 2026-04-02
