// 获取当前用户的 user_vouchers：openid → users._id → user_vouchers
const cloud = require('wx-server-sdk');
const { resolveUserIdFromOpenid } = require('./helpers');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

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
      let templateData = null;
      if (row.template_id) {
        try {
          const tdoc = await db.collection('voucher_templates').doc(row.template_id).get();
          templateData = tdoc.data || null;
        } catch (e) {
          templateData = null;
        }
      }

      return { success: true, data: { ...row, template: templateData } };
    }

    const whereCondition = { user_id: userId, status: 'active' };
    if (store_id) {
      whereCondition.store_id = store_id;
    }

    const res = await db
      .collection('user_vouchers')
      .where(whereCondition)
      .orderBy('created_at', 'desc')
      .get();

    let rows = res.data;

    var now = new Date();
    var expiredIds = [];
    rows = rows.filter(function(row) {
      if (row.expire_at) {
        var exp = row.expire_at instanceof Date ? row.expire_at : new Date(row.expire_at);
        if (!isNaN(exp.getTime()) && exp < now) {
          expiredIds.push(row._id);
          return false;
        }
      }
      return true;
    });

    if (expiredIds.length > 0) {
      try {
        for (var ei = 0; ei < expiredIds.length; ei++) {
          await db.collection('user_vouchers').doc(expiredIds[ei]).update({
            data: { status: 'expired', updated_at: db.serverDate() }
          });
        }
      } catch(e) {}
    }

    const templateIds = [...new Set(rows.map(r => r.template_id).filter(Boolean))];
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

    const list = rows.map(row => ({
      ...row,
      template: templateCache[row.template_id] || null
    }));

    return { success: true, data: list };
  } catch (err) {
    console.error('getUserVouchers error:', err);
    return { success: false, message: err.message || '查询失败', data: [] };
  }
};
