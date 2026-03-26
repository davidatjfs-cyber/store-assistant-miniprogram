# 门店私域助手 - 微信小程序

## 独立仓库说明

本仓库由单体仓库 [financial-expert](https://github.com/davidatjfs-cyber/financial-expert) 中的 `store-assistant-miniprogram/` **拆分**而来，便于单独迭代、协作与发布。

**相对原目录的变更：**

- 新增根目录 `sitemap.json`，与 `app.json` 中 `sitemapLocation` 一致，便于通过微信开发者工具 sitemap 校验。
- `.gitignore` 增加 `project.private.config.json`（请勿将本机私有配置提交到 Git）。
- 下文 README 中「云函数列表」以**本仓库实际存在的目录**为准：`createPayment`、`paymentCallback`、`saveUserPhone`（`createAppointment` / `verifyVoucher` / `getUserInfo` 等尚未在本仓库实现）。

推送远端到 [store-assistant-miniprogram](https://github.com/davidatjfs-cyber/store-assistant-miniprogram) 的步骤见仓库内 `PUSH_INSTRUCTIONS.md`。

---

## 📱 项目简介

基于**微信小程序云开发**的门店私域运营工具，解决企业微信引流客户无法在聊天窗口完成预订、买券、核销的闭环问题。

### 核心特性

- ✅ 企微深度绑定 (external_userid 1:1 映射)（规划中）
- ✅ 微信支付云调用 (自动生成核销二维码)（云函数已备，前端页面待补全）
- ✅ 智能预约 (并发库存控制)（规划中）
- ✅ 员工核销端 (扫码核销)（规划中）
- ✅ 自动标签系统 (消费行为触发)（支付回调中已实现部分逻辑）

---

## 🏗️ 技术架构

### 技术栈

- **前端**: 微信小程序原生框架 (WXML + WXSS + JavaScript)
- **后端**: Node.js 云函数 (wx-server-sdk)
- **数据库**: 微信云开发 NoSQL 数据库
- **支付**: 微信支付云调用接口
- **存储**: 云存储 (二维码图片)

### 云函数列表（本仓库已包含）

| 云函数名 | 功能 | 触发方式 |
|---------|------|---------|
| `createPayment` | 创建支付订单 | 前端调用 |
| `paymentCallback` | 支付成功回调 | 微信自动触发 |
| `saveUserPhone` | 保存手机号、老会员检测、扫码日志 | 前端调用 |

---

## 📦 部署步骤

### 1. 环境准备

#### 1.1 开通微信小程序云开发

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入小程序后台 → 开发 → 云开发
3. 开通云开发环境 (选择基础版或专业版)
4. 记录环境 ID (格式: `cloud1-xxx`)

#### 1.2 配置微信支付

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com/)
2. 产品中心 → 开发配置 → 添加支付目录
3. 设置支付回调 URL: `云函数触发器地址`
4. 记录商户号 (mch_id) 和 API 密钥

### 2. 项目配置

#### 2.1 修改 `project.config.json`

将 `appid` 改为你的小程序 AppID（若与当前不一致）。

#### 2.2 初始化云开发环境

在 `app.js` 中把 `wx.cloud.init` 的 `env` 改为你的云环境 ID。

### 3. 上传云函数

在每个云函数目录执行 `npm install` 后，在微信开发者工具中右键对应目录 → **上传并部署：云端安装依赖**。

### 4. 配置数据库

在云开发控制台创建集合，详见 `DEPLOYMENT_GUIDE.md` 与 `SCAN_INTERCEPTION_GUIDE.md`。

---

## 📝 待办事项

- [ ] 实现预约功能 (并发控制)
- [ ] 实现员工核销端与对应页面路由
- [ ] 接入企微 external_userid
- [ ] 配置订阅消息模板（替换 `paymentCallback` 内 `YOUR_TEMPLATE_ID`）
- [ ] 添加退款功能
- [ ] 添加券码过期自动提醒
- [ ] 补齐 `pages/voucher/*` 等与支付、核销相关页面（与云函数中页面路径一致）

---

## 📞 技术支持

如有问题，请联系开发团队。

**版本**: v1.0.0  
**更新时间**: 2026-02-22
