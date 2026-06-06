// 支付回调：幂等发券、users._id 写入 user_vouchers、门店 store_id、analytics_logs
const cloud = require('wx-server-sdk');
const { ensureUser, logAnalytics } = require('./helpers');
const userLifecycle = require('./userLifecycle');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function makeUserVoucherId() {
  return 'uv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

async function autoTagUser(openid, totalSpent, totalOrders) {
  const tags = [];
  if (totalSpent >= 100000) tags.push('钻石会员');
  else if (totalSpent >= 50000) tags.push('金卡会员');
  else if (totalSpent >= 20000) tags.push('银卡会员');
  if (totalOrders >= 10) tags.push('高频客户');
  else if (totalOrders >= 5) tags.push('活跃客户');
  if (totalOrders >= 3) tags.push('优惠敏感');
  return tags;
}

exports.main = async (event, context) => {
  const { returnCode, resultCode, outTradeNo, transactionId, totalFee } = event;
  console.log('支付回调:', { outTradeNo, totalFee });

  if (returnCode !== 'SUCCESS' || resultCode !== 'SUCCESS') {
    console.error('支付失败:', event);
    return { errcode: -1, errmsg: '支付失败' };
  }

  try {
    const paidSnap = await db
      .collection('Orders')
      .where({
        order_no: outTradeNo,
        payment_status: 'paid'
      })
      .limit(1)
      .get();

    if (paidSnap.data.length > 0) {
      console.log('订单已支付，跳过重复处理:', outTradeNo);
      return { errcode: 0, errmsg: 'success' };
    }

    const orderQuery = await db
      .collection('Orders')
      .where({
        order_no: outTradeNo,
        payment_status: 'pending'
      })
      .get();

    if (orderQuery.data.length === 0) {
      console.error('订单不存在或已处理:', outTradeNo);
      return { errcode: 0, errmsg: '订单已处理' };
    }

    const order = orderQuery.data[0];
    const orderId = order._id;
    const userOpenid = order._openid;
    const orderStoreId = order.store_id != null ? String(order.store_id).trim() : '';
    const orderCampaignId = order.campaign_id != null ? String(order.campaign_id).trim() : '';

    const voucherItem = order.items && order.items[0];
    if (!voucherItem || !voucherItem.voucher_id) {
      console.error('订单缺少券商品:', orderId);
      return { errcode: -1, errmsg: '订单数据异常' };
    }

    const quantity = Math.min(Math.max(parseInt(voucherItem.quantity, 10) || 1, 1), 10);

    const voucherDoc = await db.collection('voucher_templates').doc(voucherItem.voucher_id).get();
    if (!voucherDoc.data) {
      console.error('券模板不存在:', voucherItem.voucher_id);
      return { errcode: -1, errmsg: '券模板不存在' };
    }

    const voucherTemplate = voucherDoc.data;

    const usersId = await ensureUser(db, userOpenid, {});

    const existingSnap = await db
      .collection('user_vouchers')
      .where({ order_id: orderId })
      .get();
    let voucherIds = existingSnap.data.map(function (d) {
      return d._id;
    });
    const need = quantity - voucherIds.length;
    const expireAt = new Date(Date.now() + THIRTY_DAYS_MS);

    for (let i = 0; i < need; i++) {
      const vid = makeUserVoucherId();
      await db.collection('user_vouchers').add({
        data: {
          _id: vid,
          user_id: usersId,
          template_id: voucherItem.voucher_id,
          order_id: orderId,
          store_id: orderStoreId,
          status: 'unused',
          expire_at: expireAt,
          used_at: null,
          qr_code: 'voucher:' + vid,
          created_at: db.serverDate()
        }
      });
      voucherIds.push(vid);
    }

    const paidTransition = await db
      .collection('Orders')
      .where({
        order_no: outTradeNo,
        payment_status: 'pending'
      })
      .update({
        data: {
          payment_status: 'paid',
          paid_amount: totalFee,
          transaction_id: transactionId,
          paid_at: db.serverDate(),
          user_voucher_ids: voucherIds,
          voucher_codes: [],
          updated_at: db.serverDate()
        }
      });

    const didMarkPaid =
      paidTransition &&
      paidTransition.stats &&
      paidTransition.stats.updated > 0;

    let prevTotalOrders = 0;
    if (didMarkPaid) {
      const pq = await db
        .collection('users')
        .where({ _openid: userOpenid })
        .limit(1)
        .get();
      prevTotalOrders = pq.data.length ? pq.data[0].total_orders || 0 : 0;

      await db
        .collection('users')
        .doc(usersId)
        .update({
          data: {
            last_payment_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        })
        .catch(function (e) {
          console.warn('users.last_payment_at', e);
        });
    }

    if (didMarkPaid) {
      await logAnalytics(db, {
        user_id: usersId,
        action: 'payment_success',
        metadata: {
          order_no: outTradeNo,
          order_id: orderId,
          total_fee_fen: totalFee,
          quantity: quantity,
          template_id: voucherItem.voucher_id,
          store_id: orderStoreId
        }
      });
      await syncHrmsGrowthEvent({
        event_type: 'payment_success',
        openid: userOpenid,
        store_id: orderStoreId,
        campaign_id: orderCampaignId,
        coupon_id: voucherItem.voucher_id,
        order_id: orderId,
        amount_fen: totalFee,
        idempotency_key: 'payment_success:' + orderId,
        metadata: {
          order_no: outTradeNo,
          quantity: quantity,
          template_id: voucherItem.voucher_id,
          voucher_ids: voucherIds
        }
      }).catch(function (e) {
        console.warn('HRMS payment_success sync failed', e && e.message);
      });
    }

    if (didMarkPaid && need > 0) {
      await logAnalytics(db, {
        user_id: usersId,
        action: 'voucher_issued',
        metadata: {
          order_no: outTradeNo,
          voucher_ids: voucherIds.slice(-need),
          template_id: voucherItem.voucher_id,
          store_id: orderStoreId
        }
      });
      await syncHrmsGrowthEvent({
        event_type: 'coupon_purchased',
        openid: userOpenid,
        store_id: orderStoreId,
        campaign_id: orderCampaignId,
        coupon_id: voucherItem.voucher_id,
        order_id: orderId,
        amount_fen: totalFee,
        idempotency_key: 'coupon_purchased:' + orderId,
        metadata: {
          order_no: outTradeNo,
          voucher_ids: voucherIds.slice(-need),
          template_id: voucherItem.voucher_id,
          quantity: quantity
        }
      }).catch(function (e) {
        console.warn('HRMS coupon_purchased sync failed', e && e.message);
      });
    }

    if (didMarkPaid) {
      if (voucherTemplate.stock !== -1) {
        await db
          .collection('voucher_templates')
          .doc(voucherItem.voucher_id)
          .update({
            data: {
              stock: _.inc(-quantity),
              sold_count: _.inc(quantity),
              updated_at: db.serverDate()
            }
          });
      } else {
        await db
          .collection('voucher_templates')
          .doc(voucherItem.voucher_id)
          .update({
            data: {
              sold_count: _.inc(quantity),
              updated_at: db.serverDate()
            }
          });
      }
    }

    if (didMarkPaid) {
      try {
        const userQuery = await db
          .collection('users')
          .where({ _openid: userOpenid })
          .get();

        let newTotalSpent = totalFee;
        let newTotalOrders = 1;

        if (userQuery.data.length > 0) {
          const user = userQuery.data[0];
          newTotalSpent = (user.total_spent || 0) + totalFee;
          newTotalOrders = (user.total_orders || 0) + 1;
          const autoTags = await autoTagUser(userOpenid, newTotalSpent, newTotalOrders);
          const existingTags = user.tags || [];
          const mergedTags = [...new Set([...existingTags, ...autoTags])];
          await db.collection('users').doc(user._id).update({
            data: {
              total_spent: newTotalSpent,
              total_orders: newTotalOrders,
              tags: mergedTags,
              last_visit: db.serverDate(),
              updated_at: db.serverDate()
            }
          });
        } else {
          const autoTags = await autoTagUser(userOpenid, newTotalSpent, newTotalOrders);
          await db.collection('users').add({
            data: {
              _openid: userOpenid,
              total_spent: newTotalSpent,
              total_orders: newTotalOrders,
              tags: autoTags,
              member_level: '普通',
              created_at: db.serverDate(),
              updated_at: db.serverDate(),
              last_visit: db.serverDate()
            }
          });
        }
      } catch (userErr) {
        console.error('更新 Users 统计失败（不影响发券）:', userErr);
      }
    }

    if (didMarkPaid) {
      try {
        await userLifecycle.applyPaymentIncrement30d(db, _, usersId, userOpenid, totalFee);
      } catch (inc) {
        console.warn('applyPaymentIncrement30d', inc);
      }

      try {
        await userLifecycle.updateUserTags(db, _, usersId, {
          openid: userOpenid,
          is_first_order: prevTotalOrders === 0,
          single_pay_fen: totalFee
        });
      } catch (tg) {
        console.warn('updateUserTags', tg);
      }

      try {
        await userLifecycle.updateUserScore(db, _, usersId);
      } catch (sc) {
        console.warn('updateUserScore', sc);
      }

      try {
        await cloud.callFunction({
          name: 'runMarketingEngine',
          data: {
            hook: 'post_payment',
            user_id: usersId,
            openid: userOpenid,
            order_id: orderId,
            store_id: orderStoreId,
            amount_fen: totalFee,
            is_first_order: prevTotalOrders === 0
          }
        });
      } catch (mkErr) {
        console.error('runMarketingEngine 调用失败:', mkErr);
      }
    }

    // 全局硬开关：支付后自动下发订阅消息。店主要求暂停一切对客自动推送，
    // 待准备好后改回 true 即可恢复（此为购买成功的交易确认消息）。
    const POST_PAYMENT_SUBSCRIBE_MSG_ENABLED = false;
    if (didMarkPaid && POST_PAYMENT_SUBSCRIBE_MSG_ENABLED) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: userOpenid,
          page: 'pages/voucher/list',
          data: {
            thing1: { value: voucherItem.name },
            amount2: { value: '¥' + (totalFee / 100).toFixed(2) },
            number3: { value: String(quantity) },
            date4: { value: new Date().toLocaleString('zh-CN') }
          },
          templateId: process.env.SUBSCRIBE_MSG_TEMPLATE_ID || '',
          miniprogramState: process.env.NODE_ENV === 'production' ? 'formal' : 'developer'
        });
      } catch (msgErr) {
        console.error('发送订阅消息失败:', msgErr);
      }
    }

    console.log('支付回调处理成功:', {
      order_no: outTradeNo,
      user_voucher_count: voucherIds.length,
      users_id: usersId
    });

    return { errcode: 0, errmsg: 'success' };
  } catch (err) {
    console.error('支付回调处理失败:', err);
    return { errcode: -1, errmsg: err.message || 'error' };
  }
};
