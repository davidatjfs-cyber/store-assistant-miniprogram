# 🚀 企业消息推送平台生产上线完整指南

## 📋 部署前准备清单

### 1. 代码质量检查
```bash
# 代码规范检查
npm run lint

# TypeScript 类型检查  
npm run typecheck

# 运行测试
npm test

# 覆盖率检查
npm run coverage
```

### 2. 依赖管理
```bash
# 锁定版本（确保一致性）
npm install --package-lock-only

# 检查过时依赖
npm outdated

# 更新安全依赖
npm audit fix
```

### 3. 环境配置
```env
# .env.production
NODE_ENV=production
WECHAT_ENV=production
DB_HOST=your-production-db.mongo.db
DB_NAME=store_assistant
DB_USER=admin
DB_PASSWORD=secure_password
WECHAT_APP_ID=your_app_id
WECHAT_APP_SECRET=your_app_secret
WECHAT_TOKEN=your_verify_token
MINIPROGRAM_DOMAIN=https://your-domain.com
```

## 🔧 环境配置步骤

### 开发环境配置
```bash
# 复制模板文件
cp .env.example .env.development

# 编辑开发环境配置
vim .env.development
```

### 测试环境配置
```bash
# 复制并配置测试环境
cp .env.example .env.staging
# 修改数据库连接为测试数据库
```

### 生产环境配置
```bash
# 服务器上配置生产环境
cp .env.example .env.production
# 使用安全方式设置敏感变量
export DB_PASSWORD="your_secure_password"
```

## 🗄️ 数据库迁移

### 检查迁移状态
```bash
# 查看待执行的迁移文件
node scripts/check-migrations.js
```

### 执行迁移
```bash
# 开发环境迁移
npm run migrate:dev

# 生产环境迁移（谨慎执行）
npm run migrate:prod

# 回滚上一步迁移
npm run migrate:rollback
```

### 迁移验证
```bash
# 检查迁移结果
node scripts/verify-migrations.js

# 查看当前数据库结构
node scripts/schema-inspect.js
```

## ☁️ 云函数部署

### 部署前检查
```bash
# 检查云函数配置
node scripts/validate-functions.js

# 检查权限配置
node scripts/check-permissions.js
```

### 部署命令
```bash
# 部署所有云函数
npm run deploy:functions

# 单独部署特定函数
npm run deploy:function -- sendMessage
npm run deploy:function -- scheduleTask
npm run deploy:function -- createMessageTask
```

### 部署后验证
```bash
# 检查函数状态
node scripts/check-functions-status.js

# 测试函数调用
node scripts/test-function.js sendMessage
```

## 📱 小程序发布流程

### 构建阶段
```bash
# 开发构建
npm run build:dev

# 生产构建
npm run build:prod

# 构建并压缩
npm run build:release
```

### 代码上传
```bash
# 上传到微信公众平台
npm run upload:wechat

# 上传到小程序平台
npm run upload:miniprogram
```

### 审核发布
1. 登录微信公众平台开发者中心
2. 进入「版本管理」
3. 点击「提交审核」
4. 填写版本信息：
   - 版本号：1.0.0
   - 版本说明：企业消息推送功能上线
   - 要点：定时消息推送、优惠券提醒、营销活动通知
5. 等待审核（通常 1-3 个工作日）

### 发布上线
```bash
# 审核通过后执行发布
npm run release:production

# 验证发布版本
npm run verify:release
```

## 👤 管理员界面配置

### 权限配置
```javascript
// config/roles.js
export const ROLES = {
  admin: {
    name: '管理员',
    permissions: [
      'manage_templates',
      'manage_tasks',
      'manage_users',
      'manage_settings',
      'view_analytics'
    ]
  },
  manager: {
    name: '店长',
    permissions: [
      'manage_tasks',
      'view_analytics'
    ]
  },
  staff: {
    name: '员工',
    permissions: [
      'view_dashboard'
    ]
  }
};
```

### 界面定制
```bash
# 进入管理员界面配置
npm run admin:configure

# 配置通知模板
node scripts/configure-notifications.js

# 设置默认发送时间
node scripts/set-default-schedule.js
```

### 通知系统配置
```javascript
// config/notifications.js
export const NOTIFICATION_CONFIG = {
  wecom: {
    agentId: '1000002',
    secret: process.env.WECOM_SECRET,
    retryCount: 3
  },
  miniprogram: {
    templateId: '你的模板ID',
    page: 'pages/index/index'
  },
  email: {
    enabled: false,
    smtp: {
      host: 'smtp.example.com',
      port: 587
    }
  }
};
```

## 🧪 测试验证流程

### 功能测试
```bash
# 运行功能测试
npm run test:functional

# 测试消息发送
node scripts/test-message-send.js

# 测试定时任务
node scripts/test-scheduler.js

# 测试营销规则
node scripts/test-marketing-rules.js
```

### 端到端测试
```bash
# 运行完整端到端测试
npm run test:e2e

# 测试管理员界面
node scripts/test-admin-interface.js

# 测试数据库连接
node scripts/test-database.js
```

### 测试覆盖率检查
```bash
# 查看覆盖率报告
npm run coverage:report

# 检查是否达到80%
node scripts/check-coverage.js --min=80
```

## 📊 监控与日志

### 监控配置
```bash
# 启动监控系统
npm run monitor:start

# 查看监控状态
npm run monitor:status

# 配置告警规则
node scripts/configure-alerts.js
```

### 日志管理
```bash
# 查看实时日志
tail -f logs/application.log

# 错误日志监控
node scripts/monitor-errors.js

# 性能指标收集
node scripts/collect-metrics.js
```

### 健康检查
```bash
# 运行健康检查
node scripts/health-check.js

# 检查所有服务状态
node scripts/check-services.js

# 验证数据库连接
node scripts/check-database.js
```

## 🚨 生产环境验证

### 验证清单
- [ ] 云函数正常运行
- [ ] 数据库连接稳定
- [ ] 消息发送功能正常
- [ ] 定时任务准确触发
- [ ] 管理员界面可访问
- [ ] 营销规则正确执行
- [ ] 日志记录完整
- [ ] 监控告警生效
- [ ] 错误处理机制正常
- [ ] 性能指标达标

### 手动验证步骤
1. **测试消息发送**
   ```bash
   node scripts/manual-test.js send-message
   ```

2. **验证定时任务**
   ```bash
   node scripts/manual-test.js schedule-task
   ```

3. **检查日志**
   ```bash
   node scripts/check-logs.js
   ```

4. **验证数据库**
   ```bash
   node scripts/check-database-integrity.js
   ```

## 🔄 维护与更新流程

### 常规维护
```bash
# 每日检查
npm run daily-check

# 每周备份
npm run weekly-backup

# 每月清理
npm run monthly-cleanup
```

### 版本更新流程
1. 开发新功能
2. 本地测试通过
3. 部署到测试环境
4. UAT测试
5. 生产环境部署
6. 验证上线

### 回滚策略
```bash
# 回滚到上一版本
npm run rollback:previous

# 检查回滚状态
node scripts/verify-rollback.js

# 恢复数据库（如果需要）
npm run restore:database
```

## 📞 紧急问题处理

### 常见问题
1. **云函数执行失败**
   ```bash
   # 查看函数日志
   npm run logs:function sendMessage
   
   # 重新执行
   npm run retry:function sendMessage
   ```

2. **消息发送失败**
   ```bash
   # 检查配置
   node scripts/check-config.js
   
   # 重新发送
   npm run resend:failed-messages
   ```

3. **定时任务不执行**
   ```bash
   # 检查定时任务状态
   node scripts/check-scheduler.js
   
   # 重启调度器
   npm run restart:scheduler
   ```

## 📈 性能优化建议

### 数据库优化
```sql
-- 添加索引
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_tasks_send_time ON tasks(send_time);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
```

### 缓存策略
- 营销规则缓存：24小时
- 用户信息缓存：12小时
- 模板缓存：永久（更新时失效）

## 🎯 成功上线标准

所有以下指标达标：
- ✅ 云函数执行成功率 > 99%
- ✅ 消息发送成功率 > 98%
- ✅ 定时任务准时率 > 99%
- ✅ 数据库连接成功率 > 99.9%
- ✅ 监控告警响应时间 < 5分钟
- ✅ 日志完整率 100%

## 📞 后续支持

- **监控地址**: `/admin/monitoring`
- **日志地址**: `/admin/logs`
- **技术支持**: tech-support@company.com
- **紧急联系**: +86-XXX-XXXX-XXXX

## 📝 版本记录

- v1.0.0 - 初始上线版本
  - 消息模板管理
  - 定时任务调度
  - 消息发送功能
  - 日志追踪
  - 管理员界面
  - 营销规则集成

祝您部署成功！🎉