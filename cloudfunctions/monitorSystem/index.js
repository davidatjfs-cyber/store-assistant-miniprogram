/**
 * 每日（或按需）扫描 analytics_logs，写入 system_alerts，便于后续接企微 Webhook
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const WINDOW_MS = 24 * 60 * 60 * 1000;
const VERIFY_FAIL_COUNT_ALERT = 60;
const MARKETING_BLOCKED_COUNT_ALERT = 120;
const MIN_VERIFY_EVENTS_FOR_RATE = 30;
const VERIFY_FAIL_RATE_ALERT = 0.35;

function shanghaiDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

async function countActionSince(db, _, action, since) {
  const r = await db
    .collection('analytics_logs')
    .where({
      action: action,
      created_at: _.gte(since)
    })
    .count();
  return r.total || 0;
}

async function insertAlertIfAbsent(db, type, body) {
  const day = shanghaiDateString();
  const dup = await db
    .collection('system_alerts')
    .where({
      type: type,
      alert_date: day
    })
    .limit(1)
    .get();
  if (dup.data.length) {
    return false;
  }
  await db.collection('system_alerts').add({
    data: Object.assign(
      {
        type: type,
        alert_date: day,
        severity: 'warning',
        notified: false,
        created_at: db.serverDate()
      },
      body
    )
  });
  return true;
}

exports.main = async function (event, context) {
  const since = new Date(Date.now() - WINDOW_MS);

  const verifyFail = await countActionSince(db, _, 'verify_fail', since);
  const verifyOk = await countActionSince(db, _, 'verify_success', since);
  const marketingBlocked = await countActionSince(db, _, 'marketing_blocked', since);

  const fired = [];

  if (verifyFail >= VERIFY_FAIL_COUNT_ALERT) {
    const ok = await insertAlertIfAbsent(db, 'verify_fail_spike', {
      message: '近24h verify_fail 次数偏高：' + verifyFail,
      metadata: {
        verify_fail: verifyFail,
        window_hours: 24
      }
    });
    if (ok) fired.push('verify_fail_spike');
  }

  if (marketingBlocked >= MARKETING_BLOCKED_COUNT_ALERT) {
    const ok = await insertAlertIfAbsent(db, 'marketing_blocked_spike', {
      message: '近24h marketing_blocked 条数偏高：' + marketingBlocked,
      metadata: {
        marketing_blocked: marketingBlocked
      }
    });
    if (ok) fired.push('marketing_blocked_spike');
  }

  const denom = verifyFail + verifyOk;
  if (denom >= MIN_VERIFY_EVENTS_FOR_RATE) {
    const rate = verifyFail / denom;
    if (rate >= VERIFY_FAIL_RATE_ALERT) {
      const ok = await insertAlertIfAbsent(db, 'verify_fail_rate', {
        message:
          '核销失败率异常：' +
          (rate * 100).toFixed(1) +
          '%（fail ' +
          verifyFail +
          ' / 总 ' +
          denom +
          '）',
        severity: 'critical',
        metadata: {
          verify_fail: verifyFail,
          verify_success: verifyOk,
          rate: rate
        }
      });
      if (ok) fired.push('verify_fail_rate');
    }
  }

  return {
    success: true,
    alerts_fired: fired,
    stats: {
      verify_fail: verifyFail,
      verify_success: verifyOk,
      marketing_blocked: marketingBlocked
    }
  };
};
