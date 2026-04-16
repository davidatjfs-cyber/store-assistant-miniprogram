# 修正后的测试数据（解决数据加载失败问题）

## 🔧 问题原因

云开发控制台的日期格式要求不同，需要调整。

---

## ✅ 修正后的测试数据

### 1. 创建测试员工（staff 集合）

**方法1：使用云开发控制台的「添加记录」功能**

点击 `staff` 集合 → 添加记录 → 使用「表单模式」

逐个字段添加：
- `_id`: `staff_test_001` （如果允许自定义ID）
- `openid`: `oea2F1xKNGTua0xmCPcMWu97jlfc`
- `name`: `测试员工`
- `role`: `manager`
- `store_id`: `store_test_001`
- `active`: `true` （勾选）
- `created_at`: 选择日期为当前日期

**方法2：使用简化的JSON（推荐）**

```json
{
  "_id": "staff_test_001",
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "name": "测试员工",
  "role": "manager",
  "store_id": "store_test_001",
  "active": true
}
```

---

### 2. 创建测试券模板（voucher_templates 集合）

**简化的JSON：**

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
  "valid_time_range": {
    "start": "00:00",
    "end": "23:59"
  },
  "valid_weekdays": [1, 2, 3, 4, 5, 6, 7]
}
```

---

### 3. 创建测试营销规则（marketing_rules 集合）

**简化的JSON：**

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
  "cooldown_days": 7
}
```

---

### 4. 创建测试用户（users 集合）

**简化的JSON：**

```json
{
  "_id": "user_test_001",
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "phone": "13800138000"
}
```

---

## 🎯 推荐操作步骤

### 步骤1：先不创建自定义ID

很多云开发环境不允许手动指定 `_id`，改为：

**测试员工（staff）：**
```json
{
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "name": "测试员工",
  "role": "manager",
  "store_id": "store_test_001",
  "active": true
}
```

**测试用户（users）：**
```json
{
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "phone": "13800138000"
}
```

**券模板（voucher_templates）：**
```json
{
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
  "valid_time_range": {
    "start": "00:00",
    "end": "23:59"
  },
  "valid_weekdays": [1, 2, 3, 4, 5, 6, 7]
}
```

**营销规则（marketing_rules）：**
```json
{
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
  "cooldown_days": 7
}
```

---

### 步骤2：使用表单模式（最安全）

如果JSON一直报错，使用表单模式：

1. 点击集合 → 添加记录
2. 选择「表单模式」而不是「JSON模式」
3. 逐个添加字段
4. 字符串类型：直接输入文本
5. 数字类型：输入数字
6. 布尔类型：选择true/false
7. 数组类型：点击"添加元素"

---

### 步骤3：检查数据库权限

如果还是失败，检查数据库权限：

1. 云开发控制台 → 设置 → 数据库权限
2. 确认当前用户有写权限
3. 或临时设置为「所有用户可读写」（测试完成后改回安全权限）

---

## 📝 最简单的测试数据（最小化版本）

如果上面都不行，先创建最简单的数据：

### 员工（staff）：
```json
{
  "openid": "oea2F1xKNGTua0xmCPcMWu97jlfc",
  "name": "测试员工",
  "role": "manager",
  "store_id": "store_test_001",
  "active": true
}
```

### 券模板（voucher_templates）：
```json
{
  "name": "测试券",
  "type": "cash",
  "value": 10000,
  "is_active": true
}
```

先确保这两个能创建成功，再逐步添加其他字段。

---

## ❌ 如果还是报错

**错误：InvalidParameter**
可能原因：
1. JSON 格式错误（多余逗号、引号）
2. 数据类型不匹配
3. 数值超出范围
4. 特殊字符

**解决方法：**
1. 使用 JSON 校验工具检查格式
2. 或使用表单模式逐个字段添加
3. 从最简单的版本开始

---

## 🎯 我的建议

**立即尝试：**
1. 先去掉所有 `_id` 字段
2. 去掉所有日期字段（`created_at`）
3. 使用表单模式添加记录

这样应该能成功创建测试数据！

---

**文档版本：** v1.1.0（修正版）
**更新时间：** 2026-04-02
