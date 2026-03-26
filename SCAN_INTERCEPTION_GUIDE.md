# 扫码拦截与客如云跳转

本独立仓库中的实现以 `app.js`、`pages/index/*`、`cloudfunctions/saveUserPhone` 为准。

## 完整长文（图表、逐步测试与 UI 说明）

若需与历史版本完全一致的详细说明，请打开原单体仓库中的同文件：

<https://github.com/davidatjfs-cyber/financial-expert/blob/main/store-assistant-miniprogram/SCAN_INTERCEPTION_GUIDE.md>

## 核心流程（摘要）

1. 用户扫桌贴码进入小程序 → `app.js` 解析 `scene`（1047/1011）与 `query`（`table_id`、`store_id`）。
2. 首页展示授权弹窗 → 用户同意获取手机号 → 调用云函数 `saveUserPhone`。
3. 云函数：`phonenumber.getPhoneNumber` 换手机号 → 查 `LegacyMembers` → 写 `Users` → 写 `ScanLogs`。
4. 成功后 `wx.navigateToMiniProgram` 跳转客如云（需在公众平台配置跳转白名单）。

## 必配项

- `app.js`：`wx.cloud.init({ env: '你的环境ID' })`
- `globalData.keruYunConfig.appId`：客如云小程序 AppID
- 云数据库集合：`Users`、`LegacyMembers`、`ScanLogs`
- 云函数 `saveUserPhone` 已配置 `phonenumber.getPhoneNumber` 权限（见该函数下 `config.json`）

## 测试建议

- 在云库中插入一条 `LegacyMembers`（`phone` 与真机授权号码一致，`is_synced: false`），验证老会员动效与字段回写。
- 真机调试前在开发者工具中绑定当前开发者微信号，并确认小程序已开通「手机号快速验证」等能力。

**版本**: v1.0.0  
**更新时间**: 2026-03-26
