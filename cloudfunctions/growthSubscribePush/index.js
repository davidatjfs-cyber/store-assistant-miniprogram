// growthSubscribePush —— HRMS「指挥」→ 小程序「代发」订阅消息 的 HTTP 网关。
//
// 方案B：HRMS 自己没有小程序 access_token，发不了订阅消息，所以由 HRMS 通过
// 云开发「HTTP 访问服务」调用本函数，本函数解析用户 openid 后委托已存在的
// sendSubscribeMessage 真正发送（复用其模板/门店配置逻辑）。
//
// 鉴权：请求头 X-Miniprogram-Sync-Secret 必须等于 env MINIPROGRAM_SYNC_SECRET
//      （或 HRMS_GROWTH_EVENT_SECRET），与召回短信回调同一套密钥口径。
//
// 入参(JSON body 或 callFunction event)：
//   { phone?, openid?, store_id, templateType: 'received'|'expiring', templateData?, page? }
//   - openid 优先；否则用 phone 在 users 集合解析 openid。
//
// 订阅消息平台硬约束：只能发给「点过订阅授权且仍有剩余次数」的用户，
// 未授权会返回 43101，本函数原样回传，不视为系统错误。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function readSecretFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') return '';
  // HTTP 访问服务的 header key 可能为小写
  return String(
    headers['x-miniprogram-sync-secret'] ||
    headers['X-Miniprogram-Sync-Secret'] ||
    ''
  ).trim();
}

// 兼容两种调用：HTTP 访问服务(event.httpMethod/headers/body) 与 callFunction(裸 event)
function parseInvocation(event) {
  const isHttp = event && (event.httpMethod || event.headers || typeof event.body === 'string');
  if (!isHttp) return { http: false, secret: '', body: event || {} };
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
    catch (e) { body = {}; }
  }
  return { http: true, secret: readSecretFromHeaders(event.headers), body: body || {} };
}

function httpReply(http, statusCode, obj) {
  if (!http) return obj;
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

async function resolveOpenid(body) {
  const openid = String(body.openid || '').trim();
  if (openid) return openid;
  const phone = String(body.phone || '').replace(/[^0-9]/g, '');
  if (phone.length < 7) return '';
  try {
    const r = await db.collection('users').where({ phone }).limit(1).get();
    if (r.data && r.data.length) {
      const u = r.data[0];
      return String(u.openid || u._openid || '').trim();
    }
  } catch (e) {}
  return '';
}

exports.main = async function (event) {
  const { http, secret, body } = parseInvocation(event);

  const expected = String(process.env.MINIPROGRAM_SYNC_SECRET || process.env.HRMS_GROWTH_EVENT_SECRET || '').trim();
  if (!expected) return httpReply(http, 500, { ok: false, error: 'secret_not_configured' });
  if (secret !== expected) return httpReply(http, 401, { ok: false, error: 'unauthorized' });

  const storeId = String(body.store_id || '').trim();
  const templateType = body.templateType === 'expiring' ? 'expiring' : 'received';
  const templateData = body.templateData && typeof body.templateData === 'object' ? body.templateData : null;
  const page = String(body.page || '').trim();

  const openid = await resolveOpenid(body);
  if (!openid) return httpReply(http, 200, { ok: false, error: 'user_resolve_failed' });

  try {
    const res = await cloud.callFunction({
      name: 'sendSubscribeMessage',
      data: {
        userId: openid,
        store_id: storeId,
        templateType,
        templateData,
        page: page || undefined
      }
    });
    const r = (res && res.result) || {};
    // sendSubscribeMessage 成功口径：{ success:true } 或 result.errCode===0
    const ok = !!(r.success || (r.result && r.result.errCode === 0));
    return httpReply(http, 200, { ok, openid, sub_result: r });
  } catch (e) {
    return httpReply(http, 200, { ok: false, error: (e && e.message) || 'subscribe_send_failed' });
  }
};
