var roleUtil = require('../../utils/role.js');

var STORES = [
  { id: '51866138', name: '马己仙广东小馆' },
  { id: '64822111', name: '洪潮潮汕传统菜' }
];

function fenToYuan(fen) {
  var n = parseInt(fen, 10) || 0;
  return (n / 100).toFixed(2);
}

function formatRoi(v) {
  if (v == null || Number.isNaN(v)) return '\u2014';
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
    subtitle: '',
    isAdmin: false,
    storeIndex: 0,
    stores: STORES,
    isAllStores: true
  },

  onLoad: function (options) {
    var self = this;
    roleUtil.checkRoleAccess(['manager', 'admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      var role = roleUtil.getUserRoleSync();
      var scope = (options && options.scope) || '';
      var isAdmin = role === 'admin';
      var storeId = '';
      try { storeId = getApp().globalData.staffStoreId || ''; } catch (e) {}

      if (role === 'manager') {
        wx.setNavigationBarTitle({ title: '门店数据' });
        var mIdx = 0;
        for (var i = 0; i < STORES.length; i++) {
          if (STORES[i].id === storeId) { mIdx = i; break; }
        }
        self.setData({ subtitle: STORES[mIdx].name + ' 今日数据', isAllStores: false, storeIndex: mIdx, isAdmin: false });
        self.loadDashboard(storeId);
      } else if (scope === 'store') {
        wx.setNavigationBarTitle({ title: '门店数据看板' });
        var dIdx = 0;
        for (var j = 0; j < STORES.length; j++) {
          if (STORES[j].id === (storeId || STORES[0].id)) { dIdx = j; break; }
        }
        self.setData({ subtitle: STORES[dIdx].name + ' 今日数据', isAllStores: false, storeIndex: dIdx, isAdmin: true });
        self.loadDashboard(STORES[dIdx].id);
      } else {
        self.setData({ subtitle: '全部门店今日汇总', isAllStores: true, storeIndex: 0, isAdmin: true });
        self.loadDashboard('');
      }
    });
  },

  onStoreChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var store = STORES[idx];
    if (!store) return;
    this.setData({ selectedStoreId: store.id, subtitle: store.name + ' 今日数据', storeIndex: idx, isAllStores: false });
    this.loadDashboard(store.id);
  },

  onToggleView: function () {
    if (this.data.isAllStores) {
      var idx = this.data.storeIndex;
      this.setData({ isAllStores: false, subtitle: STORES[idx].name + ' 今日数据' });
      this.loadDashboard(STORES[idx].id);
    } else {
      this.setData({ isAllStores: true, subtitle: '全部门店今日汇总' });
      this.loadDashboard('');
    }
  },

  onPullDownRefresh: function () {
    var self = this;
    var storeId = '';
    if (!this.data.isAllStores) {
      storeId = STORES[this.data.storeIndex].id;
    }
    this.loadDashboard(storeId).then(
      function () { wx.stopPullDownRefresh(); },
      function () { wx.stopPullDownRefresh(); }
    );
  },

  loadDashboard: function (storeId) {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false });
      return Promise.resolve();
    }
    self.setData({ loading: true });
    return wx.cloud
      .callFunction({ name: 'getMarketingDashboard', data: { store_id: storeId || '' } })
      .then(function (res) {
        var r = (res && res.result) || {};
        if (!r.success) {
          self.setData({ loading: false });
          wx.showToast({ title: r.message || '\u52a0\u8f7d\u5931\u8d25', icon: 'none' });
          return;
        }
        var sum = (r.today && r.today.summary) || {};
        var rules = (r.today && r.today.rules) || [];
        var mapped = rules.map(function (x) {
          return { rule_id: x.rule_id, name: x.name || x.rule_id, roiText: formatRoi(x.roi) };
        });
        self.setData({ loading: false, date: r.date || '', issuedToday: sum.issued_count || 0, usedToday: sum.used_count || 0, revenueYuan: fenToYuan(sum.revenue_fen), rules: mapped });
      })
      .catch(function (e) {
        self.setData({ loading: false });
        wx.showToast({ title: (e && e.errMsg) || '\u52a0\u8f7d\u5931\u8d25', icon: 'none' });
      });
  }
});