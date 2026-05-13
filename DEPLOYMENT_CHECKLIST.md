# 云函数和小程序部署验证清单

## 环境配置

### 已创建配置文件
- ✅ `.env.production` - 生产环境配置文件，包含所有必要的变量

### 需要用户更新的配置
请在部署前更新以下配置为实际值：

#### 企业微信配置
- `WE_COM_CORP_ID` - 企业ID
- `WE_COM_APP_ID` - 应用ID  
- `WE_COM_APP_SECRET` - 应用Secret（**最重要，请从企业微信后台获取**）
- `WE_COM_REDIRECT_URL` - 回调域名

#### 支付配置
- `SUBSCRIBE_MSG_TEMPLATE_ID` - 订阅消息模板ID

#### 数据库配置
- `DB_SECRET_KEY` - 数据库密钥
- `DB_CONNECTION_STRING` - 数据库连接字符串

#### API配置
- `API_BASE_URL` - API服务器地址
- `JWT_SECRET` - JWT密钥

#### 微信小程序配置
- `MINI_PROGRAM_APPID` - 小程序AppID
- `MINI_PROGRAM_SECRET` - 小程序AppSecret

#### 文件存储
- `FILE_UPLOAD_DIR` - 文件上传目录
- `ALLOWED_FILE_TYPES` - 允许的文件类型

#### 日志配置
- `LOG_LEVEL` - 日志级别
- `LOG_DIR` - 日志存储路径

## 部署步骤

1. **更新配置文件**
   ```bash
   # 编辑.env.production文件，更新所有YOUR_XXX_HERE为实际值
   vi /Users/magainze/store-assistant-miniprogram/.env.production
   ```

2. **验证配置**
   ```bash
   # 检查必要的环境变量
   source .env.production
   echo "企业ID: $WE_COM_CORP_ID"
   echo "应用ID: $WE_COM_APP_ID"
   ```

3. **部署云函数**
   ```bash
   # 部署关联企业微信功能的云函数
   npx wcp deploy --function associateWecom
   npx wcp deploy --function getWecomUserInfo
   npx wcp deploy --function queryWecomMapping
   npx wcp deploy --function sendWecomVoucher
   ```

4. **部署小程序**
   ```bash
   npx wcp deploy --miniprogram
   ```

5. **验证API**
   ```bash
   curl http://localhost:8080/api/health
   ```

## 云函数依赖的变量

### associateWecom
- `WE_COM_APP_SECRET` - 企业微信应用Secret
- `DB_SECRET_KEY` - 数据库密钥
- `DB_CONNECTION_STRING` - 数据库连接
- `SUBSCRIBE_MSG_TEMPLATE_ID` - 订阅消息模板
- `MINI_PROGRAM_APPID` - 小程序AppID
- `MINI_PROGRAM_SECRET` - 小程序AppSecret

### getWecomUserInfo
- `WE_COM_APP_SECRET` - 企业微信应用Secret

### paymentCallback
- `SUBSCRIBE_MSG_TEMPLATE_ID` - 订阅消息模板
- `NODE_ENV` - 运行环境

## 验证要点

### 部署后检查
1. ✅ `.env.production` 文件存在且包含所有必要变量
2. ✅ 企业微信 `WE_COM_APP_SECRET` 已正确配置
3. ✅ 云函数部署成功
4. ✅ 小程序部署成功
5. ✅ API健康检查通过

### 测试命令
```bash
# 测试关联功能
node scripts/test-associate.js

# 测试发券
node scripts/test-send-voucher.js

# 测试API
curl http://localhost:8080/api/health
```

## 常见问题

### 1. 企业微信 AppSecret 获取
- 登录企业微信管理后台
- 进入「管理工具」→「开发者工具」→「自建应用」
- 创建或编辑应用，查看「应用Secret」

### 2. 回调域名配置
- 在企业微信管理后台设置回调域名
- 确保域名已备案且可访问

### 3. 变量未加载
- 确保 `.env.production` 文件在项目根目录
- 重启云函数服务使配置生效