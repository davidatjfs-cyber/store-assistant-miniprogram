/**
 * 企微中转服务（固定IP）
 * 部署在首尔轻量服务器，提供两个能力：
 *  1) 企微「接收消息服务器URL」验证与接收（GET echostr / POST 消息）
 *  2) 把云函数已经拿到 access_token 的企微请求，从本机固定IP转发出去
 *     —— 本机不保存任何企业密钥，只是个带暗号的转发管道。
 *
 * 监听端口 80，纯 Node 内置模块，无需 npm 依赖。
 */
'use strict';

var http = require('http');
var https = require('https');
var crypto = require('crypto');
var url = require('url');

// ====== 配置（与企微后台、云函数三方保持一致）======
var PORT = process.env.RELAY_PORT ? parseInt(process.env.RELAY_PORT, 10) : 80;
// 企微「接收消息」回调用：Token + EncodingAESKey（你在企微后台填一样的）
var WECOM_TOKEN = process.env.WECOM_TOKEN || 'storeassistant2026';
var WECOM_AES_KEY = process.env.WECOM_AES_KEY || 'aB3dE6gH9jK2mN5pQ8rS1tU4vW7xY0zC3eF6hJ9kL2n';
// 两家门店的 CorpID（验证回调时用来确认来源）
var KNOWN_CORPS = ['wwc4222f318e240468', 'ww2d6a3b6a774643e7'];
// 转发暗号：云函数必须带这个头，否则拒绝（防止被人盗用当代理）
var RELAY_SECRET = process.env.RELAY_SECRET || 'mjx-hc-relay-7f3a9c2e8b1d4056';
// 只允许转发到企微这些接口，杜绝被滥用为任意代理
var ALLOWED_API = {
  'externalcontact/message/send': true,
  'externalcontact/getbyunionid': true,
  'externalcontact/get_follow_user_list': true,
  'externalcontact/list': true,
  'externalcontact/get': true
};

// ---------- 企微回调验证 ----------
function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

function verifySignature(token, timestamp, nonce, echostr) {
  return sha1([token, timestamp, nonce, echostr].sort().join(''));
}

function decryptEchoStr(aesKey, echostr) {
  var key = Buffer.from(aesKey + '=', 'base64');
  var iv = key.slice(0, 16);
  var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  var decoded = Buffer.from(echostr, 'base64');
  var decrypted = Buffer.concat([decipher.update(decoded), decipher.final()]);
  var padLen = decrypted[decrypted.length - 1];
  var content = decrypted.slice(16, decrypted.length - padLen);
  var msgLen = content.readUInt32BE(0);
  var msg = content.slice(4, 4 + msgLen).toString('utf8');
  var corpId = content.slice(4 + msgLen).toString('utf8');
  return { msg: msg, corpId: corpId };
}

function handleVerify(query, res) {
  var sig = query.msg_signature || '';
  var calc = verifySignature(WECOM_TOKEN, query.timestamp || '', query.nonce || '', query.echostr || '');
  if (calc !== sig) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('signature mismatch');
  }
  try {
    var d = decryptEchoStr(WECOM_AES_KEY, query.echostr || '');
    if (KNOWN_CORPS.indexOf(d.corpId) === -1) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('unknown corpid: ' + d.corpId);
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(d.msg);
  } catch (e) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('decrypt error: ' + e.message);
  }
}

// ---------- 转发到企微 ----------
function forwardToWecom(api, accessToken, payload, res) {
  var target = 'https://qyapi.weixin.qq.com/cgi-bin/' + api + '?access_token=' + encodeURIComponent(accessToken);
  var body = JSON.stringify(payload || {});
  var req = https.request(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, function (r) {
    var data = '';
    r.on('data', function (c) { data += c; });
    r.on('end', function () {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  });
  req.on('error', function (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ errcode: -1, errmsg: 'relay forward error: ' + e.message }));
  });
  req.write(body);
  req.end();
}

function handleRelaySend(req, res) {
  if ((req.headers['x-relay-secret'] || '') !== RELAY_SECRET) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ errcode: -1, errmsg: 'forbidden' }));
  }
  var chunks = '';
  req.on('data', function (c) { chunks += c; });
  req.on('end', function () {
    var b;
    try { b = JSON.parse(chunks || '{}'); } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ errcode: -1, errmsg: 'bad json' }));
    }
    var api = b.api || 'externalcontact/message/send';
    if (!ALLOWED_API[api]) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ errcode: -1, errmsg: 'api not allowed: ' + api }));
    }
    if (!b.access_token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ errcode: -1, errmsg: 'missing access_token' }));
    }
    forwardToWecom(api, b.access_token, b.payload, res);
  });
}

// ---------- 路由 ----------
var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var path = parsed.pathname;
  var method = (req.method || 'GET').toUpperCase();

  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  // 企微回调：GET 验证 / POST 消息
  if (path === '/wecom/verify') {
    if (method === 'GET' && parsed.query.echostr) return handleVerify(parsed.query, res);
    if (method === 'POST') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('success'); }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('wecom-relay');
  }
  // 转发发送
  if (path === '/relay/send' && method === 'POST') return handleRelaySend(req, res);

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('[wecom-relay] listening on :' + PORT);
});
