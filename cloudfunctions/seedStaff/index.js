/**
 * 种子云函数：批量写入 staff 集合（幂等 upsert）
 *
 * 用法：
 *   wx.cloud.callFunction({
 *     name: 'seedStaff',
 *     data: {
 *       confirm: 'CONFIRM_SEED_STAFF',
 *       staff: [
 *         { phone: '13800000001', name: '张三', role: 'admin',  store_id: '' },
 *         { phone: '13800000002', name: '李四', role: 'manager', store_id: '51866138' },
 *         { phone: '13800000003', name: '王五', role: 'staff',   store_id: '51866138' },
 *         { phone: '13800000004', name: '赵六', role: 'staff',   store_id: '64822111' }
 *       ]
 *     }
 *   })
 *
 * role 值：admin（总部）| manager（店长）| staff（员工）
 * store_id：马己仙 51866138，洪潮 64822111，admin 可留空
 *
 * 前提：staff 对应的手机号用户必须已打开过小程序并授权过手机号（users 集合中有记录）。
 * 若未找到对应 openid，会跳过该条并返回警告。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  if (event.confirm !== 'CONFIRM_SEED_STAFF') {
    return { success: false, message: '请传入 confirm: "CONFIRM_SEED_STAFF" 以确认执行' };
  }

  const staffList = event.staff;
  if (!Array.isArray(staffList) || staffList.length === 0) {
    return { success: false, message: 'staff 数组不能为空' };
  }

  const results = [];
  const validRoles = ['admin', 'manager', 'staff'];

  for (const s of staffList) {
    const phone = String(s.phone || '').trim();
    const name = String(s.name || '').trim();
    const role = String(s.role || 'staff').trim();
    const storeId = String(s.store_id || '').trim();

    if (!phone || !name) {
      results.push({ phone, name, status: 'skipped', reason: 'phone 或 name 为空' });
      continue;
    }
    if (!validRoles.includes(role)) {
      results.push({ phone, name, status: 'skipped', reason: `无效角色: ${role}，可选: ${validRoles.join('/')}` });
      continue;
    }

    // 从 users 集合查找对应 openid
    let openid = '';
    try {
      const userRes = await db.collection('users').where({ phone }).limit(1).get();
      if (userRes.data && userRes.data.length > 0) {
        openid = userRes.data[0].openid;
      }
    } catch (e) {
      // users 集合可能不存在，继续
    }

    if (!openid) {
      results.push({ phone, name, role, status: 'skipped', reason: '未在 users 中找到该手机号，请先让该员工打开小程序授权' });
      continue;
    }

    // upsert：按 openid 去重
    try {
      const existing = await db.collection('staff').where({ openid }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        // 已存在 → 更新
        await db.collection('staff').doc(existing.data[0]._id).update({
          data: {
            name,
            role,
            store_id: storeId,
            active: true,
            updated_at: db.serverDate()
          }
        });
        results.push({ phone, name, role, store_id: storeId, status: 'updated', openid });
      } else {
        // 不存在 → 新增
        await db.collection('staff').add({
          data: {
            openid,
            name,
            role,
            store_id: storeId,
            active: true,
            created_at: db.serverDate()
          }
        });
        results.push({ phone, name, role, store_id: storeId, status: 'created', openid });
      }
    } catch (e) {
      results.push({ phone, name, role, status: 'error', reason: e.message });
    }
  }

  return {
    success: true,
    total: staffList.length,
    created: results.filter(r => r.status === 'created').length,
    updated: results.filter(r => r.status === 'updated').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    details: results
  };
};
