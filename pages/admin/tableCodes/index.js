var roleUtil = require('../../../utils/role.js');

var STORE_CONFIGS = {
  '51866138': {
    name: '马己仙广东小馆',
    zones: [
      { name: 'A区', tables: ['A1','A2','A3','A5','A6','A8','A9','A10','A11','A12','A13'] },
      { name: 'B区', tables: ['B1','B2','B3','B5','B6','B8','B9','B10','B11','B12'] },
      { name: 'C区', tables: ['C1','C2','C3','C5','C6','C8','C9','C10'] },
      { name: 'D区', tables: ['D1','D2','D3','D5','D6','D8','D9'] },
      { name: '外摆', tables: ['外摆1','外摆2','外摆3','外摆5','外摆6','外摆8'] },
      { name: '外带', tables: ['外带1','外带2'] }
    ]
  },
  '64822111': {
    name: '洪潮潮汕传统菜',
    zones: [
      { name: 'V区', tables: ['V1','V2'] },
      { name: 'K区', tables: ['k1','k2'] },
      { name: '1楼', tables: ['101','102','103'] },
      { name: '2楼', tables: ['201','202','203'] },
      { name: '3楼', tables: ['301','302','303','305'] },
      { name: '5楼', tables: ['501','502','503'] },
      { name: '6楼', tables: ['601','602'] },
      { name: '外带', tables: ['外带1','外带2'] }
    ]
  }
};

var STORE_IDS = ['51866138', '64822111'];

Page({
  data: {
    stores: STORE_IDS.map(function (id) { return { id: id, name: STORE_CONFIGS[id].name }; }),
    storeIndex: 0,
    zones: [],
    generating: false,
    saving: false,
    storeName: '',
    totalTables: 0,
    generatedCount: 0,
    saveProgress: '',
    showCanvas: false
  },

  onLoad: function (options) {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) { wx.showToast({ title: '无访问权限', icon: 'none' }); wx.navigateBack(); return; }
      self.initStore(options && options.store === 'hongchao' ? 1 : 0);
    });
  },

  initStore: function (idx) {
    var sid = STORE_IDS[idx];
    var cfg = STORE_CONFIGS[sid];
    var zones = cfg.zones.map(function (z) {
      return { name: z.name, tables: z.tables.map(function (t) { return { id: t, qrBase64: '', done: false, error: '' }; }) };
    });
    var total = 0;
    for (var i = 0; i < zones.length; i++) total += zones[i].tables.length;
    this.setData({ storeIndex: idx, storeName: cfg.name, zones: zones, totalTables: total, generatedCount: 0 });
  },

  onStoreChange: function (e) { this.initStore(parseInt(e.detail.value, 10)); },

  onGenerateAll: function () {
    var self = this;
    var sid = STORE_IDS[self.data.storeIndex];
    var allTables = [];
    var zones = self.data.zones;
    for (var i = 0; i < zones.length; i++) for (var j = 0; j < zones[i].tables.length; j++) allTables.push(zones[i].tables[j].id);

    wx.showLoading({ title: '生成中 0/' + allTables.length, mask: true });
    self.setData({ generating: true, generatedCount: 0 });

    wx.cloud.callFunction({
      name: 'batchTableCodes',
      data: { tables: allTables, store_id: sid },
      success: function (res) {
        wx.hideLoading();
        var r = (res && res.result) || {};
        if (!r.success) { wx.showToast({ title: r.message || '生成失败', icon: 'none' }); self.setData({ generating: false }); return; }
        var resultMap = {};
        for (var k = 0; k < r.results.length; k++) resultMap[r.results[k].table_id] = r.results[k];
        var updatedZones = self.data.zones.map(function (z) {
          return { name: z.name, tables: z.tables.map(function (t) { var res = resultMap[t.id]; return res ? { id: t.id, qrBase64: res.base64 || '', done: !!res.base64, error: res.error || '' } : t; }) };
        });
        var count = 0;
        for (var m = 0; m < updatedZones.length; m++) for (var n = 0; n < updatedZones[m].tables.length; n++) if (updatedZones[m].tables[n].done) count++;
        self.setData({ zones: updatedZones, generating: false, generatedCount: count, showCanvas: count > 0 });
        wx.showToast({ title: '生成完成 ' + count + '/' + allTables.length, icon: 'success' });
      },
      fail: function (err) {
        wx.hideLoading();
        self.setData({ generating: false });
        var msg = (err && (err.errMsg || err.message)) || '';
        if (msg.indexOf('not found') >= 0 || msg.indexOf('Function not found') >= 0) {
          wx.showModal({ title: '云函数未部署', content: 'batchTableCodes 未上传部署，请右键上传并部署。', showCancel: false });
        } else {
          wx.showModal({ title: '生成失败', content: msg, showCancel: false });
        }
      }
    });
  },

  onSaveAllImages: function () {
    var self = this;
    wx.showModal({
      title: '保存全部图片到相册',
      content: '将逐张生成并保存已生成的桌码图片（含桌号），共 ' + self.data.generatedCount + ' 张。请确保已授权相册权限。',
      success: function (modalRes) {
        if (!modalRes.confirm) return;
        // 检查相册权限
        wx.getSetting({
          success: function (setting) {
            if (setting.authSetting['scope.writePhotosAlbum'] === false) {
              wx.openSetting({ success: function (s) { if (s.authSetting['scope.writePhotosAlbum']) self.startSaveImages(); } });
            } else {
              self.startSaveImages();
            }
          },
          fail: function () { self.startSaveImages(); }
        });
      }
    });
  },

  startSaveImages: function () {
    var self = this;
    var allTables = [];
    var zones = self.data.zones;
    for (var i = 0; i < zones.length; i++) for (var j = 0; j < zones[i].tables.length; j++) {
      if (zones[i].tables[j].qrBase64) allTables.push(zones[i].tables[j]);
    }
    self.setData({ saving: true, saveProgress: '0/' + allTables.length });
    self.saveNextImage(allTables, 0);
  },

  saveNextImage: function (tables, idx) {
    var self = this;
    if (idx >= tables.length) {
      wx.hideLoading();
      self.setData({ saving: false, saveProgress: '' });
      wx.showToast({ title: '已保存 ' + tables.length + ' 张', icon: 'success' });
      return;
    }
    var tbl = tables[idx];
    self.setData({ saveProgress: (idx + 1) + '/' + tables.length });
    wx.showLoading({ title: '合成中 ' + (idx + 1) + '/' + tables.length, mask: true });

    var IMG_W = 500, IMG_H = 620, QR_SIZE = 420, QR_X = (IMG_W - QR_SIZE) / 2, QR_Y = 40, LABEL_Y = QR_Y + QR_SIZE + 30;

    var query = wx.createSelectorQuery();
    query.select('#saveCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        wx.hideLoading();
        self.setData({ saving: false });
        wx.showToast({ title: 'Canvas 初始化失败', icon: 'none' });
        return;
      }
      var canvas = res[0].node;
      var ctx = canvas.getContext('2d');
      canvas.width = IMG_W;
      canvas.height = IMG_H;

      // 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, IMG_W, IMG_H);

      // 加载二维码图片
      var img = canvas.createImage();
      img.src = 'data:image/png;base64,' + tbl.qrBase64;
      img.onload = function () {
        ctx.drawImage(img, QR_X, QR_Y, QR_SIZE, QR_SIZE);

        // 桌号文字
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // 桌号大标题
        ctx.font = 'bold 52px sans-serif';
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(tbl.id, IMG_W / 2, LABEL_Y);

        // 提示文字
        ctx.font = '22px sans-serif';
        ctx.fillStyle = '#888888';
        ctx.fillText('扫码点餐', IMG_W / 2, LABEL_Y + 60);

        // 门店名
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(self.data.storeName, IMG_W / 2, LABEL_Y + 90);

        // 导出
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0,
          width: IMG_W, height: IMG_H,
          destWidth: IMG_W * 2, destHeight: IMG_H * 2,
          fileType: 'png',
          quality: 1,
          success: function (tmpRes) {
            wx.saveImageToPhotosAlbum({
              filePath: tmpRes.tempFilePath,
              success: function () {
                wx.hideLoading();
                self.saveNextImage(tables, idx + 1);
              },
              fail: function (saveErr) {
                wx.hideLoading();
                self.setData({ saving: false });
                wx.showModal({ title: '保存失败', content: '第 ' + (idx + 1) + ' 张保存失败: ' + (saveErr.errMsg || ''), showCancel: false });
              }
            });
          },
          fail: function (ce) {
            wx.hideLoading();
            self.setData({ saving: false });
            wx.showModal({ title: '导出图片失败', content: ce.errMsg || '', showCancel: false });
          }
        });
      };
      img.onerror = function () {
        wx.hideLoading();
        self.setData({ saving: false });
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      };
    });
  },

  previewQr: function (e) {
    var base64 = e.currentTarget.dataset.base64;
    if (base64) wx.previewImage({ urls: ['data:image/png;base64,' + base64] });
  }
});