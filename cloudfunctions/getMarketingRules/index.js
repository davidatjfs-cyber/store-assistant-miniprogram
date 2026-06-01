/**
 * 管理员获取 marketing_rules 列表 + 今日汇总 ROI（只读）
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

function shanghaiDateKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

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

function isDbCollectionMissingError(err) {
  const s = String((err && (err.message || err.errMsg)) || err || '');
  return (
    s.indexOf('-502005') !== -1 ||
    s.indexOf('not exist') !== -1 ||
    s.indexOf('ResourceNotFound') !== -1
  );
}

function pickTemplateId(doc) {
  if (!doc) return '';
  if (doc.action_config && doc.action_config.template_id) {
    return String(doc.action_config.template_id);
  }
  if (typeof doc.action_config === 'string') {
    return doc.action_config;
  }
  return '';
}

exports.main = async function (event, context) {
  const { OPENID } = cloud.getWXContext();
  const { store_id } = event || {};
  try {
    const staff = await getActiveStaffByOpenid(OPENID);
    const role = normalizeRole(staff);
    if (role !== 'admin' && role !== 'manager') {
      return { success: false, message: '无权限', rules: [] };
    }

    const today = shanghaiDateKey();
    let statsSnap;
    try {
      statsSnap = await db
        .collection('marketing_stats')
        .where({ date: today })
        .limit(1000)
        .get();
    } catch (e0) {
      if (isDbCollectionMissingError(e0)) {
        statsSnap = { data: [] };
      } else {
        throw e0;
      }
    }

    const aggByRule = {};
    for (let i = 0; i < statsSnap.data.length; i++) {
      const row = statsSnap.data[i];
      const rid = row.rule_id;
      if (!rid) continue;
      if (!aggByRule[rid]) {
        aggByRule[rid] = { issued_value_fen: 0, revenue_fen: 0 };
      }
      aggByRule[rid].issued_value_fen += row.issued_value || 0;
      aggByRule[rid].revenue_fen += row.revenue || 0;
    }

    let rulesWhere = {};
    if (store_id) {
      rulesWhere.store_id = store_id;
    }
    const rulesSnap = await db.collection('marketing_rules').where(rulesWhere).limit(200).get();
    const templateIds = [];
    const seenTemplateIds = {};
    for (let i0 = 0; i0 < rulesSnap.data.length; i0++) {
      const tid = pickTemplateId(rulesSnap.data[i0]);
      if (tid && !seenTemplateIds[tid]) {
        seenTemplateIds[tid] = true;
        templateIds.push(tid);
      }
    }
    const templateNameById = {};
    if (templateIds.length) {
      const templateSnap = await db
        .collection('voucher_templates')
        .where({ _id: _.in(templateIds.slice(0, 100)) })
        .limit(100)
        .get()
        .catch(function () { return { data: [] }; });
      for (let t = 0; t < templateSnap.data.length; t++) {
        const tpl = templateSnap.data[t];
        templateNameById[tpl._id] = tpl.name || tpl.template_name || '';
      }
    }
    const rules = [];
    for (let j = 0; j < rulesSnap.data.length; j++) {
      const doc = rulesSnap.data[j];
      const id = doc._id;
      const agg = aggByRule[id] || { issued_value_fen: 0, revenue_fen: 0 };
      const roi =
        agg.issued_value_fen > 0 ? agg.revenue_fen / agg.issued_value_fen : null;
      const templateId = pickTemplateId(doc);
      rules.push({
        rule_id: id,
        name: doc.name || '',
        active: !!doc.active,
        priority: doc.priority != null ? doc.priority : 0,
        roi: roi,
        store_id: doc.store_id || '',
        trigger_type: doc.trigger_type || '',
        action_type: doc.action_type || '',
        template_id: templateId,
        template_name: templateNameById[templateId] || '',
        target_tags: doc.target_tags || [],
        trigger_value: doc.trigger_value != null ? String(doc.trigger_value) : '',
        daily_user_limit: doc.daily_user_limit != null ? doc.daily_user_limit : null,
        global_daily_limit: doc.global_daily_limit != null ? doc.global_daily_limit : null
      });
    }

    rules.sort(function (a, b) {
      if (b.priority !== a.priority) return (b.priority || 0) - (a.priority || 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
    });

    return { success: true, rules: rules, date: today };
  } catch (err) {
    console.error('getMarketingRules', err);
    return { success: false, message: err.message || String(err), rules: [] };
  }
};
