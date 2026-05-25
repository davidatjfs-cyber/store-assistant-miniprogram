const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

var CORP_ID = 'wwc4222f318e240468';
var CORP_SECRET = 'tmoVdCbAzE2xa-8fn5OtY15nng3hDv0b5e-R4Mi6xMo';
var AGENT_ID = '1000006';

var TOKEN_CACHE = {};

function getToken() {
  var now = Date.now();
  if (TOKEN_CACHE.token && now < TOKEN_CACHE.expireAt) {
    return Promise.resolve({ success: true, access_token: TOKEN_CACHE.token });
  }
  return new Promise(function(resolve) {
    cloud.openapi.wxacode.getUnlimited({
      scene: 'test',
      page: 'pages/index/index'
    }).catch(function() {});
    var https = require('https');
    var url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + encodeURIComponent(CORP_ID) + '&corpsecret=' + encodeURIComponent(CORP_SECRET);
    https.get(url, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var r = JSON.parse(data);
          if (r.errcode === 0 && r.access_token) {
            TOKEN_CACHE = { token: r.access_token, expireAt: now + (r.expires_in || 7200) * 1000 - 300000 };
            resolve({ success: true, access_token: r.access_token });
          } else {
            resolve({ success: false, error: r.errmsg || 'token failed', errcode: r.errcode, debug_url_used: url.substring(0, 80) });
          }
        } catch(e) {
          resolve({ success: false, error: 'parse error', raw: data.substring(0, 200) });
        }
      });
    }).on('error', function(e) {
      resolve({ success: false, error: e.message });
    });
  });
}

function getExternalUserId(accessToken, unionid) {
  var https = require('https');
  var url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/getbyunionid?access_token=' + accessToken;
  var postData = JSON.stringify({ unionid: unionid });
  return new Promise(function(resolve) {
    var req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var r = JSON.parse(data);
          if (r.errcode === 0 && r.external_userid) {
            resolve({ success: true, external_userid: r.external_userid });
          } else {
            resolve({ success: false, error: r.errmsg, errcode: r.errcode });
          }
        } catch(e) { resolve({ success: false, error: 'parse error' }); }
      });
    });
    req.on('error', function(e) { resolve({ success: false, error: e.message }); });
    req.write(postData);
    req.end();
  });
}

exports.main = async function(event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var unionid = wxContext.UNIONID || '';
  var storeId = event.store_id || '51866138';

  if (!openid) {
    return { success: false, error: 'no openid' };
  }

  var tokenRes = await getToken();
  if (!tokenRes.success) {
    return { success: false, step: 'getToken', error: tokenRes.error, errcode: tokenRes.errcode, debug_corpId: CORP_ID, debug_secret_prefix: CORP_SECRET.substring(0, 8) };
  }

  var external_userid = '';
  if (unionid) {
    var userRes = await getExternalUserId(tokenRes.access_token, unionid);
    if (userRes.success) external_userid = userRes.external_userid;
  }

  var mappingRes = await db.collection('customer_wecom_mapping')
    .where({ openid: openid })
    .get();

  if (mappingRes.data.length === 0) {
    var addRes = await db.collection('customer_wecom_mapping').add({
      data: {
        openid: openid,
        unionid: unionid,
        store_id: storeId,
        corpid: CORP_ID,
        agentid: AGENT_ID,
        external_userid: external_userid,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    return { success: true, external_userid: external_userid, is_new: true };
  } else {
    await db.collection('customer_wecom_mapping')
      .where({ openid: openid })
      .update({
        data: {
          unionid: unionid,
          external_userid: external_userid || mappingRes.data[0].external_userid,
          store_id: storeId,
          corpid: CORP_ID,
          agentid: AGENT_ID,
          updated_at: db.serverDate()
        }
      });
    return { success: true, external_userid: external_userid || mappingRes.data[0].external_userid, is_new: false };
  }
};
