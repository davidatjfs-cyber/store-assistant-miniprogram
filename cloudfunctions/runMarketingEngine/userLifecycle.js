/**
 * 30d 指标（增量 + 日切全量兜底）、user_tags 统一覆盖、营销统计 cost/roi、触达频控
 * paymentCallback / verifyVoucher 目录下同名文件请保持与本文件一致
 */
const THIRTY_MS = 30 * 24 * 60 * 60 * 1000;

const MANAGED_USER_TAGS = [
  'vip',
  'frequent',
  'low_value',
  'inactive',
  'new',
  'high_value',
  'general'
];

let _inactivityRulesCache = { at: 0, rules: [] };
const INACTIVITY_RULES_TTL_MS = 120000;

function shanghaiDateKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function isDbCollectionMissingError(err) {
  const s = String((err && (err.message || err.errMsg)) || err || '');
  return (
    s.indexOf('-502005') !== -1 ||
    s.indexOf('not exist') !== -1 ||
    s.indexOf('ResourceNotFound') !== -1
  );
}

function parseDaysFromTriggerValue(v) {
  if (v == null || v === '') return 7;
  if (typeof v === 'number' && !isNaN(v)) {
    return Math.min(Math.max(v, 1), 365);
  }
  const m = String(v).match(/(\d+)/);
  return m ? Math.min(Math.max(parseInt(m[1], 10), 1), 365) : 7;
}

function userQualifiesInactivity(user, days) {
  const cutoff = Date.now() - days * 86400000;
  const created = user.created_at ? new Date(user.created_at).getTime() : 0;
  if (!created || created > cutoff) {
    return false;
  }
  const lastV = user.last_verify_at ? new Date(user.last_verify_at).getTime() : 0;
  if (lastV > cutoff) {
    return false;
  }
  const lastP = user.last_payment_at ? new Date(user.last_payment_at).getTime() : 0;
  if (!lastP) {
    return false;
  }
  return true;
}

async function getActiveInactivityRules(db) {
  const now = Date.now();
  if (now - _inactivityRulesCache.at < INACTIVITY_RULES_TTL_MS && _inactivityRulesCache.rules.length) {
    return _inactivityRulesCache.rules;
  }
  const snap = await db
    .collection('marketing_rules')
    .where({
      active: true,
      trigger_type: 'inactivity'
    })
    .get();
  const rules = snap.data.filter(function (r) {
    return r.action_type === 'send_voucher';
  });
  _inactivityRulesCache = { at: now, rules: rules };
  return rules;
}

async function userQualifiesAnyInactivity(db, user) {
  const rules = await getActiveInactivityRules(db);
  for (let i = 0; i < rules.length; i++) {
    const d = parseDaysFromTriggerValue(rules[i].trigger_value);
    if (userQualifiesInactivity(user, d)) {
      return true;
    }
  }
  return false;
}

async function hasHighValueOrderRecently(db, _, openid) {
  if (!openid) return false;
  try {
    const since = new Date(Date.now() - 365 * 86400000);
    const o = await db
      .collection('Orders')
      .where({
        _openid: openid,
        payment_status: 'paid',
        paid_at: _.gte(since)
      })
      .limit(30)
      .get();
    for (let i = 0; i < o.data.length; i++) {
      const row = o.data[i];
      const amt = row.paid_amount != null ? row.paid_amount : row.total_amount || 0;
      if (amt >= 10000) return true;
    }
  } catch (e) {
    console.warn('hasHighValueOrderRecently', e);
  }
  return false;
}

function resolveUserSegment(tagNames) {
  const set = {};
  for (let i = 0; i < tagNames.length; i++) {
    set[tagNames[i]] = true;
  }
  if (set.vip) return 'vip';
  if (set.new) return 'new';
  if (set.inactive) return 'inactive';
  if (set.high_value) return 'high_value';
  if (set.frequent) return 'frequent';
  if (set.low_value) return 'low_value';
  return 'general';
}

async function fetchUserTagNames(db, userId) {
  const snap = await db
    .collection('user_tags')
    .where({ user_id: userId })
    .get();
  const names = [];
  for (let i = 0; i < snap.data.length; i++) {
    names.push(snap.data[i].tag);
  }
  return names;
}

async function resolveUserSegmentForUser(db, userId) {
  const tags = await fetchUserTagNames(db, userId);
  return resolveUserSegment(tags);
}

function effectiveRulePriority(rule) {
  const dp = rule.dynamic_priority;
  if (dp != null && dp !== '') {
    const n = parseInt(dp, 10);
    if (!isNaN(n)) return n;
  }
  return rulePriority(rule);
}

function computeUserScore(user) {
  const spent = user.total_spent_30d != null ? user.total_spent_30d : 0;
  const visits = user.visit_count_30d != null ? user.visit_count_30d : 0;
  const lastMs = user.last_active_at ? new Date(user.last_active_at).getTime() : 0;
  const daysSince = lastMs ? (Date.now() - lastMs) / 86400000 : 999;

  const spendCap = Math.min(spent, 500000);
  const spendScore = Math.min(40, Math.floor(Math.sqrt(spendCap / 500000) * 40));
  const freqScore = Math.min(35, Math.floor(visits * 3.5));

  let recencyScore = 0;
  if (daysSince <= 1) recencyScore = 25;
  else if (daysSince <= 7) recencyScore = 18;
  else if (daysSince <= 14) recencyScore = 10;
  else if (daysSince <= 30) recencyScore = 4;

  const score = Math.min(100, Math.round(spendScore + freqScore + recencyScore));
  return score;
}

async function updateUserScore(db, _, userId) {
  try {
    const udoc = await db.collection('users').doc(userId).get();
    const u = udoc.data;
    if (!u) return;
    const score = computeUserScore(u);
    await db.collection('users').doc(userId).update({
      data: {
        user_score: score,
        updated_at: db.serverDate()
      }
    });
  } catch (e) {
    console.warn('updateUserScore', e);
  }
}

function shanghaiDateKeysLastNDays(n) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    keys.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
  }
  return keys;
}

async function aggregateRuleStatsForDates(db, ruleId, dateKeys) {
  let iv = 0;
  let rev = 0;
  let issued = 0;
  let used = 0;
  for (let d = 0; d < dateKeys.length; d++) {
    let q;
    try {
      q = await db
        .collection('marketing_stats')
        .where({
          rule_id: ruleId,
          date: dateKeys[d]
        })
        .limit(500)
        .get();
    } catch (e) {
      if (isDbCollectionMissingError(e)) {
        continue;
      }
      throw e;
    }
    for (let i = 0; i < q.data.length; i++) {
      const row = q.data[i];
      iv += row.issued_value || 0;
      rev += row.revenue || 0;
      issued += row.issued_count || 0;
      used += row.used_count || 0;
    }
  }
  return {
    issued_value: iv,
    revenue: rev,
    issued_count: issued,
    used_count: used,
    roi: iv > 0 ? rev / iv : null
  };
}

async function logMarketingBlocked(db, userId, meta) {
  try {
    await db.collection('analytics_logs').add({
      data: {
        user_id: userId != null ? String(userId) : '',
        action: 'marketing_blocked',
        metadata: meta && typeof meta === 'object' ? meta : {},
        created_at: db.serverDate()
      }
    });
  } catch (e) {
    console.error('marketing_blocked', e);
  }
}

async function bumpMarketingStatsIssued(
  db,
  _,
  ruleId,
  inc,
  issuedValueFen,
  costFen,
  storeId,
  userSegment
) {
  if (!ruleId || !inc) return;
  try {
    const iv = Math.max(0, parseInt(issuedValueFen, 10) || 0) * inc;
    const cf = Math.max(0, parseInt(costFen, 10) || 0) * inc;
    const date = shanghaiDateKey();
    const sid = storeId != null ? String(storeId).trim() : '';
    const seg =
      userSegment != null && String(userSegment).trim()
        ? String(userSegment).trim()
        : 'general';
    const q = await db
      .collection('marketing_stats')
      .where({
        rule_id: ruleId,
        date: date,
        store_id: sid,
        user_segment: seg
      })
      .limit(1)
      .get();
    if (q.data.length) {
      const d = {
        issued_count: _.inc(inc),
        updated_at: db.serverDate()
      };
      if (iv) d.issued_value = _.inc(iv);
      if (cf) d.cost = _.inc(cf);
      await db.collection('marketing_stats').doc(q.data[0]._id).update({ data: d });
    } else {
      await db.collection('marketing_stats').add({
        data: {
          rule_id: ruleId,
          date: date,
          store_id: sid,
          user_segment: seg,
          issued_count: inc,
          issued_value: iv,
          cost: cf,
          used_count: 0,
          revenue: 0,
          roi: null,
          updated_at: db.serverDate()
        }
      });
    }
  } catch (e) {
    if (isDbCollectionMissingError(e)) {
      console.warn('bumpMarketingStatsIssued: marketing_stats 集合不存在，已跳过');
      return;
    }
    throw e;
  }
}

async function bumpMarketingStatsUsed(db, _, ruleId, revenueFen, storeId, userSegment) {
  if (!ruleId) return;
  try {
    const rev = Math.max(0, parseInt(revenueFen, 10) || 0);
    const date = shanghaiDateKey();
    const sid = storeId != null ? String(storeId).trim() : '';
    const seg =
      userSegment != null && String(userSegment).trim()
        ? String(userSegment).trim()
        : 'general';
    const q = await db
      .collection('marketing_stats')
      .where({
        rule_id: ruleId,
        date: date,
        store_id: sid,
        user_segment: seg
      })
      .limit(1)
      .get();
    if (q.data.length) {
      const d = { used_count: _.inc(1), updated_at: db.serverDate() };
      if (rev > 0) d.revenue = _.inc(rev);
      await db.collection('marketing_stats').doc(q.data[0]._id).update({ data: d });
    } else {
      await db.collection('marketing_stats').add({
        data: {
          rule_id: ruleId,
          date: date,
          store_id: sid,
          user_segment: seg,
          issued_count: 0,
          issued_value: 0,
          cost: 0,
          used_count: 1,
          revenue: rev,
          roi: null,
          updated_at: db.serverDate()
        }
      });
    }
  } catch (e) {
    if (isDbCollectionMissingError(e)) {
      console.warn('bumpMarketingStatsUsed: marketing_stats 集合不存在，已跳过');
      return;
    }
    throw e;
  }
}

async function refreshMarketingRoiForDate(db, _, dateKey) {
  let q;
  try {
    q = await db
      .collection('marketing_stats')
      .where({ date: dateKey })
      .limit(1000)
      .get();
  } catch (e) {
    if (isDbCollectionMissingError(e)) {
      return 0;
    }
    throw e;
  }
  for (let i = 0; i < q.data.length; i++) {
    const row = q.data[i];
    const iv = row.issued_value || 0;
    const rev = row.revenue || 0;
    const roi = iv > 0 ? rev / iv : null;
    await db
      .collection('marketing_stats')
      .doc(row._id)
      .update({
        data: {
          roi: roi,
          updated_at: db.serverDate()
        }
      })
      .catch(function () {});
  }
  return q.data.length;
}

async function getGlobalIssuedToday(db, ruleId, dateKey) {
  let q;
  try {
    q = await db
      .collection('marketing_stats')
      .where({ rule_id: ruleId, date: dateKey })
      .limit(500)
      .get();
  } catch (e) {
    if (isDbCollectionMissingError(e)) {
      return 0;
    }
    throw e;
  }
  let sum = 0;
  for (let i = 0; i < q.data.length; i++) {
    sum += q.data[i].issued_count || 0;
  }
  if (q.data.length >= 500) {
    console.warn('getGlobalIssuedToday: may truncate at 500 rows for rule', ruleId);
  }
  return sum;
}

async function countUserRuleFiresOnDay(db, userId, ruleId, dateKey) {
  const r = await db
    .collection('marketing_rule_fires')
    .where({
      user_id: userId,
      rule_id: ruleId,
      fire_day: dateKey
    })
    .count();
  return r.total || 0;
}

async function userMatchesTargetTags(db, userId, targetTags) {
  if (!targetTags || !Array.isArray(targetTags) || targetTags.length === 0) {
    return true;
  }
  const snap = await db
    .collection('user_tags')
    .where({ user_id: userId })
    .get();
  const have = {};
  for (let i = 0; i < snap.data.length; i++) {
    have[snap.data[i].tag] = true;
  }
  for (let j = 0; j < targetTags.length; j++) {
    if (have[targetTags[j]]) return true;
  }
  return false;
}

function rulePriority(rule) {
  const p = rule.priority;
  if (p == null || p === '') return 0;
  const n = parseInt(p, 10);
  return isNaN(n) ? 0 : n;
}

async function recomputeUserActivity30dFull(db, _, openid, userId) {
  const since = new Date(Date.now() - THIRTY_MS);

  let spent = 0;
  try {
    const orders = await db
      .collection('Orders')
      .where({
        _openid: openid,
        payment_status: 'paid',
        paid_at: _.gte(since)
      })
      .get();
    for (let i = 0; i < orders.data.length; i++) {
      const o = orders.data[i];
      spent += o.paid_amount != null ? o.paid_amount : o.total_amount || 0;
    }
  } catch (e) {
    console.warn('recompute orders', e);
  }

  let visits = 0;
  try {
    const logs = await db
      .collection('voucher_logs')
      .where({
        user_id: userId,
        action: 'verify',
        created_at: _.gte(since)
      })
      .get();
    visits = logs.data.filter(function (row) {
      return !row.reverted;
    }).length;
  } catch (e2) {
    console.warn('recompute voucher_logs', e2);
  }

  try {
    await db.collection('users').doc(userId).update({
      data: {
        total_spent_30d: spent,
        visit_count_30d: visits,
        last_active_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
  } catch (e3) {
    console.warn('users 30d full update', e3);
  }
}

async function applyPaymentIncrement30d(db, _, userId, openid, amountFen) {
  let udoc;
  try {
    udoc = await db.collection('users').doc(userId).get();
  } catch (e) {
    console.warn('applyPaymentIncrement30d: users 文档不存在或不可读', userId, e.message || e);
    return;
  }
  if (!udoc || !udoc.data) {
    console.warn('applyPaymentIncrement30d: users 无数据', userId);
    return;
  }
  const key = shanghaiDateKey();
  const amt = Math.max(0, parseInt(amountFen, 10) || 0);
  const resetKey = udoc.data && udoc.data.last_30d_reset_at;

  if (resetKey !== key) {
    await recomputeUserActivity30dFull(db, _, openid, userId);
    await db.collection('users').doc(userId).update({
      data: {
        last_30d_reset_at: key,
        last_active_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    return;
  }

  if (amt <= 0) return;

  await db.collection('users').doc(userId).update({
    data: {
      total_spent_30d: _.inc(amt),
      last_active_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
}

async function applyVisitIncrement30d(db, _, userId, openid) {
  let udoc;
  try {
    udoc = await db.collection('users').doc(userId).get();
  } catch (e) {
    console.warn('applyVisitIncrement30d: users 文档不存在或不可读', userId, e.message || e);
    return;
  }
  if (!udoc || !udoc.data) {
    console.warn('applyVisitIncrement30d: users 无数据', userId);
    return;
  }
  const key = shanghaiDateKey();
  const resetKey = udoc.data && udoc.data.last_30d_reset_at;

  if (resetKey !== key) {
    await recomputeUserActivity30dFull(db, _, openid, userId);
    await db.collection('users').doc(userId).update({
      data: {
        last_30d_reset_at: key,
        last_active_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    return;
  }

  await db.collection('users').doc(userId).update({
    data: {
      visit_count_30d: _.inc(1),
      last_active_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
}

async function updateUserTags(db, _, userId, hints) {
  hints = hints || {};
  let udoc;
  try {
    udoc = await db.collection('users').doc(userId).get();
  } catch (e) {
    return;
  }
  const user = udoc.data;
  if (!user) return;

  const openid = hints.openid || user.openid;
  let totalOrders = 0;
  if (openid) {
    try {
      const U = await db
        .collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get();
      if (U.data.length) {
        totalOrders = U.data[0].total_orders || 0;
      }
    } catch (e2) {
      console.warn('Users total_orders', e2);
    }
  }

  const spent30 = user.total_spent_30d != null ? user.total_spent_30d : 0;
  const visits = user.visit_count_30d != null ? user.visit_count_30d : 0;

  const desired = [];

  if (spent30 > 50000) {
    desired.push('vip');
  } else if (spent30 < 5000) {
    desired.push('low_value');
  }

  if (visits >= 5) {
    desired.push('frequent');
  }

  if (await userQualifiesAnyInactivity(db, user)) {
    desired.push('inactive');
  }

  if (totalOrders === 1 || (hints.is_first_order && totalOrders <= 1)) {
    desired.push('new');
  }

  const singlePay = hints.single_pay_fen != null ? parseInt(hints.single_pay_fen, 10) : NaN;
  if (!isNaN(singlePay) && singlePay >= 10000) {
    desired.push('high_value');
  } else if (await hasHighValueOrderRecently(db, _, openid)) {
    desired.push('high_value');
  }

  if (totalOrders >= 2 && desired.indexOf('vip') < 0 && desired.indexOf('new') < 0) {
    desired.push('general');
  }

  const uniq = {};
  const finalTags = [];
  for (let i = 0; i < desired.length; i++) {
    const t = desired[i];
    if (!uniq[t]) {
      uniq[t] = 1;
      finalTags.push(t);
    }
  }

  try {
    const existing = await db.collection('user_tags').where({ user_id: userId }).get();
    for (let j = 0; j < existing.data.length; j++) {
      const row = existing.data[j];
      if (MANAGED_USER_TAGS.indexOf(row.tag) >= 0) {
        await db
          .collection('user_tags')
          .doc(row._id)
          .remove()
          .catch(function () {});
      }
    }
    for (let k = 0; k < finalTags.length; k++) {
      await db.collection('user_tags').add({
        data: {
          user_id: userId,
          tag: finalTags[k],
          updated_at: db.serverDate()
        }
      });
    }
  } catch (e3) {
    console.error('updateUserTags', e3);
  }
}

async function countMarketingFires7d(db, _, userId) {
  const since = new Date(Date.now() - 7 * 86400000);
  const r = await db
    .collection('marketing_rule_fires')
    .where({
      user_id: userId,
      created_at: _.gte(since)
    })
    .count();
  return r.total || 0;
}

async function isMarketingFatigued(db, _, userId) {
  const n = await countMarketingFires7d(db, _, userId);
  try {
    await db.collection('users').doc(userId).update({
      data: {
        marketing_touch_count_7d: n,
        updated_at: db.serverDate()
      }
    });
  } catch (e) {
    console.warn('isMarketingFatigued', e);
  }
  return n >= 3;
}

async function syncMarketingTouchAfterFire(db, _, userId) {
  const n = await countMarketingFires7d(db, _, userId);
  try {
    await db.collection('users').doc(userId).update({
      data: {
        marketing_touch_count_7d: n,
        last_marketing_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
  } catch (e) {
    console.warn('syncMarketingTouchAfterFire', e);
  }
}

async function batchRecomputeUsers30d(db, _, skip, limit) {
  const batch = await db
    .collection('users')
    .skip(skip)
    .limit(limit)
    .get()
    .catch(function () {
      return { data: [] };
    });
  const key = shanghaiDateKey();
  let n = 0;
  for (let i = 0; i < batch.data.length; i++) {
    const u = batch.data[i];
    if (!u.openid) continue;
    await recomputeUserActivity30dFull(db, _, u.openid, u._id);
    await db
      .collection('users')
      .doc(u._id)
      .update({
        data: {
          last_30d_reset_at: key,
          updated_at: db.serverDate()
        }
      })
      .catch(function () {});
    await updateUserTags(db, _, u._id, { openid: u.openid });
    await updateUserScore(db, _, u._id);
    n++;
  }
  return { processed: batch.data.length, updated: n, nextSkip: skip + batch.data.length };
}

module.exports = {
  shanghaiDateKey,
  shanghaiDateKeysLastNDays,
  parseDaysFromTriggerValue,
  userQualifiesInactivity,
  logMarketingBlocked,
  bumpMarketingStatsIssued,
  bumpMarketingStatsUsed,
  refreshMarketingRoiForDate,
  getGlobalIssuedToday,
  countUserRuleFiresOnDay,
  userMatchesTargetTags,
  rulePriority,
  effectiveRulePriority,
  resolveUserSegment,
  resolveUserSegmentForUser,
  aggregateRuleStatsForDates,
  recomputeUserActivity30dFull,
  applyPaymentIncrement30d,
  applyVisitIncrement30d,
  updateUserTags,
  updateUserScore,
  computeUserScore,
  isMarketingFatigued,
  syncMarketingTouchAfterFire,
  batchRecomputeUsers30d,
  MANAGED_USER_TAGS
};
