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
  var unionid = event.unionid;
  var storeId = event.store_id || '';
  if (!unionid) {
    return { success: false, error: '缺少 unionid 参数' };
  }

  try {
    var storeConfig = await loadStoreWecomConfig(storeId);
    var corpId = storeConfig ? storeConfig.corp_id : wecomConfig.WE_COM_CORP_ID;
    var corpSecret = storeConfig ? storeConfig.corp_secret : wecomConfig.WE_COM_APP_SECRET;

    var tokenRes = await wecomConfig.getWecomAccessToken(corpId, corpSecret);
    if (!tokenRes.success) {
      return { success: false, error: tokenRes.error };
    }

    var userInfo = await wecomConfig.getWecomExternalUserId(tokenRes.access_token, unionid);

    if (userInfo.success) {
      return {
        success: true,
        external_userid: userInfo.external_userid,
        corpid: corpId
      };
    }

    return { success: false, error: userInfo.error };
  } catch (err) {
    console.error('获取企微用户信息失败:', err);
    return { success: false, error: err.message };
  }
};
