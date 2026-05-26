function formatExpire(v) {
  if (!v) return '—';
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '—';
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

function formatBenefit(template) {
  if (!template) return '专属礼遇';
  if (template.type === 'cash') {
    return '代金 ¥' + ((template.value || 0) / 100).toFixed(0);
  }
  if (template.type === 'discount') {
    return ((template.value || 0) / 10) + ' 折礼遇';
  }
  return '专属礼遇';
}

function normalizeVoucherItem(item) {
  if (!item) return item;
  var normalized = Object.assign({}, item);
  if (normalized.status === 'active') {
    normalized.status = 'unused';
  }
  if (!normalized.qr_code && normalized._id) {
    normalized.qr_code = 'voucher:' + normalized._id;
  }
  return normalized;
}

Page({
  data: {
    list: [],
    loading: true,
    statusText: {
      active: '待使用',
      unused: '待使用',
      used: '已使用',
      expired: '已过期'
    }
  },

  onShow: function () {
    this.loadList();
  },

  onRefresh: function () {
    this.loadList();
  },

  loadList: function () {
    var self = this;
    self.setData({ loading: true });
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false, list: [] });
      wx.showModal({
        title: '提示',
        content: '请先在 app.js 中初始化云开发后再试。',
        showCancel: false
      });
      return;
    }

    var app = getApp();
    var storeId = (app.globalData.scanParams || {}).store_id || '';
    wx.cloud.callFunction({
      name: 'getUserVouchers',
      data: { store_id: storeId },
      success: function (res) {
        var r = res.result || {};
        var raw = (r.success && r.data) || [];
        var list = raw.map(function (item) {
          var normalized = normalizeVoucherItem(item);
          var t = normalized.template;
          var displayName = (t && t.name) || '优惠券';
          return Object.assign({}, normalized, {
            expireText: formatExpire(normalized.expire_at),
            displayName: displayName,
            benefitText: formatBenefit(t)
          });
        });
        self.setData({ list: list, loading: false });
      },
      fail: function (err) {
        self.setData({ loading: false });
        wx.showToast({ title: '加载失败，请下拉刷新重试', icon: 'none' });
      }
    });
  },

  onOpenDetail: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item || !item._id) return;
    try {
      wx.setStorageSync('voucher_detail_item', item);
    } catch (err) {
      console.warn('setStorageSync', err);
    }
    wx.navigateTo({
      url: '/pages/voucher/detail?id=' + encodeURIComponent(item._id)
    });
  }
});
