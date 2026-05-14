var roleUtil = require('../../utils/role.js');

Page({
  data: {
    customers: [],
    stats: { totalUsers: 0, vipUsers: 0, newUsers: 0 },
    loading: true,
    keyword: ''
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      self.loadData();
    });
  },

  onShow: function() {
    this.loadData();
  },

  loadData: function() {
    var self = this;
    var app = getApp();
    var storeId = (app.globalData.staffStoreId || (app.globalData.scanParams || {}).store_id) || '';
    self.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getCustomerList',
      data: { keyword: self.data.keyword, store_id: storeId },
      success: function(res) {
        var r = res.result || {};
        if (r.success) {
          var list = (r.data || []).map(function(c) {
            return Object.assign({}, c, {
              totalSpentText: c.totalSpent ? '¥' + (c.totalSpent / 100).toFixed(2) : '¥0.00'
            });
          });
          self.setData({
            customers: list,
            stats: r.stats || { totalUsers: 0, vipUsers: 0, newUsers: 0 },
            loading: false
          });
        } else {
          self.setData({ loading: false });
        }
      },
      fail: function() {
        self.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  onSearch: function(e) {
    this.setData({ keyword: e.detail.value });
    this.loadData();
  },

  onSendVoucher: function(e) {
    var phone = e.currentTarget.dataset.phone;
    var userId = e.currentTarget.dataset.id;
    if (!phone && !userId) return wx.showToast({ title: '未知用户', icon: 'none' });

    var self = this;
    var app = getApp();
    var app = getApp();
    var storeId = (app.globalData.staffStoreId || (app.globalData.scanParams || {}).store_id) || '';

    wx.cloud.callFunction({
      name: 'getVoucherTemplates',
      data: { store_id: storeId },
      success: function(res) {
        var r = res.result || {};
        var templates = (r.success && r.data) || [];
        var activeTemplates = templates.filter(function(t) { return t.is_active && (t.stock === -1 || t.stock > 0); });
        if (activeTemplates.length === 0) {
          wx.showToast({ title: '暂无可用券模板', icon: 'none' });
          return;
        }
        var items = activeTemplates.map(function(t) { return t.name; });
        wx.showActionSheet({
          itemList: items,
          success: function(sheetRes) {
            var tpl = activeTemplates[sheetRes.tapIndex];
            wx.showLoading({ title: '发送中' });
            wx.cloud.callFunction({
              name: 'manualSendVoucher',
              data: { 
                phone: phone, 
                templateId: tpl._id,
                store_id: storeId
              },
              success: function(vRes) {
                wx.hideLoading();
                var vr = vRes.result || {};
                if (vr.success) {
                  wx.showToast({ title: '发送成功', icon: 'success' });
                } else {
                  wx.showToast({ title: vr.msg || '发送失败', icon: 'none' });
                }
              },
              fail: function() {
                wx.hideLoading();
                wx.showToast({ title: '网络错误', icon: 'none' });
              }
            });
          }
        });
      },
      fail: function() {
        wx.showToast({ title: '加载券模板失败', icon: 'none' });
      }
    });
  }
});
