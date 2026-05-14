var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = event.userId || wxContext.OPENID;
  var storeId = event.store_id || '';

  try {
    var wecomAvailable = false;
    if (storeId) {
      var configRes = await db.collection('store_wecom_configs')
        .where({ store_id: storeId })
        .limit(1)
        .get();
      wecomAvailable = configRes.data.length > 0;
    }

    if (!wecomAvailable) {
      return {
        success: true,
        hasMapping: false,
        wecomAvailable: false
      };
    }

    var mappingRes = await db.collection('customer_wecom_mapping')
      .where({ openid: openid })
      .get();

    if (mappingRes.data.length > 0) {
      var mapping = mappingRes.data[0];
      return {
        success: true,
        hasMapping: true,
        wecomAvailable: true,
        external_userid: mapping.external_userid || '',
        corpid: mapping.corpid || '',
        updated_at: mapping.updated_at
      };
    }

    return {
      success: true,
      hasMapping: false,
      wecomAvailable: true
    };
  } catch (err) {
    console.error('查询企微关联失败:', err);
    return { success: false, error: err.message };
  }
};