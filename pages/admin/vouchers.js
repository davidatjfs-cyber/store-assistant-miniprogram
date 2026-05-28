var roleUtil = require('../../utils/role.js');

var STORES = [
  { id: '51866138', name: '马己仙广东小馆' },
  { id: '64822111', name: '洪潮潮汕传统菜' }
];

function buildStoreChecks(selectedIds) {
  return STORES.map(function (s) {
    return { id: s.id, name: s.name, checked: selectedIds.indexOf(s.id) >= 0 };
  });
}

Page({
  data: {
    templates: [],
    loading: true,
    showEditModal: false,
    editingId: '',
    saving: false,
    templateData: null,
    stores: STORES,
    storeChecks: [],
    formData: {
      name: '',
      type: 'cash',
      valueYuan: '',
      discount: '',
      priceYuan: '',
      valid_days: '30',
      stock: '-1',
      cost_fen: '',
      usage_rule: '',
      store_ids: []
    }
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      self.loadTemplates();
    });
  },

  onShow: function() {
    if (this.data.templates && this.data.templates.length > 0) {
      this.loadTemplates();
    }
  },

  loadTemplates: function() {
    var self = this;
    self.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getVoucherTemplates',
      data: { store_id: '' },
      success: function(res) {
        var r = res.result || {};
        var raw = (r.success && r.data) || [];
        var list = raw.map(function(t) {
          var storeNames = (t.store_ids || []).map(function(sid) {
            for (var i = 0; i < STORES.length; i++) {
              if (STORES[i].id === sid) return STORES[i].name;
            }
            return sid;
          });
          return Object.assign({}, t, {
            valueYuan: t.value ? '\u00a5' + (t.value / 100).toFixed(2) : '\u2014',
            discountText: t.value ? (t.value / 10).toFixed(1) + '\u6298' : '\u2014',
            priceYuan: t.price ? '\u00a5' + (t.price / 100).toFixed(2) : '\u514d\u8d39',
            storeNames: storeNames.join('\u3001')
          });
        });
        self.setData({ templates: list, loading: false });
      },
      fail: function() {
        self.setData({ templates: [], loading: false });
        wx.showToast({ title: '\u52a0\u8f7d\u5931\u8d25', icon: 'none' });
      }
    });
  },

  onAdd: function() {
    var defaults = ['51866138', '64822111'];
    this.setData({
      showEditModal: true,
      editingId: '',
      formData: {
        name: '', type: 'cash', valueYuan: '', discount: '',
        priceYuan: '', valid_days: '30', stock: '-1', cost_fen: '',
        usage_rule: '',
        store_ids: defaults
      },
      storeChecks: buildStoreChecks(defaults)
    });
  },

  onEdit: function(e) {
    var id = e.currentTarget.dataset.id;
    var tpl = null;
    for (var i = 0; i < this.data.templates.length; i++) {
      if (this.data.templates[i]._id === id) { tpl = this.data.templates[i]; break; }
    }
    if (!tpl) return;
    var sids = tpl.store_ids ? tpl.store_ids.slice() : [];
    this.setData({
      showEditModal: true,
      editingId: id,
      templateData: tpl,
      formData: {
        name: tpl.name || '',
        type: tpl.type || 'cash',
        valueYuan: tpl.value ? String(tpl.value / 100) : '',
        discount: tpl.value ? String(tpl.value / 10) : '',
        priceYuan: tpl.price ? String(tpl.price / 100) : '',
        valid_days: String(tpl.valid_days || 30),
        stock: String(tpl.stock != null ? tpl.stock : -1),
        cost_fen: tpl.cost_fen != null ? String(tpl.cost_fen) : '',
        usage_rule: tpl.usage_rule || '',
        store_ids: sids
      },
      storeChecks: buildStoreChecks(sids)
    });
  },

  onToggleActive: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var active = e.detail.value;
    wx.cloud.callFunction({
      name: 'updateVoucherTemplate',
      data: { id: id, data: { is_active: active } },
      success: function() {
        wx.showToast({ title: active ? '已启用' : '已停用', icon: 'success' });
        self.loadTemplates();
      },
      fail: function() {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    });
  },

  onDelete: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定吗？',
      success: function(res) {
        if (!res.confirm) return;
        wx.cloud.callFunction({
          name: 'deleteVoucherTemplate',
          data: { id: id },
          success: function() {
            wx.showToast({ title: '已删除', icon: 'success' });
            self.loadTemplates();
          },
          fail: function() {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        });
      }
    });
  },

  onCloseModal: function() {
    this.setData({ showEditModal: false });
  },

  onInputName: function(e) { this.setData({ 'formData.name': e.detail.value }); },
  onSelectType: function(e) { this.setData({ 'formData.type': e.currentTarget.dataset.type }); },
  onInputValue: function(e) { this.setData({ 'formData.valueYuan': e.detail.value }); },
  onInputDiscount: function(e) { this.setData({ 'formData.discount': e.detail.value }); },
  onInputPrice: function(e) { this.setData({ 'formData.priceYuan': e.detail.value }); },
  onInputDays: function(e) { this.setData({ 'formData.valid_days': e.detail.value }); },
  onInputStock: function(e) { this.setData({ 'formData.stock': e.detail.value }); },
  onInputCost: function(e) { this.setData({ 'formData.cost_fen': e.detail.value }); },
  onInputRule: function(e) { this.setData({ 'formData.usage_rule': e.detail.value }); },

onToggleStore: function(e) {
    var sid = e.currentTarget.dataset.id;
    var ids = this.data.formData.store_ids.slice();
    var idx = ids.indexOf(sid);
    if (idx >= 0) { ids.splice(idx, 1); } else { ids.push(sid); }
    this.setData({ 'formData.store_ids': ids, storeChecks: buildStoreChecks(ids) });
  },

  onSave: function() {
    var self = this;
    var f = self.data.formData;
    if (!f.name) { wx.showToast({ title: '请输入券名称', icon: 'none' }); return; }
    if (!f.store_ids || f.store_ids.length === 0) { wx.showToast({ title: '请选择适用门店', icon: 'none' }); return; }

    var data = {
      name: f.name,
      type: f.type,
      price: Math.round(parseFloat(f.priceYuan || '0') * 100),
      valid_days: parseInt(f.valid_days) || 30,
      stock: isNaN(parseInt(f.stock)) ? -1 : parseInt(f.stock),
      cost_fen: parseInt(f.cost_fen) || 0,
      usage_rule: f.usage_rule,
      is_active: self.data.editingId ? !!(self.data.templateData && self.data.templateData.is_active) : true,
      store_ids: f.store_ids,
      min_spend: 0,
      valid_time_range: { start: '00:00', end: '23:59' },
      valid_weekdays: [1,2,3,4,5,6,7]
    };

    if (f.type === 'cash') {
      data.value = Math.round(parseFloat(f.valueYuan || '0') * 100);
    } else if (f.type === 'discount') {
      data.value = Math.round(parseFloat(f.discount || '10') * 10);
    }

    self.setData({ saving: true });
    var fn = self.data.editingId ? 'updateVoucherTemplate' : 'createVoucherTemplate';
    var reqData = self.data.editingId ? { id: self.data.editingId, data: data } : { data: data };

    wx.cloud.callFunction({
      name: fn,
      data: reqData,
      success: function() {
        self.setData({ saving: false, showEditModal: false });
        wx.showToast({ title: '保存成功', icon: 'success' });
        self.loadTemplates();
      },
      fail: function() {
        self.setData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  }
});
