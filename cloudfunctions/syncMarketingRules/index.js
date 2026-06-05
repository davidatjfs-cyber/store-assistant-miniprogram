// 定时执行器(每2分钟)：从 HRMS 拉取「支付后发券规则」配置 → upsert 到 marketing_rules 集合。
// 配置权集中在 HRMS；本函数只把 HRMS 的规则镜像到小程序，供 paymentCallback→runMarketingEngine 实时执行。
// 以 hrms_rule_key 作为 join key；HRMS 侧停用/删除的规则会在小程序侧同步移除。
//
// 稳健性保护：
//  1) 空列表保护：HRMS 返回 0 条有效规则时视为可疑，跳过镜像清理，避免接口瞬时异常误删全部规则导致发券停摆。
//  2) 失败告警：连续拉取失败达阈值、或触发空列表保护时，写入 system_alerts（与 monitorSystem 同一告警管道）。
const cloud = require('wx-server-sdk');
const { getPaymentRules } = require('./hrmsClient');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const HEALTH_KEY = 'payment_rules';
const FAILURE_ALERT_THRESHOLD = 3; // 连续失败 3 次（≈6 分钟）后告警

function shanghaiDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

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

// 集合不会被 .add 自动创建，首次写入前确保存在（已存在则忽略报错）
async function ensureCollection(name) {
  try { await db.createCollection(name); } catch (e) { /* already exists */ }
}

// ---- 健康状态（连续失败计数 + 最近成功时间）----
async function loadHealth() {
  try {
    const r = await db.collection('marketing_sync_health').where({ key: HEALTH_KEY }).limit(1).get();
    return r.data && r.data[0] ? r.data[0] : null;
  } catch (e) {
    return null; // 集合不存在等情况，按无记录处理
  }
}

async function writeHealth(existing, fields) {
  const data = Object.assign({ updated_at: db.serverDate() }, fields);
  if (existing && existing._id) {
    await db.collection('marketing_sync_health').doc(existing._id).update({ data: data });
  } else {
    await ensureCollection('marketing_sync_health');
    await db.collection('marketing_sync_health').add({
      data: Object.assign({ key: HEALTH_KEY, created_at: db.serverDate() }, data)
    });
  }
}

async function recordFailure(errMsg) {
  const h = await loadHealth();
  const n = ((h && h.consecutive_failures) || 0) + 1;
  await writeHealth(h, { consecutive_failures: n, last_error: String(errMsg || ''), last_fail_at: db.serverDate() });
  return n;
}

async function recordSuccess(total) {
  const h = await loadHealth();
  await writeHealth(h, { consecutive_failures: 0, last_error: '', last_ok_at: db.serverDate(), last_total_active: total });
}

// ---- 告警：写入 system_alerts（每日同 type 去重，沿用 monitorSystem 约定）----
async function insertAlert(type, message, metadata) {
  const day = shanghaiDateString();
  try {
    const dup = await db.collection('system_alerts').where({ type: type, alert_date: day }).limit(1).get();
    if (dup.data && dup.data.length) return false;
  } catch (e) {
    // 集合不存在 → 继续 add 创建
  }
  await ensureCollection('system_alerts');
  await db.collection('system_alerts').add({
    data: {
      type: type,
      alert_date: day,
      severity: 'critical',
      notified: false,
      message: message,
      metadata: metadata || {},
      created_at: db.serverDate()
    }
  });
  return true;
}

exports.main = async () => {
  const resp = await getPaymentRules();

  // 1) 拉取失败：累加失败计数，达阈值告警，本轮不做任何写入/清理
  if (!resp.ok) {
    const err = resp.error || ('http_' + resp.statusCode);
    const failures = await recordFailure(err);
    if (failures >= FAILURE_ALERT_THRESHOLD) {
      await insertAlert(
        'marketing_sync_fail',
        '支付发券规则同步连续失败 ' + failures + ' 次，HRMS 规则可能未同步到小程序',
        { consecutive_failures: failures, last_error: err }
      );
    }
    return { success: false, message: 'hrms_pull_failed', error: err, consecutive_failures: failures };
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

  // 2) 空列表保护：拉到 0 条有效规则时视为可疑，跳过清理并告警（防止接口瞬时异常误删全部镜像）。
  //    若确为「全部规则停用」的预期操作，请在 HRMS 确认后手动处理对应镜像。
  let cleanupSkipped = false;
  if (activeKeys.size === 0) {
    cleanupSkipped = true;
    await insertAlert(
      'marketing_sync_empty',
      'HRMS 返回 0 条有效支付发券规则，已跳过镜像清理以防误删；若非有意停用全部规则请尽快核查',
      { managed_kept: true }
    );
  } else {
    // 清理：HRMS 已停用/删除的受管规则（有 hrms_rule_key 但不在有效集合内）
    const managed = await db.collection('marketing_rules').where({ hrms_rule_key: _.exists(true) }).limit(500).get();
    for (const row of (managed.data || [])) {
      const key = String(row.hrms_rule_key || '');
      if (key && !activeKeys.has(key)) {
        await db.collection('marketing_rules').doc(row._id).remove();
        removed++;
      }
    }
  }

  await recordSuccess(rules.length);

  return { success: true, created, updated, removed, total_active: rules.length, cleanup_skipped: cleanupSkipped };
};
