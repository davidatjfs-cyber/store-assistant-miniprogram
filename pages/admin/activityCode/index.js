var roleUtil = require('../../../utils/role.js');

var STORES = [
  { id: '51866138', name: '马己仙广东小馆' },
  { id: '64822111', name: '洪潮潮汕传统菜' }
];

function buildStoreChecks(selectedId) {
  return STORES.map(function (s) {
    return { id: s.id, name: s.name, checked: s.id === selectedId };
  });
}

Page({
  data: {
    sceneInput: '',
    qrCodeBase64: '',
    generating: false,
    stores: STORES,
    storeChecks: [],
    selectedStoreId: '51866138'
  },

  onLoad: function () {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        wx.showToast({ title: '无访问权限', icon: 'none' });
        wx.navigateBack();
      }
    });
    self.setData({ storeChecks: buildStoreChecks('51866138') });
  },

  onSelectStore: function (e) {
    var sid = e.currentTarget.dataset.id;
    this.setData({ selectedStoreId: sid, storeChecks: buildStoreChecks(sid), qrCodeBase64: '' });
  },

  onSceneInput: function(e) {
    this.setData({ sceneInput: e.detail.value });
  },

  onGenerateCode: function() {
    var self = this;
    if (!self.data.sceneInput) return wx.showToast({ title: '请输入活动标识', icon: 'none' });

    var scene = self.data.sceneInput;
    var storeId = self.data.selectedStoreId;
    if (storeId) {
      scene = 'store_id=' + storeId + '&scene=' + scene;
    }

    self.setData({ generating: true });
    wx.cloud.callFunction({
      name: 'getActivityCode',
      data: { scene: scene },
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