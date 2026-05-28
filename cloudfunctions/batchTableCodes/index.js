const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function loadExistingByTables(storeId, tables) {
  var records = [];
  var seen = {};
  var cleanedTables = [];

  for (var i = 0; i < tables.length; i++) {
    var tableId = String(tables[i] || '').trim();
    if (!tableId || seen[tableId]) continue;
    seen[tableId] = true;
    cleanedTables.push(tableId);
  }

  for (var start = 0; start < cleanedTables.length; start += 20) {
    var batchTables = cleanedTables.slice(start, start + 20);
    var res = await db.collection('table_qrcodes')
      .where({
        store_id: storeId,
        table_id: _.in(batchTables)
      })
      .get();
    if (res && res.data && res.data.length) {
      records = records.concat(res.data);
    }
  }

  return records;
}

async function uploadQrImageBuffer(storeId, tableId, buffer) {
  var cloudPath = 'table-qrcodes/' + storeId + '/' + encodeURIComponent(tableId) + '.jpg';
  var uploadRes = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: buffer
  });
  return uploadRes && uploadRes.fileID ? uploadRes.fileID : '';
}

exports.main = async (event) => {
  console.log('[BatchQR] 函数开始执行');
  console.log('[BatchQR] 事件参数:', JSON.stringify(event));
  
  const { OPENID } = cloud.getWXContext();

  const staff = await db.collection('staff').where({ openid: OPENID, active: true }).limit(1).get();
  if (!staff.data.length) {
    console.error('[BatchQR] 无权限: 未找到员工记录');
    return { success: false, message: '无权限' };
  }
  const role = String(staff.data[0].role || '').toLowerCase();
  if (role !== 'admin') {
    console.error('[BatchQR] 无权限: 角色不是管理员, role=' + role);
    return { success: false, message: '仅管理员可操作' };
  }

  var tables = event.tables;
  if (!Array.isArray(tables) || !tables.length) {
    console.error('[BatchQR] 参数错误: tables 无效');
    return { success: false, message: '请传入 tables 数组' };
  }

  var storeId = event.store_id || '51866138';
  var force = event.force === true;
  console.log('[BatchQR] 参数: storeId=' + storeId + ', force=' + force + ', tables数量=' + tables.length);

  // 读取已生成的缓存
  var existing = [];
  try {
    existing = await loadExistingByTables(storeId, tables);
    console.log('[BatchQR] 查询到现有记录数量:', existing.length);
  } catch (e) {
    console.error('[BatchQR] 查询现有记录失败:', e.message);
  }
  var cacheMap = {};
  var docIdMap = {};
  if (!force) {
    for (var c = 0; c < existing.length; c++) {
      cacheMap[existing[c].table_id] = existing[c];
      docIdMap[existing[c].table_id] = existing[c]._id;
    }
    console.log('[BatchQR] 使用缓存, cacheMap大小:', Object.keys(cacheMap).length);
  } else {
    for (var d = 0; d < existing.length; d++) {
      docIdMap[existing[d].table_id] = existing[d]._id;
    }
    console.log('[BatchQR] 强制重新生成, 忽略缓存');
  }

  var results = [];
  for (var i = 0; i < tables.length; i++) {
    var tableId = String(tables[i]).trim();
    if (!tableId) continue;

    if (cacheMap[tableId] && cacheMap[tableId].base64) {
      console.log('[BatchQR] 使用缓存:', tableId);
      results.push({ table_id: tableId, base64: cacheMap[tableId].base64, cached: true });
      continue;
    }

    var scene = 't=' + tableId + '&s=' + storeId;
    console.log('[BatchQR] 生成新二维码:', tableId, ', scene=' + scene);
    var base64 = '';
    var qrBuffer = null;
    try {
      // 优先 getUnlimited（发布后正式），降级 get（开发/体验版）
      try {
        console.log('[BatchQR] 尝试 getUnlimited');
        var qrRes = await cloud.openapi.wxacode.getUnlimited({
          scene: scene,
          page: 'pages/index/index',
          width: 430,
          checkPath: false
        });
        qrBuffer = qrRes.buffer;
        base64 = qrBuffer.toString('base64');
        console.log('[BatchQR] getUnlimited 成功, 大小:', qrBuffer.length, 'bytes');
      } catch (e1) {
        console.warn('[BatchQR] getUnlimited 失败, 降级使用 get:', e1.message);
        var fallbackRes = await cloud.openapi.wxacode.get({
          path: 'pages/index/index?scene=' + encodeURIComponent(scene),
          width: 430,
          autoColor: true
        });
        qrBuffer = fallbackRes.buffer;
        base64 = qrBuffer.toString('base64');
        console.log('[BatchQR] get 成功, 大小:', qrBuffer.length, 'bytes');
      }
    } catch (e) {
      console.error('[BatchQR] 生成失败:', tableId, e.message);
      results.push({ table_id: tableId, error: e.message || '生成失败' });
      continue;
    }

    // 存缓存（幂等 upsert）
    try {
      var fileId = await uploadQrImageBuffer(storeId, tableId, qrBuffer);
      var docId = docIdMap[tableId] || null;
      if (docId) {
        await db.collection('table_qrcodes').doc(docId).update({
          data: { file_id: fileId, scene: scene, updated_at: db.serverDate() }
        });
      } else {
        var addRes = await db.collection('table_qrcodes').add({
          data: { store_id: storeId, table_id: tableId, file_id: fileId, scene: scene, created_at: db.serverDate() }
        });
        if (addRes && addRes._id) {
          docIdMap[tableId] = addRes._id;
        }
      }
    } catch (e) {
      results.push({ table_id: tableId, error: '缓存写入失败：' + (e.message || '未知错误') });
      continue;
    }

    results.push({ table_id: tableId, base64: base64, cached: false });
  }

  var successCount = results.filter(r => !r.error).length;
  var errorCount = results.filter(r => r.error).length;
  var cachedCount = results.filter(r => r.cached).length;
  console.log('[BatchQR] 完成: 成功=' + successCount + ', 失败=' + errorCount + ', 缓存=' + cachedCount);

  return { success: true, store_id: storeId, total: results.length, results: results };
};
