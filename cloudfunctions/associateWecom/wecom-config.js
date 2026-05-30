var WE_COM_CORP_ID = process.env.WECOM_CORP_ID || 'wwc4222f318e240468';
var WE_COM_APP_ID = 1000006;
var WE_COM_APP_SECRET = process.env.WECOM_APP_SECRET || 'tmoVdCbAzE2xa-8fn5OtY15nng3hDv0b5e-R4Mi6xMo';

var TOKEN_CACHE = {};

function getWecomAccessToken(corpId, corpSecret) {
  var id = corpId || WE_COM_CORP_ID;
  var secret = corpSecret || WE_COM_APP_SECRET;
  var cacheKey = id;
  var now = Date.now();
  if (TOKEN_CACHE[cacheKey] && now < TOKEN_CACHE[cacheKey].expireAt) {
    return Promise.resolve({ success: true, access_token: TOKEN_CACHE[cacheKey].token });
  }

  var https = require('https');
  var url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + encodeURIComponent(id) + '&corpsecret=' + encodeURIComponent(secret);

  return new Promise(function (resolve) {
    https.get(url, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var result = JSON.parse(data);
          if (result.errcode === 0 && result.access_token) {
            TOKEN_CACHE[cacheKey] = { token: result.access_token, expireAt: now + (result.expires_in || 7200) * 1000 - 300000 };
            resolve({ success: true, access_token: result.access_token });
          } else {
            resolve({ success: false, error: result.errmsg || 'token获取失败' });
          }
        } catch (e) {
          resolve({ success: false, error: '解析token响应失败' });
        }
      });
    }).on('error', function (err) {
      resolve({ success: false, error: '请求token失败: ' + err.message });
    });
  });
}

function getWecomExternalUserId(accessToken, unionid) {
  var https = require('https');
  var url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/getbyunionid?access_token=' + accessToken;
  var postData = JSON.stringify({ unionid: unionid });

  return new Promise(function (resolve) {
    var req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var result = JSON.parse(data);
          if (result.errcode === 0 && result.external_userid) {
            resolve({ success: true, external_userid: result.external_userid });
          } else {
            resolve({ success: false, error: result.errmsg || '未找到企微外部联系人' });
          }
        } catch (e) {
          resolve({ success: false, error: '解析用户响应失败' });
        }
      });
    });
    req.on('error', function (err) {
      resolve({ success: false, error: '请求用户接口失败: ' + err.message });
    });
    req.write(postData);
    req.end();
  });
}

function sendWecomTextMessage(accessToken, userId, content, agentId) {
  var https = require('https');
  var msgData = {
    external_userid: [userId],
    chat_type: 'single',
    msgtype: 'text',
    text: { content: content },
    allow_select: false
  };
  var postData = JSON.stringify(msgData);
  var url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/message/send?access_token=' + accessToken;

  return new Promise(function (resolve) {
    var req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var result = JSON.parse(data);
          if (result.errcode === 0) {
            resolve({ success: true, msgid: result.msgid });
          } else {
            resolve({ success: false, error: result.errmsg || '发送失败' });
          }
        } catch (e) {
          resolve({ success: false, error: '解析发送响应失败' });
        }
      });
    });
    req.on('error', function (err) {
      resolve({ success: false, error: '请求发送接口失败: ' + err.message });
    });
    req.write(postData);
    req.end();
  });
}

module.exports = {
  WE_COM_CORP_ID: WE_COM_CORP_ID,
  WE_COM_APP_ID: WE_COM_APP_ID,
  WE_COM_APP_SECRET: WE_COM_APP_SECRET,
  getWecomAccessToken: getWecomAccessToken,
  getWecomExternalUserId: getWecomExternalUserId,
  sendWecomTextMessage: sendWecomTextMessage
};
