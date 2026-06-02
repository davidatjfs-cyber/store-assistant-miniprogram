// 沉睡客召回活动：为目标会员生成「带短码的现金抵用券」，并调用 HRMS 发短信。
// 仅用「小程序 → HRMS」这一已验证方向。券存于小程序(可核销+留存)，短信由 HRMS 用阿里云发。
// 入参：
//   store_id   门店POS号（51866138=马己仙 / 64822111=洪潮）
//   value_yuan 券面额（元，无门槛）
//   valid_days 有效天数（默认14）
//   campaign_id 活动标识（用于回流归因，可选）
//   targets    [{ phone, name? }]  目标会员（手机号来自 HRMS 会员库导出）
const cloud = require('wx-server-sdk');
const { postWinbackSms } = require('./hrmsClient');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 上海时区把 N 天后格式化成「6月20日」给短信用
function formatValidUntil(validDays) {
  const ms = Date.now() + Math.max(1, Number(validDays) || 14) * 86400000;
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date(ms));
  const mo = (parts.find(p => p.type === 'month') || {}).value || '';
  const da = (parts.find(p => p.type === 'day') || {}).value || '';
  return mo + '月' + da + '日';
}

// 生成全局唯一 6 位数字短码（口头可报；与未使用券去重，最多重试 12 次）
async function genUniqueShortCode() {
  for (let i = 0; i < 12; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const dup = await db.collection('user_vouchers')
      .where({ short_code: code, status: 'unused' }).limit(1).get();
    if (!dup.data || dup.data.length === 0) return code;
  }
  return null;
}

// 确保该门店有一个「召回现金抵用券」模板（无门槛、限本店），返回 templateId
async function ensureWinbackTemplate(storeId) {
  const tplId = 'winback_cash_' + storeId;
  const exist = await db.collection('voucher_templates').doc(tplId).get().catch(() => null);
  if (exist && exist.data) return tplId;
  await db.collection('voucher_templates').add({
    data: {
      _id: tplId,
      name: '沉睡客召回·无门槛现金抵用券',
      type: 'cash',
      store_ids: [String(storeId)],
      min_spend: 0,
      valid_days: 365,        // 实际有效期以每张券 expire_at 为准
      stock: -1,
      usage_rule: '无门槛现金抵用，每桌限用1张，不与其他优惠同享，不找零',
      source: 'winback',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  }).catch(() => {});
  return tplId;
}

// 找用户；找不到则按手机号建一个轻量用户（HRMS 同步过来的沉睡客，尚未授权小程序）
async function findOrCreateUserByPhone(phone) {
  const clean = String(phone || '').replace(/[\s\-]/g, '');
  if (!clean || clean.length < 7) return null;
  let r = await db.collection('users').where({ phone: clean }).limit(1).get();
  if (r.data && r.data.length) return r.data[0];
  const addRes = await db.collection('users').add({
    data: {
      phone: clean,
      source: 'winback_sync',   // HRMS 会员同步、尚未授权小程序
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return { _id: addRes._id, phone: clean };
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const ev = event || {};
  const storeId = String(ev.store_id || '').trim();
  const valueYuan = Math.max(0, Math.floor(Number(ev.value_yuan || ev.value) || 0));
  const validDays = Math.max(1, Math.floor(Number(ev.valid_days) || 14));
  const campaignId = String(ev.campaign_id || '').trim() || ('winback_' + new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const targets = Array.isArray(ev.targets) ? ev.targets : [];

  try {
    // 1. 权限：管理员/店长
    const staffRes = await db.collection('staff').where({ openid: OPENID, active: true }).limit(1).get();
    if (!staffRes.data.length) return { success: false, msg: '无权限操作' };
    const role = (staffRes.data[0].role || 'staff').toLowerCase();
    if (role !== 'manager' && role !== 'admin') return { success: false, msg: '仅店长/管理员可发起召回活动' };

    if (!storeId) return { success: false, msg: '缺少 store_id' };
    if (valueYuan <= 0) return { success: false, msg: '券面额必须大于0' };
    if (!targets.length) return { success: false, msg: '目标会员名单为空' };

    const templateId = await ensureWinbackTemplate(storeId);
    const validUntilText = formatValidUntil(validDays);
    const expireAt = new Date(Date.now() + validDays * 86400000);

    const results = [];
    let okCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] || {};
      const phone = String(t.phone || '').replace(/[\s\-]/g, '');
      const name = String(t.name || '').trim();
      if (!phone) { results.push({ phone: t.phone || '', ok: false, error: 'invalid_phone' }); continue; }

      try {
        const user = await findOrCreateUserByPhone(phone);
        if (!user) { results.push({ phone, ok: false, error: 'user_resolve_failed' }); continue; }

        const shortCode = await genUniqueShortCode();
        if (!shortCode) { results.push({ phone, ok: false, error: 'short_code_gen_failed' }); continue; }

        const voucherId = 'wb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        await db.collection('user_vouchers').add({
          data: {
            _id: voucherId,
            user_id: user._id,
            template_id: templateId,
            store_id: storeId,
            status: 'unused',
            qr_code: 'voucher:' + voucherId,
            short_code: shortCode,           // 到店报码核销用
            value_fen: valueYuan * 100,      // 本券实际面额（模板面额可变）
            campaign_id: campaignId,
            source: 'winback',
            created_at: db.serverDate(),
            expire_at: expireAt,
            updated_at: db.serverDate()
          }
        });

        // 调 HRMS 发短信（带短码）。idempotency_key 用短码，HRMS 侧防重复。
        const smsRes = await postWinbackSms({
          phone: phone,
          store_id: storeId,
          value_yuan: valueYuan,
          valid_until: validUntilText,
          coupon_code: shortCode,
          name: name,
          campaign_id: campaignId,
          idempotency_key: 'winback_sms:' + shortCode
        });

        if (smsRes && smsRes.ok) {
          okCount++;
          results.push({ phone, ok: true, short_code: shortCode, voucher_id: voucherId });
        } else {
          // 短信失败：券已生成（客人之后授权也能用），仅标记短信未送达
          results.push({ phone, ok: false, error: (smsRes && smsRes.error) || 'sms_failed', short_code: shortCode, voucher_id: voucherId });
        }
      } catch (perr) {
        results.push({ phone, ok: false, error: (perr && perr.message) || 'exception' });
      }
    }

    return {
      success: true,
      msg: '召回活动完成：成功 ' + okCount + ' / ' + targets.length,
      campaign_id: campaignId,
      template_id: templateId,
      total: targets.length,
      ok_count: okCount,
      results: results
    };
  } catch (err) {
    console.error('sendWinbackCampaign error:', err);
    return { success: false, msg: '系统异常: ' + (err.message || String(err)) };
  }
};
