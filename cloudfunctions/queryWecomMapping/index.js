var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = event.userId || wxContext.OPENID;

  try {
    var mappingRes = await db.collection('customer_wecom_mapping')
      .where({ openid: openid })
      .get();

    if (mappingRes.data.length > 0) {
      var mapping = mappingRes.data[0];
      return {
        success: true,
        hasMapping: true,
        external_userid: mapping.external_userid || '',
        corpid: mapping.corpid || '',
        updated_at: mapping.updated_at
      };
    }

    return {
      success: true,
      hasMapping: false
    };
  } catch (err) {
    console.error('查询企微关联失败:', err);
    return { success: false, error: err.message };
  }
};