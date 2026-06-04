// 从 HRMS 拉取 POS 消费聚合，按手机号写回 users 集合的消费字段。
// 数据来源：HRMS pos_orders（客如云 POS 订单），按 phone 聚合。
// 单位：金额以「分」写入 users.total_spent / total_spent_30d，与小程序原有口径一致。
// 触发：每日定时（config.json）+ 可手动 callFunction 传 { dryRun:true } 预览。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const https = require('https');
const http = require('http');

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
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Miniprogram-Sync-Secret': secret
      }
    }, function (resp) {
      let chunks = '';
      resp.on('data', function (c) { chunks += c; });
      resp.on('end', function () {
        let json = null;
        try { json = JSON.parse(chunks); } catch (e) { /* ignore */ }
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, statusCode: resp.statusCode, body: json });
      });
    });
    req.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

async function loadUsersWithPhone() {
  const out = [];
  for (let skip = 0; skip < 20000; skip += 100) {
    const r = await db.collection('users')
      .field({ _id: true, phone: true, total_spent: true })
      .skip(skip)
      .limit(100)
      .get();
    out.push.apply(out, r.data);
    if (r.data.length < 100) break;
  }
  return out.filter(function (u) { return u.phone && String(u.phone).trim(); });
}

exports.main = async (event) => {
  event = event || {};
  const url = process.env.HRMS_POS_CONSUMPTION_URL || '';
  const secret = process.env.HRMS_GROWTH_EVENT_SECRET || process.env.MINIPROGRAM_SYNC_SECRET || '';
  const windowDays = Number(event.window_days) || 30;
  const dryRun = !!event.dryRun;

  const users = await loadUsersWithPhone();
  const phones = Array.from(new Set(users.map(function (u) { return String(u.phone).trim(); })));
  if (!phones.length) {
    return { success: true, users_total: 0, with_phone: 0, matched: 0, updated: 0, message: '无授权手机号用户' };
  }

  const resp = await postJson(url, { phones: phones, window_days: windowDays }, secret);
  if (!resp.ok || !resp.body || resp.body.ok !== true) {
    return { success: false, error: 'hrms_request_failed', detail: resp };
  }

  const data = resp.body.data || {};
  let matched = 0;
  let updated = 0;
  const samples = [];

  for (const u of users) {
    const agg = data[String(u.phone).trim()];
    if (!agg) continue;
    matched++;
    if (samples.length < 5) {
      samples.push({ phone: String(u.phone).slice(0, 3) + '****' + String(u.phone).slice(-4), spent_fen: agg.total_spent_fen, orders: agg.total_orders });
    }
    if (dryRun) continue;

    const patch = {
      total_spent: agg.total_spent_fen || 0,
      total_orders: agg.total_orders || 0,
      total_spent_30d: agg.spent_30d_fen || 0,
      pos_synced_at: db.serverDate(),
      updated_at: db.serverDate()
    };
    if (agg.last_visit) patch.last_visit = new Date(agg.last_visit);

    try {
      await db.collection('users').doc(u._id).update({ data: patch });
      updated++;
    } catch (e) {
      // 单条失败不影响整体
      console.warn('update user failed', u._id, e && e.message);
    }
  }

  return {
    success: true,
    dryRun: dryRun,
    window_days: windowDays,
    users_total: users.length,
    with_phone: phones.length,
    matched: matched,
    updated: updated,
    hrms_matched: resp.body.matched,
    samples: samples
  };
};
