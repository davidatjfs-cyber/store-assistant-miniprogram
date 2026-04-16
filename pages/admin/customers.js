Page({
  data: {
    customers: [],
    stats: { totalUsers: 0, vipUsers: 0, newUsers: 0 },
    loading: true,
    keyword: ''
  },

  onShow: function() {
    this.loadData();
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

  onSearch: function(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSendVoucher: function(e) {
    var phone = e.currentTarget.dataset.phone;
    if (!phone) return wx.showToast({ title: '未知用户', icon: 'none' });

    wx.showModal({
      title: '确认发券',
      content: '确定给 ' + phone + ' 发送一张【100元代金券】吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '发送中' });
          wx.cloud.callFunction({
            name: 'manualSendVoucher',
            data: { 
              phone: phone, 
              templateId: 'test_voucher_100'
            },
            success: (res) => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({ title: '发送成功', icon: 'success' });
              } else {
                wx.showToast({ title: res.result.msg, icon: 'none' });
              }
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          });
        }
      }
    });
  }
});
