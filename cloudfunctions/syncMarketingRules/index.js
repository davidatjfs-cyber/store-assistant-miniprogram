// 定时执行器(每2分钟)：从 HRMS 拉取「支付后发券规则」配置 → upsert 到 marketing_rules 集合。
// 配置权集中在 HRMS；本函数只把 HRMS 的规则镜像到小程序，供 paymentCallback→runMarketingEngine 实时执行。
// 以 hrms_rule_key 作为 join key；HRMS 侧停用/删除的规则会在小程序侧同步移除。
const cloud = require('wx-server-sdk');
const { getPaymentRules } = require('./hrmsClient');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function buildDoc(rule) {
  return {
    name: String(rule.name || ''),
    store_id: String(rule.store_id || ''),
    active: true,
    priority: Number(rule.priority) || 0,
    trigger_type: 'payment',
    action_type: 'send_voucher',
    action_config: { template_id: String((rule.action_config && rule.action_config.template_id) || '') },
    target_tags: Array.isArray(rule.target_tags) ? rule.target_tags : [],
    trigger_value: rule.trigger_value == null ? '' : String(rule.trigger_value),
    daily_user_limit: rule.daily_user_limit == null ? null : Number(rule.daily_user_limit),
    global_daily_limit: rule.global_daily_limit == null ? null : Number(rule.global_daily_limit),
    hrms_rule_key: String(rule.rule_key || ''),
    hrms_managed: true
  };
}

exports.main = async () => {
  const resp = await getPaymentRules();
  if (!resp.ok) {
    return { success: false, message: 'hrms_pull_failed', error: resp.error || ('http_' + resp.statusCode) };
  }
  const body = resp.body || {};
  const rules = Array.isArray(body.rules) ? body.rules : [];
  const activeKeys = new Set(rules.map(r => String(r.rule_key || '')).filter(Boolean));

  let created = 0, updated = 0, removed = 0;

  // upsert 每条有效规则
  for (const rule of rules) {
    const key = String(rule.rule_key || '');
    if (!key) continue;
    const doc = buildDoc(rule);
    const existing = await db.collection('marketing_rules').where({ hrms_rule_key: key }).limit(1).get();
    if (existing.data && existing.data.length) {
      doc.updated_at = db.serverDate();
      await db.collection('marketing_rules').doc(existing.data[0]._id).update({ data: doc });
      updated++;
    } else {
      doc.created_at = db.serverDate();
      doc.updated_at = db.serverDate();
      await db.collection('marketing_rules').add({ data: doc });
      created++;
    }
  }

  // 清理：HRMS 已停用/删除的受管规则（有 hrms_rule_key 但不在有效集合内）
  const managed = await db.collection('marketing_rules').where({ hrms_rule_key: _.exists(true) }).limit(500).get();
  for (const row of (managed.data || [])) {
    const key = String(row.hrms_rule_key || '');
    if (key && !activeKeys.has(key)) {
      await db.collection('marketing_rules').doc(row._id).remove();
      removed++;
    }
  }

  return { success: true, created, updated, removed, total_active: rules.length };
};
