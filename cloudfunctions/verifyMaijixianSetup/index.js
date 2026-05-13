/**
 * 马己仙配置自检 + 可选集成测试（仅在你的云环境执行后才有结果）
 *
 * 一、仅校验库表（无需用户）：
 *   { "confirm": "CONFIRM_VERIFY_MJX", "check_data_only": true }
 *
 * 二、完整链路（需测试用户 users._id + openid；建议 Users.total_orders=0 的新客）：
 *   {
 *     "confirm": "CONFIRM_VERIFY_MJX",
 *     "user_id": "users文档_id",
 *     "openid": "小程序openid",
 *     "run_integration": true,
 *     "simulate_verify": true
 *   }
 *
 * simulate_verify 会在云内模拟核销（不写 staff 体系，仅用于联调），需与 run_integration 同时使用。
 *
 * 完整链路会调用 runMarketingEngine、getMarketingDashboard，默认 3s 云函数超时不够：
 * ① 本目录 config.json 的 timeout + 上传部署；② 仍 3s 时到腾讯云/云开发控制台把该函数超时改为 60s；
 * ③ 临时传 skip_dashboard: true；④ 仍超时传 skip_engine_call: true（先单独测 runMarketingEngine，再跑本函数只读库）。
 */
const cloud = require('wx-server-sdk');
const { onVerifySuccessUserSide, logAnalytics, checkTemplateRules } = require('./helpers');
const ul = require('./userLifecycle');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const STORE_ID = 'maijixian_sh';

const TEMPLATE_IDS = [
  'mjx_tpl_new_001',
  'mjx_tpl_return_001',
  'mjx_tpl_recall_001',
  'mjx_tpl_vip_001'
];

const RULE_IDS = [
  'mjx_rule_new_convert',
  'mjx_rule_repurchase',
  'mjx_rule_recall_7d',
  'mjx_rule_vip_boost'
];

const EXPECTED_TEMPLATES = {
  mjx_tpl_new_001: {
    name: '新人专享券',
    value: 2000,
    cost_fen: 2000,
    min_spend: 8000,
    is_active: true
  },
  mjx_tpl_return_001: {
    name: '回头客福利券',
    value: 1500,
    cost_fen: 1500,
    min_spend: 6000,
    is_active: true
  },
  mjx_tpl_recall_001: {
    name: '想你了专属券',
    value: 2500,
    cost_fen: 2500,
    min_spend: 8000,
    is_active: true
  },
  mjx_tpl_vip_001: {
    name: 'VIP专享券',
    value: 3000,
    cost_fen: 3000,
    min_spend: 12000,
    is_active: true
  }
};

const EXPECTED_RULES = {
  mjx_rule_new_convert: {
    priority: 100,
    target_tags: ['new'],
    template_id: 'mjx_tpl_new_001',
    trigger_type: 'payment'
  },
  mjx_rule_repurchase: {
    priority: 80,
    target_tags: ['general'],
    template_id: 'mjx_tpl_return_001',
    trigger_type: 'payment'
  },
  mjx_rule_recall_7d: {
    priority: 90,
    target_tags: ['inactive'],
    template_id: 'mjx_tpl_recall_001',
    trigger_type: 'inactivity'
  },
  mjx_rule_vip_boost: {
    priority: 110,
    target_tags: ['vip'],
    template_id: 'mjx_tpl_vip_001',
    trigger_type: 'payment'
  }
};

function tagsEqual(a, b) {
  const x = (a || []).slice().sort().join(',');
  const y = (b || []).slice().sort().join(',');
  return x === y;
}

function validateTemplate(id, d) {
  const exp = EXPECTED_TEMPLATES[id];
  const errors = [];
  if (!exp) {
    return { ok: false, errors: ['未知模板 ID'] };
  }
  if (!d) {
    return { ok: false, errors: ['文档不存在'] };
  }
  if (d.name !== exp.name) errors.push('name 期望 ' + exp.name + ' 实际 ' + d.name);
  if (Number(d.value) !== exp.value) errors.push('value 期望 ' + exp.value + ' 实际 ' + d.value);
  if (Number(d.cost_fen) !== exp.cost_fen) errors.push('cost_fen 期望 ' + exp.cost_fen + ' 实际 ' + d.cost_fen);
  if (Number(d.min_spend) !== exp.min_spend) errors.push('min_spend 期望 ' + exp.min_spend + ' 实际 ' + d.min_spend);
  if (d.is_active !== exp.is_active) errors.push('is_active 期望 ' + exp.is_active + ' 实际 ' + d.is_active);
  return {
    ok: errors.length === 0,
    errors: errors,
    snapshot: {
      name: d.name,
      value: d.value,
      cost_fen: d.cost_fen,
      min_spend: d.min_spend,
      is_active: d.is_active
    }
  };
}

function validateRule(id, d) {
  const exp = EXPECTED_RULES[id];
  const errors = [];
  if (!exp) {
    return { ok: false, errors: ['未知规则 ID'] };
  }
  if (!d) {
    return { ok: false, errors: ['文档不存在'] };
  }
  const tid =
    typeof d.action_config === 'string'
      ? d.action_config
      : d.action_config && d.action_config.template_id;
  if (tid !== exp.template_id) {
    errors.push('template_id 期望 ' + exp.template_id + ' 实际 ' + tid);
  }
  if (Number(d.priority) !== exp.priority) {
    errors.push('priority 期望 ' + exp.priority + ' 实际 ' + d.priority);
  }
  if (!tagsEqual(d.target_tags, exp.target_tags)) {
    errors.push(
      'target_tags 期望 ' + JSON.stringify(exp.target_tags) + ' 实际 ' + JSON.stringify(d.target_tags)
    );
  }
  if (d.trigger_type !== exp.trigger_type) {
    errors.push('trigger_type 期望 ' + exp.trigger_type + ' 实际 ' + d.trigger_type);
  }
  return {
    ok: errors.length === 0,
    errors: errors,
    snapshot: {
      priority: d.priority,
      target_tags: d.target_tags,
      template_id: tid,
      active: d.active,
      dynamic_priority: d.dynamic_priority
    }
  };
}

async function safeGetDoc(db, collection, id) {
  try {
    const snap = await db.collection(collection).doc(id).get();
    return snap && snap.data ? snap.data : null;
  } catch (e) {
    return null;
  }
}

function isDbCollectionMissingError(err) {
  const s = String((err && (err.message || err.errMsg)) || err || '');
  return (
    s.indexOf('-502005') !== -1 ||
    s.indexOf('not exist') !== -1 ||
    s.indexOf('ResourceNotFound') !== -1
  );
}

async function safeWhereCount(db, collectionName, whereObj) {
  try {
    const r = await db.collection(collectionName).where(whereObj).count();
    return typeof r.total === 'number' ? r.total : 0;
  } catch (e) {
    if (isDbCollectionMissingError(e)) {
      return 0;
    }
    throw e;
  }
}

async function part1CheckCollections(db) {
  const templateRows = await Promise.all(
    TEMPLATE_IDS.map(async function (id) {
      const data = await safeGetDoc(db, 'voucher_templates', id);
      return { id: id, data: data };
    })
  );
  const templates = {};
  for (let i = 0; i < templateRows.length; i++) {
    const row = templateRows[i];
    const v = validateTemplate(row.id, row.data);
    templates[row.id] = Object.assign({ exists: !!row.data }, v);
  }

  const ruleRows = await Promise.all(
    RULE_IDS.map(async function (id) {
      const data = await safeGetDoc(db, 'marketing_rules', id);
      return { id: id, data: data };
    })
  );
  const rules = {};
  for (let j = 0; j < ruleRows.length; j++) {
    const row = ruleRows[j];
    const v = validateRule(row.id, row.data);
    rules[row.id] = Object.assign({ exists: !!row.data }, v);
  }

  const allTplOk = TEMPLATE_IDS.every(function (id) {
    return templates[id].exists && templates[id].ok;
  });
  const allRuleOk = RULE_IDS.every(function (id) {
    return rules[id].exists && rules[id].ok;
  });

  return {
    voucher_templates: templates,
    marketing_rules: rules,
    all_templates_ok: allTplOk,
    all_rules_ok: allRuleOk
  };
}

function shanghaiDateKey() {
  return ul.shanghaiDateKey();
}

async function aggregateStatsForRuleToday(db, ruleId) {
  const date = shanghaiDateKey();
  let q;
  try {
    q = await db
      .collection('marketing_stats')
      .where({
        rule_id: ruleId,
        date: date
      })
      .limit(100)
      .get();
  } catch (e) {
    const s = String((e && (e.message || e.errMsg)) || e || '');
    const missing =
      s.indexOf('-502005') !== -1 ||
      s.indexOf('not exist') !== -1 ||
      s.indexOf('ResourceNotFound') !== -1;
    if (missing) {
      return {
        date: date,
        rule_id: ruleId,
        collection_missing: true,
        note: '云数据库中尚未创建集合 marketing_stats；代码已降级为空统计。正式环境请在控制台创建该集合。',
        totals: {
          issued_count: 0,
          used_count: 0,
          revenue_fen: 0,
          issued_value_fen: 0,
          roi: null
        },
        rows: []
      };
    }
    throw e;
  }
  let issued_count = 0;
  let used_count = 0;
  let revenue = 0;
  let issued_value = 0;
  const rows = [];
  for (let i = 0; i < q.data.length; i++) {
    const r = q.data[i];
    issued_count += r.issued_count || 0;
    used_count += r.used_count || 0;
    revenue += r.revenue || 0;
    issued_value += r.issued_value || 0;
    rows.push({
      store_id: r.store_id,
      user_segment: r.user_segment,
      issued_count: r.issued_count,
      used_count: r.used_count,
      revenue: r.revenue,
      issued_value: r.issued_value,
      roi: r.roi
    });
  }
  return {
    date: date,
    rule_id: ruleId,
    totals: {
      issued_count: issued_count,
      used_count: used_count,
      revenue_fen: revenue,
      issued_value_fen: issued_value,
      roi: issued_value > 0 ? revenue / issued_value : null
    },
    rows: rows
  };
}

async function latestMarketingVoucherForUser(db, userId) {
  const q = await db
    .collection('user_vouchers')
    .where({ user_id: userId })
    .limit(50)
    .get();
  const rows = q.data.filter(function (r) {
    return r.order_id && String(r.order_id).indexOf('mkt:') === 0;
  });
  rows.sort(function (a, b) {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return rows.length ? rows[0] : null;
}

async function simulateVerifyVoucher(db, _, voucherId, userId) {
  const row = await safeGetDoc(db, 'user_vouchers', voucherId);
  if (!row) {
    return { ok: false, message: '券不存在' };
  }
  if (row.user_id !== userId) {
    return { ok: false, message: 'user_id 与券不匹配' };
  }
  if (row.status !== 'unused') {
    return { ok: false, message: '券状态非 unused: ' + row.status };
  }

  const template =
    (await safeGetDoc(db, 'voucher_templates', row.template_id)) || {};
  const orderAmountFen = Math.max(Number(template.min_spend) || 0, 10000);
  const rules = checkTemplateRules(template, {
    verifyStoreId: STORE_ID,
    voucher_store_id: row.store_id,
    order_amount_fen: orderAmountFen,
    now: new Date()
  });
  if (!rules.ok) {
    return { ok: false, message: '模板规则未通过: ' + rules.message };
  }

  const mark = await db
    .collection('user_vouchers')
    .where({
      _id: voucherId,
      status: 'unused'
    })
    .update({
      data: {
        status: 'used',
        used_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
  if (!mark.stats || !mark.stats.updated) {
    return { ok: false, message: '并发或状态已变，未更新券' };
  }

  try {
    await db.collection('voucher_logs').add({
      data: {
        voucher_id: voucherId,
        user_id: row.user_id,
        store_id: STORE_ID,
        staff_id: 'verifyMaijixianSetup_simulated',
        action: 'verify',
        reverted: false,
        created_at: db.serverDate()
      }
    });
  } catch (e) {
    if (!isDbCollectionMissingError(e)) {
      throw e;
    }
    console.warn('simulateVerifyVoucher: voucher_logs 集合不存在，已跳过核销日志写入');
  }

  await logAnalytics(db, {
    user_id: row.user_id,
    action: 'verify_success',
    metadata: {
      voucher_id: voucherId,
      simulated_by: 'verifyMaijixianSetup',
      order_amount_fen: orderAmountFen,
      store_id: STORE_ID
    }
  });

  await onVerifySuccessUserSide(db, row.user_id);

  if (row.marketing_rule_id) {
    let revFen = orderAmountFen;
    if (template.type === 'cash' && template.value) {
      revFen = Number(template.value) || revFen;
    }
    const statStore = row.store_id != null ? String(row.store_id).trim() : '';
    const seg = row.marketing_user_segment || (await ul.resolveUserSegmentForUser(db, row.user_id));
    await ul.bumpMarketingStatsUsed(db, _, row.marketing_rule_id, revFen, statStore, seg);
  }

  const udata = await safeGetDoc(db, 'users', row.user_id);
  const o = udata && udata.openid;
  if (o) {
    await ul.applyVisitIncrement30d(db, _, row.user_id, o);
    await ul.updateUserTags(db, _, row.user_id, { openid: o });
    await ul.updateUserScore(db, _, row.user_id);
  }

  return {
    ok: true,
    voucher_id: voucherId,
    order_amount_fen_used: orderAmountFen,
    user_after: {
      last_verify_at: '见 users 文档',
      visit_count_30d: '见 users 文档'
    }
  };
}

exports.main = async function (event, context) {
  if (!event || event.confirm !== 'CONFIRM_VERIFY_MJX') {
    return {
      success: false,
      message: '缺少 confirm: CONFIRM_VERIFY_MJX'
    };
  }

  const db = cloud.database();
  const _ = db.command;

  const report = {
    success: true,
    part1_data_check: await part1CheckCollections(db)
  };

  if (event.check_data_only) {
    report.note =
      '仅数据检查。完整测试请传 run_integration: true 与 user_id、openid（可选 simulate_verify: true）。';
    return report;
  }

  if (!event.run_integration) {
    report.note = '未传 run_integration，仅返回 part1。';
    return report;
  }

  const userId = String(event.user_id || event.userId || '').trim();
  const openid = String(event.openid || '').trim();
  if (!userId || !openid) {
    report.success = false;
    report.message =
      'run_integration 需要 user_id（或 userId）与 openid；并传 confirm、run_integration 等完整参数';
    return report;
  }

  const usersDoc = await safeGetDoc(db, 'users', userId);
  if (!usersDoc) {
    report.success = false;
    report.message =
      'users 集合中不存在 _id 为 ' +
      userId +
      ' 的文档。请用该用户在小程序登录一次以自动写入 users，或在控制台手动新增一条 users 记录（含 openid 字段与正确 _id）。';
    report.part2_users_precheck = { exists: false, user_id: userId };
    return report;
  }
  report.part2_users_precheck = { exists: true, user_id: userId, has_openid: !!usersDoc.openid };

  report.part2_user_context = {};
  try {
    const urows = await db
      .collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();
    const totalOrders = urows.data.length ? urows.data[0].total_orders || 0 : null;
    report.part2_user_context.Users_total_orders = totalOrders;
    report.part2_user_context.hint =
      totalOrders === 0
        ? '符合「无订单」新客假设'
        : '非 0：首单营销仍可能命中 new（若 updateUserTags 打了 new），但请以业务为准';
  } catch (e) {
    report.part2_user_context.Users_read_error = e.message || String(e);
  }

  await ul.updateUserTags(db, _, userId, {
    openid: openid,
    is_first_order: true,
    single_pay_fen: 5000
  });

  const tagSnap = await db
    .collection('user_tags')
    .where({ user_id: userId })
    .get();
  const tagList = tagSnap.data.map(function (r) {
    return r.tag;
  });
  report.part2_user_context.user_tags_after_sync = tagList;
  report.part2_user_context.has_new_tag = tagList.indexOf('new') >= 0;
  report.part2_user_context.has_general_tag = tagList.indexOf('general') >= 0;

  let enginePayload;
  if (event.skip_engine_call) {
    enginePayload = {
      skipped: true,
      note:
        '已跳过 callFunction(runMarketingEngine)。若云函数限时 3s，请先单独测试 runMarketingEngine（见 docs/MAIJIXIAN_MARKETING_SEED.md），或把 verifyMaijixianSetup 超时调到 60s 后去掉本参数再跑一体测试。'
    };
  } else {
    try {
      const er = await cloud.callFunction({
        name: 'runMarketingEngine',
        data: {
          hook: 'post_payment',
          user_id: userId,
          openid: openid,
          order_id: 'test_mjx_' + Date.now(),
          store_id: STORE_ID,
          amount_fen: 5000,
          is_first_order: true
        }
      });
      enginePayload = er.result != null ? er.result : er;
    } catch (e2) {
      enginePayload = { error: e2.message || String(e2) };
    }
  }

  report.part3_post_payment = {
    engine_result: enginePayload,
    winner_rule_id: enginePayload.winner_rule_id,
    expect_winner: 'mjx_rule_new_convert',
    winner_match: enginePayload.winner_rule_id === 'mjx_rule_new_convert'
  };

  const voucher = await latestMarketingVoucherForUser(db, userId);
  report.part3_voucher = voucher
    ? {
        exists: true,
        _id: voucher._id,
        template_id: voucher.template_id,
        marketing_rule_id: voucher.marketing_rule_id,
        status: voucher.status,
        template_id_match: voucher.template_id === 'mjx_tpl_new_001'
      }
    : { exists: false };

  const firesLogs = await Promise.all([
    db
      .collection('marketing_rule_fires')
      .where({ user_id: userId })
      .limit(30)
      .get(),
    db
      .collection('analytics_logs')
      .where({ user_id: userId })
      .limit(50)
      .get()
  ]);
  const fires = firesLogs[0];
  const logs = firesLogs[1];
  const fireList = fires.data.map(function (f) {
    return {
      rule_id: f.rule_id,
      fire_day: f.fire_day,
      created_at: f.created_at
    };
  });
  report.part3_marketing_rule_fires = fireList;
  report.part3_has_new_convert_fire = fireList.some(function (f) {
    return f.rule_id === 'mjx_rule_new_convert';
  });

  const triggered = logs.data.filter(function (l) {
    return l.action === 'marketing_triggered';
  });
  report.part3_analytics_marketing_triggered = triggered.slice(0, 5).map(function (l) {
    return {
      action: l.action,
      metadata: l.metadata,
      created_at: l.created_at
    };
  });
  report.part3_has_marketing_triggered = triggered.length > 0;

  const repurchaseFires = fireList.filter(function (f) {
    return f.rule_id === 'mjx_rule_repurchase';
  });
  report.part4_repurchase_should_not_trigger = {
    repurchase_fire_count: repurchaseFires.length,
    incorrectly_triggered: repurchaseFires.length > 0,
    reason_ok:
      '新客仅有 new 无 general，mjx_rule_repurchase 的 target_tags 为 [general]，不应命中'
  };

  report.part5_stats_after_issue = await aggregateStatsForRuleToday(db, 'mjx_rule_new_convert');

  if (event.skip_engine_call) {
    report.integration_note =
      '本次未在本函数内调用 runMarketingEngine；Part3 的券/fires/埋点仅反映**当前库内已有数据**。一体联调请去掉 skip_engine_call 并保证本云函数超时≥60s（config.json + 控制台）。';
  }

  if (event.simulate_verify && voucher && voucher._id) {
    report.part6_simulated_verify = await simulateVerifyVoucher(db, _, voucher._id, userId);
    const verifyChecks = await Promise.all([
      safeGetDoc(db, 'users', userId),
      safeGetDoc(db, 'user_vouchers', voucher._id),
      safeWhereCount(db, 'voucher_logs', { voucher_id: voucher._id })
    ]);
    const u2data = verifyChecks[0];
    const v2data = verifyChecks[1];
    const logCountTotal = verifyChecks[2];
    report.part6_verify_checks = {
      voucher_status: v2data && v2data.status,
      status_is_used: v2data && v2data.status === 'used',
      voucher_logs_total_for_voucher: logCountTotal,
      users_last_verify_at: u2data && u2data.last_verify_at,
      users_visit_count_30d: u2data && u2data.visit_count_30d
    };
    report.part7_stats_after_verify = await aggregateStatsForRuleToday(db, 'mjx_rule_new_convert');
  } else {
    report.part6_simulated_verify = {
      skipped: true,
      reason: event.simulate_verify ? '未找到营销券' : '未传 simulate_verify: true'
    };
  }

  if (event.skip_dashboard) {
    report.part7_getMarketingDashboard = {
      skipped: true,
      reason: '已传 skip_dashboard: true，未调用 getMarketingDashboard'
    };
  } else {
    try {
      const dr = await cloud.callFunction({
        name: 'getMarketingDashboard',
        data: {}
      });
      const dash = dr.result != null ? dr.result : dr;
      report.part7_getMarketingDashboard = {
        success: dash.success,
        date: dash.date,
        today_summary: dash.today && dash.today.summary,
        today_rules_sample: dash.today && dash.today.rules
          ? dash.today.rules.filter(function (r) {
              return r.rule_id === 'mjx_rule_new_convert';
            })
          : [],
        top_rules_by_roi: dash.top_rules_by_roi,
        has_summary: !!(dash.today && dash.today.summary),
        has_new_convert_in_rules:
          dash.today &&
          dash.today.rules &&
          dash.today.rules.some(function (r) {
            return r.rule_id === 'mjx_rule_new_convert';
          })
      };
    } catch (e3) {
      report.part7_getMarketingDashboard = { error: e3.message || String(e3) };
    }
  }

  report.summary_for_human = {
    '一_库表': report.part1_data_check.all_templates_ok && report.part1_data_check.all_rules_ok,
    '二_新客支付5000_命中新客规则':
      report.part3_post_payment && report.part3_post_payment.winner_match,
    '二_生成券': report.part3_voucher && report.part3_voucher.exists && report.part3_voucher.template_id_match,
    '二_fires': report.part3_has_new_convert_fire,
    '二_analytics': report.part3_has_marketing_triggered,
    '三_复购未误触': report.part4_repurchase_should_not_trigger && !report.part4_repurchase_should_not_trigger.incorrectly_triggered,
    '四_模拟核销': report.part6_simulated_verify && report.part6_simulated_verify.ok,
    '五_统计': report.part7_stats_after_verify || report.part5_stats_after_issue,
    '六_看板': event.skip_dashboard
      ? 'skipped'
      : report.part7_getMarketingDashboard &&
        !report.part7_getMarketingDashboard.error &&
        report.part7_getMarketingDashboard.has_summary
  };

  return report;
};
