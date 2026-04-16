/**
 * 一次性迁移：将 user_vouchers.user_id 从旧版（openid 字符串）迁到 users._id
 * 调用：wx.cloud.callFunction({ name: 'migrateUsers', data: { confirm: 'CONFIRM_MIGRATE_USER_VOUCHERS', limit: 200, skip: 0 } })
 * 可多次执行直至返回 migratedVouchers: 0
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { confirm, limit = 200, skip = 0 } = event || {};

  if (confirm !== 'CONFIRM_MIGRATE_USER_VOUCHERS') {
    return {
      success: false,
      message: '缺少 confirm: CONFIRM_MIGRATE_USER_VOUCHERS，已拒绝执行'
    };
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const sk = Math.max(parseInt(skip, 10) || 0, 0);

  try {
    const snap = await db
      .collection('user_vouchers')
      .skip(sk)
      .limit(lim)
      .get();

    let migratedVouchers = 0;
    const touchedOpenids = new Map();

    for (let i = 0; i < snap.data.length; i++) {
      const row = snap.data[i];
      const uid = row.user_id;
      if (!uid || typeof uid !== 'string') continue;

      const existingUserById = await db
        .collection('users')
        .doc(uid)
        .get()
        .catch(function () {
          return { data: null };
        });

      if (existingUserById && existingUserById.data) {
        continue;
      }

      let newUsersId = touchedOpenids.get(uid);
      if (!newUsersId) {
        const byOpenid = await db
          .collection('users')
          .where({ openid: uid })
          .limit(1)
          .get();

        if (byOpenid.data.length) {
          newUsersId = byOpenid.data[0]._id;
        } else {
          const add = await db.collection('users').add({
            data: {
              openid: uid,
              external_userid: '',
              phone: '',
              created_at: db.serverDate(),
              updated_at: db.serverDate()
            }
          });
          newUsersId = add._id;
        }
        touchedOpenids.set(uid, newUsersId);
      }

      await db
        .collection('user_vouchers')
        .doc(row._id)
        .update({
          data: {
            user_id: newUsersId,
            updated_at: db.serverDate()
          }
        });
      migratedVouchers++;
    }

    return {
      success: true,
      message: '本批次完成',
      data: {
        skip: sk,
        limit: lim,
        scanned: snap.data.length,
        migratedVouchers: migratedVouchers,
        distinctOpenidsTouched: touchedOpenids.size,
        nextSkip: sk + snap.data.length
      }
    };
  } catch (err) {
    console.error('migrateUsers', err);
    return { success: false, message: err.message || '迁移失败' };
  }
};
