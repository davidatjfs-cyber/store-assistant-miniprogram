var cloud = require('wx-server-sdk');
var wecomConfig = require('./wecom-config');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

async function loadStoreWecomConfig(storeId) {
  if (!storeId) return null;
  try {
    var res = await db.collection('store_wecom_configs').where({ store_id: storeId }).limit(1).get();
    return res.data.length ? res.data[0] : null;
  } catch (e) {
    return null;
  }
}

exports.main = async function (event, context) {
  var userId = event.userId || event.openid;
  var voucherId = event.voucherId || '';
  var messageType = event.messageType || 'text';
  var content = event.content || '';
  var storeId = event.store_id || '';

  try {
    var mappingRes = await db.collection('customer_wecom_mapping')
      .where({ openid: userId })
      .get();

    if (mappingRes.data.length === 0) {
      return { success: false, error: '用户未关联企业微信，请先授权关联' };
    }

    var mapping = mappingRes.data[0];
    var externalUserId = mapping.external_userid;

    if (!externalUserId) {
      return { success: false, error: '企微 external_userid 为空，无法发送' };
    }

    var storeConfig = storeId ? await loadStoreWecomConfig(storeId) : null;
    var corpId = storeConfig ? storeConfig.corp_id : wecomConfig.WE_COM_CORP_ID;
    var corpSecret = storeConfig ? storeConfig.corp_secret : wecomConfig.WE_COM_APP_SECRET;
    var agentId = storeConfig ? (storeConfig.agent_id || wecomConfig.WE_COM_APP_ID) : wecomConfig.WE_COM_APP_ID;

    var tokenRes = await wecomConfig.getWecomAccessToken(corpId, corpSecret);
    if (!tokenRes.success) {
      return { success: false, error: tokenRes.error };
    }

    var msgContent = content;
    if (voucherId && !msgContent) {
      var voucherRes = await db.collection('user_vouchers')
        .where({ _id: voucherId })
        .limit(1)
        .get();

      if (voucherRes.data.length > 0) {
        var v = voucherRes.data[0];
        msgContent = '【优惠券】' + (v.name || v.template_name || '优惠券') + '\n' +
          '金额：' + (v.face_value ? (v.face_value / 100) + '元' : (v.amount || '')) + '\n' +
          '有效期：' + (v.valid_until || v.expiry || '') + '\n\n' +
          '👉 打开小程序查看详情';
      }
    }

    if (!msgContent) {
      msgContent = '您有一条新的优惠通知，请查看小程序';
    }

    var result = await wecomConfig.sendWecomTextMessage(
      tokenRes.access_token,
      externalUserId,
      msgContent,
      agentId
    );

    await db.collection('message_logs').add({
      data: {
        openid: userId,
        external_userid: externalUserId,
        voucher_id: voucherId || '',
        msg_type: messageType,
        content: msgContent,
        send_result: result.success ? 'sent' : 'failed',
        send_error: result.success ? '' : (result.error || ''),
        store_id: storeId,
        corp_id: corpId,
        created_at: db.serverDate()
      }
    });

    return {
      success: result.success,
      message: result.success ? '消息已发送到企业微信' : result.error,
      external_userid: externalUserId
    };
  } catch (err) {
    console.error('发送企微消息失败:', err);
    return { success: false, error: err.message };
  }
};
