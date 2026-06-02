// 调用 HRMS 召回短信接口：POST {HRMS_WINBACK_SMS_URL}  鉴权 X-Miniprogram-Sync-Secret
// 带超时 + 重试（最多3次），降低高峰瞬时抖动导致的失败。
const https = require('https');
const http = require('http');

function postJsonOnce(url, payload, secret, timeoutMs) {
  return new Promise(function (resolve) {
    if (!url || !secret) return resolve({ ok: false, error: 'sms_url_or_secret_missing' });
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: 'bad_url' }); }
    const data = JSON.stringify(payload || {});
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      timeout: timeoutMs || 5000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Miniprogram-Sync-Secret': secret
      }
    }, function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
        const ok = res.statusCode >= 200 && res.statusCode < 300 && parsed && parsed.ok;
        resolve({ ok: !!ok, statusCode: res.statusCode, error: parsed && parsed.error, body: parsed });
      });
    });
    req.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

async function postWinbackSms(payload) {
  const url = process.env.HRMS_WINBACK_SMS_URL || '';
  const secret = process.env.HRMS_GROWTH_EVENT_SECRET || process.env.MINIPROGRAM_SYNC_SECRET || '';
  let last = { ok: false, error: 'not_attempted' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await postJsonOnce(url, payload, secret, 5000);
    if (last.ok) return last;
    // 业务性失败(4xx 已返回明确 error)不重试；仅网络/超时/5xx 重试
    if (last.statusCode && last.statusCode >= 400 && last.statusCode < 500) return last;
    await new Promise(function (r) { setTimeout(r, attempt * 500); });
  }
  return last;
}

module.exports = { postWinbackSms };
