# 快速开始：自动化测试

## 最快的方式（3步）

### 1. 部署测试云函数
```bash
cd /Users/magineze/store-assistant-miniprogram/cloudfunctions/runAutomatedTests
npm install
# 然后在微信开发者工具或云开发控制台上传并部署该云函数
```

### 2. 运行测试
在云开发控制台调用 `runAutomatedTests` 云函数，参数：
```json
{
  "runAll": true
}
```

### 3. 查看结果
测试会自动运行15个测试用例，返回详细的测试报告。

---

## 其他方式

### 使用 Shell 脚本
```bash
cd /Users/magineze/store-assistant-miniprogram/scripts
./test_automated.sh
```

### 使用 Node.js
```bash
cd /Users/magineze/store-assistant-miniprogram/scripts
npm install @cloudbase/node-sdk
node test_automated.js
```

---

## 详细文档
查看 `docs/TEST_AUTOMATION_PLAN.md` 了解完整方案。
