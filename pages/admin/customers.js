Page({
  data: {
    customers: [],
    stats: { totalUsers: 0, vipUsers: 0, newUsers: 0 },
    loading: true,
    keyword: '',
    voucherTemplates: [],
    sendingPhone: ''
  },

  onShow: function() {
    this.loadData();
    this.loadVoucherTemplates();
  },

  loadData: function() {
    var self = this;
    self.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getCustomerList',
      data: { keyword: self.data.keyword },
      success: function(res) {
        var r = res.result || {};
        if (r.success) {
          var list = (r.data || []).map(function(c) {
            return Object.assign({}, c, {
              totalSpentText: c.totalSpent ? '¥' + Math.round(c.totalSpent / 100) : '¥0'
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

  loadVoucherTemplates: function() {
    var self = this;
    wx.cloud.callFunction({
      name: 'getVoucherTemplates',
      data: {},
      success: function(res) {
        var r = res.result || {};
        if (r.success && r.data) {
          self.setData({ voucherTemplates: r.data });
        }
      },
      fail: function() {}
    });
  },

  onSearch: function(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSendVoucher: function(e) {
    var self = this;
    var phone = e.currentTarget.dataset.phone;
    if (!phone) return wx.showToast({ title: '未知用户', icon: 'none' });

    var tpls = self.data.voucherTemplates;
    if (!tpls.length) {
      wx.showToast({ title: '暂无可用的券模板', icon: 'none' });
      return;
    }
    self.setData({ sendingPhone: phone });

    var itemList = tpls.map(function(t) {
      var desc = t.name;
      if (t.type === 'cash') desc += ' (¥' + (t.value / 100).toFixed(2) + ')';
      else if (t.type === 'discount') desc += ' (' + (t.value / 10).toFixed(1) + '折)';
      return desc;
    });

    wx.showActionSheet({
      itemList: itemList,
      success: function(res) {
        var tpl = tpls[res.tapIndex];
        wx.showModal({
          title: '确认发券',
          content: '确定给 ' + phone + ' 发送一张【' + tpl.name + '】吗？',
          success: function(modalRes) {
            if (modalRes.confirm) {
              wx.showLoading({ title: '发送中' });
              wx.cloud.callFunction({
                name: 'manualSendVoucher',
                data: { phone: phone, templateId: tpl._id },
                success: function(res) {
                  wx.hideLoading();
                  if (res.result.success) {
                    wx.showToast({ title: '发送成功', icon: 'success' });
                  } else {
                    wx.showToast({ title: res.result.msg || '发送失败', icon: 'none' });
                  }
                },
                fail: function() {
                  wx.hideLoading();
                  wx.showToast({ title: '网络错误', icon: 'none' });
                }
              });
            }
          }
        });
      }
    });
  }
});
