// 定时执行器(每2分钟):拉取 HRMS 冻结好的召回任务 → 逐个生成带短码的券 + 调 HRMS 发短信 → 回写结果。
// 发起权在 HRMS,本函数只"执行已冻结名单"。timer 触发(无用户 OPENID),不对外暴露发起能力。
const cloud = require('wx-server-sdk');
const { getPendingJob, postWinbackSms, postCampaignSms, postJobResult } = require('./hrmsClient');

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
// 通用发券段模板（VIP/新客/活跃/长期流失）。统一 min_spend=0：礼品/赠菜券无门槛，
// 也避免「按元/按分」误判导致核销失败（线上曾因门槛核销不了）。一段一门店一模板。
const CAMPAIGN_TPL_META = {
  vip_gift:        { name: 'VIP专属·赠菜券',       type: 'gift' },
  newcomer_4d:     { name: '新客回头·赠菜券',      type: 'gift' },
  newcomer_8d:     { name: '新客回头·赠菜券',      type: 'gift' },
  active:          { name: '活跃客·赠菜券',        type: 'gift' },
  newcomer_recall: { name: '新客二次召回·21-60天', type: 'cash' },
  regular_cooling: { name: '常客降温唤醒·21-60天', type: 'gift' },
  vip_winback:     { name: 'VIP专属召回·61-365天', type: 'cash' },
  dormant_60_90:   { name: '沉睡召回·60-90天',     type: 'cash' },
  dormant_90_180:  { name: '沉睡召回·90-180天',    type: 'cash' },
  lost_long:       { name: '长期流失·满额回归券',  type: 'cash' },
};
async function ensureCampaignTemplate(kind, storeId) {
  const meta = CAMPAIGN_TPL_META[kind] || { name: '营销发券', type: 'gift' };
  const tplId = 'campaign_' + kind + '_' + storeId;
  const exist = await db.collection('voucher_templates').doc(tplId).get().catch(() => null);
  if (exist && exist.data) {
    // 已存在但名称/类型与最新定义不符(如早期用通用名建的)，刷新一次，保证核销时回出正确中文活动名
    if (CAMPAIGN_TPL_META[kind] && (exist.data.name !== meta.name || exist.data.type !== meta.type)) {
      await db.collection('voucher_templates').doc(tplId)
        .update({ data: { name: meta.name, type: meta.type, updated_at: db.serverDate() } })
        .catch(() => {});
    }
    return tplId;
  }
  await db.collection('voucher_templates').add({
    data: {
      _id: tplId, name: meta.name, type: meta.type, store_ids: [String(storeId)],
      min_spend: 0, valid_days: 365, stock: -1,
      usage_rule: '凭券码到店核销，每桌限用，不与其他优惠同享',
      source: 'campaign', campaign_key: kind, created_at: db.serverDate(), updated_at: db.serverDate()
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

    // kind 区分管道：'winback' 走储值召回(现金券+winback短信)；其余为通用发券段，
    // 走 campaign 模板 + /campaign/send-sms。coupon_count>1 时同一短码可核销多次(max_uses)。
    const kind = String(job.kind || 'winback');
    const isWinback = kind === 'winback';
    const result = (job.result && typeof job.result === 'object') ? job.result : {};
    const couponCount = Math.max(1, Math.floor(Number(result.coupon_count) || 1));
    const source = isWinback ? 'winback' : 'campaign';

    const templateId = isWinback
      ? await ensureWinbackTemplate(storeId)
      : await ensureCampaignTemplate(kind, storeId);
    const validUntilText = formatValidUntil(validDays);
    const expireAt = new Date(Date.now() + validDays * 86400000);
    let sent = 0, failed = 0, skipped = 0;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] || {};
      const phone = String(t.phone || '').replace(/[\s\-]/g, '');
      if (!phone) { failed++; continue; }
      try {
        const user = await findOrCreateUserByPhone(phone);
        if (!user) { failed++; continue; }
        const shortCode = await genUniqueShortCode();
        if (!shortCode) { failed++; continue; }
        const voucherId = (isWinback ? 'wb_' : 'cmp_') + Date.now() + '_' + Math.floor(Math.random() * 100000);
        const voucherData = {
          _id: voucherId, user_id: user._id, template_id: templateId, store_id: storeId,
          status: 'unused', qr_code: 'voucher:' + voucherId, short_code: shortCode,
          value_fen: valueYuan * 100, campaign_id: campaignId, campaign_key: kind, source: source,
          created_at: db.serverDate(), expire_at: expireAt, updated_at: db.serverDate()
        };
        // 多张/一码：max_uses 张数，核销时逐次累计 used_count，用满才置 used
        if (couponCount > 1) { voucherData.max_uses = couponCount; voucherData.used_count = 0; }
        await db.collection('user_vouchers').add({ data: voucherData });

        const smsRes = isWinback
          ? await postWinbackSms({
              phone: phone, store_id: storeId, value_yuan: valueYuan, valid_until: validUntilText,
              coupon_code: shortCode, name: t.name || '', campaign_id: campaignId,
              idempotency_key: 'winback_sms:' + shortCode
            })
          : await postCampaignSms({
              campaign_key: kind, phone: phone, store_id: storeId, value_yuan: valueYuan,
              valid_until: validUntilText, coupon_code: shortCode, name: t.name || '',
              campaign_id: campaignId, idempotency_key: kind + ':' + shortCode
            });
        // 频控/幂等命中时 HRMS 返回 {ok:true, skipped|deduped:true}，未真正发出，
        // 不计入 sent(避免发送量虚高)，单列 skipped 统计。
        var body = (smsRes && smsRes.body) || {};
        if (smsRes && smsRes.ok && (body.skipped || body.deduped)) skipped++;
        else if (smsRes && smsRes.ok) sent++;
        else failed++;
      } catch (e) { failed++; }
    }

    await postJobResult({ job_id: job.id, sent: sent, failed: failed, status: 'done', result: { total: targets.length, skipped: skipped } });
    return { success: true, job_id: job.id, total: targets.length, sent: sent, failed: failed, skipped: skipped };
  } catch (err) {
    console.error('runWinbackJobs error:', err);
    return { success: false, msg: (err && err.message) || String(err) };
  }
};
