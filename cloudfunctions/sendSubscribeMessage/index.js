var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var https = require('https');

// 订阅消息模板 ID
var TEMPLATE_COUPON_RECEIVED = process.env.SUBSCRIBE_TEMPLATE_COUPON || 'pyk3FCeBC4MtxptY3ZBeLUOiVx93Lmb_4pxkN8AFowE';
var TEMPLATE_COUPON_EXPIRING = process.env.SUBSCRIBE_TEMPLATE_EXPIRING || 'y2OgEdK4ADr5ibGuJFJEsy2CNU7ELq9d-If6jUv8ee4';

// 手动获取 access_token
function getMiniProgramAccessToken() {
  var appId = process.env.WX_APPID || 'wx8cb030fad5998252';
  var appSecret = process.env.WX_APPSECRET || 'cd7a49215faae28f408afd61d65f62aa';

  if (!appSecret) {
    return Promise.resolve({ success: false, error: '未配置 WX_APPSECRET 环境变量' });
  }

  var url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + appId + '&secret=' + appSecret;

  return new Promise(function (resolve) {
    https.get(url, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var result = JSON.parse(data);
          if (result.access_token) {
            resolve({ success: true, access_token: result.access_token });
          } else {
            resolve({ success: false, error: result.errmsg || '获取token失败' });
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

// 加载门店订阅消息模板配置
async function loadStoreTemplateConfig(storeId) {
  if (storeId) {
    try {
      var res = await db.collection('store_subscribe_configs')
        .where({ store_id: storeId }).limit(1).get();
      if (res.data.length) return res.data[0];
    } catch (e) {}
  }
  try {
    var res = await db.collection('store_subscribe_configs').limit(1).get();
    return res.data.length ? res.data[0] : null;
  } catch (e) {
    return null;
  }
}

// 根据消息类型选择模板
function getTemplateId(templateType, storeConfig) {
  if (templateType === 'expiring') {
    return storeConfig ? (storeConfig.template_expiring || TEMPLATE_COUPON_EXPIRING) : TEMPLATE_COUPON_EXPIRING;
  }
  return storeConfig ? (storeConfig.template_received || storeConfig.template_id || TEMPLATE_COUPON_RECEIVED) : TEMPLATE_COUPON_RECEIVED;
}

exports.main = async function (event, context) {
  var userId = event.userId || event.openid;
  var voucherId = event.voucherId || '';
  var storeId = event.store_id || '';
  var templateData = event.templateData || null;
  var templateType = event.templateType || 'received'; // 'received' or 'expiring'

  try {
    if (!userId) {
      return { success: false, error: '缺少 userId 或 openid' };
    }

    // 获取模板 ID 和门店显示名称
    var storeConfig = await loadStoreTemplateConfig(storeId);
    var templateId = getTemplateId(templateType, storeConfig);
    var storeDisplayName = storeConfig ? (storeConfig.store_display_name || storeConfig.store_name || '门店') : '门店';
    console.log('[SubscribeMsg] storeId:', storeId, 'storeDisplayName:', storeDisplayName, 'storeConfig:', JSON.stringify(storeConfig));

    if (!templateId || templateId === 'YOUR_TEMPLATE_ID_HERE') {
      return {
        success: false,
        error: '未配置订阅消息模板 ID，请在微信小程序后台添加模板后填写到环境变量或 store_subscribe_configs 集合',
        hint: '前往 https://mp.weixin.qq.com → 功能 → 订阅消息 → 添加模板'
      };
    }

    // 构造消息内容（匹配模板字段）
    var msgData = templateData;
    if (!msgData && voucherId) {
      var voucherRes = await db.collection('user_vouchers')
        .where({ _id: voucherId })
        .limit(1)
        .get();

      if (voucherRes.data.length > 0) {
        var v = voucherRes.data[0];
        if (templateType === 'expiring') {
          // 过期提醒模板字段
          msgData = {
            thing1: { value: (v.name || v.template_name || '优惠券').substring(0, 20) },
            thing2: { value: (v.valid_until || v.expiry || '详见小程序') },
            thing3: { value: (v.face_value ? (v.face_value / 100) + '元' : (v.amount || '0元')).substring(0, 20) },
            thing4: { value: '您的优惠券即将过期，请尽快使用' },
            thing5: { value: (v.valid_until || v.expiry || '详见小程序') }
          };
        } else {
          // 领取通知模板字段（thing1-7, time8, thing9）
          msgData = {
            thing1: { value: storeDisplayName.substring(0, 20) },
            thing2: { value: (v.name || v.template_name || '优惠券').substring(0, 20) },
            thing3: { value: (v.face_value ? (v.face_value / 100) + '元' : (v.amount || '详见小程序')).substring(0, 20) },
            thing4: { value: (v.amount || v.face_value ? (v.face_value / 100) + '元' : '0').substring(0, 20) },
            thing5: { value: (v.valid_until || v.expiry || '详见小程序') },
            thing6: { value: '-' },
            thing7: { value: '-' },
            time8: { value: (v.valid_until || v.expiry || '详见小程序') },
            thing9: { value: '-' }
          };
        }
      }
    }

    if (!msgData) {
      if (templateType === 'expiring') {
        msgData = {
          thing1: { value: '优惠券' },
          thing2: { value: new Date().toLocaleDateString('zh-CN') },
          thing3: { value: '详见小程序' },
          thing4: { value: '您的优惠券即将过期' },
          thing5: { value: new Date().toLocaleDateString('zh-CN') }
        };
      } else {
        msgData = {
          thing1: { value: storeDisplayName.substring(0, 20) },
          thing2: { value: '优惠券通知' },
          thing3: { value: '详见小程序' },
          thing4: { value: '0元' },
          thing5: { value: '详见小程序' },
          thing6: { value: '-' },
          thing7: { value: '-' },
          time8: { value: new Date().toLocaleString('zh-CN') },
          thing9: { value: '-' }
        };
      }
    }

    // 发送订阅消息
    var result;
    try {
      result = await cloud.openapi.subscribeMessage.send({
        touser: userId,
        templateId: templateId,
        page: 'pages/index/index',
        miniprogramState: 'formal',
        lang: 'zh_CN',
        data: msgData
      });
    } catch (sdkErr) {
      // 如果 SDK 的 token 无效，尝试手动获取
      if (sdkErr.message && sdkErr.message.indexOf('access_token') >= 0) {
        var tokenRes = await getMiniProgramAccessToken();
        if (!tokenRes.success) {
          return { success: false, error: '获取access_token失败: ' + tokenRes.error + '，请在云函数环境变量中配置 WX_APPSECRET' };
        }

        var postData = JSON.stringify({
          touser: userId,
          template_id: templateId,
          page: 'pages/index/index',
          miniprogram_state: 'formal',
          lang: 'zh_CN',
          data: msgData
        });

        result = await new Promise(function (resolve) {
          var url = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + tokenRes.access_token;
          var req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
          }, function (res) {
            var data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
              try {
                var apiResult = JSON.parse(data);
                resolve({ errCode: apiResult.errcode, errMsg: apiResult.errmsg || (apiResult.errcode === 0 ? 'ok' : 'fail') });
              } catch (e) {
                resolve({ errCode: -1, errMsg: '解析响应失败' });
              }
            });
          });
          req.on('error', function (err) {
            resolve({ errCode: -1, errMsg: '请求失败: ' + err.message });
          });
          req.write(postData);
          req.end();
        });
      } else {
        throw sdkErr;
      }
    }

    console.log('[SubscribeMsg] 发送结果:', JSON.stringify(result));

    // 记录日志（如果集合不存在则跳过）
    try {
      await db.collection('message_logs').add({
        data: {
          openid: userId,
          voucher_id: voucherId || '',
          msg_type: 'subscribe_message',
          template_type: templateType,
          template_id: templateId,
          template_data: msgData,
          send_result: result.errCode === 0 ? 'sent' : 'failed',
          send_error: result.errCode === 0 ? '' : (result.errMsg || ''),
          store_id: storeId,
          created_at: db.serverDate()
        }
      });
    } catch (logErr) {
      console.log('[SubscribeMsg] 日志记录跳过:', logErr.message);
    }

    return {
      success: result.errCode === 0,
      message: result.errCode === 0 ? '订阅消息已发送' : (result.errMsg || '发送失败'),
      errCode: result.errCode,
      openid: userId
    };

  } catch (err) {
    console.error('[SubscribeMsg] 发送订阅消息失败:', err);
    return { success: false, error: err.message };
  }
};
