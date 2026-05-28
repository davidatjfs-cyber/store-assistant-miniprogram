/**
 * 打开小程序首页时调用：按 OPENID 在 users 集合创建或更新一条档案。
 * 不替代 saveUserPhone（手机号仍须授权后由 saveUserPhone 写入）。
 */
const cloud = require('wx-server-sdk');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function pickCampaignId(scanParams) {
  if (!scanParams || typeof scanParams !== 'object') return '';
  return String(scanParams.campaign_id || scanParams.campaignId || scanParams.activity_id || scanParams.scene || '').trim();
}

function scanPatchFromEvent(scanParams) {
  const p = {};
  if (!scanParams || typeof scanParams !== 'object') return p;
  if (scanParams.store_id != null && scanParams.store_id !== '') {
    p.last_scan_store_id = String(scanParams.store_id);
  }
  if (scanParams.store_display_name != null && scanParams.store_display_name !== '') {
    p.last_scan_store_name = String(scanParams.store_display_name);
  }
  if (scanParams.table_id != null && scanParams.table_id !== '') {
    p.last_scan_table_id = String(scanParams.table_id);
  }
  return p;
}

async function ensureUserByOpenid(openid, scanParams) {
  const extra = scanPatchFromEvent(scanParams);
  const r = await db
    .collection('users')
    .where({ openid: openid })
    .limit(1)
    .get();

  if (r.data.length) {
    const user = r.data[0];
    const id = user._id;
    if (Object.keys(extra).length) {
      extra.updated_at = db.serverDate();
      await db.collection('users').doc(id).update({ data: extra });
    }
    return { id: id, phone: user.phone || '' };
  }

  const add = await db.collection('users').add({
    data: Object.assign(
      {
        openid: openid,
        external_userid: '',
        phone: '',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      },
      extra
    )
  });
  return { id: add._id, phone: '' };
}

exports.main = async function (event) {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) {
      return { success: false, errMsg: '缺少 OPENID' };
    }
    const userId = await ensureUserByOpenid(OPENID, event && event.scanParams);
    const phone = userId.phone || '';
    const scanParams = event && event.scanParams;
    if (scanParams && typeof scanParams === 'object') {
      await syncHrmsGrowthEvent({
        event_type: 'campaign_scan',
        openid: OPENID,
        store_id: scanParams.store_id,
        campaign_id: pickCampaignId(scanParams),
        channel: scanParams.channel || scanParams.source || 'miniprogram',
        idempotency_key: 'campaign_scan:' + OPENID + ':' + (pickCampaignId(scanParams) || '') + ':' + Math.floor(Date.now() / 600000),
        metadata: { scanParams: scanParams }
      }).catch(function (e) {
        console.warn('HRMS campaign_scan sync failed', e && e.message);
      });
    }
    return { success: true, user_id: userId.id || userId, phone: phone };
  } catch (e) {
    console.error('ensureUserDoc', e);
    return {
      success: false,
      errMsg: e.message || String(e)
    };
  }
};
