# 企业微信配置模板

## 获取位置

### 1. 企业信息
- **企业ID (CorpID)**: 管理后台 → 企业信息 → 企业ID
  - 格式：`wwXXXXXXXXXX` 或 `corpidXXXXXXXXXXXXX`

### 2. 应用信息
- **应用ID (AgentID)**: 应用与权限 → 自建应用 → 您的应用 → AgentID
- **应用密钥 (AppSecret)**: 应用与权限 → 自建应用 → 您的应用 → 显示密钥

### 3. 授权回调
- **回调域名**: 管理后台 → 应用与权限 → 授权回调域名
- 需要将您的域名添加到这里

### 4. 开发配置
- **开发模式 Token**: 任意字符串（用于验证）
- **IP 白名单**: 您的服务器 IP

## 环境变量配置

```bash
# .env.production
WE_COM_CORP_ID=ww_your_enterprise_id
WE_COM_APP_ID=1000002  # 或者您使用的 AgentID
WE_COM_APP_SECRET=your_application_secret
WE_COM_REDIRECT_URL=https://your-domain.com/auth/callback
WE_COM_TOKEN=your_verify_token_for_wecom
```

## 管理员操作步骤

### 步骤1：登录企业微信管理后台
1. 访问：https://work.weixin.qq.com
2. 使用管理员账号登录

### 步骤2：查看企业信息
1. 进入「管理后台」
2. 点击「企业信息」
3. 记录「企业ID」

### 步骤3：创建自建应用
1. 进入「应用与权限」→「自建应用」
2. 点击「创建应用」
3. 填写：
   - 应用名称：`门店助手`
   - 应用可见范围：选择全员
4. 创建成功

### 步骤4：配置授权回调
1. 进入刚才创建的应用
2. 进入「权限配置」→「授权回调域名」
3. 添加您的域名，如：`https://store.yourcompany.com`

### 步骤5：获取应用密钥
1. 进入「应用与权限」→「自建应用」
2. 点击您的应用
3. 找到「AppSecret」，点击「显示」获取密钥

## 测试验证

### 检查配置是否正确
```bash
# 1. 查看环境变量
cat .env.production

# 2. 测试云函数
npm run test:config

# 3. 检查企业微信连接
node scripts/check-wecom-config.js
```

### 期望输出
```json
{
  "success": true,
  "corpId": "ww_your_corp_id",
  "agentId": 1000002,
  "hasPermission": true
}
```

## 常见问题

### Q1: 获取不到 external_userid？
**A**: 确保：
1. 用户已授权企业微信
2. 应用有 `snsapi_userinfo` 权限
3. 回调域名配置正确

### Q2: 发送消息失败？
**A**: 检查：
1. CorpID 和 AppSecret 是否正确
2. Token 配置是否正确
3. 用户是否已在企业通讯录中

### Q3: 回调域名不匹配？
**A**: 确保 `.env.production` 中的 `WE_COM_REDIRECT_URL` 与管理后台配置的完全一致，包括 `https://` 和端口号