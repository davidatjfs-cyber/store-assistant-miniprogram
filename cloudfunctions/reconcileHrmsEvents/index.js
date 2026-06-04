// 兜底对账：把 hrms_event_outbox 里因 HRMS 不可用而落库的事件重新投递。
// HRMS /api/miniprogram/events 按 idempotency_key 幂等去重，重投不会重复计数。
// 触发：定时（config.json，每 10 分钟）+ 可手动 callFunction 立即跑。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const https = require('https');
const http = require('http');

const MAX_ATTEMPTS = 8;   // 超过则标记 failed，留待人工排查
const BATCH = 50;         // 每次最多处理条数

function postJson(url, payload, secret) {
  return new Promise(function (resolve) {
    if (!url || !secret) return resolve({ ok: false, skipped: true, error: 'missing_url_or_secret' });
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: 'bad_url' }); }
    const data = JSON.stringify(payload || {});
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Miniprogram-Sync-Secret': secret
      }
    }, function (res) {
      res.resume();
      res.on('end', function () { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode }); });
    });
    req.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

async function ensureCollection() {
  try {
    await db.createCollection('hrms_event_outbox');
  } catch (e) {
    // 已存在会报错，忽略
  }
}

exports.main = async (event) => {
  const url = process.env.HRMS_GROWTH_EVENT_URL || process.env.HRMS_MINIPROGRAM_EVENT_URL || '';
  const secret = process.env.HRMS_GROWTH_EVENT_SECRET || process.env.MINIPROGRAM_SYNC_SECRET || '';
  if (!url || !secret) return { success: false, error: 'missing_url_or_secret' };

  await ensureCollection();

  let pending;
  try {
    pending = await db.collection('hrms_event_outbox')
      .where({ status: 'pending' })
      .orderBy('created_at', 'asc')
      .limit(BATCH)
      .get();
  } catch (e) {
    return { success: true, replayed: 0, note: 'outbox 暂无集合或无数据', detail: e && e.message };
  }

  const rows = (pending && pending.data) || [];
  let replayed = 0, failed = 0, retried = 0;

  for (const row of rows) {
    const result = await postJson(url, row.payload || {}, secret);

    if (result.ok || result.skipped) {
      try { await db.collection('hrms_event_outbox').doc(row._id).remove(); } catch (e) {}
      replayed++;
      continue;
    }

    // 4xx 永久性错误：不再重投，标记 failed
    const permanent = result.statusCode && result.statusCode >= 400 && result.statusCode < 500;
    const attempts = (row.attempts || 0) + 1;

    if (permanent || attempts >= MAX_ATTEMPTS) {
      try {
        await db.collection('hrms_event_outbox').doc(row._id).update({
          data: {
            status: 'failed',
            attempts: attempts,
            last_error: String(result.error || result.statusCode || 'unknown'),
            updated_at: db.serverDate()
          }
        });
      } catch (e) {}
      failed++;
    } else {
      try {
        await db.collection('hrms_event_outbox').doc(row._id).update({
          data: {
            attempts: attempts,
            last_error: String(result.error || result.statusCode || 'unknown'),
            updated_at: db.serverDate()
          }
        });
      } catch (e) {}
      retried++;
    }
  }

  return {
    success: true,
    scanned: rows.length,
    replayed: replayed,   // 重投成功并已出队
    retried: retried,     // 仍失败、保留待下次
    failed: failed,       // 超限/永久失败、需人工
    batch_full: rows.length >= BATCH
  };
};
