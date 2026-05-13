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
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var unionid = event.unionid || wxContext.UNIONID || '';
  var storeId = event.store_id || '';

  try {
    if (!openid) {
      return { success: false, error: '无法获取用户 openid' };
    }

    var storeConfig = await loadStoreWecomConfig(storeId);
    var corpId = storeConfig ? storeConfig.corp_id : wecomConfig.WE_COM_CORP_ID;
    var corpSecret = storeConfig ? storeConfig.corp_secret : wecomConfig.WE_COM_APP_SECRET;
    var agentId = storeConfig ? storeConfig.agent_id : String(wecomConfig.WE_COM_APP_ID);

    var tokenRes = await wecomConfig.getWecomAccessToken(corpId, corpSecret);
    if (!tokenRes.success) {
      return { success: false, error: tokenRes.error };
    }

    var external_userid = '';
    if (unionid) {
      var wecomUserRes = await wecomConfig.getWecomExternalUserId(tokenRes.access_token, unionid);
      if (wecomUserRes.success) {
        external_userid = wecomUserRes.external_userid;
      }
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
          corpid: corpId,
          agentid: agentId,
          external_userid: external_userid,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });

      try {
        await db.collection('customers')
          .where({ openid: openid })
          .update({
            data: {
              wecomId: external_userid,
              wecomCorpId: corpId,
              wecomLinked: !!external_userid,
              wecomLinkedAt: db.serverDate()
            }
          });
      } catch (e) {
        console.warn('更新customers表失败(可忽略):', e.message);
      }

      return {
        success: true,
        external_userid: external_userid,
        mapping_id: addRes._id,
        is_new: true
      };
    } else {
      var updateData = {
        unionid: unionid,
        external_userid: external_userid || mappingRes.data[0].external_userid,
        updated_at: db.serverDate()
      };
      if (storeId) updateData.store_id = storeId;
      if (corpId) updateData.corpid = corpId;
      await db.collection('customer_wecom_mapping')
        .where({ openid: openid })
        .update({ data: updateData });

      return {
        success: true,
        external_userid: external_userid || mappingRes.data[0].external_userid,
        mapping_id: mappingRes.data[0]._id,
        is_new: false
      };
    }
  } catch (err) {
    console.error('关联企业微信失败:', err);
    return { success: false, error: err.message };
  }
};
