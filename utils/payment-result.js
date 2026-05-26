function resolveCreatePaymentResult(result) {
  const r = result || {};
  if (r.success && r.data && r.data.payment) {
    return { type: 'payment', payment: r.data.payment, data: r.data };
  }
  if (r.success && r.data && r.data.free_claim) {
    return { type: 'free_claim', data: r.data };
  }
  if (r.success && r.data && r.data.order_id) {
    return {
      type: 'missing_payment',
      data: r.data,
      message: '订单已创建，但支付参数缺失，请检查 createPayment 云函数部署与微信支付配置'
    };
  }
  return {
    type: 'error',
    message: r.errMsg || r.message || JSON.stringify(r)
  };
}

module.exports = {
  resolveCreatePaymentResult
};
