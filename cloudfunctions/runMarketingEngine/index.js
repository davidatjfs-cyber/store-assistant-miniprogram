// 营销引擎：payment 钩子、inactive 全量扫描、manual 单发
const cloud = require('wx-server-sdk');
const internal = require('./internal');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const hook = (event && event.hook) || '';

  try {
    if (hook === 'post_payment') {
      if (!event.user_id) {
        return { success: false, message: '缺少 user_id' };
      }
      return await internal.processPaymentRules(db, _, event);
    }

    if (hook === 'post_authorization') {
      if (!event.user_id) {
        return { success: false, message: '缺少 user_id' };
      }
      return await internal.processAuthorizationRules(db, _, event);
    }

    if (hook === 'inactivity_scan') {
      return await internal.processInactivityRules(db, _, cloud);
    }

    if (hook === 'manual') {
      return await internal.processManual(db, _, event);
    }

    if (hook === 'daily_reconcile') {
      return await internal.processDailyReconcile(db, _, event);
    }

    const rules = await db
      .collection('marketing_rules')
      .where({ active: true })
      .get();

    return {
      success: true,
      message:
        '请使用 hook: post_payment | post_authorization | inactivity_scan | manual | daily_reconcile。当前仅列出活跃规则数。',
      active_rule_count: rules.data.length
    };
  } catch (err) {
    console.error('runMarketingEngine', err);
    return { success: false, message: err.message || 'error' };
  }
};
