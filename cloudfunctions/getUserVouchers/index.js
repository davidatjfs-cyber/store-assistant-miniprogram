// 获取当前用户的 user_vouchers：openid → users._id → user_vouchers
const cloud = require('wx-server-sdk');
const { resolveUserIdFromOpenid } = require('./helpers');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { status } = event || {};

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

    const res = await db
      .collection('user_vouchers')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .get();

    let rows = res.data;
    if (status && typeof status === 'string') {
      rows = rows.filter(function (r) {
        return r.status === status;
      });
    }

    const templateCache = {};
    const list = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tid = row.template_id;
      if (tid && !templateCache[tid]) {
        try {
          const tdoc = await db.collection('voucher_templates').doc(tid).get();
          templateCache[tid] = tdoc.data || null;
        } catch (e) {
          templateCache[tid] = null;
        }
      }
      list.push({
        ...row,
        template: templateCache[tid] || null
      });
    }

    return { success: true, data: list };
  } catch (err) {
    console.error('getUserVouchers error:', err);
    return { success: false, message: err.message || '查询失败', data: [] };
  }
};
