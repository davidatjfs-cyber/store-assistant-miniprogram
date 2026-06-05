// 定时任务：30d/ROI 兜底对账 + 系统监控。
// 注意：沉睡客召回（inactivity_scan）已停用——召回统一由 HRMS 集中发起
// （含预览 + 频控 + 管理员审核），本定时器不再触发小程序侧自动群发。
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  try {
    // 召回扫描已停用，不再调用 runMarketingEngine 的 inactivity_scan。
    const payload = { success: true, disabled: true, message: 'inactivity_scan 已停用，召回统一由 HRMS 集中发起' };

    let reconcile = null;
    try {
      const rec = await cloud.callFunction({
        name: 'runMarketingEngine',
        data: {
          hook: 'daily_reconcile',
          limit: 400,
          skip: 0
        }
      });
      reconcile = rec && rec.result != null ? rec.result : rec;
    } catch (e) {
      console.error('daily_reconcile', e);
    }

    let monitor = null;
    try {
      const m = await cloud.callFunction({
        name: 'monitorSystem',
        data: {}
      });
      monitor = m && m.result != null ? m.result : m;
    } catch (e2) {
      console.error('monitorSystem', e2);
    }

    return {
      success: true,
      engine: payload,
      reconcile: reconcile,
      monitor: monitor
    };
  } catch (err) {
    console.error('dailyCheckInactiveUsers', err);
    return {
      success: false,
      message: err.message || String(err)
    };
  }
};
