var roleUtil = require('../../../utils/role.js');

Page({
  data: {
    loading: true,
    wecomLinked: false,
    wecomInfo: null,
    vouchers: [],
    wecomAvailable: true,
    dialogVisible: false,
    dialogMode: '',
    dialogTitle: '',
    dialogDesc: '',
    confirmLoading: false
  },

  onLoad: function () {
    this.checkWecomStatus();
    this.loadUserVouchers();
  },

  getStoreId: function () {
    var app = getApp();
    var fromScan = (app.globalData.scanParams || {}).store_id || '';
    if (fromScan) return fromScan;
    return app.globalData.staffStoreId || '';
  },

  checkWecomStatus: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false });
      return;
    }
    var storeId = self.getStoreId();
    wx.cloud.callFunction({
      name: 'queryWecomMapping',
      data: { store_id: storeId },
      success: function (res) {
        var result = (res && res.result) || {};
        if (!result.success) {
          self.setData({ loading: false, wecomLinked: false, wecomAvailable: true });
          return;
        }
        if (!result.wecomAvailable) {
          self.setData({ loading: false, wecomAvailable: false });
          return;
        }
        if (result.hasMapping) {
          self.setData({
            loading: false,
            wecomAvailable: true,
            wecomLinked: true,
            wecomInfo: {
              external_userid: result.external_userid,
              corpid: result.corpid
            }
          });
        } else {
          self.setData({
            loading: false,
            wecomAvailable: true,
            wecomLinked: false
          });
        }
      },
      fail: function () {
        self.setData({ loading: false, wecomLinked: false });
      }
    });
  },

  showDialog: function (mode, title, desc) {
    this.setData({
      dialogVisible: true,
      dialogMode: mode || '',
      dialogTitle: title || '',
      dialogDesc: desc || ''
    });
  },

  hideDialog: function () {
    this.setData({
      dialogVisible: false,
      dialogMode: '',
      dialogTitle: '',
      dialogDesc: '',
      confirmLoading: false
    });
  },

  associateWecom: function () {
    this.showDialog(
      'associate',
      '关联企业微信',
      '关联后可在企业微信中接收优惠券和活动通知。'
    );
  },

  confirmDialogAction: function () {
    var self = this;
    if (self.data.dialogMode !== 'associate') {
      self.hideDialog();
      return;
    }

    self.setData({ confirmLoading: true });
    wx.cloud.callFunction({
      name: 'associateWecom',
      data: { store_id: self.getStoreId() },
      success: function (res) {
        var result = (res && res.result) || {};
        if (result.success) {
          wx.showToast({ title: '关联成功', icon: 'success' });
          self.setData({
            confirmLoading: false,
            wecomLinked: true,
            wecomInfo: {
              external_userid: result.external_userid
            }
          });
          self.loadUserVouchers();
          self.checkWecomStatus();
          self.hideDialog();
        } else {
          self.setData({ confirmLoading: false });
          wx.showToast({ title: result.error || '关联失败', icon: 'none' });
        }
      },
      fail: function () {
        self.setData({ confirmLoading: false });
        wx.showToast({ title: '关联请求失败', icon: 'none' });
      }
    });
  },

  sendToWecom: function (e) {
    var self = this;
    var voucherId = e.currentTarget.dataset.voucherId;
    if (!voucherId) return;

    wx.showLoading({ title: '发送中...' });

    wx.cloud.callFunction({
      name: 'sendWecomVoucher',
      data: {
        voucherId: voucherId,
        messageType: 'text',
        content: '',
        store_id: self.getStoreId()
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

    var storeId = self.getStoreId();
    wx.cloud.callFunction({
      name: 'getUserVouchers',
      data: { store_id: storeId },
      success: function (res) {
        var result = (res && res.result) || {};
        if (result.success && result.data) {
          self.setData({
            vouchers: result.data.map(function (item) {
              var faceValue = item.face_value || item.amount || '';
              return Object.assign({}, item, {
                displayName: item.name || item.template_name || '优惠券',
                amountText: faceValue ? String(faceValue) : '会员礼遇'
              });
            })
          });
        }
      },
      fail: function () {}
    });
  }
});
