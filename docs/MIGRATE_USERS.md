# users 与 user_vouchers.user_id 迁移说明

## 背景

新版逻辑要求：

- 统一身份在集合 **`users`**（字段 `openid` / `phone` 等）。
- **`user_vouchers.user_id`** 必须为 **`users._id`**，不再直接存小程序 `openid` 字符串。

## 方案 A：云函数批量迁移（推荐）

1. 上传并部署云函数 **`migrateUsers`**（云端安装依赖）。
2. 在小程序端或云开发控制台「云函数测试」中**分批**调用，直到 `migratedVouchers` 为 0：

```javascript
wx.cloud.callFunction({
  name: 'migrateUsers',
  data: {
    confirm: 'CONFIRM_MIGRATE_USER_VOUCHERS',
    limit: 200,
    skip: 0
  }
});
```

- 将返回的 `nextSkip` 作为下一轮的 `skip` 继续调用。
- 对每条 `user_vouchers`：若 `user_id` 已是 `users` 里存在的 `_id`，则跳过；否则按 `openid = user_id` 查找或新建 `users`，再回写 `user_vouchers.user_id`。

**安全提示**：迁移完成后可删除或禁用 `migrateUsers`，避免他人误触；生产环境建议改为仅管理员可调的 HTTP 触发器 + 密钥。

## 方案 B：控制台导出 / 脚本

1. 导出 `user_vouchers`、`users`。
2. 对每个 distinct 的旧 `user_id`（实为 openid）在 `users` 中 upsert：`{ openid, phone: '', external_userid: '', created_at }`。
3. 批量更新 `user_vouchers.user_id` 为新 `users._id`。

## 方案 C：零停机渐进

- 新支付回调已通过 `ensureUser` 写入 `users` 并使用 `users._id` 发券。
- 老数据按方案 A/B 分批迁移；迁移前 `getUserVouchers` 对无 `users` 行的 openid 会返回空列表。

## 关联数据

- **`voucher_logs.user_id`**：新核销记录存券持有人 **`users._id`**。历史记录若为 openid，可另跑脚本按券反查用户后修正（非必须）。
