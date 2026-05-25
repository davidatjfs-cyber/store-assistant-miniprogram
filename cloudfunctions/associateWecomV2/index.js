var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();
var https = require('https');

var CORP_ID = 'wwc4222f318e240468';
var CORP_SECRET = 'tmoVdCbAzE2xa-8fn5OtY15nng3hDv0b5e-R4Mi6xMo';
var AGENT_ID = '1000006';

exports.main = async function(event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var unionid = wxContext.UNIONID || '';
  var storeId = event.store_id || '51866138';

  if (!openid) {
    return { success: false, error: 'no openid' };
  }

  var tokenUrl = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + encodeURIComponent(CORP_ID) + '&corpsecret=' + encodeURIComponent(CORP_SECRET);

  var tokenResult = await new Promise(function(resolve) {
    https.get(tokenUrl, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ errcode: -2, errmsg: 'parse error', raw: data }); }
      });
    }).on('error', function(e) {
      resolve({ errcode: -1, errmsg: e.message });
    });
  });

  if (tokenResult.errcode !== 0 || !tokenResult.access_token) {
    return {
      success: false,
      error: tokenResult.errmsg || 'token failed',
      errcode: tokenResult.errcode,
      debug_corpId: CORP_ID,
      debug_secret_prefix: CORP_SECRET.substring(0, 8) + '...',
      debug_token_raw: JSON.stringify(tokenResult).substring(0, 200)
    };
  }

  var external_userid = '';
  if (unionid) {
    var userUrl = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/getbyunionid?access_token=' + tokenResult.access_token;
    var postData = JSON.stringify({ unionid: unionid });
    var userResult = await new Promise(function(resolve) {
      var req = https.request(userUrl, {
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
    if (userResult.success) external_userid = userResult.external_userid;
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
