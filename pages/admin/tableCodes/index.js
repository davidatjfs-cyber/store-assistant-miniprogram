var roleUtil = require('../../../utils/role.js');
var exportUtil = require('../../../utils/table-code-export.js');
var BATCH_SIZE = 1;
var MAX_RETRY = 2;
var EXPORT_IMAGE_CHUNK_SIZE = exportUtil.EXPORT_IMAGE_CHUNK_SIZE;
var EXPORT_CANVAS_WIDTH = exportUtil.EXPORT_CANVAS_WIDTH;
var EXPORT_CANVAS_HEIGHT = exportUtil.EXPORT_CANVAS_HEIGHT;
var EXPORT_PAGE_PADDING = exportUtil.EXPORT_PAGE_PADDING;
var EXPORT_CARD_GAP = exportUtil.EXPORT_CARD_GAP;
var EXPORT_CARD_COLUMNS = exportUtil.EXPORT_CARD_COLUMNS;
var EXPORT_CARD_ROWS = exportUtil.EXPORT_CARD_ROWS;

var STORE_CONFIGS = {
  '51866138': {
    name: '马己仙广东小馆',
    zones: [
      { name: 'A区', tables: ['A1', 'A2', 'A3', 'A5', 'A6', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13'] },
      { name: 'B区', tables: ['B1', 'B2', 'B3', 'B5', 'B6', 'B8', 'B9', 'B10', 'B11', 'B12'] },
      { name: 'C区', tables: ['C1', 'C2', 'C3', 'C5', 'C6', 'C8', 'C9', 'C10'] },
      { name: 'D区', tables: ['D1', 'D2', 'D3', 'D5', 'D6', 'D8', 'D9'] },
      { name: '外摆', tables: ['外摆1', '外摆2', '外摆3', '外摆5', '外摆6', '外摆8'] },
      { name: '外带', tables: ['外带1', '外带2'] }
    ]
  },
  '64822111': {
    name: '洪潮潮汕传统菜',
    zones: [
      { name: 'V区', tables: ['V1', 'V2'] },
      { name: 'K区', tables: ['k1', 'k2'] },
      { name: '1楼', tables: ['101', '102', '103'] },
      { name: '2楼', tables: ['201', '202', '203'] },
      { name: '3楼', tables: ['301', '302', '303', '305'] },
      { name: '5楼', tables: ['501', '502', '503', '505'] },
      { name: '6楼', tables: ['601', '602', '603', '605'] },
      { name: '外带', tables: ['外带1', '外带2'] }
    ]
  }
};

var STORE_IDS = ['51866138', '64822111'];

function buildTableState(tableId) {
  return {
    id: tableId,
    qrBase64: '',
    generating: false,
    done: false,
    error: '',
    selected: false
  };
}

Page({
  data: {
    stores: STORE_IDS.map(function (id) { return { id: id, name: STORE_CONFIGS[id].name }; }),
    storeIndex: 0,
    zones: [],
    generating: false,
    exporting: false,
    storeName: '',
    totalTables: 0,
    generatedCount: 0,
    selectedCount: 0,
    exportCanvasWidth: EXPORT_CANVAS_WIDTH,
    exportCanvasHeight: EXPORT_CANVAS_HEIGHT
  },

  onLoad: function (options) {
    var self = this;
    roleUtil.checkRoleAccess(['admin']).then(function (ok) {
      if (!ok) {
        wx.showToast({ title: '无访问权限', icon: 'none' });
        wx.navigateBack();
        return;
      }
      var storeIdx = 0;
      if (options && options.store === 'hongchao') storeIdx = 1;
      self.initStore(storeIdx);
    });
  },

  initStore: function (idx) {
    var sid = STORE_IDS[idx];
    var cfg = STORE_CONFIGS[sid];
    var zones = cfg.zones.map(function (z) {
      return {
        name: z.name,
        tables: z.tables.map(function (t) {
          return buildTableState(t);
        })
      };
    });
    var total = 0;
    for (var i = 0; i < zones.length; i++) { total += zones[i].tables.length; }
    this.setData({ storeIndex: idx, storeName: cfg.name, zones: zones, totalTables: total, generatedCount: 0, selectedCount: 0, generating: false });
  },

  onStoreChange: function (e) {
    this.initStore(parseInt(e.detail.value, 10));
  },

  onGenerateAll: function () {
    this.startGenerateFlow(this.collectAllTableIds(), { title: '生成全部桌码' });
  },

  onGenerateSelected: function () {
    var selectedIds = this.collectSelectedTableIds();
    if (!selectedIds.length) {
      wx.showToast({ title: '请先勾选桌位', icon: 'none' });
      return;
    }
    this.startGenerateFlow(selectedIds, { title: '生成选中桌码' });
  },

  onGenerateSingle: function (e) {
    var tableId = e.currentTarget.dataset.id;
    if (!tableId) return;
    this.startGenerateFlow([tableId], { title: '生成 ' + tableId });
  },

  startGenerateFlow: function (tableIds, options) {
    if (this.data.generating) return;
    if (!tableIds || !tableIds.length) {
      wx.showToast({ title: '没有可生成的桌位', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中 0/' + tableIds.length, mask: true });
    this.setData({ generating: true });
    this.setTablesGenerating(tableIds, true);
    this.generateTableCodeQueue(tableIds, options || {});
  },

  generateTableCodeQueue: async function (tableIds, options) {
    var self = this;
    var resultMap = {};
    var processed = 0;
    var failedTables = [];

    try {
      for (var start = 0; start < tableIds.length; start += BATCH_SIZE) {
        var batchTables = tableIds.slice(start, start + BATCH_SIZE);
        var batchResult = await self.requestBatchWithRetry(batchTables);
        for (var i = 0; i < batchResult.results.length; i++) {
          var item = batchResult.results[i];
          resultMap[item.table_id] = item;
          if (item.error && failedTables.indexOf(item.table_id) < 0) {
            failedTables.push(item.table_id);
          }
        }
        processed += batchTables.length;
        self.applyGeneratedResults(resultMap);
        wx.showLoading({ title: '生成中 ' + processed + '/' + tableIds.length, mask: true });
      }

      wx.hideLoading();
      self.setTablesGenerating(tableIds, false);
      self.setData({ generating: false });
      if (failedTables.length) {
        wx.showModal({
          title: '部分生成失败',
          content: '以下桌码生成失败：' + failedTables.join('、'),
          showCancel: false
        });
      } else {
        wx.showToast({ title: options.title || '生成完成', icon: 'success' });
      }
    } catch (err) {
      wx.hideLoading();
      self.setTablesGenerating(tableIds, false);
      self.setData({ generating: false });
      self.handleGenerateError(err);
    }
  },

  requestBatchWithRetry: async function (batchTables) {
    var lastError = null;
    for (var attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        var sid = STORE_IDS[this.data.storeIndex];
        var res = await wx.cloud.callFunction({
          name: 'batchTableCodes',
          data: { tables: batchTables, store_id: sid, force: true }
        });
        var r = (res && res.result) || {};
        if (!r.success) {
          throw new Error(r.message || '批量生成失败');
        }
        return r;
      } catch (err) {
        lastError = err;
      }
    }
    return {
      success: true,
      results: batchTables.map(function (tableId) {
        return { table_id: tableId, error: (lastError && (lastError.errMsg || lastError.message)) || '生成失败' };
      })
    };
  },

  applyGeneratedResults: function (resultMap) {
    var updatedZones = this.data.zones.map(function (z) {
      return {
        name: z.name,
        tables: z.tables.map(function (t) {
          var res = resultMap[t.id];
          if (res) {
            return {
              id: t.id,
              qrBase64: res.base64 || t.qrBase64 || '',
              generating: false,
              done: !!(res.base64 || t.qrBase64),
              error: res.error || '',
              selected: t.selected
            };
          }
          return t;
        })
      };
    });
    this.refreshZones(updatedZones);
  },

  setTablesGenerating: function (tableIds, generating) {
    var tableMap = {};
    for (var i = 0; i < tableIds.length; i++) tableMap[tableIds[i]] = true;
    var updatedZones = this.data.zones.map(function (z) {
      return {
        name: z.name,
        tables: z.tables.map(function (t) {
          if (tableMap[t.id]) {
            return {
              id: t.id,
              qrBase64: t.qrBase64,
              generating: generating,
              done: t.done,
              error: generating ? '' : t.error,
              selected: t.selected
            };
          }
          return t;
        })
      };
    });
    this.setData({ zones: updatedZones });
  },

  collectAllTableIds: function () {
    var allTables = [];
    var zones = this.data.zones;
    for (var i = 0; i < zones.length; i++) {
      for (var j = 0; j < zones[i].tables.length; j++) {
        allTables.push(zones[i].tables[j].id);
      }
    }
    return allTables;
  },

  collectSelectedTableIds: function () {
    var selected = [];
    var zones = this.data.zones;
    for (var i = 0; i < zones.length; i++) {
      for (var j = 0; j < zones[i].tables.length; j++) {
        if (zones[i].tables[j].selected) selected.push(zones[i].tables[j].id);
      }
    }
    return selected;
  },

  collectGeneratedTableIds: function () {
    var generated = [];
    var zones = this.data.zones;
    for (var i = 0; i < zones.length; i++) {
      for (var j = 0; j < zones[i].tables.length; j++) {
        if (zones[i].tables[j].qrBase64) generated.push(zones[i].tables[j].id);
      }
    }
    return generated;
  },

  filterGeneratedTableIds: function (tableIds) {
    var result = [];
    for (var i = 0; i < tableIds.length; i++) {
      var table = this.findTableById(tableIds[i]);
      if (table && table.qrBase64) result.push(table.id);
    }
    return result;
  },

  findTableById: function (tableId) {
    var zones = this.data.zones;
    for (var i = 0; i < zones.length; i++) {
      for (var j = 0; j < zones[i].tables.length; j++) {
        if (zones[i].tables[j].id === tableId) return zones[i].tables[j];
      }
    }
    return null;
  },

  onToggleTableSelection: function (e) {
    var tableId = e.currentTarget.dataset.id;
    if (!tableId || this.data.generating) return;
    var updatedZones = this.data.zones.map(function (z) {
      return {
        name: z.name,
        tables: z.tables.map(function (t) {
          if (t.id === tableId) {
            return {
              id: t.id,
              qrBase64: t.qrBase64,
              generating: t.generating,
              done: t.done,
              error: t.error,
              selected: !t.selected
            };
          }
          return t;
        })
      };
    });
    this.refreshZones(updatedZones);
  },

  onClearSelection: function () {
    if (this.data.generating) return;
    var updatedZones = this.data.zones.map(function (z) {
      return {
        name: z.name,
        tables: z.tables.map(function (t) {
          return {
            id: t.id,
            qrBase64: t.qrBase64,
            generating: t.generating,
            done: t.done,
            error: t.error,
            selected: false
          };
        })
      };
    });
    this.refreshZones(updatedZones);
  },

  refreshZones: function (zones) {
    var count = 0;
    var selectedCount = 0;
    for (var i = 0; i < zones.length; i++) {
      for (var j = 0; j < zones[i].tables.length; j++) {
        if (zones[i].tables[j].done) count++;
        if (zones[i].tables[j].selected) selectedCount++;
      }
    }
    this.setData({ zones: zones, generatedCount: count, selectedCount: selectedCount });
  },

  onExportSelectedImage: function () {
    var selectedIds = this.collectSelectedTableIds();
    if (!selectedIds.length) {
      wx.showToast({ title: '请先勾选桌位', icon: 'none' });
      return;
    }
    var downloadableIds = this.filterGeneratedTableIds(selectedIds);
    if (!downloadableIds.length) {
      wx.showToast({ title: '选中桌位尚未生成', icon: 'none' });
      return;
    }
    this.exportTableCodesImages(downloadableIds, '导出选中图片');
  },

  onExportAllImage: function () {
    var generatedIds = this.collectGeneratedTableIds();
    if (!generatedIds.length) {
      wx.showToast({ title: '请先生成桌码', icon: 'none' });
      return;
    }
    this.exportTableCodesImages(generatedIds, '导出全部图片');
  },

  exportTableCodesImages: async function (tableIds, title) {
    if (this.data.exporting) return;
    try {
      wx.showLoading({ title: '整理桌码中', mask: true });
      var exportTableIds = this.filterGeneratedTableIds(tableIds);
      if (!exportTableIds.length) {
        wx.hideLoading();
        wx.showToast({ title: '没有可导出的已生成桌码', icon: 'none' });
        return;
      }
      var exportItems = this.buildExportItems(exportTableIds);
      var chunks = exportUtil.chunkExportItems(exportItems, EXPORT_IMAGE_CHUNK_SIZE);
      var filePaths = [];
      this.setData({ exporting: true });
      await this.ensureAlbumPermission();
      for (var chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        wx.showLoading({ title: '导出图片 ' + (chunkIndex + 1) + '/' + chunks.length, mask: true });
        var tempPath = await this.renderExportImage(chunks[chunkIndex], chunkIndex, chunks.length);
        await this.saveImageToAlbum(tempPath);
        filePaths.push(tempPath);
      }
      wx.hideLoading();
      wx.showModal({
        title: title || '图片已导出',
        content: '已保存 ' + filePaths.length + ' 张桌码拼版图片到系统相册，每张图片都包含桌号。点击“确定”可预览第 1 张。',
        showCancel: false,
        success: function() {
          if (filePaths.length) {
            wx.previewImage({
              current: filePaths[0],
              urls: filePaths
            });
          }
        }
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ exporting: false });
      var msg = (err && (err.message || err.errMsg)) || '';
      if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize:fail') >= 0) {
        wx.showModal({
          title: '需要相册权限',
          content: '批量导出图片需要保存到系统相册，请在弹窗里允许“保存到相册”权限后重试。',
          showCancel: false
        });
        return;
      }
      if (msg.indexOf('saveImageToPhotosAlbum:fail') >= 0) {
        wx.showModal({
          title: '保存图片失败',
          content: '图片已经生成，但保存到相册失败。请确认微信已获得“保存到相册”权限后重试。',
          showCancel: false
        });
        return;
      }
      wx.showModal({
        title: '导出失败',
        content: msg || '图片导出失败，请稍后重试。',
        showCancel: false
      });
    } finally {
      this.setData({ exporting: false });
    }
  },

  buildExportItems: function (tableIds) {
    var items = [];
    for (var i = 0; i < tableIds.length; i++) {
      var table = this.findTableById(tableIds[i]);
      if (table && table.qrBase64) {
        items.push({
          tableId: table.id,
          qrBase64: table.qrBase64
        });
      }
    }
    return items;
  },

  ensureAlbumPermission: function () {
    return new Promise(function (resolve, reject) {
      wx.getSetting({
        success: function (settingRes) {
          var authSetting = (settingRes && settingRes.authSetting) || {};
          if (authSetting['scope.writePhotosAlbum']) {
            resolve();
            return;
          }
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: resolve,
            fail: reject
          });
        },
        fail: reject
      });
    });
  },

  renderExportImage: async function (items, pageIndex, totalPages) {
    var localFiles = await this.prepareExportImageFiles(items, pageIndex);
    var canvasWidth = EXPORT_CANVAS_WIDTH;
    var canvasHeight = EXPORT_CANVAS_HEIGHT;
    var headerHeight = 180;
    var cardWidth = (canvasWidth - EXPORT_PAGE_PADDING * 2 - EXPORT_CARD_GAP * (EXPORT_CARD_COLUMNS - 1)) / EXPORT_CARD_COLUMNS;
    var cardHeight = (canvasHeight - EXPORT_PAGE_PADDING - headerHeight - EXPORT_CARD_GAP * (EXPORT_CARD_ROWS - 1) - 48) / EXPORT_CARD_ROWS;
    var qrSize = Math.min(cardWidth - 72, 320);
    var ctx = wx.createCanvasContext('tableExportCanvas', this);
    var storeName = this.data.storeName;

    ctx.setFillStyle('#f5f0e6');
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.setFillStyle('#2a2118');
    ctx.setFontSize(44);
    ctx.fillText(storeName, EXPORT_PAGE_PADDING, 74);
    ctx.setFillStyle('#6f6255');
    ctx.setFontSize(24);
    ctx.fillText('桌码拼版 · 第 ' + (pageIndex + 1) + ' / ' + totalPages + ' 张', EXPORT_PAGE_PADDING, 118);
    ctx.fillText('每张图片都包含桌号，可直接转发或打印', EXPORT_PAGE_PADDING, 154);

    for (var i = 0; i < items.length; i++) {
      var col = i % EXPORT_CARD_COLUMNS;
      var row = Math.floor(i / EXPORT_CARD_COLUMNS);
      var x = EXPORT_PAGE_PADDING + col * (cardWidth + EXPORT_CARD_GAP);
      var y = headerHeight + row * (cardHeight + EXPORT_CARD_GAP);
      var qrX = x + (cardWidth - qrSize) / 2;
      var qrY = y + 54;

      ctx.setFillStyle('#ffffff');
      ctx.fillRect(x, y, cardWidth, cardHeight);
      ctx.setStrokeStyle('#d8c9b5');
      ctx.setLineWidth(3);
      ctx.strokeRect(x, y, cardWidth, cardHeight);
      ctx.drawImage(localFiles[i], qrX, qrY, qrSize, qrSize);
      ctx.setFillStyle('#2a2118');
      ctx.setFontSize(42);
      ctx.setTextAlign('center');
      ctx.fillText(items[i].tableId, x + cardWidth / 2, qrY + qrSize + 70);
      ctx.setFillStyle('#8a7b69');
      ctx.setFontSize(22);
      ctx.fillText(storeName, x + cardWidth / 2, qrY + qrSize + 106);
    }
    ctx.setTextAlign('left');

    return this.drawCanvasToTempFile(ctx, canvasWidth, canvasHeight, pageIndex, totalPages);
  },

  prepareExportImageFiles: function (items, pageIndex) {
    var self = this;
    return Promise.all(items.map(function (item) {
      return self.writeQrBase64ToTempFile(item.tableId, item.qrBase64, pageIndex);
    }));
  },

  writeQrBase64ToTempFile: function (tableId, base64, pageIndex) {
    var safeId = encodeURIComponent(String(tableId || 'table'));
    var filePath = wx.env.USER_DATA_PATH + '/table-code-' + safeId + '-' + pageIndex + '.png';
    return new Promise(function (resolve, reject) {
      wx.getFileSystemManager().writeFile({
        filePath: filePath,
        data: base64,
        encoding: 'base64',
        success: function () { resolve(filePath); },
        fail: reject
      });
    });
  },

  drawCanvasToTempFile: function (ctx, width, height, pageIndex, totalPages) {
    var self = this;
    return new Promise(function (resolve, reject) {
      ctx.draw(false, function () {
        wx.canvasToTempFilePath({
          canvasId: 'tableExportCanvas',
          width: width,
          height: height,
          destWidth: width,
          destHeight: height,
          fileType: 'png',
          quality: 1,
          success: function (res) {
            resolve(res.tempFilePath);
          },
          fail: reject
        }, self);
      });
    });
  },

  saveImageToAlbum: function (filePath) {
    return new Promise(function (resolve, reject) {
      wx.saveImageToPhotosAlbum({
        filePath: filePath,
        success: resolve,
        fail: reject
      });
    });
  },

  chunkTableIds: function (tableIds, size) {
    var chunks = [];
    for (var i = 0; i < tableIds.length; i += size) {
      chunks.push(tableIds.slice(i, i + size));
    }
    return chunks;
  },

  handleGenerateError: function (err) {
    var msg = (err && (err.errMsg || err.message)) || '';
    if (msg.indexOf('not found') >= 0 || msg.indexOf('Function not found') >= 0) {
      wx.showModal({
        title: '云函数未部署',
        content: 'batchTableCodes 云函数尚未上传部署，请在开发者工具中右键该云函数 → 上传并部署（云端安装依赖）后重试。',
        showCancel: false
      });
    } else if (msg.indexOf('-501005') >= 0) {
      wx.showModal({
        title: '云环境未选择',
        content: '请在 app.js 中设置正确的云环境 ID（CLOUD_ENV_ID），且开发工具当前环境与之一致。',
        showCancel: false
      });
    } else if (msg.indexOf('-504003') >= 0 || msg.indexOf('timed out') >= 0) {
      wx.showModal({
        title: '生成超时',
        content: '本次生成请求超时，请稍后重试；若反复出现，请检查云函数部署状态。',
        showCancel: false
      });
    } else {
      wx.showModal({ title: '调用失败', content: msg || '云函数调用失败', showCancel: false });
    }
  },

  previewQr: function (e) {
    var base64 = e.currentTarget.dataset.base64;
    if (base64) {
      wx.previewImage({ urls: ['data:image/png;base64,' + base64] });
    }
  }
});
