var roleUtil = require('../../utils/role.js');

var STORES = [
  { id: '51866138', name: '马己仙广东小馆' },
  { id: '64822111', name: '洪潮潮汕传统菜' }
];

var TRIGGER_TYPES = [
  { value: 'payment', label: '支付后触发' },
  { value: 'inactivity', label: 'N天未到店召回' },
  { value: 'manual', label: '手动发放' }
];

var TARGET_TAGS = [
  { value: 'prospect', label: '潜在新客' },
  { value: 'new', label: '新客' },
  { value: 'active', label: '活跃客' },
  { value: 'at_risk', label: '临界客' },
  { value: 'dormant', label: '沉睡老客' },
  { value: 'churned', label: '流失客' },
  { value: 'vip', label: 'VIP' },
  { value: 'regular', label: '常规价值' },
  { value: 'low', label: '低价值' }
];

function formatRoi(v) {
  if (v == null || Number.isNaN(v)) return '\u2014';
  return Number(v).toFixed(2);
}

function formatYuanFromFen(fen) {
  var n = parseInt(fen, 10) || 0;
  if (n % 100 === 0) return String(n / 100);
  return (n / 100).toFixed(2);
}

function formatVoucherTemplateOption(t) {
  t = t || {};
  var valueFen = t.value != null ? t.value : (t.face_value != null ? t.face_value : 0);
  var parts = [];
  if (valueFen) parts.push('面值' + formatYuanFromFen(valueFen) + '元');
  if (t.min_spend) parts.push('满' + formatYuanFromFen(t.min_spend) + '元可用');
  if (t.store_display_name || t.storeName) parts.push(t.store_display_name || t.storeName);
  var suffix = parts.length ? '（' + parts.join('，') + '）' : '';
  return {
    id: t._id,
    name: (t.name || t.template_name || t._id || '未命名券模板') + suffix
  };
}

function formatTriggerValueDisplay(triggerType, triggerValue) {
  if (triggerType === 'payment') {
    var fen = parseInt(triggerValue, 10) || 0;
    if (fen <= 0) return '支付成功后发券（无消费门槛）';
    return '实付满' + formatYuanFromFen(fen) + '元后发券';
  }
  if (triggerType === 'inactivity') {
    var days = parseInt(triggerValue, 10) || 7;
    return days + '天未到店后发券';
  }
  if (triggerType === 'manual') {
    return '手动选择客户后发券';
  }
  return '';
}

function buildStoreChecks(selectedIds) {
  return STORES.map(function (s) {
    return { id: s.id, name: s.name, checked: selectedIds.indexOf(s.id) >= 0 };
  });
}

function buildTagChecks(selectedTags) {
  return TARGET_TAGS.map(function (t) {
    return { value: t.value, label: t.label, checked: selectedTags.indexOf(t.value) >= 0 };
  });
}

Page({
  data: {
    loading: true,
    rules: [],
    statsDate: '',
    stores: STORES,
    triggerTypes: TRIGGER_TYPES,
    targetTagOptions: TARGET_TAGS,
    storeChecks: [],
    tagChecks: [],
    templateOptions: [],
    showCreateModal: false,
    creating: false,
    createForm: {
      name: '',
      priority: '10',
      store_ids: ['51866138', '64822111'],
      active: true,
      trigger_type: 'payment',
      action_type: 'send_voucher',
      template_id: '',
      templateIndex: -1,
      target_tags: ['new'],
      trigger_value: '0',
      daily_user_limit: '1',
      global_daily_limit: '100'
    },
    winbackStoreIndex: 0,
    winbackValue: '30',
    winbackValidDays: '14',
    winbackDormantDays: '14',
    winbackMinBalance: '1',
    winbackRunning: false,
    winbackResult: ''
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        self.setData({ loading: false });
        wx.showToast({ title: '无访问权限', icon: 'none' });
        return;
      }
      self.loadTemplates().then(function () {
        self.loadRules();
      });
    });
  },

  onPullDownRefresh: function () {
    this.loadRules().then(
      function () { wx.stopPullDownRefresh(); },
      function () { wx.stopPullDownRefresh(); }
    );
  },

  loadTemplates: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve();
    return new Promise(function (resolve) {
      wx.cloud.callFunction({
        name: 'getVoucherTemplates',
        data: { store_id: '' },
        success: function (res) {
          var r = res.result || {};
          var raw = (r.success && r.data) || [];
          var list = raw.filter(function (t) { return t.is_active !== false; }).map(function (t) {
            return formatVoucherTemplateOption(t);
          });
          self.setData({ templateOptions: list });
          resolve();
        },
        fail: function () { resolve(); }
      });
    });
  },

  loadRules: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ loading: false });
      return Promise.resolve();
    }
    self.setData({ loading: true });
    return wx.cloud
      .callFunction({ name: 'getMarketingRules', data: {} })
      .then(function (res) {
        var r = (res && res.result) || {};
        if (!r.success) {
          self.setData({ loading: false });
          wx.showToast({ title: r.message || '加载失败', icon: 'none' });
          return;
        }
        var templateOptions = self.data.templateOptions;
        var list = (r.rules || []).map(function (x) {
          var storeName = '';
          for (var i = 0; i < STORES.length; i++) {
            if (STORES[i].id === x.store_id) { storeName = STORES[i].name; break; }
          }
          var triggerLabel = '';
          for (var j = 0; j < TRIGGER_TYPES.length; j++) {
            if (TRIGGER_TYPES[j].value === x.trigger_type) { triggerLabel = TRIGGER_TYPES[j].label; break; }
          }
          var tagLabel = '';
          if (x.target_tags && x.target_tags.length) {
            tagLabel = x.target_tags.map(function (tv) {
              for (var k = 0; k < TARGET_TAGS.length; k++) {
                if (TARGET_TAGS[k].value === tv) return TARGET_TAGS[k].label;
              }
              return tv;
            }).join('\u3001');
          }
          var triggerValDisplay = formatTriggerValueDisplay(x.trigger_type, x.trigger_value);
          var templateName = x.template_name || x.template_id;
          for (var m = 0; m < templateOptions.length; m++) {
            if (templateOptions[m].id === x.template_id) { templateName = templateOptions[m].name; break; }
          }
          return Object.assign({}, x, {
            roiText: formatRoi(x.roi),
            storeName: storeName || x.store_id,
            triggerLabel: triggerLabel,
            tagLabel: tagLabel,
            triggerValDisplay: triggerValDisplay,
            templateName: templateName
          });
        });
        self.setData({ loading: false, rules: list, statsDate: r.date || '' });
      })
      .catch(function (e) {
        self.setData({ loading: false });
        wx.showToast({ title: (e && e.errMsg) || '加载失败', icon: 'none' });
      });
  },

  onToggleActive: function (e) {
    var id = e.currentTarget.dataset.id;
    this.patchRule(id, { active: e.detail.value });
  },

  onPriMinus: function (e) {
    var id = e.currentTarget.dataset.id;
    var rule = null;
    for (var i = 0; i < this.data.rules.length; i++) {
      if (this.data.rules[i].rule_id === id) { rule = this.data.rules[i]; break; }
    }
    if (!rule) return;
    var p = Math.max(0, (parseInt(rule.priority, 10) || 0) - 1);
    this.patchRule(id, { priority: p });
  },

  onPriPlus: function (e) {
    var id = e.currentTarget.dataset.id;
    var rule = null;
    for (var i = 0; i < this.data.rules.length; i++) {
      if (this.data.rules[i].rule_id === id) { rule = this.data.rules[i]; break; }
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

  onCreateTap: function () {
    var defaults = ['51866138', '64822111'];
    var defaultTags = ['new'];
    this.setData({
      showCreateModal: true,
      createForm: {
        name: '', priority: '10',
        store_ids: defaults, active: true,
        trigger_type: 'payment', action_type: 'send_voucher',
        template_id: '', templateIndex: -1,
        target_tags: defaultTags,
        trigger_value: '0', daily_user_limit: '1', global_daily_limit: '100'
      },
      storeChecks: buildStoreChecks(defaults),
      tagChecks: buildTagChecks(defaultTags)
    });
  },

  onDeleteRule: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name || '\u6b64\u89c4\u5219';
    wx.showModal({
      title: '\u786e\u8ba4\u5220\u9664',
      content: '\u5220\u9664\u300c' + name + '\u300d\u540e\u4e0d\u53ef\u6062\u590d\uff0c\u786e\u5b9a\u5417\uff1f',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '\u5220\u9664\u4e2d', mask: true });
        wx.cloud.callFunction({
          name: 'deleteMarketingRule',
          data: { rule_id: id },
          success: function (r) {
            wx.hideLoading();
            var result = (r && r.result) || {};
            if (result.success) {
              wx.showToast({ title: '\u5df2\u5220\u9664', icon: 'success' });
              self.loadRules();
            } else {
              wx.showToast({ title: result.message || '\u5220\u9664\u5931\u8d25', icon: 'none' });
            }
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({ title: '\u5220\u9664\u5931\u8d25', icon: 'none' });
          }
        });
      }
    });
  },

  onCreateClose: function () {
    this.setData({ showCreateModal: false });
  },

  onInputRuleName: function (e) {
    this.setData({ 'createForm.name': e.detail.value });
  },

  onInputPriority: function (e) {
    this.setData({ 'createForm.priority': e.detail.value });
  },

  onSelectTriggerType: function (e) {
    var val = e.currentTarget.dataset.value;
    this.setData({ 'createForm.trigger_type': val });
  },

  onSelectTemplate: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var tpls = this.data.templateOptions;
    if (idx >= 0 && idx < tpls.length) {
      this.setData({ 'createForm.template_id': tpls[idx].id, 'createForm.templateIndex': idx });
    }
  },

  onInputTriggerValue: function (e) {
    this.setData({ 'createForm.trigger_value': e.detail.value });
  },

  onInputDailyLimit: function (e) {
    this.setData({ 'createForm.daily_user_limit': e.detail.value });
  },

  onInputGlobalLimit: function (e) {
    this.setData({ 'createForm.global_daily_limit': e.detail.value });
  },

  onToggleCreateStore: function (e) {
    var sid = e.currentTarget.dataset.id;
    var ids = this.data.createForm.store_ids.slice();
    var idx = ids.indexOf(sid);
    if (idx >= 0) { ids.splice(idx, 1); } else { ids.push(sid); }
    this.setData({ 'createForm.store_ids': ids, storeChecks: buildStoreChecks(ids) });
  },

  onToggleCreateTag: function (e) {
    var val = e.currentTarget.dataset.value;
    var tags = this.data.createForm.target_tags.slice();
    var idx = tags.indexOf(val);
    if (idx >= 0) { tags.splice(idx, 1); } else { tags.push(val); }
    this.setData({ 'createForm.target_tags': tags, tagChecks: buildTagChecks(tags) });
  },

  onSubmitCreate: function () {
    var self = this;
    var f = self.data.createForm;
    if (!f.name.trim()) { wx.showToast({ title: '\u8bf7\u8f93\u5165\u89c4\u5219\u540d\u79f0', icon: 'none' }); return; }
    if (!f.store_ids || f.store_ids.length === 0) { wx.showToast({ title: '\u8bf7\u9009\u62e9\u9002\u7528\u95e8\u5e97', icon: 'none' }); return; }
    if (!f.template_id) { wx.showToast({ title: '\u8bf7\u9009\u62e9\u5173\u8054\u52b8\u6a21\u677f', icon: 'none' }); return; }

    self.setData({ creating: true });
    wx.cloud.callFunction({
      name: 'createMarketingRule',
      data: {
        name: f.name.trim(),
        priority: parseInt(f.priority, 10) || 10,
        store_ids: f.store_ids,
        active: f.active,
        trigger_type: f.trigger_type,
        action_type: 'send_voucher',
        template_id: f.template_id,
        target_tags: f.target_tags,
        trigger_value: f.trigger_type === 'payment'
          ? String(Math.round(parseFloat(f.trigger_value || '0') * 100))
          : f.trigger_value,
        daily_user_limit: parseInt(f.daily_user_limit, 10),
        global_daily_limit: parseInt(f.global_daily_limit, 10)
      },
      success: function (res) {
        self.setData({ creating: false, showCreateModal: false });
        var r = (res && res.result) || {};
        if (r.success) {
          wx.showToast({ title: '\u521b\u5efa\u6210\u529f', icon: 'success' });
          self.loadRules();
        } else {
          wx.showToast({ title: r.message || '\u521b\u5efa\u5931\u8d25', icon: 'none' });
        }
      },
      fail: function () {
        self.setData({ creating: false });
        wx.showToast({ title: '\u521b\u5efa\u5931\u8d25', icon: 'none' });
      }
    });
  },

  // ===== \u50a8\u503c\u5ba2\u6237\u53ec\u56de =====
  onWinbackStore: function (e) { this.setData({ winbackStoreIndex: Number(e.detail.value) || 0 }); },
  onWinbackValue: function (e) { this.setData({ winbackValue: e.detail.value }); },
  onWinbackValidDays: function (e) { this.setData({ winbackValidDays: e.detail.value }); },
  onWinbackDormant: function (e) { this.setData({ winbackDormantDays: e.detail.value }); },
  onWinbackMinBalance: function (e) { this.setData({ winbackMinBalance: e.detail.value }); },
  onRunWinback: function () {
    var self = this;
    var store = STORES[this.data.winbackStoreIndex] || STORES[0];
    var value = Math.floor(Number(this.data.winbackValue) || 0);
    if (value <= 0) { wx.showToast({ title: '\u8bf7\u8f93\u5165\u5238\u9762\u989d', icon: 'none' }); return; }
    var days = Math.floor(Number(this.data.winbackValidDays) || 14);
    var dormant = Math.floor(Number(this.data.winbackDormantDays) || 14);
    var minBal = Math.floor(Number(this.data.winbackMinBalance) || 1);
    wx.showModal({
      title: '\u786e\u8ba4\u53d1\u8d77\u50a8\u503c\u53ec\u56de',
      content: '\u95e8\u5e97:' + store.name + '\uff1b\u9762\u989d:' + value + '\u5143\uff1b\u6709\u6548\u671f:' + days + '\u5929\uff1b\u5bf9\u8c61:\u6709\u4f59\u989d\u2265' + minBal + '\u5143\u4e14' + dormant + '\u5929\u672a\u6d88\u8d39\u7684\u50a8\u503c\u5ba2\u6237\u3002\u786e\u5b9a\u7fa4\u53d1\u77ed\u4fe1?',
      success: function (r) {
        if (!r.confirm) return;
        self.setData({ winbackRunning: true, winbackResult: '' });
        wx.showLoading({ title: '\u53ec\u56de\u4e2d\u2026' });
        wx.cloud.callFunction({
          name: 'sendWinbackCampaign',
          data: { store_id: store.id, value_yuan: value, valid_days: days, dormant_days: dormant, min_balance_yuan: minBal },
          success: function (res) {
            wx.hideLoading();
            var d = res.result || {};
            self.setData({ winbackRunning: false, winbackResult: d.msg || (d.success ? '\u5b8c\u6210' : '\u5931\u8d25') });
            wx.showToast({ title: d.success ? '\u5df2\u53d1\u8d77' : '\u5931\u8d25', icon: d.success ? 'success' : 'none' });
          },
          fail: function (err) {
            wx.hideLoading();
            self.setData({ winbackRunning: false, winbackResult: '\u8c03\u7528\u5931\u8d25:' + ((err && err.errMsg) || '') });
            wx.showToast({ title: '\u8c03\u7528\u5931\u8d25', icon: 'none' });
          }
        });
      }
    });
  }
});
