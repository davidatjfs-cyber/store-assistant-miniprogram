// 撤销核销：仅 manager，10 分钟内，券恢复 unused，核销日志标记 reverted
const cloud = require('wx-server-sdk');
const { logAnalytics, findActiveStaff } = require('./helpers');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const TEN_MIN_MS = 10 * 60 * 1000;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { voucher_id } = event || {};

  if (!OPENID) {
    return { success: false, message: '未登录' };
  }
  if (!voucher_id || typeof voucher_id !== 'string') {
    return { success: false, message: '缺少 voucher_id' };
  }

  const staff = await findActiveStaff(db, OPENID);
  if (!staff || staff.role !== 'manager') {
    return { success: false, message: '仅店长/管理员可撤销核销' };
  }

  // 检查店长是否属于同一个门店
  const staffStoreId = String(staff.store_id || staff.storeId || '').trim();

  try {
    const vdoc = await db.collection('user_vouchers').doc(voucher_id).get();
    const v = vdoc.data;
    if (!v) {
      return { success: false, message: '券不存在' };
    }
    if (v.status !== 'used') {
      return { success: false, message: '仅已核销的券可撤销' };
    }
    if (staffStoreId && v.store_id && String(v.store_id).trim() !== staffStoreId) {
      return { success: false, message: '仅可撤销本门店的券' };
    }

    const usedMs = v.used_at ? new Date(v.used_at).getTime() : 0;
    if (!usedMs || Date.now() - usedMs > TEN_MIN_MS) {
      return { success: false, message: '超出可撤销时间（10 分钟）' };
    }

    const upd = await db
      .collection('user_vouchers')
      .where({
        _id: voucher_id,
        status: 'used'
      })
      .update({
        data: {
          status: 'unused',
          used_at: _.remove(),
          updated_at: db.serverDate()
        }
      });

    if (!upd || !upd.stats || !upd.stats.updated) {
      return { success: false, message: '撤销失败，券状态已变化' };
    }

    const logs = await db
      .collection('voucher_logs')
      .where({ voucher_id: voucher_id, action: 'verify' })
      .orderBy('created_at', 'desc')
      .limit(20)
      .get();

    const target = logs.data.find(function (row) {
      return !row.reverted;
    });

    if (target && target._id) {
      await db
        .collection('voucher_logs')
        .doc(target._id)
        .update({
          data: {
            reverted: true,
            reverted_at: db.serverDate(),
            reverted_by_staff_id: staff._id
          }
        });
    }

    await logAnalytics(db, {
      user_id: v.user_id,
      action: 'verify_reverted',
      metadata: {
        voucher_id: voucher_id,
        manager_staff_id: staff._id,
        log_id: target ? target._id : null
      }
    });

    return { success: true, message: '已撤销核销' };
  } catch (err) {
    console.error('revertVoucher', err);
    return { success: false, message: err.message || '撤销失败' };
  }
};
