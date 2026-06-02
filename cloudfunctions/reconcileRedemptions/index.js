// Plan B 对账兜底：每日定时把近 2 天的核销记录(voucher_logs)重新回流给 HRMS。
// HRMS 按 idempotency_key('coupon_redeemed:'+voucher_id) 幂等去重 → 实时回流成功的不会重复计，
// 实时回流丢失的在这里补回。保证高峰期核销率/ROI 统计零丢失。
const cloud = require('wx-server-sdk');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const lookbackDays = Math.max(1, Math.floor(Number(event && event.days) || 2));
  const since = new Date(Date.now() - lookbackDays * 86400000);
  let scanned = 0, resynced = 0, failed = 0;

  try {
    // 分页拉取近 N 天 verify 成功且未撤销的核销日志
    const PAGE = 100;
    for (let page = 0; page < 50; page++) {
      const logs = await db.collection('voucher_logs')
        .where({ action: 'verify', reverted: false, created_at: _.gte(since) })
        .orderBy('created_at', 'desc')
        .skip(page * PAGE).limit(PAGE).get();
      const rows = (logs && logs.data) || [];
      if (!rows.length) break;

      for (let i = 0; i < rows.length; i++) {
        const log = rows[i];
        scanned++;
        try {
          // 取券(拿 campaign_id) 与 用户(拿 phone/openid)
          let voucher = null, user = null;
          if (log.voucher_id) {
            const vd = await db.collection('user_vouchers').doc(log.voucher_id).get().catch(() => null);
            voucher = vd && vd.data;
          }
          if (log.user_id) {
            const ud = await db.collection('users').doc(log.user_id).get().catch(() => null);
            user = ud && ud.data;
          }
          const res = await syncHrmsGrowthEvent({
            event_type: 'coupon_redeemed',
            phone: user && user.phone,
            openid: user && (user.openid || user._openid),
            store_id: log.store_id || (voucher && voucher.store_id) || '',
            campaign_id: (voucher && voucher.campaign_id) || '',
            coupon_id: log.voucher_id || '',
            amount_fen: 0, // 兜底事件不含金额；实时回流已带，幂等去重以实时为准
            idempotency_key: 'coupon_redeemed:' + (log.voucher_id || ''),
            metadata: { reconciled: true, staff_id: log.staff_id || '' }
          });
          if (res && (res.ok || res.skipped)) resynced++; else failed++;
        } catch (e) {
          failed++;
        }
      }
      if (rows.length < PAGE) break;
    }
    return { success: true, scanned: scanned, resynced: resynced, failed: failed };
  } catch (err) {
    console.error('reconcileRedemptions error:', err);
    return { success: false, msg: (err && err.message) || String(err), scanned: scanned, resynced: resynced, failed: failed };
  }
};
