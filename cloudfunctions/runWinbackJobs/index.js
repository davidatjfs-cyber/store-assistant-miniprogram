// 定时执行器(每2分钟):拉取 HRMS 冻结好的召回任务 → 逐个生成带短码的券 + 调 HRMS 发短信 → 回写结果。
// 发起权在 HRMS,本函数只"执行已冻结名单"。timer 触发(无用户 OPENID),不对外暴露发起能力。
const cloud = require('wx-server-sdk');
const { getPendingJob, postWinbackSms, postJobResult } = require('./hrmsClient');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function formatValidUntil(validDays) {
  const ms = Date.now() + Math.max(1, Number(validDays) || 14) * 86400000;
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).formatToParts(new Date(ms));
  const mo = (parts.find(p => p.type === 'month') || {}).value || '';
  const da = (parts.find(p => p.type === 'day') || {}).value || '';
  return mo + '月' + da + '日';
}
async function genUniqueShortCode() {
  for (let i = 0; i < 12; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const dup = await db.collection('user_vouchers').where({ short_code: code, status: 'unused' }).limit(1).get();
    if (!dup.data || dup.data.length === 0) return code;
  }
  return null;
}
async function ensureWinbackTemplate(storeId) {
  const tplId = 'winback_cash_' + storeId;
  const exist = await db.collection('voucher_templates').doc(tplId).get().catch(() => null);
  if (exist && exist.data) return tplId;
  await db.collection('voucher_templates').add({
    data: {
      _id: tplId, name: '沉睡客召回·无门槛现金抵用券', type: 'cash', store_ids: [String(storeId)],
      min_spend: 0, valid_days: 365, stock: -1,
      usage_rule: '无门槛现金抵用，每桌限用1张，不与其他优惠同享，不找零',
      source: 'winback', created_at: db.serverDate(), updated_at: db.serverDate()
    }
  }).catch(() => {});
  return tplId;
}
async function findOrCreateUserByPhone(phone) {
  const clean = String(phone || '').replace(/[\s\-]/g, '');
  if (!clean || clean.length < 7) return null;
  const r = await db.collection('users').where({ phone: clean }).limit(1).get();
  if (r.data && r.data.length) return r.data[0];
  const addRes = await db.collection('users').add({ data: { phone: clean, source: 'winback_sync', created_at: db.serverDate(), updated_at: db.serverDate() } });
  return { _id: addRes._id, phone: clean };
}

exports.main = async () => {
  try {
    const pull = await getPendingJob();
    if (!pull.ok) return { success: false, msg: 'pull_failed: ' + (pull.error || pull.statusCode) };
    const job = pull.body && pull.body.job;
    if (!job) return { success: true, msg: 'no_pending_job' };

    const storeId = String(job.store_id || '');
    const valueYuan = Math.max(0, Math.floor(Number(job.value_yuan) || 0));
    const validDays = Math.max(1, Math.floor(Number(job.valid_days) || 14));
    const campaignId = String(job.campaign_id || '');
    const targets = Array.isArray(job.targets) ? job.targets : [];

    const templateId = await ensureWinbackTemplate(storeId);
    const validUntilText = formatValidUntil(validDays);
    const expireAt = new Date(Date.now() + validDays * 86400000);
    let sent = 0, failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] || {};
      const phone = String(t.phone || '').replace(/[\s\-]/g, '');
      if (!phone) { failed++; continue; }
      try {
        const user = await findOrCreateUserByPhone(phone);
        if (!user) { failed++; continue; }
        const shortCode = await genUniqueShortCode();
        if (!shortCode) { failed++; continue; }
        const voucherId = 'wb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        await db.collection('user_vouchers').add({
          data: {
            _id: voucherId, user_id: user._id, template_id: templateId, store_id: storeId,
            status: 'unused', qr_code: 'voucher:' + voucherId, short_code: shortCode,
            value_fen: valueYuan * 100, campaign_id: campaignId, source: 'winback',
            created_at: db.serverDate(), expire_at: expireAt, updated_at: db.serverDate()
          }
        });
        const smsRes = await postWinbackSms({
          phone: phone, store_id: storeId, value_yuan: valueYuan, valid_until: validUntilText,
          coupon_code: shortCode, name: t.name || '', campaign_id: campaignId,
          idempotency_key: 'winback_sms:' + shortCode
        });
        if (smsRes && smsRes.ok) sent++; else failed++;
      } catch (e) { failed++; }
    }

    await postJobResult({ job_id: job.id, sent: sent, failed: failed, status: 'done', result: { total: targets.length } });
    return { success: true, job_id: job.id, total: targets.length, sent: sent, failed: failed };
  } catch (err) {
    console.error('runWinbackJobs error:', err);
    return { success: false, msg: (err && err.message) || String(err) };
  }
};
