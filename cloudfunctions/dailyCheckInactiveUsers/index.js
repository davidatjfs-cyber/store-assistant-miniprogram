// 定时任务：召回扫描 + 30d/ROI 兜底 + 系统监控（可拆分为独立定时器）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  try {
    const res = await cloud.callFunction({
      name: 'runMarketingEngine',
      data: {
        hook: 'inactivity_scan'
      }
    });

    const payload = res && res.result != null ? res.result : res;

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
