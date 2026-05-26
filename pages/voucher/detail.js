var drawQrcode = require('../../utils/weapp.qrcode.js');

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

Page({
  data: {
    item: null,
    displayName: '优惠券',
    expireText: '',
    benefitText: '',
    statusText: {
      unused: '待使用',
      used: '已使用',
      expired: '已过期'
    }
  },

  onLoad: function (options) {
    var id = options.id ? decodeURIComponent(options.id) : '';
    var cached = null;
    try {
      cached = wx.getStorageSync('voucher_detail_item');
    } catch (e) {}
    if (cached && cached._id === id) {
      this.applyItem(cached);
      return;
    }
    this.fetchById(id);
  },

  onReady: function () {
    this.drawQrIfNeeded();
  },

  onShow: function () {
    this.drawQrIfNeeded();
  },

  applyItem: function (item) {
    if (!item) return;
    var t = item.template;
    var displayName = (t && t.name) || '优惠券';
    this.setData({
      item: item,
      displayName: displayName,
      expireText: formatExpire(item.expire_at),
      benefitText: formatBenefit(t)
    });
  },

  fetchById: function (id) {
    var self = this;
    if (!id) {
      self.setData({ item: null });
      return;
    }
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ item: null });
      return;
    }
    wx.cloud.callFunction({
      name: 'getUserVouchers',
      data: { voucherId: id },
      success: function (res) {
        var r = res.result || {};
        var list = (r.success && (Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []))) || [];
        var found = null;
        if (r.success && r.data && r.data._id === id) {
          found = r.data;
        } else if (Array.isArray(r.data)) {
          for (var i = 0; i < r.data.length; i++) {
            if (r.data[i]._id === id) {
              found = r.data[i];
              break;
            }
          }
        }
        if (found) {
          self.applyItem(found);
          self.drawQrIfNeeded();
        } else {
          self.setData({ item: null });
        }
      },
      fail: function () {
        self.setData({ item: null });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  drawQrIfNeeded: function () {
    var self = this;
    var item = self.data.item;
    if (!item || item.status !== 'unused' || !item.qr_code) return;

    setTimeout(function () {
      try {
        drawQrcode({
          width: 200,
          height: 200,
          canvasId: 'voucherQr',
          text: String(item.qr_code),
          _this: self,
          correctLevel: 1,
          background: '#ffffff',
          foreground: '#000000',
          callback: function () {}
        });
      } catch (e) {
        console.error('drawQrcode', e);
      }
    }, 80);
  }
});
