var roleUtil = require('../../../utils/role.js');
var BATCH_SIZE = 1;
var MAX_RETRY = 2;
var PDF_EXPORT_CHUNK_SIZE = 2;

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
      { name: '5楼', tables: ['501', '502', '503'] },
      { name: '6楼', tables: ['601', '602'] },
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
    storeName: '',
    totalTables: 0,
    generatedCount: 0,
    selectedCount: 0
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

  onExportSelectedPdf: function () {
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
    this.exportTableCodesPdf(downloadableIds, '导出选中 PDF');
  },

  onExportAllPdf: function () {
    var generatedIds = this.collectGeneratedTableIds();
    if (!generatedIds.length) {
      wx.showToast({ title: '请先生成桌码', icon: 'none' });
      return;
    }
    this.exportTableCodesPdf(generatedIds, '导出全部 PDF');
  },

  exportTableCodesPdf: async function (tableIds, title) {
    try {
      wx.showLoading({ title: '整理桌码中', mask: true });
      var sid = STORE_IDS[this.data.storeIndex];
      var exportTableIds = this.filterGeneratedTableIds(tableIds);
      if (!exportTableIds.length) {
        wx.hideLoading();
        wx.showToast({ title: '没有可导出的已生成桌码', icon: 'none' });
        return;
      }
      var chunkedTableIds = this.chunkTableIds(exportTableIds, PDF_EXPORT_CHUNK_SIZE);
      var filePaths = [];
      for (var chunkIndex = 0; chunkIndex < chunkedTableIds.length; chunkIndex++) {
        wx.showLoading({ title: '导出PDF ' + (chunkIndex + 1) + '/' + chunkedTableIds.length, mask: true });
        var res = await wx.cloud.callFunction({
          name: 'exportTableCodesPdf',
          data: {
            tables: chunkedTableIds[chunkIndex],
            store_id: sid
          }
        });
        var result = (res && res.result) || {};
        if (!result.success || !result.fileID) {
          throw new Error(result.message || 'PDF 导出失败');
        }
        var downloadRes = await wx.cloud.downloadFile({ fileID: result.fileID });
        if (!downloadRes || !downloadRes.tempFilePath) {
          throw new Error('PDF 云文件下载失败');
        }
        filePaths.push(downloadRes.tempFilePath);
      }
      wx.hideLoading();
      if (filePaths.length === 1) {
        wx.openDocument({
          filePath: filePaths[0],
          fileType: 'pdf',
          showMenu: true
        });
        wx.showToast({ title: title || 'PDF 已导出', icon: 'success' });
        return;
      }
      var firstPath = filePaths[0];
      wx.showModal({
        title: '已导出分卷 PDF',
        content: '本次共导出 ' + filePaths.length + ' 份 PDF，避免单次导出过大失败。点击“确定”先打开第 1 份。',
        showCancel: false,
        success: function () {
          wx.openDocument({
            filePath: firstPath,
            fileType: 'pdf',
            showMenu: true
          });
        }
      });
    } catch (err) {
      wx.hideLoading();
      var msg = (err && (err.message || err.errMsg)) || '';
      if (msg.indexOf('FunctionName parameter could not be found') >= 0 ||
          msg.indexOf('FUNCTION_NOT_FOUND') >= 0 ||
          msg.indexOf('-501000') >= 0) {
        wx.showModal({
          title: 'PDF导出云函数未部署',
          content: '请在微信开发者工具中右键 cloudfunctions/exportTableCodesPdf ，选择“上传并部署：云端安装依赖”，完成后再重试导出 PDF。',
          showCancel: false
        });
        return;
      }
      if (msg.indexOf('-504002') >= 0 ||
          msg.indexOf('functions execute fail') >= 0 ||
          msg.indexOf('code exit unexpected') >= 0) {
        wx.showModal({
          title: 'PDF导出依赖未安装',
          content: 'exportTableCodesPdf 云函数执行异常，通常是部署时没有安装依赖。请在微信开发者工具中右键 cloudfunctions/exportTableCodesPdf ，选择“上传并部署：云端安装依赖”；如果用“上传并部署：所有文件”，请先在该目录执行 npm install 后再上传。',
          showCancel: false
        });
        return;
      }
      if (msg.indexOf('downloadFile:fail') >= 0 || msg.indexOf('下载') >= 0) {
        wx.showModal({
          title: 'PDF下载失败',
          content: '云端 PDF 已生成，但小程序下载文件失败。请确认当前网络正常后重试。',
          showCancel: false
        });
        return;
      }
      if (msg.indexOf('openDocument:fail') >= 0) {
        wx.showModal({
          title: 'PDF打开失败',
          content: 'PDF 已下载，但系统打开文档失败。可稍后重试，或让我改成导出后直接复制链接。',
          showCancel: false
        });
        return;
      }
      wx.showModal({
        title: '导出失败',
        content: msg || 'PDF 导出失败，请稍后重试。',
        showCancel: false
      });
    }
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
