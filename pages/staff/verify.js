var roleUtil = require('../../utils/role.js');

Page({
  data: {
    storeId: '',
    orderAmountFen: '',
    lastMessage: '',
    lastOk: false,
    arrivals: [],
    arrivalsLoaded: false
  },

  onAmountInput: function (e) {
    // 只允许数字输入
    var val = String(e.detail.value).replace(/[^\d]/g, '');
    this.setData({ orderAmountFen: val });
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['staff', 'manager', 'admin']).then(function (ok) {
      if (!ok) {
        self.setData({ arrivalsLoaded: true, storeLocked: true });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      var storeId = '';
      try {
        var app = getApp();
        if (app.globalData && app.globalData.staffStoreId) {
          storeId = String(app.globalData.staffStoreId);
        }
        var p = app.globalData && app.globalData.scanParams;
        if (!storeId && p && p.store_id) storeId = String(p.store_id);
      } catch (e) {}
      self.setData({ storeId: storeId });
      self.loadRecentArrivals();
    });
  },

  onShow: function () {
    if (this.data.storeId || getApp().globalData.staffStoreId) {
      this.loadRecentArrivals();
    }
  },

  loadRecentArrivals: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ arrivals: [], arrivalsLoaded: true });
      return;
    }
    wx.cloud
      .callFunction({ name: 'getRecentArrivals', data: { store_id: self.data.storeId } })
      .then(function (res) {
        var r = (res && res.result) || {};
        var raw = r.items || [];
        var list = raw.slice(0, 5);
        self.setData({ arrivals: list, arrivalsLoaded: true });
      })
      .catch(function (err) {
        self.setData({ arrivals: [], arrivalsLoaded: true });
        console.error('loadRecentArrivals failed:', err && err.errMsg);
      });
  },

  onScan: function () {
    var self = this;
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: function (res) {
        var raw = (res && res.result) ? String(res.result).trim() : '';
        if (!raw) {
          self.setData({ lastOk: false, lastMessage: '未识别到二维码内容' });
          return;
        }
        self.verify(raw);
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return;
        self.setData({
          lastOk: false,
          lastMessage: (err && err.errMsg) || '扫码失败'
        });
      }
    });
  },

  verify: function (qrCode) {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ lastOk: false, lastMessage: '云能力未初始化' });
      return;
    }
    wx.showLoading({ title: '核销中…' });
    wx.cloud.callFunction({
      name: 'verifyVoucher',
      data: {
        qr_code: qrCode,
        store_id: self.data.storeId || '',
        order_amount_fen: self.data.orderAmountFen
      },
      success: function (res) {
        wx.hideLoading();
        var r = res.result || {};
        if (r.success) {
          self.setData({ lastOk: true, lastMessage: r.message || '核销成功' });
          wx.showToast({ title: '核销成功', icon: 'success' });
          self.loadRecentArrivals();
        } else {
          var msg = r.message || '核销失败';
          self.setData({ lastOk: false, lastMessage: msg });
          wx.showToast({ title: msg, icon: 'none' });
        }
      },
      fail: function (err) {
        wx.hideLoading();
        var msg = (err && err.errMsg) ? err.errMsg : '云函数调用失败';
        self.setData({ lastOk: false, lastMessage: msg });
        wx.showToast({ title: msg, icon: 'none' });
      }
    });
  }
});
