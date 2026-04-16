Page({
  data: {
    templates: [],
    loading: true,
    showEditModal: false,
    editingId: '',
    saving: false,
    formData: {
      name: '',
      type: 'cash',
      valueYuan: '',
      discount: '',
      priceYuan: '',
      valid_days: '30',
      stock: '-1',
      usage_rule: ''
    }
  },

  onShow: function() {
    this.loadTemplates();
  },

  loadTemplates: function() {
    var self = this;
    self.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getVoucherTemplates',
      data: {},
      success: function(res) {
        var r = res.result || {};
        var raw = (r.success && r.data) || [];
        var list = raw.map(function(t) {
          return Object.assign({}, t, {
            valueYuan: t.value ? '¥' + (t.value / 100).toFixed(2) : '—',
            discountText: t.value ? (t.value / 10).toFixed(1) + '折' : '—',
            priceYuan: t.price ? '¥' + (t.price / 100).toFixed(2) : '免费'
          });
        });
        self.setData({
          templates: list,
          loading: false
        });
      },
      fail: function() {
        self.setData({ templates: [], loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  onAdd: function() {
    this.setData({
      showEditModal: true,
      editingId: '',
      formData: {
        name: '', type: 'cash', valueYuan: '', discount: '',
        priceYuan: '', valid_days: '30', stock: '-1', usage_rule: ''
      }
    });
  },

  onEdit: function(e) {
    var id = e.currentTarget.dataset.id;
    var tpl = null;
    for (var i = 0; i < this.data.templates.length; i++) {
      if (this.data.templates[i]._id === id) { tpl = this.data.templates[i]; break; }
    }
    if (!tpl) return;
    this.setData({
      showEditModal: true,
      editingId: id,
      formData: {
        name: tpl.name || '',
        type: tpl.type || 'cash',
        valueYuan: tpl.value ? String(tpl.value / 100) : '',
        discount: tpl.value ? String(tpl.value / 10) : '',
        priceYuan: tpl.price ? String(tpl.price / 100) : '',
        valid_days: String(tpl.valid_days || 30),
        stock: String(tpl.stock != null ? tpl.stock : -1),
        usage_rule: tpl.usage_rule || ''
      }
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
  onInputRule: function(e) { this.setData({ 'formData.usage_rule': e.detail.value }); },

  onSave: function() {
    var self = this;
    var f = self.data.formData;
    if (!f.name) { wx.showToast({ title: '请输入券名称', icon: 'none' }); return; }

    var data = {
      name: f.name,
      type: f.type,
      price: Math.round(parseFloat(f.priceYuan || '0') * 100),
      valid_days: parseInt(f.valid_days) || 30,
      stock: parseInt(f.stock) != null ? parseInt(f.stock) : -1,
      usage_rule: f.usage_rule,
      is_active: true,
      store_ids: ['store_test_001'],
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
