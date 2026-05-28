const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getActiveStaffByOpenid(openid) {
  if (!openid) return null;
  const r = await db.collection('staff').where({ openid: openid, active: true }).limit(1).get();
  return r.data.length ? r.data[0] : null;
}

function normalizeRole(row) {
  if (!row) return null;
  let role = String(row.role || 'staff').toLowerCase();
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') role = 'staff';
  return role;
}

exports.main = async function (event) {
  const { OPENID } = cloud.getWXContext();
  const ruleId = event && event.rule_id ? String(event.rule_id).trim() : '';

  if (!ruleId) {
    return { success: false, message: '缺少 rule_id' };
  }

  const staff = await getActiveStaffByOpenid(OPENID);
  if (normalizeRole(staff) !== 'admin') {
    return { success: false, message: '仅管理员可删除规则' };
  }

  try {
    await db.collection('marketing_rules').doc(ruleId).remove();
    return { success: true };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.indexOf('cannot find document') !== -1 || msg.indexOf('不存在') !== -1) {
      return { success: false, message: '规则不存在' };
    }
    return { success: false, message: msg };
  }
};