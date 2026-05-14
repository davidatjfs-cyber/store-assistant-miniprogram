var roleUtil = require('../../utils/role.js');

function formatRoi(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(2);
}

Page({
  data: {
    loading: true,
    rules: [],
    statsDate: '',
    sceneInput: '',
    qrCodeBase64: '',
    generating: false
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      self.loadRules();
    });
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadRules().then(
      function () {
        wx.stopPullDownRefresh();
      },
      function () {
        wx.stopPullDownRefresh();
      }
    );
  },

  loadRules: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false });
      return Promise.resolve();
    }
    var app = getApp();
    var storeId = (app.globalData.staffStoreId || (app.globalData.scanParams || {}).store_id) || '';
    self.setData({ loading: true });
    return wx.cloud
      .callFunction({ name: 'getMarketingRules', data: { store_id: storeId } })
      .then(function (res) {
        var r = (res && res.result) || {};
        if (!r.success) {
          self.setData({ loading: false });
          wx.showToast({ title: r.message || '加载失败', icon: 'none' });
          return;
        }
        var list = (r.rules || []).map(function (x) {
          return Object.assign({}, x, { roiText: formatRoi(x.roi) });
        });
        self.setData({
          loading: false,
          rules: list,
          statsDate: r.date || ''
        });
      })
      .catch(function (e) {
        self.setData({ loading: false });
        wx.showToast({ title: (e && e.errMsg) || '加载失败', icon: 'none' });
      });
  },

  onToggleActive: function (e) {
    var id = e.currentTarget.dataset.id;
    var on = !!(e.detail && e.detail.value);
    this.patchRule(id, { active: on });
  },

  onPriMinus: function (e) {
    var id = e.currentTarget.dataset.id;
    var rule = null;
    for (var i = 0; i < this.data.rules.length; i++) {
      if (this.data.rules[i].rule_id === id) {
        rule = this.data.rules[i];
        break;
      }
    }
    if (!rule) return;
    var p = Math.max(0, (parseInt(rule.priority, 10) || 0) - 1);
    this.patchRule(id, { priority: p });
  },

  onPriPlus: function (e) {
    var id = e.currentTarget.dataset.id;
    var rule = null;
    for (var i = 0; i < this.data.rules.length; i++) {
      if (this.data.rules[i].rule_id === id) {
        rule = this.data.rules[i];
        break;
      }
    }
    if (!rule) return;
    var p = (parseInt(rule.priority, 10) || 0) + 1;
    this.patchRule(id, { priority: p });
  },

  patchRule: function (ruleId, update_fields) {
    var self = this;
    wx.showLoading({ title: '保存中', mask: true });
    wx.cloud
      .callFunction({
        name: 'updateMarketingRule',
        data: { rule_id: ruleId, update_fields: update_fields }
      })
      .then(function (res) {
        wx.hideLoading();
        var r = (res && res.result) || {};
        if (r.success) {
          wx.showToast({ title: '已保存', icon: 'success' });
          self.loadRules();
        } else {
          wx.showToast({ title: r.message || '失败', icon: 'none' });
        }
      })
      .catch(function (err) {
        wx.hideLoading();
        wx.showToast({ title: (err && err.errMsg) || '失败', icon: 'none' });
      });
  },

  onSceneInput: function(e) {
    this.setData({ sceneInput: e.detail.value });
  },

  onGenerateCode: function() {
    var self = this;
    if (!self.data.sceneInput) return wx.showToast({ title: '请输入活动标识', icon: 'none' });

    self.setData({ generating: true });
    wx.cloud.callFunction({
      name: 'getActivityCode',
      data: { scene: self.data.sceneInput },
      success: function(res) {
        self.setData({ generating: false });
        var result = (res && res.result) || {};
        if (result.success) {
          self.setData({ qrCodeBase64: result.base64 });
          wx.showToast({ title: '生成成功', icon: 'success' });
        } else {
          wx.showToast({ title: result.msg || '生成失败', icon: 'none' });
        }
      },
      fail: function() {
        self.setData({ generating: false });
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    });
  },

  previewQr: function() {
    if (this.data.qrCodeBase64) {
      wx.previewImage({
        urls: ['data:image/png;base64,' + this.data.qrCodeBase64]
      });
    }
  }
});
