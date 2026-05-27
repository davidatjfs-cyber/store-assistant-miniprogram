const cloud = require('wx-server-sdk');
const CLOUD_PAY_ENV_ID = 'cloud1-2gqo1169d58023d7';
const CLOUD_PAY_SUB_MCH_ID = '1745516131';
cloud.init({ env: CLOUD_PAY_ENV_ID });
const db = cloud.database();

exports.main = async function() {
  var OPENID = cloud.getWXContext().OPENID;
  var result = { openid: OPENID };

  // 1. Find user_id
  var userId = OPENID;
  try {
    var uRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
    if (uRes.data.length) userId = uRes.data[0]._id;
    result.userId = userId;
  } catch(e) { result.userError = e.message; }

  // 2. Find all user_vouchers for this openid
  try {
    var vRes = await db.collection('user_vouchers').where({ _openid: OPENID }).limit(20).get();
    result.voucherCount = vRes.data.length;
    result.vouchers = vRes.data.map(function(v) {
      return { _id: v._id, name: v.name, user_id: v.user_id || 'MISSING', status: v.status };
    });

    // Fix records with missing/wrong user_id
    var fixed = 0;
    for (var i = 0; i < vRes.data.length; i++) {
      var v = vRes.data[i];
      if (!v.user_id || v.user_id === OPENID) {
        await db.collection('user_vouchers').doc(v._id).update({
          data: { user_id: userId, updated_at: db.serverDate() }
        });
        fixed++;
      }
    }
    result.fixedCount = fixed;
  } catch(e) { result.voucherError = e.message; }

  // 3. Test cloudPay
  try {
    var payRes = await cloud.cloudPay.unifiedOrder({
      body: '年年有喜-测试',
      outTradeNo: 'DIAG' + Date.now(),
      spbillCreateIp: '127.0.0.1',
      subMchId: CLOUD_PAY_SUB_MCH_ID,
      totalFee: 1,
      envId: CLOUD_PAY_ENV_ID,
      functionName: 'paymentCallback',
      nonceStr: Math.random().toString(36).substr(2, 15),
      tradeType: 'JSAPI',
      openid: OPENID
    });
    result.cloudPayResult = JSON.stringify(payRes).substring(0, 300);
  } catch(pe) {
    result.cloudPayError = pe.message;
    result.cloudPayErrCode = pe.errCode || pe.code || 'none';
  }

  return result;
};
