/**
 * 一次性辅助：列出机器人所在的飞书群及其 chat_id，便于拿 chat_id 去配置。
 *
 * 用法：
 *   wx.cloud.callFunction({
 *     name: 'listFeishuChats',
 *     data: { app_id: 'cli_xxxx', app_secret: 'xxxx' }
 *   })
 * 返回 [{ chat_id, name }]，按群名找到对应 oc_ 开头的 chat_id。
 */
var cloud = require('wx-server-sdk');
var https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var FEISHU_HOST = 'open.feishu.cn';

function request(options, body) {
  return new Promise(function (resolve) {
    var req = https.request(options, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ code: -2, msg: data }); }
      });
    });
    req.on('error', function (e) { resolve({ code: -1, msg: e.message }); });
    if (body) req.write(body);
    req.end();
  });
}

exports.main = async function (event) {
  var appId = String(event.app_id || '').trim();
  var appSecret = String(event.app_secret || '').trim();
  if (!appId || !appSecret) return { success: false, message: '缺少 app_id / app_secret' };

  var tokenBody = JSON.stringify({ app_id: appId, app_secret: appSecret });
  var tokenRes = await request({
    host: FEISHU_HOST,
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(tokenBody) }
  }, tokenBody);
  if (!tokenRes || tokenRes.code !== 0 || !tokenRes.tenant_access_token) {
    return { success: false, message: (tokenRes && tokenRes.msg) || '获取 token 失败' };
  }
  var token = tokenRes.tenant_access_token;

  var listRes = await request({
    host: FEISHU_HOST,
    path: '/open-apis/im/v1/chats?page_size=100',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!listRes || listRes.code !== 0) {
    return { success: false, message: (listRes && listRes.msg) || '获取群列表失败' };
  }

  var items = (listRes.data && listRes.data.items) || [];
  var chats = items.map(function (c) {
    return { chat_id: c.chat_id, name: c.name };
  });
  return { success: true, chats: chats };
};
