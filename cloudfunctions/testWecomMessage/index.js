var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

var WE_COM_CORP_ID = process.env.WECOM_CORP_ID || 'wwc4222f318e240468';
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

function sendExternalContactMessage(accessToken, externalUserId, content) {
  var https = require('https');
  var msgData = {
    external_userid: [externalUserId],
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
            resolve({ success: false, error: result.errmsg || '发送失败', errcode: result.errcode });
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

exports.main = async function (event, context) {
  var phone = event.phone || '13817824514';
  var testMessage = event.message || '【测试】企微消息发送测试 - ' + new Date().toLocaleString('zh-CN');

  try {
    // Step 1: 通过手机号查找用户
    console.log('[TestWecom] Step 1: 查找手机号', phone);
    var userRes = await db.collection('users').where({ phone: phone }).limit(1).get();
    if (userRes.data.length === 0) {
      return { success: false, error: '未找到手机号为 ' + phone + ' 的用户' };
    }
    var user = userRes.data[0];
    console.log('[TestWecom] 找到用户:', user._id, 'openid:', user.openid);

    // Step 2: 查找企微映射
    console.log('[TestWecom] Step 2: 查找企微映射');
    var mappingRes = await db.collection('customer_wecom_mapping').where({ openid: user.openid }).limit(1).get();
    if (mappingRes.data.length === 0) {
      return {
        success: false,
        error: '用户未关联企业微信',
        user: { openid: user.openid, phone: user.phone },
        hint: '请先在小程序中授权关联企微'
      };
    }
    var mapping = mappingRes.data[0];
    var externalUserId = mapping.external_userid;
    console.log('[TestWecom] external_userid:', externalUserId);

    // Step 3: 获取 token
    console.log('[TestWecom] Step 3: 获取企微 token');
    var tokenRes = await getWecomAccessToken(WE_COM_CORP_ID, WE_COM_APP_SECRET);
    if (!tokenRes.success) {
      return { success: false, error: '获取token失败: ' + tokenRes.error };
    }
    console.log('[TestWecom] token获取成功');

    // Step 4: 发送测试消息
    console.log('[TestWecom] Step 4: 发送测试消息');
    var sendRes = await sendExternalContactMessage(tokenRes.access_token, externalUserId, testMessage);
    console.log('[TestWecom] 发送结果:', JSON.stringify(sendRes));

    return {
      success: sendRes.success,
      message: sendRes.success ? '测试消息已发送' : sendRes.error,
      user: { openid: user.openid, phone: user.phone },
      external_userid: externalUserId,
      wecom_response: sendRes
    };

  } catch (err) {
    console.error('[TestWecom] 测试失败:', err);
    return { success: false, error: err.message };
  }
};
