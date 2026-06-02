var roleUtil = require('../../utils/role.js');

// 管理员可切换的门店（'' = 全部）
var STORE_TABS = [
  { id: '', name: '全部' },
  { id: '51866138', name: '马己仙' },
  { id: '64822111', name: '洪潮' }
];

function buildCustomerListRequestData(keyword, app, selectedStoreId, tag) {
  var gd = (app && app.globalData) || {};
  var role = gd.userRole || '';
  var storeId = '';

  if (role === 'admin') {
    // 管理员：用页面上选择的门店（'' 表示全部）
    storeId = selectedStoreId || '';
  } else {
    storeId = (gd.staffStoreId || (gd.scanParams || {}).store_id) || '';
  }

  return {
    keyword: keyword || '',
    store_id: storeId,
    tag: tag || ''
  };
}

Page({
  data: {
    customers: [],
    stats: { totalUsers: 0, vipUsers: 0, newUsers: 0 },
    loading: true,
    keyword: '',
    isAdmin: false,
    storeTabs: STORE_TABS,
    selectedStoreId: '',
    // #2 标签筛选
    availableTags: [],
    selectedTag: '',
    // #3 批量选择
    selectMode: false,
    selectedIds: [],
    selectedCount: 0
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      self.setData({ isAdmin: true });
      self.loadData();
    });
  },

  onSelectStore: function (e) {
    var sid = e.currentTarget.dataset.id || '';
    if (sid === this.data.selectedStoreId) return;
    // 切换门店清空标签与已选
    this.setData({ selectedStoreId: sid, selectedTag: '', selectedIds: [], selectedCount: 0 });
    this.loadData();
  },

  onSelectTag: function (e) {
    var tag = e.currentTarget.dataset.tag || '';
    var next = (tag === this.data.selectedTag) ? '' : tag; // 再次点击取消
    this.setData({ selectedTag: next, selectedIds: [], selectedCount: 0 });
    this.loadData();
  },

  onShow: function() {
    this.loadData();
  },

  loadData: function() {
    var self = this;
    var app = getApp();
    self.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getCustomerList',
      data: buildCustomerListRequestData(self.data.keyword, app, self.data.selectedStoreId, self.data.selectedTag),
      success: function(res) {
        var r = res.result || {};
        if (r.success) {
          var selectedIds = self.data.selectedIds || [];
          var list = (r.data || []).map(function(c) {
            return Object.assign({}, c, {
              totalSpentText: c.totalSpent ? '¥' + (c.totalSpent / 100).toFixed(2) : '¥0.00',
              _checked: selectedIds.indexOf(c._id) >= 0
            });
          });
          self.setData({
            customers: list,
            stats: r.stats || { totalUsers: 0, vipUsers: 0, newUsers: 0 },
            availableTags: r.availableTags || [],
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

  // ---- 批量选择 ----
  onToggleSelectMode: function() {
    var on = !this.data.selectMode;
    this.setData({ selectMode: on, selectedIds: [], selectedCount: 0 });
    if (!on) this._syncChecks([]);
  },

  onToggleCustomer: function(e) {
    if (!this.data.selectMode) return;
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var ids = (this.data.selectedIds || []).slice();
    var idx = ids.indexOf(id);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(id);
    this.setData({ selectedIds: ids, selectedCount: ids.length });
    this._syncChecks(ids);
  },

  onSelectAll: function() {
    var all = (this.data.customers || []).map(function(c) { return c._id; });
    var ids = (this.data.selectedIds.length === all.length) ? [] : all;
    this.setData({ selectedIds: ids, selectedCount: ids.length });
    this._syncChecks(ids);
  },

  _syncChecks: function(ids) {
    var patch = {};
    (this.data.customers || []).forEach(function(c, i) {
      patch['customers[' + i + ']._checked'] = ids.indexOf(c._id) >= 0;
    });
    this.setData(patch);
  },

  // ---- 单个发券 ----
  onSendVoucher: function(e) {
    var userId = e.currentTarget.dataset.id;
    if (!userId) return wx.showToast({ title: '未知用户', icon: 'none' });
    this._pickTemplateThenSend([userId]);
  },

  // ---- 批量发券 ----
  onBatchSend: function() {
    var ids = this.data.selectedIds || [];
    if (ids.length === 0) return wx.showToast({ title: '请先选择客户', icon: 'none' });
    this._pickTemplateThenSend(ids);
  },

  _pickTemplateThenSend: function(userIds) {
    var self = this;
    var app = getApp();
    var requestData = buildCustomerListRequestData('', app, self.data.selectedStoreId, '');
    var storeId = requestData.store_id;

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
            self._sendToUsers(userIds, tpl._id, storeId);
          }
        });
      },
      fail: function() {
        wx.showToast({ title: '加载券模板失败', icon: 'none' });
      }
    });
  },

  _sendToUsers: function(userIds, templateId, storeId) {
    var self = this;
    var ok = 0, fail = 0;
    var total = userIds.length;
    wx.showLoading({ title: '发送中 0/' + total, mask: true });

    function next(i) {
      if (i >= total) {
        wx.hideLoading();
        wx.showModal({
          title: '发券完成',
          content: '成功 ' + ok + ' 人' + (fail ? '，失败 ' + fail + ' 人' : ''),
          showCancel: false
        });
        self.setData({ selectMode: false, selectedIds: [], selectedCount: 0 });
        self.loadData();
        return;
      }
      wx.showLoading({ title: '发送中 ' + i + '/' + total, mask: true });
      wx.cloud.callFunction({
        name: 'manualSendVoucher',
        data: { user_id: userIds[i], templateId: templateId, store_id: storeId },
        success: function(vRes) {
          var vr = vRes.result || {};
          if (vr.success) ok++; else fail++;
          next(i + 1);
        },
        fail: function() {
          fail++;
          next(i + 1);
        }
      });
    }
    next(0);
  }
});
