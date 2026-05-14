var roleUtil = require('../../../utils/role.js');

Page({
  data: {
    loading: true,
    wecomLinked: false,
    wecomInfo: null,
    vouchers: []
  },

  onLoad: function () {
    this.checkWecomStatus();
    this.loadUserVouchers();
  },

  onShow: function () {
    this.checkWecomStatus();
  },

  checkWecomStatus: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false });
      return;
    }
    wx.cloud.callFunction({
      name: 'queryWecomMapping',
      data: {},
      success: function (res) {
        var result = (res && res.result) || {};
        if (result.success && result.hasMapping) {
          self.setData({
            loading: false,
            wecomLinked: true,
            wecomInfo: {
              external_userid: result.external_userid,
              corpid: result.corpid
            }
          });
        } else {
          self.setData({
            loading: false,
            wecomLinked: false
          });
        }
      },
      fail: function () {
        self.setData({ loading: false, wecomLinked: false });
      }
    });
  },

  associateWecom: function () {
    var self = this;
    wx.showModal({
      title: '关联企业微信',
      content: '关联后可在企业微信中接收优惠券和活动通知',
      success: function (modalRes) {
        if (!modalRes.confirm) return;

        wx.cloud.callFunction({
          name: 'associateWecom',
          data: { store_id: (getApp().globalData.scanParams || {}).store_id || '' },
          success: function (res) {
            var result = (res && res.result) || {};
            if (result.success) {
              wx.showToast({ title: '关联成功', icon: 'success' });
              self.setData({
                wecomLinked: true,
                wecomInfo: {
                  external_userid: result.external_userid
                }
              });
            } else {
              wx.showToast({ title: result.error || '关联失败', icon: 'none' });
            }
          },
          fail: function () {
            wx.showToast({ title: '关联请求失败', icon: 'none' });
          }
        });
      }
    });
  },

  sendToWecom: function (e) {
    var voucherId = e.currentTarget.dataset.voucherId;
    if (!voucherId) return;

    wx.showLoading({ title: '发送中...' });

    wx.cloud.callFunction({
      name: 'sendWecomVoucher',
      data: {
        voucherId: voucherId,
        messageType: 'text',
        content: '',
        store_id: (getApp().globalData.scanParams || {}).store_id || ''
      },
      success: function (res) {
        wx.hideLoading();
        var result = (res && res.result) || {};
        if (result.success) {
          wx.showToast({ title: '已发送到企微', icon: 'success' });
        } else {
          wx.showToast({ title: result.error || '发送失败', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
    });
  },

  loadUserVouchers: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) return;

    var app = getApp();
    var storeId = (app.globalData.scanParams || {}).store_id || '';
    wx.cloud.callFunction({
      name: 'getUserVouchers',
      data: { store_id: storeId },
      success: function (res) {
        var result = (res && res.result) || {};
        if (result.success && result.data) {
          self.setData({ vouchers: result.data });
        }
      },
      fail: function () {}
    });
  }
});