const https = require('https');
const http = require('http');

function postJson(url, payload, secret) {
  return new Promise(function (resolve) {
    if (!url || !secret) return resolve({ ok: false, skipped: true });
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: 'bad_url' }); }
    const data = JSON.stringify(payload || {});
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      timeout: 5000,
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

// Plan A 加固：超时/网络抖动/5xx 时重试（最多3次,指数退避）。
// HRMS 接收端按 idempotency_key 幂等去重,重试不会重复计数 → 高峰也不丢核销回流。
async function syncHrmsGrowthEvent(payload) {
  const url = process.env.HRMS_GROWTH_EVENT_URL || process.env.HRMS_MINIPROGRAM_EVENT_URL || '';
  const secret = process.env.HRMS_GROWTH_EVENT_SECRET || process.env.MINIPROGRAM_SYNC_SECRET || '';
  let result = { ok: false, error: 'not_attempted' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    result = await postJson(url, payload, secret);
    if (result.ok || result.skipped) return result;
    // 4xx（鉴权/参数）不重试；仅网络/超时/5xx 重试
    if (result.statusCode && result.statusCode >= 400 && result.statusCode < 500) break;
    await new Promise(function (r) { setTimeout(r, attempt * 600); });
  }
  if (!result.ok && !result.skipped) console.warn('HRMS growth sync failed (after retries)', result);
  return result;
}

module.exports = { syncHrmsGrowthEvent };
