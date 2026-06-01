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

  const voucherId = parseVoucherId(qr_code);
  if (!voucherId) {
    return fail('无效的二维码', {});
  }

  try {
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
      return fail('该券已使用', {
        voucher_user_id: row.user_id,
        voucher_id: voucherId,
        verify_store_id: verifyStoreId
      });
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

    const markUsed = await db
      .collection('user_vouchers')
      .where({
        _id: voucherId,
        status: 'unused'
      })
      .update({
        data: {
          status: 'used',
          used_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });

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
      campaign_id: event && event.campaign_id || '',
      coupon_id: voucherId,
      order_id: row.order_id || '',
      amount_fen: order_amount_fen != null ? parseInt(order_amount_fen, 10) || 0 : 0,
      idempotency_key: 'coupon_redeemed:' + voucherId,
      metadata: {
        template_id: row.template_id,
        staff_id: staffId,
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
      message: '核销成功',
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
