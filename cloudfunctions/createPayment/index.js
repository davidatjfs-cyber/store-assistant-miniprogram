// 云函数入口文件
const cloud = require('wx-server-sdk');
const CLOUD_PAY_ENV_ID = 'cloud1-2gqo1169d58023d7';
const CLOUD_PAY_SUB_MCH_ID = '1745516131';

cloud.init({
  env: CLOUD_PAY_ENV_ID
});

const db = cloud.database();
const _ = db.command;

function makeUserVoucherId() {
  return 'uv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

/**
 * 从 voucher_templates.dish_name 生成订单行 dish_name：
 * - 单菜品：string
 * - 套餐：string[]；也可在模板里写「烧鹅 + 肠粉」自动拆成数组写入
 */
function buildItemDishName(voucher) {
  const raw = voucher && voucher.dish_name;
  if (raw == null || raw === '') {
    return '';
  }
  if (Array.isArray(raw)) {
    const arr = raw
      .map(function (s) {
        return String(s).trim();
      })
      .filter(Boolean);
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    return arr;
  }
  const s = String(raw).trim();
  if (!s) return '';
  const parts = s
    .split(/[+＋、,，]/)
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);
  if (parts.length > 1) {
    return parts;
  }
  return s;
}

/**
 * 生成唯一订单号
 * 格式: ORD + YYYYMMDD + 6位随机数
 */
function generateOrderNo() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 900000) + 100000;
  return `ORD${dateStr}${random}`;
}

/**
 * 创建支付订单
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { voucher_id, quantity = 1, store_id, campaign_id } = event;

  // ========== 1. 参数校验 ==========
  if (!voucher_id) {
    return {
      success: false,
      errMsg: '缺少必要参数: voucher_id'
    };
  }

  if (quantity < 1 || quantity > 10) {
    return {
      success: false,
      errMsg: '购买数量必须在 1-10 之间'
    };
  }

  try {
    // ========== 2. 查询券模板信息 ==========
    const voucherDoc = await db.collection('voucher_templates')
      .doc(voucher_id)
      .get();

    if (!voucherDoc.data) {
      return {
        success: false,
        errMsg: '券不存在或已下架'
      };
    }

    const voucher = voucherDoc.data;

    // 检查券是否上架
    if (!voucher.is_active) {
      return {
        success: false,
        errMsg: '该券已下架'
      };
    }

    // 检查库存 (stock = -1 表示无限库存)
    if (voucher.stock !== -1 && voucher.stock < quantity) {
      return {
        success: false,
        errMsg: `库存不足，剩余 ${voucher.stock} 张`
      };
    }

    // 检查券模板是否适用于当前门店
    if (store_id) {
      var sid = String(store_id);
      var tplStoreIds = voucher.store_ids;
      if (Array.isArray(tplStoreIds) && tplStoreIds.length > 0) {
        if (tplStoreIds.indexOf(sid) < 0 && tplStoreIds.indexOf('*') < 0) {
          return { success: false, errMsg: '该券不可在当前门店使用' };
        }
      }
    }

    // ========== 3. 计算订单金额 ==========
    const unitPrice = voucher.price; // 单价 (分)
    const totalAmount = unitPrice * quantity; // 总金额 (分)

    var userId = OPENID;
    try {
      var uRes2 = await db.collection('users').where({ openid: OPENID }).limit(1).get();
      if (uRes2.data.length) userId = uRes2.data[0]._id;
    } catch(e) {}

    // 检查是否已领取过该免费券
    if (voucher.price === 0) {
      var existRes = await db.collection('user_vouchers')
        .where({ _openid: OPENID, template_id: voucher._id })
        .limit(1)
        .get();
      if (existRes.data.length > 0) {
        return { success: false, errMsg: '您已领取过该券' };
      }
    }

    // ========== 4. 创建订单记录 (预支付状态) ==========
    const orderNo = generateOrderNo();
    const now = new Date();

    const orderData = {
      _openid: OPENID,
      store_id: store_id != null ? String(store_id) : '',
      order_no: orderNo,
      type: 'voucher',
      items: [
        {
          voucher_id: voucher._id,
          name: voucher.name,
          dish_name: buildItemDishName(voucher),
          quantity: quantity,
          price: unitPrice,
          subtotal: totalAmount
        }
      ],
      total_amount: totalAmount,
      paid_amount: 0,
      discount_amount: 0,
      payment_method: 'wechat',
      payment_status: 'pending',
      campaign_id: campaign_id || '',
      user_voucher_ids: [],
      voucher_codes: [],
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    };

    const orderResult = await db.collection('Orders').add({
      data: orderData
    });

    const orderId = orderResult._id;

    // ========== 5. 免费券直接发券，不走支付 ==========
    if (totalAmount === 0) {
      var validDays = voucher.valid_days || 30;
      var expireAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
      var userVoucherId = makeUserVoucherId();
      var userVoucherData = {
        _id: userVoucherId,
        _openid: OPENID,
        user_id: userId,
        template_id: voucher._id,
        name: voucher.name,
        type: voucher.type || 'cash',
        value: voucher.value || 0,
        price: 0,
        usage_rule: voucher.usage_rule || '',
        dish_name: buildItemDishName(voucher),
        valid_days: validDays,
        status: 'unused',
        store_id: store_id != null ? String(store_id) : '',
        order_id: orderResult._id,
        used_at: null,
        qr_code: 'voucher:' + userVoucherId,
        expire_at: expireAt,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };

      try {
        var uvRes = await db.collection('user_vouchers').add({ data: userVoucherData });
        await db.collection('Orders').doc(orderResult._id).update({
          data: {
            payment_status: 'paid',
            paid_amount: 0,
            user_voucher_ids: [userVoucherId || uvRes._id],
            updated_at: db.serverDate()
          }
        });
      } catch(e) {
        console.warn('免费券写入失败:', e.message);
      }

      return {
        success: true,
        data: {
          order_id: orderResult._id,
          order_no: orderNo,
          total_amount: 0,
          free_claim: true
        }
      };
    }

    // ========== 6. 付费券：调用微信支付统一下单接口 ==========
    var paymentResult;
    try {
      paymentResult = await cloud.cloudPay.unifiedOrder({
        body: `年年有喜-${voucher.name}`,
        outTradeNo: orderNo,
        spbillCreateIp: '127.0.0.1',
        subMchId: CLOUD_PAY_SUB_MCH_ID,
        totalFee: totalAmount,
        envId: CLOUD_PAY_ENV_ID,
        functionName: 'paymentCallback',
        nonceStr: Math.random().toString(36).substr(2, 15),
        tradeType: 'JSAPI',
        openid: OPENID
      });
    } catch(payErr) {
      await db.collection('Orders').doc(orderResult._id).update({
        data: { payment_status: 'failed', errMsg: payErr.message, updated_at: db.serverDate() }
      });
      return {
        success: false,
        errMsg: '支付下单失败: ' + (payErr.message || JSON.stringify(payErr))
      };
    }

    if (!paymentResult || paymentResult.returnCode === 'FAIL' || !paymentResult.payment) {
      var payMsg = (paymentResult && paymentResult.returnMsg) || '支付返回异常';
      await db.collection('Orders').doc(orderResult._id).update({
        data: { payment_status: 'failed', errMsg: payMsg, updated_at: db.serverDate() }
      });
      return {
        success: false,
        errMsg: '支付下单失败: ' + payMsg
      };
    }

    // ========== 6. 返回支付参数给前端 ==========
    return {
      success: true,
      data: {
        order_id: orderId,
        order_no: orderNo,
        payment: paymentResult.payment, // 包含 timeStamp, nonceStr, package, signType, paySign
        total_amount: totalAmount
      }
    };

  } catch (err) {
    console.error('创建支付订单失败:', err);
    return {
      success: false,
      errMsg: err.message || '系统错误，请稍后重试'
    };
  }
};
