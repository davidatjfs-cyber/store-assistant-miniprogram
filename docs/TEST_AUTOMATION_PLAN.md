# 微信小程序自动化测试方案

## 概述

本方案为微信小程序提供了一套完整的自动化测试方案，包括：
1. Shell 脚本测试（使用 tcb CLI）
2. Node.js 测试脚本（使用 @cloudbase/node-sdk）
3. 测试云函数（可集成测试）
4. 测试数据验证和错误处理

---

## 测试分类

### 可自动化的测试（15个云函数）

| 测试项 | 云函数 | 测试方式 |
|--------|---------|----------|
| 基础连接 | ensureUserDoc | ✅ 完全自动化 |
| 测试数据管理 | seedTestData | ✅ 完全自动化 |
| 用户档案 | ensureUserDoc | ✅ 完全自动化 |
| 到店检测 | detectUserArrival | ✅ 完全自动化 |
| 获取用户券 | getUserVouchers | ✅ 完全自动化 |
| 营销规则 | getMarketingRules | ✅ 完全自动化 |
| 营销看板 | getMarketingDashboard | ✅ 完全自动化（需管理员） |
| 系统监控 | monitorSystem | ✅ 完全自动化 |
| 营销引擎 | runMarketingEngine | ✅ 完全自动化 |
| 员工档案 | getStaffProfile | ✅ 完全自动化 |
| 到店记录 | getRecentArrivals | ✅ 完全自动化（需员工） |
| 配置验证 | verifyMaijixianSetup | ✅ 完全自动化 |
| 数据播种 | seedMaijixianMarketing | ✅ 完全自动化 |
| 撤销核销 | revertVoucher | ✅ 完全自动化 |
| 定时扫描 | dailyCheckInactiveUsers | ✅ 完全自动化 |

### 需要手动操作的测试

| 测试项 | 手动操作说明 |
|--------|-------------|
| 支付流程 | 需要在真机/模拟器中完成：createPayment → 微信支付 → paymentCallback |
| 手机号授权 | 需要用户在小程序中点击"获取手机号"按钮 |
| 核销券 | 需要员工使用真机/模拟器扫描用户券的二维码 |
| 扫码到店 | 需要使用微信开发者工具或真机扫桌码 |

---

## 使用方法

### 方案1：Shell 脚本测试（推荐）

#### 前置条件
```bash
# 安装云开发 CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 配置环境
# 编辑脚本中的 ENV_ID 变量为你的环境ID
```

#### 运行测试
```bash
cd /Users/magainze/store-assistant-miniprogram/scripts
chmod +x test_automated.sh
./test_automated.sh
```

#### 脚本功能
- 自动调用15个云函数进行测试
- 彩色输出测试结果
- 自动收集用户ID用于后续测试
- 生成测试报告

---

### 方案2：Node.js 测试脚本

#### 前置条件
```bash
cd /Users/magainze/store-assistant-miniprogram/scripts
npm install @cloudbase/node-sdk
```

#### 配置环境变量
```bash
# 方式1: 修改脚本中的 CONFIG 对象
# 方式2: 使用环境变量
export TCB_ENV_ID=your-env-id
export TEST_OPENID=oea2F1xKNGTua0xmCPcMWu97jlfc
```

#### 运行测试
```bash
node test_automated.js
```

#### 脚本功能
- 异步测试执行
- 结构化测试报告
- 断言验证
- 失败时返回非零退出码

---

### 方案3：测试云函数（最方便）

#### 部署测试云函数
```bash
# 在云开发控制台或 CLI 中部署
cd cloudfunctions/runAutomatedTests
npm install
# 上传并部署: npm run deploy 或在控制台操作
```

#### 调用方式

##### 方式A：云开发控制台
1. 打开云开发控制台
2. 进入云函数 → runAutomatedTests
3. 点击"测试"
4. 输入参数：
```json
{
  "runAll": true
}
```

##### 方式B：小程序端调用
```javascript
// 运行所有测试
wx.cloud.callFunction({
  name: 'runAutomatedTests',
  data: { runAll: true }
}).then(res => {
  console.log('测试结果:', res.result);
  const { summary, results } = res.result;
  console.log(`总计: ${summary.total}, 通过: ${summary.passed}, 失败: ${summary.failed}`);
});

// 运行指定测试
wx.cloud.callFunction({
  name: 'runAutomatedTests',
  data: {
    tests: ['test1', 'test4', 'test10']
  }
});
```

##### 方式C：CLI 调用
```bash
tcb functions call runAutomatedTests --data '{"runAll":true}'
```

#### 测试报告格式
```json
{
  "success": true,
  "summary": {
    "total": 15,
    "passed": 12,
    "failed": 1,
    "skipped": 2,
    "duration_ms": 8500
  },
  "results": [
    {
      "test": "基础连接测试",
      "status": "PASS",
      "message": "基础连接正常",
      "data": { "openid": "oea2F1..." },
      "timestamp": "2024-04-02T..."
    }
  ],
  "openid": "oea2F1...",
  "appid": "wx..."
}
```

---

## 测试数据验证

### 验证集合是否存在
```javascript
// 测试云函数内部自动处理集合不存在的情况
// 使用 isDbCollectionMissingError 函数检测
```

### 验证测试数据
```bash
# 获取测试数据摘要
tcb functions call seedTestData --data '{"action":"get_test_summary"}'
```

### 验证马己仙配置
```bash
# 仅验证数据
tcb functions call verifyMaijixianSetup --data '{
  "confirm": "CONFIRM_VERIFY_MJX",
  "check_data_only": true
}'

# 完整集成测试（需要真实用户ID）
tcb functions call verifyMaijixianSetup --data '{
  "confirm": "CONFIRM_VERIFY_MJX",
  "user_id": "user_id_here",
  "openid": "openid_here",
  "run_integration": true,
  "simulate_verify": true
}'
```

---

## 错误处理

### 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|----------|
| 权限不足 | 非管理员/员工 | 检查 staff 集合中的权限配置 |
| 集合不存在 | 未创建数据库集合 | 测试云函数会自动跳过，或在控制台手动创建 |
| OPENID 错误 | 未登录或 OPENID 错误 | 确保在正确的小程序环境中调用 |
| 超时 | 云函数超时时间不足 | 将 runAutomatedTests 超时时间设为 60s |
| 环境ID错误 | TCB_ENV_ID 配置错误 | 检查云开发环境ID |

### 测试失败处理
1. 查看详细错误信息（error.message）
2. 检查相关集合数据
3. 重新播种测试数据
4. 单独运行失败的测试
5. 检查云函数日志

---

## 最佳实践

### 1. 定期运行测试
建议在以下场景运行自动化测试：
- 代码部署前
- 营销规则变更后
- 每日定时执行
- 疑似问题排查时

### 2. 集成到 CI/CD
```yaml
# .github/workflows/test.yml 示例
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: node scripts/test_automated.js
        env:
          TCB_ENV_ID: ${{ secrets.TCB_ENV_ID }}
```

### 3. 测试数据管理
```bash
# 播种测试数据（幂等，可重复运行）
tcb functions call seedTestData --data '{"action":"seed_test_data"}'

# 清理测试数据（谨慎使用）
tcb functions call seedTestData --data '{"action":"clear_test_data"}'

# 播种马己仙数据
tcb functions call seedMaijixianMarketing --data '{"confirm":"CONFIRM_SEED_MAIJIXIAN"}'
```

### 4. 监控和告警
```javascript
// 使用 monitorSystem 检查系统健康
tcb functions call monitorSystem --data '{}'
```

---

## 高级用法

### 1. 自定义测试
编辑 `cloudfunctions/runAutomatedTests/index.js` 添加新的测试用例：

```javascript
async function test16_customTest() {
  const testName = '自定义测试';
  try {
    // 添加测试逻辑
    log(testName, 'PASS', '测试通过');
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}
```

### 2. 持续集成
设置定时触发器（云函数定时触发）：
```json
{
  "timer": {
    "cron": "0 2 * * *"  // 每天凌晨2点执行
  }
}
```

### 3. 测试结果持久化
将测试结果写入数据库：
```javascript
// 在 runAutomatedTests 的最后添加
await db.collection('test_reports').add({
  data: {
    summary: summary,
    results: testResults,
    created_at: db.serverDate()
  }
});
```

---

## 文件说明

| 文件 | 说明 |
|------|------|
| scripts/test_automated.sh | Shell 自动化测试脚本 |
| scripts/test_automated.js | Node.js 自动化测试脚本 |
| cloudfunctions/runAutomatedTests/ | 测试云函数 |
| TEST_AUTOMATION_PLAN.md | 本文档 |

---

## 总结

本自动化测试方案提供了：
- ✅ 15个云函数的自动化测试
- ✅ 3种测试执行方式（Shell/Node.js/云函数）
- ✅ 完整的测试报告
- ✅ 错误处理和验证机制
- ✅ 易于集成和扩展

对于需要手动操作的测试（支付、核销等），建议：
1. 使用微信开发者工具的模拟器进行半自动化测试
2. 记录测试步骤和预期结果
3. 定期进行人工验证

---

## 联系与支持

如有问题，请参考：
- 云开发文档：https://docs.cloudbase.net/
- 小程序云开发：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
