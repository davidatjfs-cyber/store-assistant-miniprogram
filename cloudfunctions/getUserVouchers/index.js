// 获取当前用户的 user_vouchers：openid → users._id → user_vouchers
const cloud = require('wx-server-sdk');
const { resolveUserIdFromOpenid, normalizeVoucherRowForClient } = require('./helpers');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { status, voucherId, store_id } = event || {};

  if (!OPENID) {
    return { success: false, message: '未登录', data: [] };
  }

  try {
    const userId = await resolveUserIdFromOpenid(db, OPENID);
    if (!userId) {
      return {
        success: true,
        data: [],
        message: '暂无用户档案，请先完成手机号授权或下单'
      };
    }

    if (voucherId) {
      const singleRes = await db
        .collection('user_vouchers')
        .doc(voucherId)
        .get();

      if (!singleRes.data) {
        return { success: true, data: [] };
      }

      const row = singleRes.data;
      if (row.user_id !== userId && row._openid !== OPENID) {
        return { success: true, data: [] };
      }

      const normalizedSingle = normalizeVoucherRowForClient(row, { now: new Date() });
      if (Object.keys(normalizedSingle.patch).length > 0) {
        normalizedSingle.patch.updated_at = db.serverDate();
        await db.collection('user_vouchers').doc(voucherId).update({
          data: normalizedSingle.patch
        }).catch(function () {});
      }

      let templateData = null;
      if (normalizedSingle.row.template_id) {
        try {
          const tdoc = await db.collection('voucher_templates').doc(normalizedSingle.row.template_id).get();
          templateData = tdoc.data || null;
        } catch (e) {
          templateData = null;
        }
      }

      return { success: true, data: { ...normalizedSingle.row, template: templateData } };
    }

    const whereCondition = {
      user_id: userId,
      status: _.in(['active', 'unused', 'used', 'expired'])
    };
    if (store_id) {
      whereCondition.store_id = store_id;
    }

    const res = await db
      .collection('user_vouchers')
      .where(whereCondition)
      .orderBy('created_at', 'desc')
      .get();

    var now = new Date();
    const normalizedRows = [];
    const repairQueue = [];
    for (let i = 0; i < res.data.length; i++) {
      const normalized = normalizeVoucherRowForClient(res.data[i], { now: now });
      normalizedRows.push(normalized.row);
      if (Object.keys(normalized.patch).length > 0 && normalized.row._id) {
        repairQueue.push({
          id: normalized.row._id,
          patch: Object.assign({}, normalized.patch, { updated_at: db.serverDate() })
        });
      }
    }

    if (repairQueue.length > 0) {
      for (let ri = 0; ri < repairQueue.length; ri++) {
        await db.collection('user_vouchers').doc(repairQueue[ri].id).update({
          data: repairQueue[ri].patch
        }).catch(function () {});
      }
    }

    const templateIds = [...new Set(normalizedRows.map(r => r.template_id).filter(Boolean))];
    const templateCache = {};
    if (templateIds.length > 0) {
      const templateRes = await db
        .collection('voucher_templates')
        .where({ _id: db.command.in(templateIds) })
        .get();
      for (const t of templateRes.data) {
        templateCache[t._id] = t;
      }
    }

    const list = normalizedRows.map(row => ({
      ...row,
      template: templateCache[row.template_id] || null
    }));

    return { success: true, data: list };
  } catch (err) {
    console.error('getUserVouchers error:', err);
    return { success: false, message: err.message || '查询失败', data: [] };
  }
};
