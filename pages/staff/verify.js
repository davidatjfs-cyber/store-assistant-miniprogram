var roleUtil = require('../../utils/role.js');

Page({
  data: {
    storeId: '',
    orderAmountFen: '',
    lastMessage: '',
    lastOk: false,
    arrivals: [],
    arrivalsLoaded: false,
    regularTipVisible: false,
    regularTip: null
  },

  // 已见到店记录（user_id|created_at），用于检测新熟客
  _seenArrivals: null,
  _baselineDone: false,
  _pollTimer: null,

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
    this.startPolling();
  },

  onHide: function () {
    this.stopPolling();
  },

  onUnload: function () {
    this.stopPolling();
  },

  startPolling: function () {
    var self = this;
    this.stopPolling();
    this._pollTimer = setInterval(function () {
      if (self.data.storeId) self.loadRecentArrivals();
    }, 15000);
  },

  stopPolling: function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  closeRegularTip: function () {
    this.setData({ regularTipVisible: false, regularTip: null });
  },

  // 检测本次返回中是否有「新出现」的熟客（来店≥2次），有则弹窗
  detectNewRegular: function (list) {
    if (!this._seenArrivals) this._seenArrivals = {};
    var newRegular = null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var key = String(it.user_id) + '|' + String(it.created_at);
      var seen = this._seenArrivals[key];
      this._seenArrivals[key] = true;
      if (!this._baselineDone) continue; // 首次加载只建立基线，不弹窗
      var visits = it.total_visits != null ? it.total_visits : 0;
      if (!seen && visits >= 2 && !newRegular) {
        newRegular = it;
      }
    }
    this._baselineDone = true;
    if (newRegular) {
      this.setData({
        regularTipVisible: true,
        regularTip: {
          display_name: newRegular.display_name + (newRegular.level_suffix || ''),
          total_visits: newRegular.total_visits,
          favorite_dish: newRegular.favorite_dish || '',
          user_level: newRegular.user_level
        }
      });
      try { wx.vibrateShort && wx.vibrateShort(); } catch (e) {}
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
        self.detectNewRegular(raw);
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
