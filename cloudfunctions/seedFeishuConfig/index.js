/**
 * 写入门店飞书凭证到 store_feishu_configs（幂等 upsert，按 store_id）。
 * 凭证由调用方在 data 中传入，源码不硬编码任何密钥。
 *
 * 用法（在云开发控制台 / 测试面板执行一次即可）：
 *   wx.cloud.callFunction({
 *     name: 'seedFeishuConfig',
 *     data: {
 *       confirm: 'CONFIRM_SEED_FEISHU',
 *       store_id: '51866138',
 *       app_id: 'cli_xxxxxxxx',
 *       app_secret: 'xxxxxxxx',
 *       store_name: '马己仙',
 *       chat_id: 'oc_xxxxxxxx'   // 必填：推送到该飞书群
 *     }
 *   })
 */
var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();

exports.main = async function (event) {
  if (event.confirm !== 'CONFIRM_SEED_FEISHU') {
    return { success: false, message: '请传入 confirm: "CONFIRM_SEED_FEISHU" 以确认执行' };
  }
  var storeId = String(event.store_id || '').trim();
  var appId = String(event.app_id || '').trim();
  var appSecret = String(event.app_secret || '').trim();
  var chatId = String(event.chat_id || '').trim();
  if (!storeId || !appId || !appSecret || !chatId) {
    return { success: false, message: '缺少 store_id / app_id / app_secret / chat_id' };
  }

  var data = {
    store_id: storeId,
    app_id: appId,
    app_secret: appSecret,
    store_name: String(event.store_name || '').trim(),
    chat_id: chatId,
    updated_at: db.serverDate()
  };

  try {
    var existing = await db.collection('store_feishu_configs').where({ store_id: storeId }).limit(1).get();
    if (existing.data.length) {
      await db.collection('store_feishu_configs').doc(existing.data[0]._id).update({ data: data });
      return { success: true, action: 'updated', store_id: storeId };
    }
    data.created_at = db.serverDate();
    await db.collection('store_feishu_configs').add({ data: data });
    return { success: true, action: 'created', store_id: storeId };
  } catch (e) {
    return { success: false, message: e.message };
  }
};
