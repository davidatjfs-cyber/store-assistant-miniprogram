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

var VALID_TRIGGER_TYPES = ['payment', 'inactivity', 'manual'];
var VALID_ACTION_TYPES = ['send_voucher'];
var VALID_TARGET_TAGS = ['new', 'vip', 'frequent', 'inactive', 'high_value', 'low_value', 'general'];

exports.main = async function (event) {
  const { OPENID } = cloud.getWXContext();
  const staff = await getActiveStaffByOpenid(OPENID);
  if (normalizeRole(staff) !== 'admin') {
    return { success: false, message: '仅管理员可创建规则' };
  }

  const name = String(event.name || '').trim();
  const storeIds = event.store_ids;
  const priority = parseInt(event.priority, 10);
  const active = event.active !== false;
  const triggerType = String(event.trigger_type || 'payment').trim();
  const actionType = String(event.action_type || 'send_voucher').trim();
  const templateId = String(event.template_id || '').trim();
  const targetTags = event.target_tags; // string[] or string
  const triggerValue = String(event.trigger_value || '').trim();
  const dailyUserLimit = parseInt(event.daily_user_limit, 10);
  const globalDailyLimit = parseInt(event.global_daily_limit, 10);

  if (!name) {
    return { success: false, message: '规则名称不能为空' };
  }
  if (VALID_TRIGGER_TYPES.indexOf(triggerType) < 0) {
    return { success: false, message: '无效的触发类型，可选: ' + VALID_TRIGGER_TYPES.join('/') };
  }
  if (VALID_ACTION_TYPES.indexOf(actionType) < 0) {
    return { success: false, message: '无效的动作类型，可选: ' + VALID_ACTION_TYPES.join('/') };
  }
  if (actionType === 'send_voucher' && !templateId) {
    return { success: false, message: '发券动作必须指定关联券模板' };
  }

  var targetStoreIds = [];
  if (Array.isArray(storeIds)) {
    targetStoreIds = storeIds.filter(function(s) { return !!s; });
  } else if (storeIds && typeof storeIds === 'string') {
    targetStoreIds = [storeIds];
  }
  if (targetStoreIds.length === 0) {
    return { success: false, message: '至少选择一个门店' };
  }

  var normalizedTags = [];
  if (Array.isArray(targetTags)) {
    normalizedTags = targetTags.filter(function(t) { return VALID_TARGET_TAGS.indexOf(t) >= 0; });
  } else if (targetTags && typeof targetTags === 'string' && targetTags) {
    normalizedTags = [targetTags].filter(function(t) { return VALID_TARGET_TAGS.indexOf(t) >= 0; });
  }

  var p = isNaN(priority) ? 0 : priority;
  var actionConfig = { template_id: templateId };

  var results = [];
  for (var i = 0; i < targetStoreIds.length; i++) {
    var sid = targetStoreIds[i];
    try {
      var added = await db.collection('marketing_rules').add({
        data: {
          name: name,
          store_id: sid,
          active: active,
          priority: p,
          trigger_type: triggerType,
          action_type: actionType,
          action_config: actionConfig,
          target_tags: normalizedTags,
          trigger_value: triggerValue,
          daily_user_limit: isNaN(dailyUserLimit) ? null : dailyUserLimit,
          global_daily_limit: isNaN(globalDailyLimit) ? null : globalDailyLimit,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
      results.push({ store_id: sid, id: added._id, status: 'created' });
    } catch (e) {
      results.push({ store_id: sid, status: 'error', reason: e.message });
    }
  }

  return { success: true, results: results };
};