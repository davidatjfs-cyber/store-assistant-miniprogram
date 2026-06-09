// 员工扫码核销：staff 校验、门店/模板规则、防重复、写 voucher_logs、analytics
const cloud = require('wx-server-sdk');
const {
  logAnalytics,
  findActiveStaff,
  checkTemplateRules,
  onVerifySuccessUserSide
} = require('./helpers');
const userLifecycle = require('./userLifecycle');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const QR_PREFIX = 'voucher:';
const RATE_WINDOW_MS = 3000;
const RATE_MAX_IN_WINDOW = 8;

function parseVoucherId(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return '';
  const t = qrCode.trim();
  if (t.indexOf(QR_PREFIX) !== 0) return '';
  return t.slice(QR_PREFIX.length).trim();
}

function toDateMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  const ms = d.getTime();
  return isNaN(ms) ? null : ms;
}

// 上海时区把时间戳格式化成「2026-06-04 13:10:44」，给店员展示核销时间
function formatRedeemTime(v) {
  const ms = toDateMs(v);
  if (ms == null) return '未知时间';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date(ms));
  const g = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value || ''; };
  return g('year') + '-' + g('month') + '-' + g('day') + ' ' + g('hour') + ':' + g('minute') + ':' + g('second');
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const callerOpenid = wxContext.OPENID || '';
  const { qr_code, store_id, order_amount_fen } = event || {};

  async function fail(msg, meta) {
    await logAnalytics(db, {
      user_id: (meta && meta.voucher_user_id) || '',
      action: 'verify_fail',
      metadata: Object.assign(
        {
          reason: msg,
          store_id: meta && meta.verify_store_id
        },
        meta || {}
      )
    });
    return { success: false, message: msg };
  }

  if (!callerOpenid) {
    return fail('无法识别身份，请重新登录', {});
  }

  const staffRow = await findActiveStaff(db, callerOpenid);
  if (!staffRow) {
    return fail('非店员账号，无法核销', { staff_openid_tail: callerOpenid.slice(-6) });
  }

  const staffId = staffRow._id;

  let verifyStoreId = '';
  if (staffRow.store_id != null && String(staffRow.store_id).trim()) {
    verifyStoreId = String(staffRow.store_id).trim();
  }
  if (store_id != null && String(store_id).trim()) {
    const passed = String(store_id).trim();
    if (verifyStoreId && passed !== verifyStoreId) {
      return fail('门店信息与当前员工绑定门店不一致', {
        verify_store_id: verifyStoreId,
        passed_store_id: passed
      });
    }
    if (!verifyStoreId) verifyStoreId = passed;
  }

  if (!verifyStoreId) {
    return fail('无法确定核销门店，请配置员工 store_id 或传入 store_id', {});
  }

  let voucherId = parseVoucherId(qr_code);

  try {
    // 「到店报码」极简核销：非 voucher: 二维码时，按 6 位短码查券。
    // 不限 status：取该码最新一张券；若已核销，下面的状态分支会回出核销时间给店员看。
    if (!voucherId) {
      const code = String(qr_code || '').trim();
      if (/^[0-9]{6}$/.test(code)) {
        const byCode = await db
          .collection('user_vouchers')
          .where({ short_code: code })
          .orderBy('created_at', 'desc')
          .limit(1)
          .get();
        if (byCode.data && byCode.data.length) voucherId = byCode.data[0]._id;
      }
    }
    if (!voucherId) {
      return fail('无效的券码或二维码', {});
    }

    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const burst = await db
      .collection('voucher_logs')
      .where({
        staff_id: staffId,
        created_at: _.gte(since)
      })
      .count();

    if (burst.total > RATE_MAX_IN_WINDOW) {
      return fail('操作过于频繁，请稍后再试', { voucher_id: voucherId });
    }

    const snap = await db.collection('user_vouchers').doc(voucherId).get();
    const row = snap.data;

    if (!row) {
      return fail('券不存在', { voucher_id: voucherId });
    }

    const tplSnap = await db
      .collection('voucher_templates')
      .doc(row.template_id)
      .get();
    const template = tplSnap.data || {};

    // 核销回执：把「中文活动名 + 面额」拼好回给店员，便于其在 POS 里手工登记入账
    // （我们与 POS 未打通，店员核销后需自行在 POS 记账，否则客人无法买单）。
    var couponValueFen = Number(row.value_fen) || 0;
    var couponValueYuan = Math.round(couponValueFen / 100);
    var couponName = template.name || '营销券';
    var couponType = template.type || '';
    var couponLabel = couponName + (
      couponType === 'cash' && couponValueYuan > 0
        ? '（' + couponValueYuan + '元现金券）'
        : (couponType === 'gift' ? '（赠菜券）' : '')
    );

    const rules = checkTemplateRules(template, {
      verifyStoreId: verifyStoreId,
      voucher_store_id: row.store_id,
      order_amount_fen: order_amount_fen,
      now: new Date()
    });
    if (!rules.ok) {
      return fail(rules.message, {
        voucher_user_id: row.user_id,
        voucher_id: voucherId,
        verify_store_id: verifyStoreId
      });
    }

    if (row.status === 'used') {
      // 已核销券再次报码：把核销日期+时间(及门店)回给店员，避免重复核销又能当场说清
      const redeemedAtText = formatRedeemTime(row.used_at);
      await logAnalytics(db, {
        user_id: row.user_id,
        action: 'verify_fail',
        metadata: { reason: 'already_used', voucher_id: voucherId, store_id: verifyStoreId, used_at: row.used_at }
      });
      return {
        success: false,
        message: '该券已于 ' + redeemedAtText + ' 核销，不可重复使用',
        already_redeemed: true,
        redeemed_at: row.used_at || null,
        redeemed_at_text: redeemedAtText,
        redeemed_store_id: row.store_id || '',
        short_code: row.short_code || '',
        value_fen: row.value_fen || 0,
        coupon_label: couponLabel,
        coupon_name: couponName,
        coupon_type: couponType
      };
    }

    if (row.status === 'expired') {
      return fail('券已失效', {
        voucher_user_id: row.user_id,
        voucher_id: voucherId,
        verify_store_id: verifyStoreId
      });
    }

    const nowMs = Date.now();
    const expMs = toDateMs(row.expire_at);
    if (expMs != null && expMs < nowMs) {
      await db
        .collection('user_vouchers')
        .doc(voucherId)
        .update({
          data: {
            status: 'expired',
            updated_at: db.serverDate()
          }
        })
        .catch(function () {});

      return fail('券已过期', {
        voucher_user_id: row.user_id,
        voucher_id: voucherId,
        verify_store_id: verifyStoreId
      });
    }

    if (row.status !== 'unused') {
      return fail('券状态异常', {
        voucher_user_id: row.user_id,
        voucher_id: voucherId,
        verify_store_id: verifyStoreId
      });
    }

    // 多次核销支持：max_uses>1 的券(如长期流失「2张/1码」)，每次核销 used_count+1，
    // 用满后才置 used。单次券(无 max_uses 或=1)走原逻辑，完全向后兼容。
    const maxUses = Math.max(1, Number(row.max_uses) || 1);
    const usedCount = Math.max(0, Number(row.used_count) || 0);
    const newUsedCount = usedCount + 1;
    const fullyConsumed = newUsedCount >= maxUses;

    let markUsed;
    if (maxUses > 1) {
      // 乐观锁带 used_count：并发核销同一码时只会有一方命中，避免超核
      markUsed = await db
        .collection('user_vouchers')
        .where({ _id: voucherId, status: 'unused', used_count: usedCount })
        .update({
          data: Object.assign(
            { used_count: _.inc(1), updated_at: db.serverDate() },
            fullyConsumed ? { status: 'used', used_at: db.serverDate() } : {}
          )
        });
    } else {
      markUsed = await db
        .collection('user_vouchers')
        .where({ _id: voucherId, status: 'unused' })
        .update({
          data: { status: 'used', used_at: db.serverDate(), updated_at: db.serverDate() }
        });
    }

    const updated =
      markUsed &&
      markUsed.stats &&
      markUsed.stats.updated;

    if (!updated) {
      return fail('该券已使用或正在核销中', {
        voucher_user_id: row.user_id,
        voucher_id: voucherId,
        verify_store_id: verifyStoreId
      });
    }

    await db.collection('voucher_logs').add({
      data: {
        voucher_id: voucherId,
        user_id: row.user_id,
        store_id: verifyStoreId,
        staff_id: staffId,
        action: 'verify',
        reverted: false,
        created_at: db.serverDate()
      }
    });

    await logAnalytics(db, {
      user_id: row.user_id,
      action: 'verify_success',
      metadata: {
        voucher_id: voucherId,
        staff_id: staffId,
        store_id: verifyStoreId,
        order_amount_fen: order_amount_fen != null ? order_amount_fen : null
      }
    });

    await onVerifySuccessUserSide(db, row.user_id);

    let userForSync = null;
    try {
      const udoc = await db.collection('users').doc(row.user_id).get();
      userForSync = udoc.data || null;
    } catch (e) {
      userForSync = null;
    }

    await syncHrmsGrowthEvent({
      event_type: 'coupon_redeemed',
      phone: userForSync && userForSync.phone,
      openid: userForSync && (userForSync.openid || userForSync._openid),
      store_id: verifyStoreId,
      // 归因：报码核销时入参不带 campaign_id，回退到券自带的活动号，保证核销能对回原始投放
      campaign_id: (event && event.campaign_id) || row.campaign_id || '',
      coupon_id: voucherId,
      order_id: row.order_id || '',
      amount_fen: order_amount_fen != null ? parseInt(order_amount_fen, 10) || 0 : 0,
      // 多次券：每次核销带 used_count 后缀，避免 HRMS 幂等去重把第2次核销吞掉
      idempotency_key: 'coupon_redeemed:' + voucherId + (maxUses > 1 ? ':' + newUsedCount : ''),
      metadata: {
        template_id: row.template_id,
        staff_id: staffId,
        // 短码 + 券额回传：HRMS 据此把「发送日志(按短码)」翻成已核销，并核算券成本
        short_code: row.short_code || '',
        coupon_value_fen: row.value_fen || 0,
        coupon_source: row.source || '',
        marketing_rule_id: row.marketing_rule_id || '',
        marketing_user_segment: row.marketing_user_segment || ''
      }
    }).catch(function (e) {
      console.warn('HRMS coupon_redeemed sync failed', e && e.message);
    });

    if (row.marketing_rule_id) {
      let revFen = parseInt(order_amount_fen, 10);
      if (isNaN(revFen) || revFen < 0) revFen = 0;
      if (revFen === 0 && template.type === 'cash' && template.value) {
        revFen = Number(template.value) || 0;
      }
      let seg = row.marketing_user_segment;
      if (!seg) {
        try {
          seg = await userLifecycle.resolveUserSegmentForUser(db, row.user_id);
        } catch (e0) {
          seg = 'prospect';
        }
      }
      const statStore = row.store_id != null ? String(row.store_id).trim() : '';
      try {
        await userLifecycle.bumpMarketingStatsUsed(
          db,
          _,
          row.marketing_rule_id,
          revFen,
          statStore,
          seg
        );
      } catch (ms) {
        console.warn('bumpMarketingStatsUsed', ms);
      }
    }

    try {
      const udoc = await db.collection('users').doc(row.user_id).get();
      const o = udoc.data && udoc.data.openid;
      if (o) {
        await userLifecycle.applyVisitIncrement30d(db, _, row.user_id, o);
        await userLifecycle.updateUserTags(db, _, row.user_id, { openid: o });
        await userLifecycle.updateUserScore(db, _, row.user_id);
      }
    } catch (ru) {
      console.warn('applyVisit/updateUserTags after verify', ru);
    }

    return {
      success: true,
      message: maxUses > 1 ? ('核销成功（第 ' + newUsedCount + '/' + maxUses + ' 次）') : '核销成功',
      remaining_uses: Math.max(0, maxUses - newUsedCount),
      // 店员据此在 POS 登记：活动中文名 + 面额（如「新客二次召回·21-60天（30元现金券）」）
      coupon_label: couponLabel,
      coupon_name: couponName,
      coupon_type: couponType,
      value_fen: couponValueFen,
      value_yuan: couponValueYuan,
      short_code: row.short_code || '',
      data: {
        voucher_id: voucherId,
        user_id: row.user_id,
        staff_id: staffId,
        store_id: verifyStoreId
      }
    };
  } catch (err) {
    console.error('verifyVoucher error:', err);
    await logAnalytics(db, {
      user_id: '',
      action: 'verify_fail',
      metadata: { err: err.message || String(err), voucher_id: voucherId }
    });
    return { success: false, message: err.message || '核销失败' };
  }
};
