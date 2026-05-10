// 云函数入口文件 - 保存用户手机号并检测老会员
const cloud = require('wx-server-sdk');
const { upsertUserByOpenid } = require('./helpers');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 检测是否为老会员
 * 从客如云导入的老会员数据存储在 LegacyMembers 集合
 * @param {string} phone - 手机号
 * @returns {Promise} { isLegacy, points }
 */
async function checkLegacyMember(phone) {
  try {
    const res = await db.collection('LegacyMembers')
      .where({
        phone: phone,
        is_synced: false // 未同步到新系统
      })
      .get();

    if (res.data.length > 0) {
      const legacyData = res.data[0];
      return {
        isLegacy: true,
        points: legacyData.points || 0,
        total_spent: legacyData.total_spent || 0,
        member_level: legacyData.member_level || '普通',
        legacy_id: legacyData._id
      };
    }

    return {
      isLegacy: false,
      points: 0
    };
  } catch (err) {
    console.error('检测老会员失败:', err);
    return {
      isLegacy: false,
      points: 0
    };
  }
}

/**
 * 标记老会员已同步
 */
async function markLegacyMemberSynced(legacyId) {
  try {
    await db.collection('LegacyMembers')
      .doc(legacyId)
      .update({
        data: {
          is_synced: true,
          synced_at: db.serverDate()
        }
      });
  } catch (err) {
    console.error('标记老会员同步失败:', err);
  }
}

/**
 * 云开发 openapi.phonenumber.getPhoneNumber 不同版本/环境下返回结构不一致：
 * phone_info（官方文档）、phoneInfo（驼峰）、或号码直接在根对象上。
 */
function extractPhoneFromGetPhoneNumberResult(r) {
  if (!r || typeof r !== 'object') return '';
  const nests = [r.phone_info, r.phoneInfo].filter(function (o) {
    return o && typeof o === 'object';
  });
  for (var i = 0; i < nests.length; i++) {
    var o = nests[i];
    var n = o.phoneNumber || o.purePhoneNumber;
    if (n) return String(n).trim();
  }
  if (r.phoneNumber || r.purePhoneNumber) {
    return String(r.phoneNumber || r.purePhoneNumber).trim();
  }
  return '';
}

function pickCampaignId(scanParams) {
  if (!scanParams || typeof scanParams !== 'object') return '';
  return String(scanParams.campaign_id || scanParams.campaignId || scanParams.activity_id || scanParams.scene || '').trim();
}

/**
 * 云函数入口
 * 保存用户手机号并检测老会员
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { code, scanParams } = event;

  // ========== 1. 参数校验 ==========
  if (!code) {
    return {
      success: false,
      errMsg: '缺少必要参数: code'
    };
  }

  try {
    // ========== 2. 获取手机号 ==========
    // 使用 code 换取手机号 (微信新版接口)
    let phoneNumber = '';

    try {
      const phoneResult = await cloud.openapi.phonenumber.getPhoneNumber({
        code: code
      });

      // 云开发 / 不同版本 SDK 可能返回 errcode 或 errCode；手机号字段可能是 phoneNumber 或 purePhoneNumber
      const ecRaw =
        phoneResult.errcode !== undefined && phoneResult.errcode !== null
          ? phoneResult.errcode
          : phoneResult.errCode;
      const emRaw = (phoneResult.errmsg || phoneResult.errMsg || '').trim();
      const resolvedPhone = extractPhoneFromGetPhoneNumberResult(phoneResult);

      const errcodeOk =
        ecRaw === 0 ||
        ecRaw === '0' ||
        (ecRaw === undefined && resolvedPhone) ||
        (resolvedPhone && /:ok$/i.test(emRaw));

      if (resolvedPhone && errcodeOk) {
        phoneNumber = resolvedPhone;
      } else {
        console.error('phonenumber.getPhoneNumber 返回非成功:', JSON.stringify(phoneResult));
        const ec =
          ecRaw !== undefined && ecRaw !== null ? ecRaw : 'unknown';
        const snippet = JSON.stringify(phoneResult);
        // 常见：40029 code 无效/已使用/过期；需用户重新点「立即授权」且勿连点
        return {
          success: false,
          errMsg:
            `获取手机号失败 [${ec}] ${emRaw}\n\n请检查：① 不要连点授权，失败请关闭弹窗再点一次；② 小程序非个人主体且已微信认证，付费管理内有手机号额度；③ 用户隐私指引已声明处理手机号；④ 本小程序与云开发环境属同一 AppID；⑤ 云函数已「上传并部署」且含 openapi phonenumber.getPhoneNumber。\n\n[调试] ${snippet.length > 400 ? snippet.slice(0, 400) + '…' : snippet}`
        };
      }
    } catch (err) {
      console.error('获取手机号异常:', err);
      const extra =
        err && typeof err === 'object'
          ? JSON.stringify({
              errCode: err.errCode,
              errMsg: err.errMsg,
              message: err.message
            })
          : '';
      return {
        success: false,
        errMsg:
          '获取手机号异常: ' +
          (err.message || err.errMsg || String(err)) +
          (extra ? '\n' + extra : '')
      };
    }

    const maskedPhone = phoneNumber.slice(0, 3) + '****' + phoneNumber.slice(-4);
    console.log('获取到手机号:', maskedPhone);

    await upsertUserByOpenid(db, OPENID, { phone: phoneNumber });

    // ========== 3. 检测老会员 ==========
    const legacyCheck = await checkLegacyMember(phoneNumber);
    const { isLegacy, points, total_spent, member_level, legacy_id } = legacyCheck;

    console.log('老会员检测结果:', { isLegacy, hasPoints: !!points, hasLevel: !!member_level });

    // ========== 4. 查询用户是否已存在 ==========
    const userQuery = await db.collection('users')
      .where({
        _openid: OPENID
      })
      .get();

    const now = new Date();
    const userData = {
      phone: phoneNumber,
      updated_at: db.serverDate(),
      last_visit: db.serverDate()
    };

    // 如果是老会员，同步数据
    if (isLegacy) {
      userData.total_spent = total_spent;
      userData.member_level = member_level;
      userData.legacy_points = points; // 保留老积分记录
      userData.is_legacy_member = true;
      userData.legacy_synced_at = db.serverDate();
    }

    // 记录扫码信息
    if (scanParams) {
      userData.last_scan = {
        table_id: scanParams.table_id,
        store_id: scanParams.store_id,
        timestamp: scanParams.timestamp || Date.now()
      };
    }

    if (userQuery.data.length > 0) {
      // ========== 5. 更新已有用户 ==========
      const userId = userQuery.data[0]._id;

      await db.collection('users')
        .doc(userId)
        .update({
          data: userData
        });

      console.log('用户信息已更新:', userId);
    } else {
      // ========== 6. 创建新用户 ==========
      const newUserData = {
        _openid: OPENID,
        ...userData,
        total_spent: userData.total_spent || 0,
        total_orders: 0,
        member_level: userData.member_level || '普通',
        tags: [],
        vouchers: [],
        created_at: db.serverDate()
      };

      await db.collection('users').add({
        data: newUserData
      });

      console.log('新用户已创建');
    }

    // ========== 7. 标记老会员已同步 ==========
    if (isLegacy && legacy_id) {
      await markLegacyMemberSynced(legacy_id);
    }

    // ========== 8. 记录扫码日志（集合不存在或权限失败时不阻断入会）==========
    if (scanParams) {
      try {
        await db.collection('ScanLogs').add({
          data: {
            _openid: OPENID,
            phone: phoneNumber,
            table_id: scanParams.table_id,
            store_id: scanParams.store_id,
            is_legacy_member: isLegacy,
            legacy_points: points,
            created_at: db.serverDate()
          }
        });
      } catch (logErr) {
        console.error('ScanLogs 写入失败（可稍后建集合）:', logErr);
      }
    }

    // Best-effort only: HRMS 同步失败不能阻断手机号授权主流程。
    syncHrmsGrowthEvent({
      event_type: 'phone_authorized',
      phone: phoneNumber,
      openid: OPENID,
      store_id: scanParams && scanParams.store_id,
      campaign_id: pickCampaignId(scanParams),
      channel: scanParams && (scanParams.channel || scanParams.source || 'miniprogram'),
      idempotency_key: 'phone_authorized:' + OPENID + ':' + phoneNumber,
      metadata: {
        scanParams: scanParams || {},
        is_legacy_member: isLegacy,
        legacy_points: points || 0
      }
    }).catch(function (e) {
      console.warn('HRMS phone_authorized sync failed', e && e.message);
    });

    // P2-5: 自动反查企微客户匹配（不阻断主流程）
    var wechatMatch = null;
    db.collection('users').where({ _openid: OPENID }).limit(1).get().then(function(uDoc) {
      const phoneFromDb = uDoc.data && uDoc.data[0] && uDoc.data[0].phone;
      if (!phoneFromDb) return;
      return syncHrmsGrowthEvent({
        event_type: 'wechat_match_check',
        phone: phoneNumber || phoneFromDb,
        openid: OPENID,
        store_id: scanParams && scanParams.store_id,
        metadata: { match_check: true }
      }).catch(function() {});
    }).catch(function() {});

    // Best-effort only: 自动营销触发不阻断手机号授权主流程，避免 3s 云函数超时。
    // P3-3: 带客户标签区分差异化发券
    db.collection('users').where({ _openid: OPENID }).limit(1).get().then(function (refreshedUser) {
      const userId = refreshedUser.data && refreshedUser.data[0] && refreshedUser.data[0]._id;
      if (!userId) return null;
      return cloud.callFunction({
        name: 'runMarketingEngine',
        data: {
          hook: 'post_authorization',
          user_id: userId,
          openid: OPENID,
          store_id: scanParams && scanParams.store_id || '',
          campaign_id: pickCampaignId(scanParams)
        }
      });
    }).catch(function (mkErr) {
      console.error('post_authorization runMarketingEngine 调用失败:', mkErr);
    });

    // ========== 9. 返回结果 ==========
    return {
      success: true,
      data: {
        phone: phoneNumber,
        isLegacyMember: isLegacy,
        legacyPoints: points
      }
    };

  } catch (err) {
    console.error('保存用户信息失败:', err);
    return {
      success: false,
      errMsg: err.message || '系统错误，请稍后重试'
    };
  }
};
