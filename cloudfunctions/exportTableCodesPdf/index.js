const cloud = require('wx-server-sdk');
const { PDF } = require('./pdf-builder');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const GAP = 18;
const COLS = 2;
const ROWS = 2;
const CARD_W = (PAGE_W - MARGIN * 2 - GAP) / COLS;
const CARD_H = (PAGE_H - MARGIN * 2 - GAP) / ROWS;

var STORE_LABELS = {
  '51866138': 'MAJIXIAN GUANGDONG',
  '64822111': 'HONGCHAO CHAOSHAN'
};

function cardPos(idx) {
  var col = idx % COLS;
  var row = Math.floor(idx / COLS);
  return { x: MARGIN + col * (CARD_W + GAP), y: PAGE_H - MARGIN - (row + 1) * CARD_H - row * GAP };
}

function normLabel(tid) {
  var s = String(tid || '').trim();
  if (!s) return 'TABLE';
  return s.replace(/外摆/g, 'WB').replace(/外带/g, 'TAKE').replace(/[^\x20-\x7E]/g, '').trim() || 'TABLE';
}

function loadExisting(storeId, tables) {
  var tids = [];
  var seen = {};
  for (var i = 0; i < tables.length; i++) {
    var ti = String(tables[i] || '').trim();
    if (!ti || seen[ti]) continue;
    seen[ti] = true;
    tids.push(ti);
  }
  return new Promise(function (resolve) {
    (async function () {
      var all = [];
      for (var s = 0; s < tids.length; s += 20) {
        var batch = tids.slice(s, s + 20);
        try {
          var r = await db.collection('table_qrcodes').where({ store_id: storeId, table_id: _.in(batch) }).get();
          if (r && r.data) { all.push.apply(all, r.data); }
        } catch (e) { resolve([]); return; }
      }
      resolve(all);
    })();
  });
}

exports.main = async function (event) {
  var storeId = String(event.store_id || '51866138');
  var label = STORE_LABELS[storeId] || 'TABLE QR';
  var tables = Array.isArray(event.tables) ? event.tables : [];
  var items = Array.isArray(event.items) ? event.items : [];

  var exportItems = [];
  if (items.length) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var tid = String(it.tableId || it.table_id || '').trim();
      var b64 = String(it.base64 || '').trim();
      if (!tid || !b64) continue;
      exportItems.push({ tableId: tid, label: normLabel(tid), base64: b64 });
    }
  } else if (tables.length) {
    var records = await loadExisting(storeId, tables);
    var rmap = {};
    for (var ri = 0; ri < records.length; ri++) { rmap[records[ri].table_id] = records[ri]; }
    var missing = [];
    for (var ti = 0; ti < tables.length; ti++) {
      var tid2 = String(tables[ti] || '').trim();
      if (!tid2) continue;
      var rec = rmap[tid2];
      var b64 = rec && rec.base64 ? rec.base64 : '';
      var fid = rec && rec.file_id ? rec.file_id : '';
      if (!b64 && !fid) { missing.push(tid2); continue; }
      exportItems.push({ tableId: tid2, label: normLabel(tid2), base64: b64, fileId: fid });
    }
    if (missing.length) {
      return { success: false, message: '以下桌码未找到缓存，请先生成：' + missing.join('、') };
    }
  } else {
    return { success: false, message: '缺少 tables 或 items 参数' };
  }
  if (!exportItems.length) {
    return { success: false, message: '没有可导出的桌码' };
  }

  var pdf = new PDF();
  var fonts = { h: pdf.addFontHelvetica(), hb: pdf.addFontHelveticaBold() };

  var qrSize = Math.min(CARD_W - 52, 180);

  for (var ei = 0; ei < exportItems.length; ei++) {
    var ip = ei % (COLS * ROWS);
    if (ip === 0) { pdf.addPage(PAGE_W, PAGE_H); }
    var page = pdf.pages[pdf.pages.length - 1];
    var item = exportItems[ei];
    var pos = cardPos(ip);

    // Embed image from base64
    var img;
    if (item.base64) {
      var buf = Buffer.from(item.base64, 'base64');
      img = pdf.addImage(buf);
    } else if (item.fileId) {
      var dl = await cloud.downloadFile({ fileID: item.fileId });
      img = pdf.addImage(dl.fileContent);
    } else { continue; }

    // Card background
    pdf.drawRect(page, pos.x, pos.y, CARD_W, CARD_H, {
      fillColor: [0.988, 0.969, 0.929],
      borderColor: [0.78, 0.66, 0.44],
      borderWidth: 1.2
    });

    // Store label
    pdf.drawText(page, label, pos.x + 18, pos.y + CARD_H - 32, 16, fonts.hb, [0.16, 0.12, 0.08]);
    pdf.drawText(page, 'TABLE QR CODE', pos.x + 18, pos.y + CARD_H - 56, 11, fonts.h, [0.52, 0.42, 0.28]);

    // QR code
    pdf.drawImage(page, img, pos.x + (CARD_W - qrSize) / 2, pos.y + 72, qrSize, qrSize);

    // Table label
    pdf.drawText(page, item.label, pos.x + 18, pos.y + 44, 24, fonts.hb, [0.16, 0.12, 0.08]);
    pdf.drawText(page, 'Scan to order', pos.x + 18, pos.y + 20, 10, fonts.h, [0.48, 0.42, 0.36]);
  }

  var pdfBuffer = pdf.save();
  var ts = Date.now();
  var fname = 'table-codes-' + ts + '.pdf';
  var cloudPath = 'exports/table-codes/' + storeId + '/' + fname;
  var upRes = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: pdfBuffer });

  return { success: true, fileID: upRes.fileID, filename: fname, total: exportItems.length };
};