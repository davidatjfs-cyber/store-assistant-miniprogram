// 根据 OPENID 查 staff 表，active=true 有效；返回统一角色结构（小程序权限以此为准）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function normalizeRole(row) {
  if (!row) return null;
  let role = String(row.role || 'staff').toLowerCase();
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
    role = 'staff';
  }
  return role;
}

function pickStoreId(row) {
  if (!row) return '';
  const v =
    row.store_id != null && String(row.store_id).trim()
      ? row.store_id
      : row.storeId != null
        ? row.storeId
        : '';
  return String(v).trim();
}

/** 仅在调试绑 staff 时使用：小程序 Console 里 callFunction 传 include_caller_openid: true */
function attachCallerOpenid(event, openid, payload) {
  if (!event || event.include_caller_openid !== true || !openid) {
    return payload;
  }
  return Object.assign({}, payload, { caller_openid: openid });
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const empty = {
    success: true,
    is_staff: false,
    role: null,
    store_id: ''
  };

  if (!OPENID) {
    return attachCallerOpenid(event, '', Object.assign({}, empty, { success: false }));
  }

  try {
    const r = await db
      .collection('staff')
      .where({ openid: OPENID, active: true })
      .limit(1)
      .get();

    const row = r.data.length ? r.data[0] : null;
    if (!row) {
      return attachCallerOpenid(event, OPENID, empty);
    }

    const role = normalizeRole(row);
    return attachCallerOpenid(event, OPENID, {
      success: true,
      is_staff: true,
      role: role,
      store_id: pickStoreId(row),
      // 兼容旧版小程序：完整行仍放在 data
      data: row
    });
  } catch (err) {
    console.error('getStaffProfile', err);
    return attachCallerOpenid(event, OPENID, {
      success: false,
      is_staff: false,
      role: null,
      store_id: '',
      message: err.message,
      data: null
    });
  }
};
