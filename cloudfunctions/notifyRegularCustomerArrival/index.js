/**
 * 熟客到店 → 飞书提醒
 *
 * 由 detectUserArrival 在「消费≥2次」的顾客到店时调用（fire-and-forget）。
 * 给本门店全体在职员工（staff 集合，active:true）推送飞书消息。
 *
 * 飞书凭证存放在数据库集合 store_feishu_configs，请勿硬编码到源码：
 *   {
 *     store_id: '51866138',
 *     app_id:   'cli_xxxxxxxx',
 *     app_secret: 'xxxxxxxx',
 *     store_name: '马己仙',
 *     chat_id: 'oc_xxxxxxxx'   // 必填：推送到该飞书群
 *   }
 */
var cloud = require('wx-server-sdk');
var https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();

var FEISHU_HOST = 'open.feishu.cn';

function httpsRequest(options, body) {
  return new Promise(function (resolve) {
    var req = https.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ code: -2, msg: 'parse error: ' + data }); }
      });
    });
    req.on('error', function (e) { resolve({ code: -1, msg: e.message }); });
    if (body) req.write(body);
    req.end();
  });
}

function postJson(path, token, payload) {
  var body = JSON.stringify(payload);
  var headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  return httpsRequest(
    { host: FEISHU_HOST, path: path, method: 'POST', headers: headers },
    body
  );
}

async function loadFeishuConfig(storeId) {
  if (storeId) {
    try {
      var r = await db.collection('store_feishu_configs').where({ store_id: storeId }).limit(1).get();
      if (r.data.length) return r.data[0];
    } catch (e) {}
  }
  try {
    var r2 = await db.collection('store_feishu_configs').limit(1).get();
    return r2.data.length ? r2.data[0] : null;
  } catch (e) {
    return null;
  }
}

async function getTenantToken(appId, appSecret) {
  var res = await postJson('/open-apis/auth/v3/tenant_access_token/internal', '', {
    app_id: appId,
    app_secret: appSecret
  });
  if (res && res.code === 0 && res.tenant_access_token) {
    return { ok: true, token: res.tenant_access_token };
  }
  return { ok: false, error: (res && res.msg) || '获取 tenant_access_token 失败' };
}

function shortField(label, value) {
  return {
    is_short: true,
    text: { tag: 'lark_md', content: '**' + label + '**\n' + (value || '—') }
  };
}

function buildCard(profile) {
  var fields = [
    shortField('顾客', profile.display_name),
    shortField('累计到店', (profile.total_visits != null ? profile.total_visits : 0) + ' 次'),
    shortField('今天所在桌号', profile.table_id),
    shortField('今天到店时间', profile.arrival_time_text),
    shortField('最近到店日期', profile.last_visit_text)
  ];
  if (profile.favorite_dish) {
    fields.push(shortField('偏好菜品', profile.favorite_dish));
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'orange',
      title: { tag: 'plain_text', content: '🔔 熟客到店提醒' }
    },
    elements: [
      { tag: 'div', fields: fields },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '门店：' + (profile.store_name || '—') }] }
    ]
  };
}

async function sendCard(token, chatId, card) {
  return postJson('/open-apis/im/v1/messages?receive_id_type=chat_id', token, {
    receive_id: chatId,
    msg_type: 'interactive',
    content: JSON.stringify(card)
  });
}

exports.main = async function (event) {
  var storeId = event && event.store_id != null ? String(event.store_id).trim() : '';
  if (!storeId) return { success: false, message: '缺少 store_id' };

  var config = await loadFeishuConfig(storeId);
  if (!config || !config.app_id || !config.app_secret) {
    return { success: false, message: '未配置飞书凭证（store_feishu_configs）' };
  }
  if (!config.chat_id) {
    return { success: false, message: '未配置飞书群 chat_id' };
  }

  var tokenRes = await getTenantToken(config.app_id, config.app_secret);
  if (!tokenRes.ok) return { success: false, message: tokenRes.error };
  var token = tokenRes.token;

  var profile = {
    display_name: event.display_name || '顾客',
    total_visits: event.total_visits != null ? event.total_visits : 0,
    favorite_dish: event.favorite_dish || '',
    table_id: event.table_id || '',
    arrival_time_text: event.arrival_time_text || '',
    last_visit_text: event.last_visit_text || '',
    store_name: config.store_name || ''
  };
  var card = buildCard(profile);

  var r = await sendCard(token, config.chat_id, card);
  var ok = !!(r && r.code === 0);

  try {
    await db.collection('message_logs').add({
      data: {
        type: 'feishu_regular_arrival',
        store_id: storeId,
        chat_id: config.chat_id,
        content: profile,
        send_result: ok ? 'sent' : 'failed',
        send_error: ok ? '' : (r && r.msg) || '',
        created_at: db.serverDate()
      }
    });
  } catch (e) {}

  return { success: ok, message: ok ? '已推送到飞书群' : (r && r.msg) };
};
