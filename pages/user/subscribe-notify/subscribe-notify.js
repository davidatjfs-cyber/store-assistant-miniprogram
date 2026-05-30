var roleUtil = require('../../../utils/role.js');

Page({
  data: {
    loading: true,
    subscribed: false,
    sendResult: null,
    sendError: null
  },

  onLoad: function () {
    this.checkSubscribeStatus();
  },

  getStoreId: function () {
    var app = getApp();
    var fromScan = (app.globalData.scanParams || {}).store_id || '';
    if (fromScan) return fromScan;
    return app.globalData.staffStoreId || '';
  },

  checkSubscribeStatus: function () {
    var self = this;
    var openid = (wx.getStorageSync('openid')) || '';
    if (!openid) {
      wx.cloud.callFunction({
        name: 'ensureUserDoc',
        success: function (res) {
          if (res.result && res.result.openid) {
            self.setData({ loading: false });
          } else {
            self.setData({ loading: false });
          }
        },
        fail: function () {
          self.setData({ loading: false });
        }
      });
    } else {
      self.setData({ loading: false });
    }
  },

  requestSubscribe: function () {
    var self = this;
    var templateId = 'pyk3FCeBC4MtxptY3ZBeLUOiVx93Lmb_4pxkN8AFowE';

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: function (res) {
        console.log('订阅授权结果:', res);
        if (res[templateId] === 'accept') {
          wx.showToast({ title: '授权成功', icon: 'success' });
          self.setData({ subscribed: true });
        } else if (res[templateId] === 'reject') {
          wx.showToast({ title: '您已拒绝授权', icon: 'none' });
        } else if (res[templateId] === 'ban') {
          wx.showToast({ title: '模板已被禁用', icon: 'none' });
        }
      },
      fail: function (err) {
        console.error('订阅授权失败:', err);
        wx.showToast({ title: '授权失败', icon: 'none' });
      }
    });
  },

  sendTestMessage: function () {
    var self = this;
    wx.showLoading({ title: '发送中...' });

    wx.cloud.callFunction({
      name: 'sendSubscribeMessage',
      data: {
        store_id: self.getStoreId(),
        templateData: {
          thing1: { value: '测试通知' },
          thing2: { value: '这是一条测试消息' },
          time3: { value: new Date().toLocaleString('zh-CN') }
        }
      },
      success: function (res) {
        wx.hideLoading();
        var result = (res && res.result) || {};
        if (result.success) {
          self.setData({ sendResult: '发送成功', sendError: null });
          wx.showToast({ title: '发送成功', icon: 'success' });
        } else {
          self.setData({ sendResult: null, sendError: result.error || result.message });
          wx.showToast({ title: result.error || '发送失败', icon: 'none' });
        }
      },
      fail: function (err) {
        wx.hideLoading();
        self.setData({ sendResult: null, sendError: err.errMsg || '请求失败' });
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
    });
  }
});
