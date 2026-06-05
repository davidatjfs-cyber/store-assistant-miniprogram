// 营销引擎：payment 钩子（店内支付后实时发券）、manual 单发、daily_reconcile 对账。
// 注意：inactivity_scan（沉睡客召回）已停用，召回统一由 HRMS 集中发起。
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

    if (hook === 'inactivity_scan') {
      // 已停用：N天未到店召回统一改由 HRMS 集中发起（含预览 + 频控 + 管理员审核），
      // 小程序不再自动群发沉睡客，避免两套系统对同一客重复轰炸。
      // 仅保留 post_payment（店内支付后实时发券）与 manual（手动单发）。
      return {
        success: true,
        disabled: true,
        message: 'inactivity_scan 已停用：沉睡客召回统一由 HRMS 集中发起（预览+频控+管理员审核）'
      };
    }

    if (hook === 'disable_inactivity_rules') {
      // 维护操作（幂等）：把 marketing_rules 里 trigger_type=inactivity 的规则全部停用，
      // 与上面的引擎硬关停配套，使小程序后台不再展示/触发这类自动召回规则。
      const snap = await db
        .collection('marketing_rules')
        .where({ trigger_type: 'inactivity', active: true })
        .get();
      let n = 0;
      for (let i = 0; i < snap.data.length; i++) {
        await db
          .collection('marketing_rules')
          .doc(snap.data[i]._id)
          .update({ data: { active: false, updated_at: db.serverDate() } });
        n++;
      }
      return { success: true, disabled_count: n };
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
        '请使用 hook: post_payment | inactivity_scan | manual | daily_reconcile。当前仅列出活跃规则数。',
      active_rule_count: rules.data.length
    };
  } catch (err) {
    console.error('runMarketingEngine', err);
    return { success: false, message: err.message || 'error' };
  }
};
