/**
 * 营销引擎：优先级、每日限额、target_tags、marketing_stats、与 userLifecycle 联动
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ul = require('./userLifecycle');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');


function parseMinPaymentFen(v) {
  if (v == null || v === '') return 0;
  const s = String(v);
  if (/天/.test(s)) return 0;
  if (typeof v === 'number' && !isNaN(v)) return Math.max(0, v);
  const m = s.match(/(\d+)/);
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

function cooldownDaysForRule(rule, triggerType) {
  if (rule.cooldown_days != null && rule.cooldown_days !== '') {
    const n = parseInt(rule.cooldown_days, 10);
    if (!isNaN(n) && n > 0) return Math.min(n, 365);
  }
  if (triggerType === 'payment') return 1;
  if (triggerType === 'inactivity') {
    return Math.max(ul.parseDaysFromTriggerValue(rule.trigger_value), 1);
  }
  return 7;
}

async function alreadyFiredRecently(db, _, userId, ruleId, cooldownDays) {
  const since = new Date(Date.now() - cooldownDays * 86400000);
  const r = await db
    .collection('marketing_rule_fires')
    .where({
      user_id: userId,
      rule_id: ruleId,
      created_at: _.gte(since)
    })
    .limit(1)
    .get();
  return r.data.length > 0;
}

async function recordMarketingFire(db, userId, ruleId, meta, dateKey) {
  await db.collection('marketing_rule_fires').add({
    data: {
      user_id: userId,
      rule_id: ruleId,
      fire_day: dateKey || ul.shanghaiDateKey(),
      meta: meta || {},
      created_at: db.serverDate()
    }
  });
}

async function logAnalytics(db, payload) {
  try {
    await db.collection('analytics_logs').add({
      data: {
        user_id: payload.user_id != null ? String(payload.user_id) : '',
        action: String(payload.action || ''),
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        created_at: db.serverDate()
      }
    });
  } catch (e) {
    console.error('analytics_logs', e);
  }
}

async function issueMarketingVoucher(db, _, rule, userId, storeId) {
  const segment = await ul.resolveUserSegmentForUser(db, userId);
  const templateId =
    typeof rule.action_config === 'string'
      ? rule.action_config
      : rule.action_config && rule.action_config.template_id;
  if (!templateId) {
    return { ok: false, reason: 'no_template' };
  }

  const tdoc = await db.collection('voucher_templates').doc(templateId).get();
  if (!tdoc.data || !tdoc.data.is_active) {
    return { ok: false, reason: 'template_inactive' };
  }

  const tpl = tdoc.data;
  if (tpl.stock !== -1 && (tpl.stock || 0) < 1) {
    return { ok: false, reason: 'out_of_stock' };
  }

  const vd = parseInt(tpl.valid_days, 10);
  const expireMs =
    !isNaN(vd) && vd > 0 ? vd * 86400000 : THIRTY_DAYS_MS;

  const vid = 'uv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  const ruleId = rule._id;

  await db.collection('user_vouchers').add({
    data: {
      _id: vid,
      user_id: userId,
      template_id: templateId,
      order_id: 'mkt:' + ruleId + ':' + vid,
      store_id: storeId != null ? String(storeId) : '',
      status: 'unused',
      expire_at: new Date(Date.now() + expireMs),
      used_at: null,
      qr_code: 'voucher:' + vid,
      marketing_rule_id: ruleId,
      marketing_user_segment: segment,
      created_at: db.serverDate()
    }
  });

  if (tpl.stock !== -1) {
    await db.collection('voucher_templates').doc(templateId).update({
      data: {
        stock: _.inc(-1),
        sold_count: _.inc(1),
        updated_at: db.serverDate()
      }
    });
  } else {
    await db.collection('voucher_templates').doc(templateId).update({
      data: {
        sold_count: _.inc(1),
        updated_at: db.serverDate()
      }
    });
  }

  const faceValue = tpl.value != null ? Number(tpl.value) || 0 : 0;
  const costFen = tpl.cost_fen != null ? Number(tpl.cost_fen) || 0 : faceValue;

  await ul.bumpMarketingStatsIssued(
    db,
    _,
    ruleId,
    1,
    faceValue,
    costFen,
    storeId != null ? String(storeId) : '',
    segment
  );

  return { ok: true, voucher_id: vid, template_id: templateId };
}

function parseLimit(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

async function tryExecuteRule(db, _, userId, rule, ctx) {
  const dateKey = ctx.dateKey;
  const ruleId = rule._id;

  if (!(await ul.userMatchesTargetTags(db, userId, rule.target_tags))) {
    await ul.logMarketingBlocked(db, userId, {
      reason: 'target_tags_mismatch',
      rule_id: ruleId,
      rule_name: rule.name
    });
    return { ok: false, skip: true };
  }

  const dailyUser = parseLimit(rule.daily_user_limit);
  if (dailyUser != null) {
    const cnt = await ul.countUserRuleFiresOnDay(db, userId, ruleId, dateKey);
    if (cnt >= dailyUser) {
      await ul.logMarketingBlocked(db, userId, {
        reason: 'daily_user_limit',
        rule_id: ruleId,
        limit: dailyUser,
        current: cnt
      });
      return { ok: false, skip: true };
    }
  }

  const globalDaily = parseLimit(rule.global_daily_limit);
  if (globalDaily != null) {
    const gcnt = await ul.getGlobalIssuedToday(db, ruleId, dateKey);
    if (gcnt >= globalDaily) {
      await ul.logMarketingBlocked(db, userId, {
        reason: 'global_daily_limit',
        rule_id: ruleId,
        limit: globalDaily,
        current: gcnt
      });
      return { ok: false, skip: true };
    }
  }

  const issued = await issueMarketingVoucher(db, _, rule, userId, ctx.storeId || '');
  if (!issued.ok) {
    return { ok: false, error: issued.reason };
  }

  await recordMarketingFire(db, userId, ruleId, ctx.fireMeta || {}, dateKey);

  await ul.syncMarketingTouchAfterFire(db, _, userId);

  await logAnalytics(db, {
    user_id: userId,
    action: 'marketing_triggered',
    metadata: Object.assign(
      {
        rule_id: ruleId,
        rule_name: rule.name,
        trigger_type: ctx.triggerType,
        voucher_id: issued.voucher_id,
        template_id: issued.template_id
      },
      ctx.extraMeta || {}
    )
  });

  let userForSync = null;
  try {
    const udoc = await db.collection('users').doc(userId).get();
    userForSync = udoc.data || null;
  } catch (e) {
    userForSync = null;
  }

  await syncHrmsGrowthEvent({
    event_type: 'marketing_triggered',
    phone: userForSync && userForSync.phone,
    openid: userForSync && (userForSync.openid || userForSync._openid),
    store_id: ctx.storeId || '',
    campaign_id: ctx.campaignId || '',
    coupon_id: issued.voucher_id,
    order_id: 'mkt:' + ruleId + ':' + issued.voucher_id,
    idempotency_key: 'marketing_triggered:' + ruleId + ':' + issued.voucher_id,
    metadata: Object.assign({
      rule_id: ruleId,
      rule_name: rule.name,
      trigger_type: ctx.triggerType,
      template_id: issued.template_id
    }, ctx.extraMeta || {})
  }).catch(function (e) {
    console.warn('HRMS marketing_triggered sync failed', e && e.message);
  });

  return { ok: true, voucher_id: issued.voucher_id };
}

async function processPaymentRules(db, _, event) {
  const userId = event.user_id;
  const amountFen = parseInt(event.amount_fen, 10) || 0;
  const storeId = event.store_id || '';
  const orderId = event.order_id || '';
  const dateKey = ul.shanghaiDateKey();

  if (await ul.isMarketingFatigued(db, _, userId)) {
    await ul.logMarketingBlocked(db, userId, {
      reason: 'marketing_frequency_cap',
      context: 'post_payment'
    });
    return {
      success: true,
      winner_rule_id: null,
      results: [],
      skipped: 'marketing_frequency_cap'
    };
  }

  const snap = await db
    .collection('marketing_rules')
    .where({
      active: true,
      trigger_type: 'payment'
    })
    .get();

  const candidates = [];
  for (let i = 0; i < snap.data.length; i++) {
    const rule = snap.data[i];
    if (rule.action_type !== 'send_voucher') continue;
    const minFen = parseMinPaymentFen(rule.trigger_value);
    if (minFen > 0 && amountFen < minFen) continue;
    const cd = cooldownDaysForRule(rule, 'payment');
    if (await alreadyFiredRecently(db, _, userId, rule._id, cd)) continue;
    candidates.push(rule);
  }

  candidates.sort(function (a, b) {
    return ul.effectiveRulePriority(b) - ul.effectiveRulePriority(a);
  });

  let results = [];
  let winnerIdx = -1;

  for (let j = 0; j < candidates.length; j++) {
    const rule = candidates[j];
    const r = await tryExecuteRule(db, _, userId, rule, {
      dateKey: dateKey,
      storeId: storeId,
      triggerType: 'payment',
      fireMeta: { hook: 'post_payment', order_id: orderId },
      extraMeta: { order_id: orderId }
    });
    if (r.ok) {
      winnerIdx = j;
      results.push({ rule_id: rule._id, ok: true, voucher_id: r.voucher_id });
      break;
    }
    if (r.error) {
      results.push({ rule_id: rule._id, error: r.error });
      continue;
    }
    results.push({ rule_id: rule._id, skipped: true });
  }

  if (winnerIdx >= 0) {
    const winnerId = candidates[winnerIdx]._id;
    for (let k = winnerIdx + 1; k < candidates.length; k++) {
      await ul.logMarketingBlocked(db, userId, {
        reason: 'lower_priority_suppressed',
        rule_id: candidates[k]._id,
        winner_rule_id: winnerId
      });
    }
  }

  return {
    success: true,
    winner_rule_id: winnerIdx >= 0 ? candidates[winnerIdx]._id : null,
    results: results
  };
}

async function processAuthorizationRules(db, _, event) {
  const userId = event.user_id;
  const storeId = event.store_id || '';
  const campaignId = event.campaign_id || '';
  const dateKey = ul.shanghaiDateKey();
  if (!userId) {
    return { success: false, message: '缺少 user_id' };
  }
  if (await ul.isMarketingFatigued(db, _, userId)) {
    await ul.logMarketingBlocked(db, userId, {
      reason: 'marketing_frequency_cap',
      context: 'post_authorization'
    });
    return { success: true, winner_rule_id: null, results: [], skipped: 'marketing_frequency_cap' };
  }

  try {
    await ul.updateUserTags(db, _, userId, { openid: event.openid, auth_just_granted: true, is_first_order: false, single_pay_fen: 0 });
  } catch (e) {
    console.warn('updateUserTags(post_authorization)', e);
  }

  const snap = await db.collection('marketing_rules').where({ active: true }).get();
  const candidates = [];
  for (let i = 0; i < snap.data.length; i++) {
    const rule = snap.data[i];
    if (rule.action_type !== 'send_voucher') continue;
    if (rule.trigger_type !== 'authorization' && rule.trigger_type !== 'phone_authorized') continue;
    const cd = cooldownDaysForRule(rule, 'authorization');
    if (await alreadyFiredRecently(db, _, userId, rule._id, cd)) continue;
    candidates.push(rule);
  }

  // 兼容历史配置：如果线上尚未创建 authorization 类型规则，
  // 则回退到现有 active send_voucher 规则中，按用户标签挑选最匹配的一条。
  if (!candidates.length) {
    for (let i = 0; i < snap.data.length; i++) {
      const rule = snap.data[i];
      if (rule.action_type !== 'send_voucher') continue;
      if (!rule.active) continue;
      if (!Array.isArray(rule.target_tags) || !rule.target_tags.length) continue;
      const cd = cooldownDaysForRule(rule, 'authorization');
      if (await alreadyFiredRecently(db, _, userId, rule._id, cd)) continue;
      candidates.push(Object.assign({}, rule, {
        _fallback_authorization: true
      }));
    }
  }

  candidates.sort(function (a, b) {
    return ul.effectiveRulePriority(b) - ul.effectiveRulePriority(a);
  });

  const results = [];
  let winnerIdx = -1;
  for (let j = 0; j < candidates.length; j++) {
    const rule = candidates[j];
    const r = await tryExecuteRule(db, _, userId, rule, {
      dateKey: dateKey,
      storeId: storeId,
      campaignId: campaignId,
      triggerType: 'authorization',
      fireMeta: { hook: 'post_authorization' },
      extraMeta: { phone_authorized: true }
    });
    if (r.ok) {
      winnerIdx = j;
      results.push({ rule_id: rule._id, ok: true, voucher_id: r.voucher_id });
      break;
    }
    if (r.error) results.push({ rule_id: rule._id, error: r.error });
    else results.push({ rule_id: rule._id, skipped: true });
  }

  return {
    success: true,
    winner_rule_id: winnerIdx >= 0 ? candidates[winnerIdx]._id : null,
    results: results
  };
}

async function processInactivityRules(db, _, cloud) {
  const rulesSnap = await db
    .collection('marketing_rules')
    .where({
      active: true,
      trigger_type: 'inactivity'
    })
    .get();

  if (!rulesSnap.data.length) {
    return { success: true, message: 'no_inactivity_rules', stats: {} };
  }

  const rules = rulesSnap.data
    .filter(function (r) {
      return r.action_type === 'send_voucher';
    })
    .sort(function (a, b) {
      return ul.effectiveRulePriority(b) - ul.effectiveRulePriority(a);
    });

  const stats = { users_scanned: 0, issued: 0, skipped: 0 };
  const dateKey = ul.shanghaiDateKey();

  const BATCH = 400;
  let skip = 0;
  const MAX_SKIP = 20000;

  for (;;) {
    if (skip > MAX_SKIP) break;
    const batch = await db
      .collection('users')
      .skip(skip)
      .limit(BATCH)
      .get()
      .catch(function () {
        return { data: [] };
      });

    if (!batch.data.length) break;

    for (let u = 0; u < batch.data.length; u++) {
      const user = batch.data[u];
      stats.users_scanned++;

      let issuedToday = false;

      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r];
        const days = ul.parseDaysFromTriggerValue(rule.trigger_value);
        if (!ul.userQualifiesInactivity(user, days)) {
          continue;
        }

        await ul.updateUserTags(db, _, user._id, { openid: user.openid });

        if (await ul.isMarketingFatigued(db, _, user._id)) {
          await ul.logMarketingBlocked(db, user._id, {
            reason: 'marketing_frequency_cap',
            context: 'inactivity_scan'
          });
          stats.skipped++;
          continue;
        }

        const cd = cooldownDaysForRule(rule, 'inactivity');
        if (await alreadyFiredRecently(db, _, user._id, rule._id, cd)) {
          stats.skipped++;
          continue;
        }

        const res = await tryExecuteRule(db, _, user._id, rule, {
          dateKey: dateKey,
          storeId: '',
          triggerType: 'inactivity',
          fireMeta: { hook: 'inactivity_scan' },
          extraMeta: { inactive_days: days }
        });

        if (res.ok) {
          stats.issued++;
          issuedToday = true;
          const winId = rule._id;
          for (let rr = r + 1; rr < rules.length; rr++) {
            await ul.logMarketingBlocked(db, user._id, {
              reason: 'lower_priority_suppressed',
              rule_id: rules[rr]._id,
              winner_rule_id: winId,
              context: 'inactivity'
            });
          }
          break;
        }
        if (res.error) {
          stats.skipped++;
          continue;
        }
        stats.skipped++;
      }

      if (issuedToday && user.openid) {
        await ul.updateUserTags(db, _, user._id, { openid: user.openid });
      }
    }

    skip += batch.data.length;
    if (batch.data.length < BATCH) break;
  }

  return { success: true, stats: stats };
}

async function processManual(db, _, event) {
  const userId = event.user_id;
  const ruleId = event.rule_id;
  if (!userId || !ruleId) {
    return { success: false, message: '需要 user_id 与 rule_id' };
  }

  const rdoc = await db.collection('marketing_rules').doc(ruleId).get();
  const rule = rdoc.data;
  if (!rule || !rule.active) {
    return { success: false, message: '规则不存在或未启用' };
  }
  if (rule.action_type !== 'send_voucher') {
    return { success: false, message: '不支持的动作类型' };
  }

  const cd = cooldownDaysForRule(rule, rule.trigger_type || 'manual');
  if (await alreadyFiredRecently(db, _, userId, ruleId, cd)) {
    return { success: false, message: '时间窗口内已触发过' };
  }

  if (await ul.isMarketingFatigued(db, _, userId)) {
    await ul.logMarketingBlocked(db, userId, {
      reason: 'marketing_frequency_cap',
      context: 'manual'
    });
    return { success: false, message: '7日内营销触达已达上限' };
  }

  const dateKey = ul.shanghaiDateKey();
  const ctx = {
    dateKey: dateKey,
    storeId: event.store_id || '',
    triggerType: 'manual',
    fireMeta: { hook: 'manual' },
    extraMeta: {}
  };

  const res = await tryExecuteRule(db, _, userId, rule, ctx);
  if (!res.ok) {
    return {
      success: false,
      message: res.error || '未触发（标签或限额）'
    };
  }

  await ul.updateUserTags(db, _, userId, { openid: event.openid });

  return { success: true, voucher_id: res.voucher_id };
}

async function runMarketingRuleMaintenance(db, _) {
  const keys3 = ul.shanghaiDateKeysLastNDays(3);
  const minIssuedForDisable = 10000;
  const minIssuedForDynamic = 1000;
  let disabled = 0;
  let adjusted = 0;

  const rulesSnap = await db.collection('marketing_rules').get();
  for (let i = 0; i < rulesSnap.data.length; i++) {
    const rule = rulesSnap.data[i];
    const rid = rule._id;
    if (!rid) continue;

    const agg = await ul.aggregateRuleStatsForDates(db, rid, keys3);
    const thrRaw = rule.auto_disable_roi_threshold;
    const thr =
      thrRaw != null && thrRaw !== '' ? parseFloat(thrRaw) : NaN;

    if (
      rule.active &&
      !isNaN(thr) &&
      agg.issued_value >= minIssuedForDisable &&
      agg.roi != null &&
      agg.roi < thr
    ) {
      await db
        .collection('marketing_rules')
        .doc(rid)
        .update({
          data: {
            active: false,
            updated_at: db.serverDate()
          }
        })
        .catch(function () {});
      await logAnalytics(db, {
        user_id: '',
        action: 'rule_auto_disabled',
        metadata: {
          rule_id: rid,
          rule_name: rule.name || '',
          roi_3d: agg.roi,
          issued_value_3d_fen: agg.issued_value,
          revenue_3d_fen: agg.revenue,
          threshold: thr
        }
      });
      disabled++;
      continue;
    }

    if (rule.active && agg.issued_value >= minIssuedForDynamic) {
      let dp = rule.dynamic_priority;
      if (dp == null || dp === '') {
        dp = ul.rulePriority(rule);
      } else {
        const n = parseInt(dp, 10);
        dp = isNaN(n) ? ul.rulePriority(rule) : n;
      }
      const roi = agg.roi;
      if (roi != null) {
        if (roi >= 1.1) {
          dp = Math.min(dp + 2, 200);
        } else if (roi >= 0.85) {
          dp = Math.min(dp + 1, 200);
        } else if (roi < 0.35) {
          dp = Math.max(dp - 3, -100);
        } else if (roi < 0.65) {
          dp = Math.max(dp - 1, -100);
        }
      }
      await db
        .collection('marketing_rules')
        .doc(rid)
        .update({
          data: {
            dynamic_priority: dp,
            updated_at: db.serverDate()
          }
        })
        .catch(function () {});
      adjusted++;
    }
  }

  return { rules_disabled: disabled, dynamic_priority_adjusted: adjusted };
}

async function processDailyReconcile(db, _, event) {
  const limit = Math.min(Math.max(parseInt(event.limit, 10) || 300, 1), 500);
  const skip = Math.max(parseInt(event.skip, 10) || 0, 0);
  const batch = await ul.batchRecomputeUsers30d(db, _, skip, limit);

  const today = ul.shanghaiDateKey();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Shanghai'
  });

  const nToday = await ul.refreshMarketingRoiForDate(db, _, today);
  const nYest = await ul.refreshMarketingRoiForDate(db, _, yesterday);

  const maintenance = await runMarketingRuleMaintenance(db, _);

  return {
    success: true,
    reconcile: batch,
    roi_rows_today: nToday,
    roi_rows_yesterday: nYest,
    rule_maintenance: maintenance
  };
}

module.exports = {
  processAuthorizationRules,
  processPaymentRules,
  processInactivityRules,
  processManual,
  processDailyReconcile,
  parseDaysFromTriggerValue: ul.parseDaysFromTriggerValue,
  logAnalytics,
  issueMarketingVoucher,
  recordMarketingFire,
  alreadyFiredRecently,
  cooldownDaysForRule,
  ul
};
