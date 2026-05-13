var cloud = require('wx-server-sdk');
var wecomConfig = require('./wecom-config');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async function (event, context) {
  var unionid = event.unionid;
  if (!unionid) {
    return { success: false, error: '缺少 unionid 参数' };
  }

  try {
    var tokenRes = await wecomConfig.getWecomAccessToken();
    if (!tokenRes.success) {
      return { success: false, error: tokenRes.error };
    }

    var userInfo = await wecomConfig.getWecomExternalUserId(tokenRes.access_token, unionid);

    if (userInfo.success) {
      return {
        success: true,
        external_userid: userInfo.external_userid,
        corpid: wecomConfig.WE_COM_CORP_ID
      };
    }

    return { success: false, error: userInfo.error };
  } catch (err) {
    console.error('获取企微用户信息失败:', err);
    return { success: false, error: err.message };
  }
};