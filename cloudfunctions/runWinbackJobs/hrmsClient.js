// runWinbackJobs ↔ HRMS：拉取待执行召回任务、逐个发短信、回写结果。
const https = require('https');
const http = require('http');

function request(method, url, payload) {
  return new Promise(function (resolve) {
    const secret = process.env.HRMS_GROWTH_EVENT_SECRET || process.env.MINIPROGRAM_SYNC_SECRET || '';
    if (!url || !secret) return resolve({ ok: false, error: 'url_or_secret_missing' });
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: 'bad_url' }); }
    const data = payload ? JSON.stringify(payload) : null;
    const lib = u.protocol === 'http:' ? http : https;
    const headers = { 'X-Miniprogram-Sync-Secret': secret };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = lib.request({
      method: method, hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search, timeout: 8000, headers: headers
    }, function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        let parsed = null; try { parsed = JSON.parse(body); } catch (e) {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 && parsed && parsed.ok, statusCode: res.statusCode, body: parsed, error: parsed && parsed.error });
      });
    });
    req.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

function getPendingJob() {
  return request('GET', process.env.HRMS_WINBACK_PENDING_URL || '', null);
}
function postWinbackSms(payload) {
  return request('POST', process.env.HRMS_WINBACK_SMS_URL || '', payload);
}
function postJobResult(payload) {
  return request('POST', process.env.HRMS_WINBACK_JOBRESULT_URL || '', payload);
}

module.exports = { getPendingJob, postWinbackSms, postJobResult };
