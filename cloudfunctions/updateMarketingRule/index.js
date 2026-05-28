/**
 * 更新营销规则（仅 admin）；仅允许白名单字段
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

async function getActiveStaffByOpenid(openid) {
  if (!openid) return null;
  const r = await db
    .collection('staff')
    .where({ openid: openid, active: true })
    .limit(1)
    .get();
  return r.data.length ? r.data[0] : null;
}

function normalizeRole(row) {
  if (!row) return null;
  let role = String(row.role || 'staff').toLowerCase();
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
    role = 'staff';
  }
  return role;
}

exports.main = async function (event, context) {
  const { OPENID } = cloud.getWXContext();
  const ruleId = event && event.rule_id != null ? String(event.rule_id).trim() : '';
  const updateFields = event && event.update_fields && typeof event.update_fields === 'object'
    ? event.update_fields
    : {};

  if (!ruleId) {
    return { success: false, message: '缺少 rule_id' };
  }

  try {
    const staff = await getActiveStaffByOpenid(OPENID);
    if (normalizeRole(staff) !== 'admin') {
      return { success: false, message: '无权限' };
    }

    const allowedKeys = { active: 1, priority: 1, trigger_value: 1, daily_user_limit: 1, global_daily_limit: 1 };
    const data = {};
    if (Object.prototype.hasOwnProperty.call(updateFields, 'active')) {
      data.active = !!updateFields.active;
    }
    if (Object.prototype.hasOwnProperty.call(updateFields, 'priority')) {
      const p = parseInt(updateFields.priority, 10);
      if (Number.isNaN(p) || p < 0 || p > 999999) {
        return { success: false, message: 'priority 无效' };
      }
      data.priority = p;
    }
    if (Object.prototype.hasOwnProperty.call(updateFields, 'trigger_value')) {
      data.trigger_value = String(updateFields.trigger_value).trim();
    }
    if (Object.prototype.hasOwnProperty.call(updateFields, 'daily_user_limit')) {
      const d = parseInt(updateFields.daily_user_limit, 10);
      data.daily_user_limit = isNaN(d) || d < 0 ? null : d;
    }
    if (Object.prototype.hasOwnProperty.call(updateFields, 'global_daily_limit')) {
      const g = parseInt(updateFields.global_daily_limit, 10);
      data.global_daily_limit = isNaN(g) || g < 0 ? null : g;
    }

    if (Object.keys(data).length === 0) {
      return { success: false, message: '无合法更新字段' };
    }

    data.updated_at = db.serverDate();

    await db.collection('marketing_rules').doc(ruleId).update({ data: data });

    return { success: true };
  } catch (err) {
    console.error('updateMarketingRule', err);
    const msg = err.message || String(err);
    if (msg.indexOf('cannot find document') !== -1 || msg.indexOf('不存在') !== -1) {
      return { success: false, message: '规则不存在' };
    }
    return { success: false, message: msg };
  }
};
