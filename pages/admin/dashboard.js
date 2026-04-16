var roleUtil = require('../../utils/role.js');

function fenToYuan(fen) {
  var n = parseInt(fen, 10) || 0;
  return (n / 100).toFixed(2);
}

function formatRoi(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(2);
}

Page({
  data: {
    loading: true,
    date: '',
    issuedToday: 0,
    usedToday: 0,
    revenueYuan: '0.00',
    rules: [],
    subtitle: ''
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['manager', 'admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      var role = roleUtil.getUserRoleSync();
      if (role === 'manager') {
        wx.setNavigationBarTitle({ title: '门店数据' });
        self.setData({ subtitle: '本门店今日数据' });
      } else {
        self.setData({ subtitle: '全部门店今日汇总' });
      }
      self.loadDashboard();
    });
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadDashboard().then(
      function () {
        wx.stopPullDownRefresh();
      },
      function () {
        wx.stopPullDownRefresh();
      }
    );
  },

  loadDashboard: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false });
      return Promise.resolve();
    }
    self.setData({ loading: true });
    return wx.cloud
      .callFunction({ name: 'getMarketingDashboard', data: {} })
      .then(function (res) {
        var r = (res && res.result) || {};
        if (!r.success) {
          self.setData({ loading: false });
          wx.showToast({ title: r.message || '加载失败', icon: 'none' });
          return;
        }
        var sum = (r.today && r.today.summary) || {};
        var rules = (r.today && r.today.rules) || [];
        var mapped = rules.map(function (x) {
          return {
            rule_id: x.rule_id,
            name: x.name || x.rule_id,
            roiText: formatRoi(x.roi)
          };
        });
        self.setData({
          loading: false,
          date: r.date || '',
          issuedToday: sum.issued_count || 0,
          usedToday: sum.used_count || 0,
          revenueYuan: fenToYuan(sum.revenue_fen),
          rules: mapped
        });
      })
      .catch(function (e) {
        self.setData({ loading: false });
        wx.showToast({ title: (e && e.errMsg) || '加载失败', icon: 'none' });
      });
  }
});
