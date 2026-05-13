var cloud = require('wx-server-sdk');
var wecomConfig = require('./wecom-config');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var unionid = event.unionid || wxContext.UNIONID || '';

  try {
    if (!openid) {
      return { success: false, error: '无法获取用户 openid' };
    }

    var tokenRes = await wecomConfig.getWecomAccessToken();
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
          corpid: wecomConfig.WE_COM_CORP_ID,
          agentid: wecomConfig.WE_COM_APP_ID,
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
              wecomCorpId: wecomConfig.WE_COM_CORP_ID,
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
      await db.collection('customer_wecom_mapping')
        .where({ openid: openid })
        .update({
          data: {
            unionid: unionid,
            external_userid: external_userid || mappingRes.data[0].external_userid,
            updated_at: db.serverDate()
          }
        });

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