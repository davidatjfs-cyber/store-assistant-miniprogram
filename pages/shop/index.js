var paymentResult = require('../../utils/payment-result.js');

Page({
  data: {
    templates: [],
    loading: true
  },

  onShow: function() {
    this.loadTemplates();
  },

  loadTemplates: function() {
    var self = this;
    var app = getApp();
    var storeId = (app.globalData.scanParams || {}).store_id || app.globalData.staffStoreId || '51866138';
    self.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getVoucherTemplates',
      data: { store_id: storeId },
      success: function(res) {
        var r = res.result || {};
        var list = (r.success && r.data) || [];
        // 只显示上架且有库存的，并预处理价格
        var available = list.filter(function(t) { return t.is_active && t.stock !== 0; }).map(function(t) {
          var benefitText = t.type === 'cash'
            ? '代金 ¥' + ((t.value || 0) / 100).toFixed(0)
            : ((t.value || 0) / 10) + ' 折礼遇';
          var stockText = t.stock === -1 ? '库存充足' : '剩余 ' + t.stock + ' 张';
          return Object.assign({}, t, {
            priceYuan: t.price ? (t.price / 100).toFixed(2) : '0.00',
            benefitText: benefitText,
            stockText: stockText
          });
        });
        self.setData({ templates: available, loading: false });
      },
      fail: function() {
        self.setData({ templates: [], loading: false });
      }
    });
  },

  onBuy: function(e) {
    var self = this;
    var templateId = e.currentTarget.dataset.id;
    var tpl = null;
    for (var i = 0; i < this.data.templates.length; i++) {
      if (this.data.templates[i]._id === templateId) { tpl = this.data.templates[i]; break; }
    }
    if (!tpl) return;

    if (tpl.price === 0 || tpl.priceYuan === '0.00') {
      // 免费领取
      self.claimFreeVoucher(templateId);
    } else {
      // 支付购买
      self.createPayment(templateId, 1);
    }
  },

  claimFreeVoucher: function(templateId) {
    var self = this;
    var app = getApp();
    var campaignId = app.globalData.campaignId || '';
    var storeId = (app.globalData.scanParams || {}).store_id || app.globalData.staffStoreId || '51866138';
    wx.showLoading({ title: '领取中' });
    wx.cloud.callFunction({
      name: 'createPayment',
      data: { voucher_id: templateId, quantity: 1, store_id: storeId, campaign_id: campaignId },
      success: function(res) {
        wx.hideLoading();
        var r = res.result || {};
        if (r.success) {
          if (r.data && r.data.free_claim) {
            wx.showToast({ title: '领取成功', icon: 'success' });
            setTimeout(function() {
              wx.navigateTo({ url: '/pages/voucher/list' });
            }, 1500);
          } else {
            wx.showToast({ title: '领取成功', icon: 'success' });
          }
        } else {
          wx.showModal({ title: '领取失败', content: r.errMsg || r.message || JSON.stringify(r), showCancel: false });
        }
      },
      fail: function(err) {
        wx.hideLoading();
        wx.showModal({ title: '请求失败', content: (err && err.errMsg) || JSON.stringify(err), showCancel: false });
      }
    });
  },

  createPayment: function(templateId, quantity) {
    var self = this;
    var app = getApp();
    var campaignId = app.globalData.campaignId || '';
    var storeId = (app.globalData.scanParams || {}).store_id || app.globalData.staffStoreId || '51866138';
    wx.showLoading({ title: '创建订单' });
    wx.cloud.callFunction({
      name: 'createPayment',
      data: { voucher_id: templateId, quantity: quantity, store_id: storeId, campaign_id: campaignId },
      success: function(res) {
        wx.hideLoading();
        var r = res.result || {};
        var resolved = paymentResult.resolveCreatePaymentResult(r);
        if (resolved.type === 'payment') {
          wx.requestPayment({
            timeStamp: resolved.payment.timeStamp,
            nonceStr: resolved.payment.nonceStr,
            package: resolved.payment.package,
            signType: resolved.payment.signType,
            paySign: resolved.payment.paySign,
            success: function() {
              wx.showToast({ title: '支付成功', icon: 'success' });
              setTimeout(function() {
                wx.navigateTo({ url: '/pages/voucher/list' });
              }, 1500);
            },
            fail: function() {
              wx.showToast({ title: '支付取消', icon: 'none' });
            }
          });
        } else if (resolved.type === 'free_claim') {
          wx.showToast({ title: '领取成功', icon: 'success' });
          setTimeout(function() {
            wx.navigateTo({ url: '/pages/voucher/list' });
          }, 1500);
        } else if (resolved.type === 'missing_payment') {
          wx.showModal({
            title: '支付参数异常',
            content: resolved.message,
            showCancel: false
          });
        } else {
          wx.showModal({ title: '创建订单失败', content: resolved.message, showCancel: false });
        }
      },
      fail: function(err) {
        wx.hideLoading();
        wx.showModal({ title: '请求失败', content: (err && err.errMsg) || JSON.stringify(err), showCancel: false });
      }
    });
  }
});
