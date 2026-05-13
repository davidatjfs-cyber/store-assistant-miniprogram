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
      timeout: 3000,
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

async function syncHrmsGrowthEvent(payload) {
  const url = process.env.HRMS_GROWTH_EVENT_URL || process.env.HRMS_MINIPROGRAM_EVENT_URL || 'https://nnyx.cc/api/miniprogram/events';
  const secret = process.env.HRMS_GROWTH_EVENT_SECRET || process.env.MINIPROGRAM_SYNC_SECRET || '5bde6e733281f2b42305a525ccb7411a6fb5f911341703929c3f384ab6047e33';
  const result = await postJson(url, payload, secret);
  if (!result.ok && !result.skipped) console.warn('HRMS growth sync failed', result);
  return result;
}

module.exports = { syncHrmsGrowthEvent };
