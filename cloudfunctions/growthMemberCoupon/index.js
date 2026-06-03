// growthMemberCoupon —— HRMS「指挥」→ 小程序「站内推券」的 HTTP 网关。
//
// 用途：HRMS 的增长策略命中某会员后，通过云开发「HTTP 访问服务」调用本函数，
//      直接给该会员发一张券进 user_vouchers（即小程序「我的券」卡包），实现
//      「只在自己的小程序里给客人推券」的站内触达渠道。复用既有 voucher_templates
//      / user_vouchers / getUserVouchers 展示与核销链路，不另造数据模型。
//
// 鉴权：请求头 X-Miniprogram-Sync-Secret 必须等于 env MINIPROGRAM_SYNC_SECRET
//      （或 HRMS_GROWTH_EVENT_SECRET），与订阅消息代发网关同一套密钥口径。
//
// 入参(JSON body 或 callFunction event)：
//   { phone?, openid?, store_id, template_id, idempotency_key? }
//   - openid 优先；否则用 phone 在 users 集合解析 user。
//   - template_id 必填：指向 voucher_templates 里已建好的券模板（决定面额/有效期/名称）。
//   - idempotency_key：同一 key 重复调用只发一次（防 HRMS 重试导致重复发券）。
//
// 返回：{ ok, voucher_id?, deduped?, error? }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function readSecretFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') return '';
  return String(headers['x-miniprogram-sync-secret'] || headers['X-Miniprogram-Sync-Secret'] || '').trim();
}

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
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

async function resolveUser(body) {
  const openid = String(body.openid || '').trim();
  if (openid) {
    const r = await db.collection('users').where({ openid }).limit(1).get();
    if (r.data && r.data.length) return r.data[0];
  }
  const phone = String(body.phone || '').replace(/[^0-9]/g, '');
  if (phone.length >= 7) {
    const r = await db.collection('users').where({ phone }).limit(1).get();
    if (r.data && r.data.length) return r.data[0];
  }
  return null;
}

exports.main = async function (event) {
  const { http, secret, body } = parseInvocation(event);

  const expected = String(process.env.MINIPROGRAM_SYNC_SECRET || process.env.HRMS_GROWTH_EVENT_SECRET || '').trim();
  if (!expected) return httpReply(http, 500, { ok: false, error: 'secret_not_configured' });
  if (secret !== expected) return httpReply(http, 401, { ok: false, error: 'unauthorized' });

  const storeId = String(body.store_id || '').trim();
  const templateId = String(body.template_id || body.member_template_id || '').trim();
  const idempotencyKey = String(body.idempotency_key || '').trim();
  if (!templateId) return httpReply(http, 200, { ok: false, error: 'missing_template_id' });

  // 幂等：同一 idempotency_key 已发过 → 不重复发
  if (idempotencyKey) {
    const dup = await db.collection('user_vouchers').where({ idempotency_key: idempotencyKey }).limit(1).get();
    if (dup.data && dup.data.length) {
      return httpReply(http, 200, { ok: true, deduped: true, voucher_id: dup.data[0]._id });
    }
  }

  const user = await resolveUser(body);
  if (!user) return httpReply(http, 200, { ok: false, error: 'user_resolve_failed' });

  // 模板校验
  let tpl = null;
  try { const t = await db.collection('voucher_templates').doc(templateId).get(); tpl = t.data; } catch (e) { tpl = null; }
  if (!tpl) return httpReply(http, 200, { ok: false, error: 'template_not_found' });
  if (tpl.stock !== -1 && Number(tpl.stock) <= 0) return httpReply(http, 200, { ok: false, error: 'out_of_stock' });

  const effectiveStoreId = storeId || (Array.isArray(tpl.store_ids) ? tpl.store_ids[0] : '') || String(user.last_scan_store_id || '');
  if (effectiveStoreId && Array.isArray(tpl.store_ids) && tpl.store_ids.length > 0) {
    if (tpl.store_ids.indexOf(effectiveStoreId) < 0 && tpl.store_ids.indexOf('*') < 0) {
      return httpReply(http, 200, { ok: false, error: 'template_not_for_store' });
    }
  }

  const validDays = Math.max(1, Math.floor(Number(tpl.valid_days) || 7));
  const voucherId = `gm_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  try {
    await db.collection('user_vouchers').add({
      data: {
        _id: voucherId,
        user_id: user._id,
        template_id: templateId,
        store_id: effectiveStoreId,
        status: 'unused',
        qr_code: `voucher:${voucherId}`,
        created_at: db.serverDate(),
        expire_at: new Date(Date.now() + validDays * 86400000),
        source: 'hrms_growth',
        idempotency_key: idempotencyKey || null
      }
    });
    if (tpl.stock !== -1) {
      await db.collection('voucher_templates').doc(templateId).update({
        data: { stock: db.command.inc(-1), sold_count: db.command.inc(1) }
      }).catch(function () {});
    }
    return httpReply(http, 200, { ok: true, voucher_id: voucherId, openid: user.openid || '' });
  } catch (err) {
    return httpReply(http, 200, { ok: false, error: 'grant_failed: ' + (err && err.message ? err.message : String(err)) });
  }
};
