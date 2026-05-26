// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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
      var userVoucherData = {
        _openid: OPENID,
        template_id: voucher._id,
        name: voucher.name,
        type: voucher.type || 'cash',
        value: voucher.value || 0,
        price: 0,
        usage_rule: voucher.usage_rule || '',
        dish_name: buildItemDishName(voucher),
        valid_days: voucher.valid_days || 30,
        status: 'active',
        store_id: store_id != null ? String(store_id) : '',
        order_id: orderResult._id,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };

      try {
        var uvRes = await db.collection('user_vouchers').add({ data: userVoucherData });
        await db.collection('Orders').doc(orderResult._id).update({
          data: {
            payment_status: 'paid',
            paid_amount: 0,
            user_voucher_ids: [uvRes._id],
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
    const paymentResult = await cloud.cloudPay.unifiedOrder({
      body: `年年有喜-${voucher.name}`,
      outTradeNo: orderNo,
      spbillCreateIp: '127.0.0.1',
      totalFee: totalAmount,
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'paymentCallback',
      nonceStr: Math.random().toString(36).substr(2, 15),
      tradeType: 'JSAPI',
      openid: OPENID
    });

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
